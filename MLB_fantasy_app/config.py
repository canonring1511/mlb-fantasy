"""
Fantasy Baseball 設定檔
根據你的 Yahoo League 設定調整
"""

# ── Yahoo 聯盟類別 ──────────────────────────────
BATTING_CATEGORIES  = ["H", "HR", "RBI", "SB", "AVG", "BB", "2B", "3B", "K"]
PITCHING_CATEGORIES = ["W", "SV", "ERA", "WHIP", "SO", "HLD", "BB", "IP"]
# QS（Quality Starts）MLB Stats API 無法提供，已移除

# ── PR 方向設定 ─────────────────────────────────
# 打者：K（被三振次數）越少越好
BATTING_LOWER_IS_BETTER = ["K"]

# 投手：ERA、WHIP、BB（保送數）越少越好
# 注意：打者的 BB（四壞球）是越多越好，所以分開設定
PITCHING_LOWER_IS_BETTER = ["ERA", "WHIP", "BB"]

# ── MLB API 欄位對應表 ───────────────────────────
# Yahoo 顯示的類別名稱 → MLB Stats API DataFrame 欄位名稱
# MLB API 以 "B" 代表 walks（BB），"K" 代表 strikeouts

BATTING_FG_COLS = {
    "R":   "R",
    "HR":  "HR",
    "RBI": "RBI",
    "SB":  "SB",
    "AVG": "AVG",
    "BB":  "B",   # 打者四壞球 = API 欄位 "B"
    "2B":  "2B",
    "3B":  "3B",
    "K":   "K",   # 打者被三振次數
    "H":   "H",
    "OBP": "OBP",
    "OPS": "OPS",
}

PITCHING_FG_COLS = {
    "W":    "W",
    "SV":   "SV",
    "ERA":  "ERA",
    "WHIP": "WHIP",
    "SO":   "K",   # Yahoo 顯示 SO = API 欄位 "K"（strikeOuts）
    "K":    "K",
    "HLD":  "HLD",
    "BB":   "B",   # 投手保送數 = API 欄位 "B"
    "IP":   "IP",
    "QS":   "QS",  # QS 查不到，PR 欄位會顯示 —
}

# ── Savant xStats 欄位 ──────────────────────────
SAVANT_BATTING_COLS = {
    "ba": "BA（實際打擊率）",
    "xba": "xBA（預期打擊率）",
    "slg": "SLG（實際長打率）",
    "xslg": "xSLG（預期長打率）",
    "woba": "wOBA（實際加權上壘率）",
    "xwoba": "xwOBA（預期加權上壘率）",
    "xobp": "xOBP（預期上壘率）",
    "xiso": "xISO（預期純長打率）",
    "babip": "BABIP（場內球打擊率）",
    "brl_percent": "Barrel%（桶打率）",
    "hard_hit_percent": "Hard Hit%（硬擊率）",
    "avg_exit_velocity": "平均出球速度",
    "avg_launch_angle": "平均仰角",
}

# ── 樣本數最低門檻 ──────────────────────────────
MIN_PA_SEASON = 100    # 全季 PR 計算最低打席
MIN_PA_30D = 30        # 近30天 PR 計算最低打席
MIN_IP_SEASON = 20     # 全季投手最低局數
MIN_IP_30D = 5         # 近30天投手最低局數

# ── PR 顏色閾值 ──────────────────────────────────
PR_COLOR_THRESHOLDS = {
    "elite": 80,    # >= 80 → 深綠
    "good":  60,    # 60-79 → 淺綠
    "average": 40,  # 40-59 → 黃色
    "below": 20,    # 20-39 → 橘色
    # < 20 → 紅色
}
