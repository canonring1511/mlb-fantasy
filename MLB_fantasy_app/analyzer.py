"""
分析模組：計算 PR（百分位排名）並產生陣容強弱分析
"""

import numpy as np
import pandas as pd


def _percentileofscore(a: np.ndarray, score: float) -> float:
    """numpy replacement for scipy.stats.percentileofscore(kind='rank')"""
    n = len(a)
    if n == 0:
        return np.nan
    left  = np.count_nonzero(a < score)
    right = np.count_nonzero(a <= score)
    return (left + right + (1 if right > left else 0)) / (2 * n) * 100

from config import (
    BATTING_CATEGORIES,
    BATTING_FG_COLS,
    BATTING_LOWER_IS_BETTER,
    MIN_PA_30D,
    MIN_PA_SEASON,
    MIN_IP_30D,
    MIN_IP_SEASON,
    PITCHING_CATEGORIES,
    PITCHING_FG_COLS,
    PITCHING_LOWER_IS_BETTER,
    PR_COLOR_THRESHOLDS,
)


# ─────────────────────────────────────────────────
# PR 計算核心
# ─────────────────────────────────────────────────

def compute_pr(
    player_value: float,
    all_values: pd.Series,
    lower_is_better: bool = False,
) -> float:
    """
    計算球員在某項數據中的百分位排名（PR）。

    Args:
        player_value: 該球員的數值
        all_values: 所有球員的數值（當作母體）
        lower_is_better: ERA/WHIP 等越低越好的指標

    Returns:
        PR 值 0-100（100 = 最強）
    """
    if pd.isna(player_value):
        return np.nan
    clean_values = all_values.dropna().values
    if len(clean_values) == 0:
        return np.nan

    pr = _percentileofscore(clean_values, player_value)

    # ERA/WHIP 等：越低 PR 越高
    if lower_is_better:
        pr = 100 - pr

    return round(pr, 1)


def compute_all_pr(
    df_player: pd.DataFrame,
    df_all: pd.DataFrame,
    categories: list[str],
    col_map: dict,
    lower_is_better_list: list[str] = None,
) -> pd.DataFrame:
    """
    對多個球員、多個項目計算 PR 值。

    Returns:
        DataFrame，columns = ['Name'] + categories (PR values)
    """
    if lower_is_better_list is None:
        lower_is_better_list = []

    results = []
    for _, player_row in df_player.iterrows():
        row = {"Name": player_row.get("Name", player_row.get("OCR_Name", "Unknown"))}
        for cat in categories:
            col = col_map.get(cat, cat)
            if col not in df_all.columns:
                row[cat] = np.nan
                continue
            player_val = player_row.get(col, np.nan)
            all_vals = df_all[col]
            lower = cat in lower_is_better_list
            row[cat] = compute_pr(player_val, all_vals, lower_is_better=lower)
        results.append(row)

    return pd.DataFrame(results)


# ─────────────────────────────────────────────────
# 打者分析
# ─────────────────────────────────────────────────

def analyze_batters(
    roster_df: pd.DataFrame,
    all_batters_df: pd.DataFrame,
    time_period: str = "season",  # "season" or "30d"
    categories: list[str] = None,
) -> dict:
    """
    分析陣容打者的各項 PR 值，回傳完整分析結果。

    Returns:
        {
            "pr_table": DataFrame,          # 各球員各項目 PR 值
            "team_totals": Series,          # 陣容 PR 加總
            "strengths": list,              # 強項（PR 加總最高的前幾項）
            "weaknesses": list,             # 弱項
        }
    """
    if categories is None:
        categories = BATTING_CATEGORIES

    # 最低打席門檻過濾（只用來計算 PR 母體）
    # 自動依據實際資料調整門檻（球季初期 PA 數較少）
    base_min = MIN_PA_SEASON if time_period == "season" else MIN_PA_30D
    pa_col = "PA" if "PA" in all_batters_df.columns else None
    if pa_col:
        actual_max_pa = all_batters_df[pa_col].max()
        min_pa = min(base_min, max(10, actual_max_pa * 0.3))
        qualified_all = all_batters_df[all_batters_df[pa_col] >= min_pa]
        if qualified_all.empty:
            qualified_all = all_batters_df  # 完全沒資料時不過濾
    else:
        qualified_all = all_batters_df

    pr_table = compute_all_pr(
        roster_df, qualified_all, categories, BATTING_FG_COLS,
        lower_is_better_list=BATTING_LOWER_IS_BETTER,
    )

    team_totals = pr_table[categories].sum(skipna=True)
    n_players = pr_table[categories].notna().sum()
    team_avg = pr_table[categories].mean(skipna=True)

    # 強弱項排序
    sorted_cats = team_avg.sort_values(ascending=False)
    strengths = sorted_cats.head(2).index.tolist()
    weaknesses = sorted_cats.tail(2).index.tolist()

    return {
        "pr_table": pr_table,
        "team_totals": team_totals,
        "team_avg": team_avg,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "n_players": n_players,
    }


# ─────────────────────────────────────────────────
# 投手分析
# ─────────────────────────────────────────────────

def analyze_pitchers(
    roster_df: pd.DataFrame,
    all_pitchers_df: pd.DataFrame,
    time_period: str = "season",
    categories: list[str] = None,
) -> dict:
    """分析陣容投手的各項 PR 值"""
    if categories is None:
        categories = PITCHING_CATEGORIES

    base_min_ip = MIN_IP_SEASON if time_period == "season" else MIN_IP_30D
    ip_col = "IP" if "IP" in all_pitchers_df.columns else None
    if ip_col:
        actual_max_ip = all_pitchers_df[ip_col].max()
        min_ip = min(base_min_ip, max(3, actual_max_ip * 0.2))
        qualified_all = all_pitchers_df[all_pitchers_df[ip_col] >= min_ip]
        if qualified_all.empty:
            qualified_all = all_pitchers_df
    else:
        qualified_all = all_pitchers_df

    pr_table = compute_all_pr(
        roster_df, qualified_all, categories, PITCHING_FG_COLS,
        lower_is_better_list=PITCHING_LOWER_IS_BETTER,
    )

    team_avg = pr_table[categories].mean(skipna=True)
    sorted_cats = team_avg.sort_values(ascending=False)

    return {
        "pr_table": pr_table,
        "team_totals": pr_table[categories].sum(skipna=True),
        "team_avg": team_avg,
        "strengths": sorted_cats.head(2).index.tolist(),
        "weaknesses": sorted_cats.tail(2).index.tolist(),
    }


# ─────────────────────────────────────────────────
# FA 球員分析
# ─────────────────────────────────────────────────

def analyze_fa_players(
    fa_df: pd.DataFrame,
    all_df: pd.DataFrame,
    categories: list[str],
    col_map: dict,
    is_pitcher: bool = False,
) -> pd.DataFrame:
    """
    分析 FA 球員並依照綜合 PR 排序。
    回傳加上 PR 欄位、PR_Total 的 DataFrame。
    """
    pr_table = compute_all_pr(fa_df, all_df, categories, col_map)
    pr_cols = [c for c in categories if c in pr_table.columns]
    pr_table["PR_Total"] = pr_table[pr_cols].sum(axis=1, skipna=True)
    pr_table["PR_Avg"] = pr_table[pr_cols].mean(axis=1, skipna=True)
    pr_table = pr_table.sort_values("PR_Total", ascending=False)
    return pr_table


# ─────────────────────────────────────────────────
# Savant 運氣分析
# ─────────────────────────────────────────────────

def analyze_savant_luck(
    player_names: list[str],
    savant_df: pd.DataFrame,
    ev_df: pd.DataFrame = None,
) -> list[dict]:
    """
    分析球員擊球品質，對各 Fantasy 類別給出「看漲/維持/看跌」結論。

    Returns:
        list of dicts, 每個 dict 代表一個球員的完整分析結果
    """
    from data_fetcher import fuzzy_match_player

    results = []
    for name in player_names:
        entry = {"name": name, "found": False}

        s_row = None
        e_row = None

        if not savant_df.empty:
            matched = fuzzy_match_player(name, savant_df, "Name")
            if matched:
                s_row = savant_df[savant_df["Name"] == matched].iloc[0].to_dict()
                entry["found"] = True

        if ev_df is not None and not ev_df.empty:
            matched_ev = fuzzy_match_player(name, ev_df, "Name")
            if matched_ev:
                e_row = ev_df[ev_df["Name"] == matched_ev].iloc[0].to_dict()
                entry["found"] = True

        # ── 原始數據（Savant CSV 實際欄位名稱）──
        # expected_statistics CSV：ba, est_ba, slg, est_slg, woba, est_woba
        # statcast leaderboard CSV：avg_hit_speed, avg_hit_angle, brl_percent, ev95percent
        def fget(d, *keys, default=np.nan):
            if d is None:
                return default
            for key in keys:
                val = d.get(key)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        continue
            return default

        ba    = fget(s_row, "ba")
        xba   = fget(s_row, "est_ba")           # Savant 用 est_ba 代表 xBA
        slg   = fget(s_row, "slg")
        xslg  = fget(s_row, "est_slg")          # est_slg = xSLG
        woba  = fget(s_row, "woba")
        xwoba = fget(s_row, "est_woba")          # est_woba = xwOBA
        babip = fget(s_row, "babip")
        brl   = fget(e_row, "brl_percent")
        hh    = fget(e_row, "ev95percent")       # ev95percent ≈ Hard Hit% (EV ≥ 95mph)
        ev    = fget(e_row, "avg_hit_speed")     # avg_hit_speed = 平均出球速度
        la    = fget(e_row, "avg_hit_angle")     # avg_hit_angle = 平均仰角

        entry.update({
            "ba": ba, "xba": xba,
            "slg": slg, "xslg": xslg,
            "woba": woba, "xwoba": xwoba,
            "babip": babip, "brl": brl,
            "hard_hit": hh, "ev": ev, "la": la,
        })

        # ── 各類別結論 ──
        entry["verdicts"] = _build_verdicts(ba, xba, slg, xslg, woba, xwoba, babip, brl, hh, ev, la)

        # ── 整體一句話總結 ──
        entry["summary"] = _overall_summary(entry["verdicts"], ba, xba, babip, brl, hh)

        results.append(entry)

    return results


# ── 各類別結論邏輯 ─────────────────────────────────

def _build_verdicts(ba, xba, slg, xslg, woba, xwoba, babip, brl, hh, ev, la) -> dict:
    """
    對每個 Fantasy 打者類別產生「verdict」和「reason」。
    verdict: "up" / "hold" / "down"
    """
    v = {}

    # ── AVG / H ─────────────────────────────────
    signals_avg = []
    if not np.isnan(xba) and not np.isnan(ba):
        diff = xba - ba
        if diff > 0.025:
            signals_avg.append(("up",   f"xBA {xba:.3f} > BA {ba:.3f}（差距 {diff:+.3f}），擊球品質優於結果"))
        elif diff < -0.025:
            signals_avg.append(("down", f"xBA {xba:.3f} < BA {ba:.3f}（差距 {diff:+.3f}），結果優於擊球品質"))
        else:
            signals_avg.append(("hold", f"xBA {xba:.3f} 與 BA {ba:.3f} 接近，表現真實"))
    if not np.isnan(babip):
        if babip > 0.340:
            signals_avg.append(("down", f"BABIP {babip:.3f} 偏高（聯盟均值約 .300），場內球運氣好，可能回落"))
        elif babip < 0.260:
            signals_avg.append(("up",   f"BABIP {babip:.3f} 偏低，場內球運氣差，AVG 有上修空間"))
    if not np.isnan(hh):
        if hh >= 50:
            signals_avg.append(("up",   f"Hard Hit% {hh:.1f}% 高，擊球品質紮實可持續"))
        elif hh < 35:
            signals_avg.append(("down", f"Hard Hit% {hh:.1f}% 偏低，擊球品質不穩"))
    v["AVG/H"] = _aggregate_signals(signals_avg)

    # ── HR ──────────────────────────────────────
    signals_hr = []
    if not np.isnan(brl):
        if brl >= 15:
            signals_hr.append(("up",   f"Barrel% {brl:.1f}% 極高（菁英水準 ≥15%），HR 產能可持續"))
        elif brl >= 8:
            signals_hr.append(("hold", f"Barrel% {brl:.1f}% 中等（8-14%），HR 表現屬正常範圍"))
        else:
            signals_hr.append(("down", f"Barrel% {brl:.1f}% 偏低（<8%），目前 HR 可能含運氣成分"))
    if not np.isnan(xslg) and not np.isnan(slg):
        diff = xslg - slg
        if diff > 0.05:
            signals_hr.append(("up",   f"xSLG {xslg:.3f} > SLG {slg:.3f}，長打仍被低估"))
        elif diff < -0.05:
            signals_hr.append(("down", f"xSLG {xslg:.3f} < SLG {slg:.3f}，長打有高估風險"))
    if not np.isnan(la):
        if 15 <= la <= 30:
            signals_hr.append(("up",   f"平均仰角 {la:.1f}° 在最佳 HR 區間（15-30°）"))
        elif la < 10:
            signals_hr.append(("down", f"平均仰角 {la:.1f}° 偏低，擊球多滾地，HR 受限"))
        elif la > 35:
            signals_hr.append(("down", f"平均仰角 {la:.1f}° 過高，飛球過深易被接殺"))
    v["HR"] = _aggregate_signals(signals_hr)

    # ── RBI ─────────────────────────────────────
    signals_rbi = []
    if not np.isnan(xwoba) and not np.isnan(woba):
        diff = xwoba - woba
        if diff > 0.030:
            signals_rbi.append(("up",   f"xwOBA {xwoba:.3f} > wOBA {woba:.3f}，整體攻擊品質被低估，RBI 有望增加"))
        elif diff < -0.030:
            signals_rbi.append(("down", f"xwOBA {xwoba:.3f} < wOBA {woba:.3f}，RBI 表現優於擊球品質，可能修正"))
        else:
            signals_rbi.append(("hold", f"xwOBA {xwoba:.3f} 與 wOBA {woba:.3f} 接近，RBI 產能穩定"))
    v["RBI"] = _aggregate_signals(signals_rbi)

    # ── SB ──────────────────────────────────────
    # Savant 沒有好的 SB 預測指標，直接說明
    v["SB"] = {
        "verdict": "hold",
        "icon": "➡️",
        "label": "維持",
        "reasons": ["SB 主要取決於盜壘意願與機會，Statcast 無直接預測指標"],
    }

    # ── 2B / 3B ─────────────────────────────────
    signals_xb = []
    if not np.isnan(la):
        if 8 <= la <= 20:
            signals_xb.append(("up",   f"平均仰角 {la:.1f}° 在二壘安打最佳區間（8-20°）"))
        elif la > 25:
            signals_xb.append(("down", f"仰角 {la:.1f}° 偏高，飛球多，二壘打減少"))
    if not np.isnan(ev):
        if ev >= 92:
            signals_xb.append(("up",   f"出球速度 {ev:.1f} mph 強勁，長打可期"))
        elif ev < 87:
            signals_xb.append(("down", f"出球速度 {ev:.1f} mph 偏軟，長打受限"))
    v["2B/3B"] = _aggregate_signals(signals_xb)

    # ── BB ──────────────────────────────────────
    v["BB"] = {
        "verdict": "hold",
        "icon": "➡️",
        "label": "維持",
        "reasons": ["BB（四壞球）主要反映選球紀律，Statcast 無直接預測指標"],
    }

    # ── K（打者被三振）────────────────────────────
    v["K"] = {
        "verdict": "hold",
        "icon": "➡️",
        "label": "維持",
        "reasons": ["K 預測需要揮空率（Whiff%）等資料，此資料集未提供"],
    }

    return v


def _aggregate_signals(signals: list[tuple]) -> dict:
    """將多個訊號彙整為一個結論"""
    if not signals:
        return {"verdict": "hold", "icon": "➡️", "label": "維持", "reasons": ["資料不足，無法判斷"]}

    ups   = sum(1 for s in signals if s[0] == "up")
    downs = sum(1 for s in signals if s[0] == "down")

    if ups > downs:
        verdict, icon, label = "up",   "📈", "看漲"
    elif downs > ups:
        verdict, icon, label = "down", "📉", "看跌"
    else:
        verdict, icon, label = "hold", "➡️", "維持"

    return {
        "verdict": verdict,
        "icon": icon,
        "label": label,
        "reasons": [s[1] for s in signals],
    }


def _overall_summary(verdicts: dict, ba, xba, babip, brl, hh) -> str:
    """給出一段整體文字總結"""
    parts = []

    # xBA 差距
    if not np.isnan(ba) and not np.isnan(xba):
        diff = xba - ba
        if diff > 0.025:
            parts.append(f"擊球品質（xBA {xba:.3f}）優於實際打擊率（{ba:.3f}），AVG/安打有上漲空間")
        elif diff < -0.025:
            parts.append(f"實際打擊率（{ba:.3f}）高於擊球品質（xBA {xba:.3f}），AVG 可能下修")

    # BABIP
    if not np.isnan(babip):
        if babip > 0.340:
            parts.append(f"BABIP {babip:.3f} 偏高，部分安打含場內球好運成分")
        elif babip < 0.260:
            parts.append(f"BABIP {babip:.3f} 偏低，實際成績被運氣壓低")

    # Barrel/HH
    if not np.isnan(brl):
        if brl >= 15:
            parts.append(f"Barrel% {brl:.1f}% 精英級，長打產能可持續")
        elif brl < 6:
            parts.append(f"Barrel% {brl:.1f}% 偏低，長打需留意")
    if not np.isnan(hh) and hh >= 50:
        parts.append(f"Hard Hit% {hh:.1f}% 高，整體擊球品質佳")

    up_cats   = [k for k, v in verdicts.items() if v["verdict"] == "up"]
    down_cats = [k for k, v in verdicts.items() if v["verdict"] == "down"]

    conclusion = "；".join(parts) if parts else "擊球數據與實際成績相符"
    if up_cats:
        conclusion += f"。【看漲類別】{' / '.join(up_cats)}"
    if down_cats:
        conclusion += f"。【留意類別】{' / '.join(down_cats)}"

    return conclusion


# ─────────────────────────────────────────────────
# 視覺化輔助
# ─────────────────────────────────────────────────

def pr_to_color(pr: float) -> str:
    """PR 值轉顏色（用於 DataFrame 樣式）"""
    if pd.isna(pr):
        return "color: gray"
    if pr >= PR_COLOR_THRESHOLDS["elite"]:
        return "background-color: #1a7a1a; color: white"
    elif pr >= PR_COLOR_THRESHOLDS["good"]:
        return "background-color: #5cb85c; color: white"
    elif pr >= PR_COLOR_THRESHOLDS["average"]:
        return "background-color: #f0ad4e; color: black"
    elif pr >= PR_COLOR_THRESHOLDS["below"]:
        return "background-color: #e87722; color: white"
    else:
        return "background-color: #d9534f; color: white"


def style_pr_table(df: pd.DataFrame, pr_cols: list[str]):
    """對 PR 表格套用顏色樣式"""
    styled = df.style
    for col in pr_cols:
        if col in df.columns:
            styled = styled.map(pr_to_color, subset=[col])
    styled = styled.format(
        {col: "{:.1f}" for col in pr_cols if col in df.columns},
        na_rep="—",
    )
    return styled


def get_radar_data(team_avg: pd.Series, categories: list[str]) -> dict:
    """準備雷達圖數據"""
    values = [team_avg.get(cat, 0) for cat in categories]
    return {
        "categories": categories,
        "values": values,
    }
