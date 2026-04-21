"""
資料抓取模組：從 MLB 官方 Stats API 取得球員數據
API 文件：https://statsapi.mlb.com/api/v1/  (免費、無需 API Key)
"""

import io
import warnings
from datetime import datetime, timedelta

import pandas as pd
import requests

try:
    import streamlit as st
    _HAS_STREAMLIT = True
except ImportError:
    _HAS_STREAMLIT = False

    # No-op cache decorator when running outside Streamlit (e.g. FastAPI)
    class _FakeCache:
        def __call__(self, fn=None, **kwargs):
            if fn is not None:
                return fn
            return lambda f: f

    class _FakeSt:
        cache_data = _FakeCache()
        def warning(self, msg): pass

    st = _FakeSt()

warnings.filterwarnings("ignore")

MLB_API = "https://statsapi.mlb.com/api/v1"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; fantasy-baseball-analyzer/1.0)"}

# ── MLB API 欄位對應 ──────────────────────────────
# MLB API 回傳名稱 → 我們用的欄位名稱
HITTING_COL_MAP = {
    "runs":                "R",
    "homeRuns":            "HR",
    "rbi":                 "RBI",
    "stolenBases":         "SB",
    "avg":                 "AVG",
    "obp":                 "OBP",
    "slg":                 "SLG",
    "ops":                 "OPS",
    "hits":                "H",
    "doubles":             "2B",
    "triples":             "3B",
    "baseOnBalls":         "B",    # 打者四壞球數
    "strikeOuts":          "K",    # 打者被三振數
    "plateAppearances":    "PA",
    "atBats":              "AB",
    "gamesPlayed":         "G",
    "babip":               "BABIP",          # 場內球打擊率
    "groundOutsToAirouts": "GOFB",           # GB/FB 比
}

PITCHING_COL_MAP = {
    "wins":             "W",
    "saves":            "SV",
    "holds":            "HLD",
    "era":              "ERA",
    "whip":             "WHIP",
    "strikeOuts":       "K",    # 投手三振數
    "baseOnBalls":      "B",    # 投手保送數
    "inningsPitched":   "IP",
    "qualityStarts":    "QS",
    "losses":           "L",
    "runs":             "R",    # 投手失分數（越少越好）
    "gamesPlayed":      "G",
    "gamesStarted":     "GS",
    "saveOpportunities": "SVO",
    "blownSaves":       "BS",
}

# MLB Stats API split["team"] has id/name/link but no abbreviation field.
# Map team ID → abbreviation so we can display short team names.
_MLB_TEAM_ABBR: dict[int, str] = {
    108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS",
    112: "CHC", 113: "CIN", 114: "CLE", 115: "COL",
    116: "DET", 117: "HOU", 118: "KC",  119: "LAD",
    120: "WSH", 121: "NYM", 133: "ATH", 134: "PIT",
    135: "SD",  136: "SEA", 137: "SF",  138: "STL",
    139: "TB",  140: "TEX", 141: "TOR", 142: "MIN",
    143: "PHI", 144: "ATL", 145: "CWS", 146: "MIA",
    147: "NYY", 158: "MIL",
}


# ─────────────────────────────────────────────────
# 核心抓取函式
# ─────────────────────────────────────────────────

def _fetch_mlb_stats(
    group: str,          # "hitting" or "pitching"
    season: int,
    start_date: str = None,
    end_date: str = None,
    limit: int = 2000,
) -> pd.DataFrame:
    """
    從 MLB Stats API 抓取全聯盟球員數據。

    全季用：stats=season
    日期區間用：stats=byDateRange
    """
    if start_date and end_date:
        url = (
            f"{MLB_API}/stats"
            f"?stats=byDateRange&group={group}&gameType=R"
            f"&season={season}&sportId=1&playerPool=ALL"
            f"&startDate={start_date}&endDate={end_date}"
            f"&limit={limit}&offset=0"
        )
    else:
        url = (
            f"{MLB_API}/stats"
            f"?stats=season&group={group}&gameType=R"
            f"&season={season}&sportId=1&playerPool=ALL"
            f"&limit={limit}&offset=0"
        )

    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    col_map = HITTING_COL_MAP if group == "hitting" else PITCHING_COL_MAP

    rows = []
    for stat_block in data.get("stats", []):
        for split in stat_block.get("splits", []):
            player_info = split.get("player", {})
            team_info = split.get("team", {})
            stat = split.get("stat", {})

            # position is a top-level field in the split, not inside player_info
            pos_info = split.get("position", {})
            team_id  = team_info.get("id")
            row = {
                "Name": player_info.get("fullName", "Unknown"),
                "Team": _MLB_TEAM_ABBR.get(team_id, team_info.get("name", "")[:3].upper() if team_info.get("name") else ""),
                "Pos":  pos_info.get("abbreviation", "") if isinstance(pos_info, dict) else "",
                "player_id": player_info.get("id"),
            }

            # 把 MLB API 欄位名稱轉成我們的名稱
            for api_key, our_key in col_map.items():
                val = stat.get(api_key)
                if val is not None:
                    # AVG, ERA, WHIP 等是字串，轉成 float
                    try:
                        row[our_key] = float(val)
                    except (ValueError, TypeError):
                        row[our_key] = val

            rows.append(row)

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)

    # IP 可能是 "5.2" 格式（5又2/3局），轉成真正的局數
    if "IP" in df.columns:
        df["IP"] = df["IP"].apply(_parse_ip)

    # 打者衍生欄位：K% 和 BB%
    if group == "hitting" and "K" in df.columns and "PA" in df.columns:
        pa = pd.to_numeric(df["PA"], errors="coerce")
        df["K_PCT"] = pd.to_numeric(df["K"], errors="coerce") / pa * 100
        df["BB_PCT"] = pd.to_numeric(df["B"], errors="coerce") / pa * 100

    return df


def _parse_ip(ip_val) -> float:
    """把 '5.2' 格式的 IP 轉成正確局數（5 + 2/3 = 5.667）"""
    try:
        ip_str = str(ip_val)
        if "." in ip_str:
            whole, frac = ip_str.split(".", 1)
            return int(whole) + int(frac) / 3.0
        return float(ip_str)
    except Exception:
        return 0.0


# ─────────────────────────────────────────────────
# 全聯盟打者數據（Streamlit 快取）
# ─────────────────────────────────────────────────

@st.cache_data(ttl=3600, show_spinner="正在從 MLB Stats API 下載打者數據...")
def get_all_batters_season(year: int = None) -> pd.DataFrame:
    if year is None:
        year = datetime.now().year
    return _fetch_mlb_stats("hitting", year)


@st.cache_data(ttl=1800, show_spinner="正在從 MLB Stats API 下載近30天打者數據...")
def get_all_batters_last30(year: int = None) -> pd.DataFrame:
    if year is None:
        year = datetime.now().year
    end = datetime.now()
    start = end - timedelta(days=30)
    df = _fetch_mlb_stats(
        "hitting", year,
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
    )
    if df.empty:
        st.warning("近30天數據為空，改用全季數據")
        return get_all_batters_season(year)
    return df


# ─────────────────────────────────────────────────
# 全聯盟投手數據
# ─────────────────────────────────────────────────

@st.cache_data(ttl=3600, show_spinner="正在從 MLB Stats API 下載投手數據...")
def get_all_pitchers_season(year: int = None) -> pd.DataFrame:
    if year is None:
        year = datetime.now().year
    return _fetch_mlb_stats("pitching", year)


@st.cache_data(ttl=1800, show_spinner="正在從 MLB Stats API 下載近30天投手數據...")
def get_all_pitchers_last30(year: int = None) -> pd.DataFrame:
    if year is None:
        year = datetime.now().year
    end = datetime.now()
    start = end - timedelta(days=30)
    df = _fetch_mlb_stats(
        "pitching", year,
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
    )
    if df.empty:
        st.warning("近30天數據為空，改用全季數據")
        return get_all_pitchers_season(year)
    return df


# ─────────────────────────────────────────────────
# Baseball Savant xStats
# ─────────────────────────────────────────────────

@st.cache_data(ttl=3600, show_spinner="正在從 Baseball Savant 下載 xStats...")
def get_savant_batting_stats(year: int = None, min_pa: int = 10) -> pd.DataFrame:
    """從 Baseball Savant 取得打者預期數據（xBA, xSLG, xwOBA 等）
    如果當年數據不足 50 人，自動補抓前一年。
    """
    if year is None:
        year = datetime.now().year

    def _fetch(yr):
        url = (
            f"https://baseballsavant.mlb.com/leaderboard/expected_statistics"
            f"?type=batter&year={yr}&position=&team=&min={min_pa}&csv=true"
        )
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        if "last_name, first_name" in df.columns:
            df["Name"] = df["last_name, first_name"].apply(_flip_name)
        elif "player_name" in df.columns:
            df["Name"] = df["player_name"]
        return df

    try:
        df = _fetch(year)
        if len(df) < 50:
            df_prev = _fetch(year - 1)
            existing_names = set(df["Name"].dropna()) if "Name" in df.columns else set()
            df_prev_fill = df_prev[~df_prev["Name"].isin(existing_names)]
            df = pd.concat([df, df_prev_fill], ignore_index=True)
        return df
    except Exception as e:
        st.warning(f"⚠️ Savant 數據抓取失敗：{e}")
        return pd.DataFrame()


@st.cache_data(ttl=3600, show_spinner="正在從 Baseball Savant 下載出球速度數據...")
def get_savant_exit_velo(year: int = None, min_bbe: int = 10) -> pd.DataFrame:
    """從 Savant 取得出球速度、Barrel、HardHit 等數據
    如果當年數據不足 50 人，自動補抓前一年。
    """
    if year is None:
        year = datetime.now().year

    def _fetch(yr):
        url = (
            f"https://baseballsavant.mlb.com/leaderboard/statcast"
            f"?type=batter&year={yr}&position=&team=&min={min_bbe}&csv=true"
        )
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        if "last_name, first_name" in df.columns:
            df["Name"] = df["last_name, first_name"].apply(_flip_name)
        elif "player_name" in df.columns:
            df["Name"] = df["player_name"]
        return df

    try:
        df = _fetch(year)
        if len(df) < 50:
            df_prev = _fetch(year - 1)
            existing_names = set(df["Name"].dropna()) if "Name" in df.columns else set()
            df_prev_fill = df_prev[~df_prev["Name"].isin(existing_names)]
            df = pd.concat([df, df_prev_fill], ignore_index=True)
        return df
    except Exception as e:
        st.warning(f"⚠️ Savant 出球速度數據抓取失敗：{e}")
        return pd.DataFrame()


@st.cache_data(ttl=3600, show_spinner="正在從 Baseball Savant 下載選球紀律數據...")
def get_savant_plate_discipline(year: int = None, min_pa: int = 10) -> pd.DataFrame:
    """從 Savant 取得選球紀律數據（O-Swing%, SwStr%, BB%, K% 等）
    如果當年數據不足 50 人，自動補抓前一年。
    """
    if year is None:
        year = datetime.now().year

    def _fetch(yr):
        url = (
            f"https://baseballsavant.mlb.com/leaderboard/plate-discipline"
            f"?type=batter&year={yr}&min={min_pa}&csv=true"
        )
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        if "last_name, first_name" in df.columns:
            df["Name"] = df["last_name, first_name"].apply(_flip_name)
        elif "player_name" in df.columns:
            df["Name"] = df["player_name"]
        return df

    try:
        df = _fetch(year)
        # 如果當年數據不足，補抓前一年
        if len(df) < 50:
            df_prev = _fetch(year - 1)
            # 合併：當年有的用當年，否則用前一年
            existing_names = set(df["Name"].dropna()) if "Name" in df.columns else set()
            df_prev_fill = df_prev[~df_prev["Name"].isin(existing_names)]
            df = pd.concat([df, df_prev_fill], ignore_index=True)
        return df
    except Exception as e:
        st.warning(f"⚠️ Savant 選球紀律數據抓取失敗：{e}")
        return pd.DataFrame()


# ─────────────────────────────────────────────────
# 球員名稱模糊匹配
# ─────────────────────────────────────────────────

def fuzzy_match_player(
    name: str,
    df: pd.DataFrame,
    name_col: str = "Name",
    threshold: float = 0.7,
) -> str | None:
    """
    模糊匹配球員名稱，處理：
    - 拼字差異（OCR 錯誤）
    - 縮寫名字：'S. Ohtani' → 'Shohei Ohtani'
    - 日文球員羅馬拼音差異：'Imai' 等
    """
    import re
    from difflib import SequenceMatcher

    name_clean = name.strip()
    name_lower = name_clean.lower()
    candidates = df[name_col].dropna().tolist()

    # 1. 完全匹配
    for cand in candidates:
        if name_lower == str(cand).lower().strip():
            return cand

    # 2. 縮寫名匹配：'S. Ohtani' 或 'S Ohtani'
    abbrev_match = re.match(r"^([A-Za-z])\.?\s+(.+)$", name_clean)
    if abbrev_match:
        first_initial = abbrev_match.group(1).upper()
        last_name = abbrev_match.group(2).strip().lower()
        for cand in candidates:
            cand_parts = str(cand).strip().split()
            if len(cand_parts) >= 2:
                cand_first = cand_parts[0][0].upper()
                cand_last = " ".join(cand_parts[1:]).lower()
                # 首字母 + 姓氏模糊匹配
                last_score = SequenceMatcher(None, last_name, cand_last).ratio()
                if cand_first == first_initial and last_score >= 0.85:
                    return cand

    # 3. 一般模糊匹配（對 OCR 拼字錯誤）
    best_score = 0.0
    best_match = None
    for cand in candidates:
        score = SequenceMatcher(None, name_lower, str(cand).lower().strip()).ratio()
        if score > best_score:
            best_score = score
            best_match = cand

    return best_match if best_score >= threshold else None


def match_players_to_df(
    player_names: list[str],
    df: pd.DataFrame,
    name_col: str = "Name",
) -> tuple[pd.DataFrame, list[str]]:
    """
    將球員名單與數據 DataFrame 做匹配。

    Returns:
        matched_df: 成功匹配的球員數據
        unmatched: 找不到的球員名字清單
    """
    matched_rows = []
    unmatched = []
    seen_matched: set[str] = set()  # deduplicate by canonical matched name

    for name in player_names:
        matched_name = fuzzy_match_player(name, df, name_col)
        if matched_name:
            if matched_name in seen_matched:
                continue  # same player already added via a different input spelling
            seen_matched.add(matched_name)
            row = df[df[name_col] == matched_name].copy()
            row["OCR_Name"] = name
            matched_rows.append(row)
        else:
            unmatched.append(name)

    if matched_rows:
        matched_df = pd.concat(matched_rows, ignore_index=True)
    else:
        matched_df = pd.DataFrame()

    return matched_df, unmatched


# ─────────────────────────────────────────────────
# 工具函式
# ─────────────────────────────────────────────────

def _flip_name(name: str) -> str:
    """將 'Last, First' 格式轉成 'First Last'"""
    if "," in name:
        parts = name.split(",", 1)
        return f"{parts[1].strip()} {parts[0].strip()}"
    return name


# ─────────────────────────────────────────────────
# Sprint Speed
# ─────────────────────────────────────────────────

def get_savant_sprint_speed(year: int = None, min_runs: int = 5) -> pd.DataFrame:
    """從 Savant 取得衝刺速度數據（sprint_speed, hp_to_1b, bolts）"""
    if year is None:
        year = datetime.now().year

    def _fetch(yr):
        url = (
            f"https://baseballsavant.mlb.com/leaderboard/sprint_speed"
            f"?type=batter&year={yr}&min={min_runs}&csv=true"
        )
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        if "last_name, first_name" in df.columns:
            df["Name"] = df["last_name, first_name"].apply(_flip_name)
        elif "player_name" in df.columns:
            df["Name"] = df["player_name"]
        return df

    try:
        df = _fetch(year)
        if len(df) < 50:
            df_prev = _fetch(year - 1)
            existing_names = set(df["Name"].dropna()) if "Name" in df.columns else set()
            df = pd.concat([df, df_prev[~df_prev["Name"].isin(existing_names)]], ignore_index=True)
        return df
    except Exception:
        return pd.DataFrame()


# ─────────────────────────────────────────────────
# 投手 Savant 數據
# ─────────────────────────────────────────────────

def get_savant_pitcher_stats(year: int = None, min_pitches: int = 1) -> pd.DataFrame:
    """從 Savant Statcast leaderboard 取得投手數據（K%, BB%, Whiff%, EV/HH/Barrel/xwOBA against）"""
    if year is None:
        year = datetime.now().year

    def _fetch(yr):
        url = (
            f"https://baseballsavant.mlb.com/leaderboard/statcast"
            f"?type=pitcher&year={yr}&position=&team=&min={min_pitches}&csv=true"
        )
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        if "last_name, first_name" in df.columns:
            df["Name"] = df["last_name, first_name"].apply(_flip_name)
        elif "player_name" in df.columns:
            df["Name"] = df["player_name"]
        return df

    try:
        df = _fetch(year)
        if len(df) < 30:
            df_prev = _fetch(year - 1)
            existing_names = set(df["Name"].dropna()) if "Name" in df.columns else set()
            df = pd.concat([df, df_prev[~df_prev["Name"].isin(existing_names)]], ignore_index=True)
        return df
    except Exception as e:
        st.warning(f"⚠️ Savant 投手 Statcast 數據抓取失敗：{e}")
        return pd.DataFrame()


def get_savant_pitcher_discipline(year: int = None, min_pitches: int = 1) -> pd.DataFrame:
    """從 Savant plate-discipline leaderboard 取得投手紀律數據（SwStr%, CSW% 等）"""
    if year is None:
        year = datetime.now().year

    def _fetch(yr):
        url = (
            f"https://baseballsavant.mlb.com/leaderboard/plate-discipline"
            f"?type=pitcher&year={yr}&min={min_pitches}&csv=true"
        )
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        if "last_name, first_name" in df.columns:
            df["Name"] = df["last_name, first_name"].apply(_flip_name)
        elif "player_name" in df.columns:
            df["Name"] = df["player_name"]
        return df

    try:
        df = _fetch(year)
        if len(df) < 30:
            df_prev = _fetch(year - 1)
            existing_names = set(df["Name"].dropna()) if "Name" in df.columns else set()
            df = pd.concat([df, df_prev[~df_prev["Name"].isin(existing_names)]], ignore_index=True)
        return df
    except Exception as e:
        st.warning(f"⚠️ Savant 投手紀律數據抓取失敗：{e}")
        return pd.DataFrame()


def get_savant_bat_tracking(year: int = None, min_swings: int = 100) -> pd.DataFrame:
    """從 Savant 取得揮棒力學數據（avg_bat_speed, squared_up, blast, whiff 等）"""
    if year is None:
        year = datetime.now().year

    def _fetch(yr):
        url = (
            f"https://baseballsavant.mlb.com/leaderboard/bat-tracking"
            f"?type=batter&year={yr}&min={min_swings}&csv=true"
        )
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
        # bat-tracking CSV 用 'name' 欄位，格式為 'Last, First'
        if "name" in df.columns:
            df["Name"] = df["name"].apply(_flip_name)
        return df

    try:
        df = _fetch(year)
        if len(df) < 50:
            df_prev = _fetch(year - 1)
            existing_names = set(df["Name"].dropna()) if "Name" in df.columns else set()
            df = pd.concat([df, df_prev[~df_prev["Name"].isin(existing_names)]], ignore_index=True)
        return df
    except Exception:
        return pd.DataFrame()
