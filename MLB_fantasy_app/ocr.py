"""
截圖 OCR 模組：用 Google Gemini Vision 從 Yahoo Fantasy 截圖辨識球員名單
"""

import os
import re
import io

from dotenv import load_dotenv
from google import genai
from PIL import Image

load_dotenv()

# 打者守備位置（含 Util / BN 時要看括號）
BATTER_POSITIONS  = {"C", "1B", "2B", "3B", "SS", "OF", "LF", "CF", "RF", "DH", "Util", "UTIL"}
PITCHER_POSITIONS = {"SP", "RP", "P"}


def _get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError(
            "找不到 GEMINI_API_KEY！\n"
            "請在 MLB_fantasy_app/.env 檔案中設定：\n"
            "GEMINI_API_KEY=your_key_here"
        )
    return genai.Client(api_key=api_key)


def extract_roster_from_screenshot(image_bytes: bytes) -> dict[str, list[str]]:
    """
    從 Yahoo Fantasy 陣容截圖中辨識球員名字，並依打者/投手分類。

    Returns:
        {
            "batters":  ["Shohei Ohtani", "Aaron Judge", ...],
            "pitchers": ["Logan Webb", "Tyler Rogers", ...],
        }
    """
    client = _get_client()
    image = Image.open(io.BytesIO(image_bytes))

    prompt = """This is a Yahoo Fantasy Baseball roster screenshot.

For EACH player visible, output ONE line in this exact format:
  POSITION|Player Full Name

Where POSITION is the slot label shown next to the player (e.g. C, 1B, 2B, 3B, SS, OF, Util, SP, RP, BN, DL, IL).
- If a BN/DL/IL player has a position in parentheses like "(SP)" or "(1B)", use that parenthetical position instead of BN/DL/IL.
- For two-way players like Shohei Ohtani who appear TWICE (once as hitter, once as pitcher), output BOTH lines with their respective positions.
- Use the full English name as shown.
- Do NOT include stats, team names, or ownership%.

Example output:
C|Will Smith
1B|Freddie Freeman
SP|Clayton Kershaw
RP|Tyler Rogers
BN|Luis Arraez
SP|Shohei Ohtani
DH|Shohei Ohtani"""

    response = _generate_with_fallback(client, [prompt, image])
    return _parse_roster_with_positions(response.text)


def extract_fa_players_from_screenshot(image_bytes: bytes) -> list[str]:
    """
    從 Yahoo Fantasy FA 瀏覽截圖中辨識球員名字。

    Returns:
        list of player names
    """
    client = _get_client()
    image = Image.open(io.BytesIO(image_bytes))

    prompt = """This is a Yahoo Fantasy Baseball Free Agent (FA) player list screenshot.

Please extract ALL player names visible in this image.

Rules:
- Return ONLY the player names, one per line
- Use the full English name as shown
- Remove position labels, team names, ownership%, stats columns
- Do NOT include column headers
- Include players marked as "Add" or available

Example output:
Luis Arraez
Jake McCarthy
Cedric Mullins"""

    response = _generate_with_fallback(client, [prompt, image])
    return _parse_player_names(response.text)


def _generate_with_fallback(client, contents):
    """依序嘗試多個模型，第一個成功的就回傳"""
    models = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-001",
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
    ]
    last_error = None
    for model_name in models:
        try:
            return client.models.generate_content(
                model=model_name,
                contents=contents,
            )
        except Exception as e:
            err_str = str(e)
            if any(code in err_str for code in ["429", "RESOURCE_EXHAUSTED", "404", "NOT_FOUND", "503", "UNAVAILABLE"]):
                last_error = e
                continue
            raise
    raise RuntimeError(
        "所有 Gemini 模型均無法使用。\n"
        f"最後錯誤：{last_error}\n"
        "請改用下方「手動輸入」欄位填入球員名字。"
    )


def _parse_roster_with_positions(text: str) -> dict[str, list[str]]:
    """
    解析 'POSITION|Name' 格式，分類成打者和投手。
    同一球員若同時是打者和投手（如 Ohtani），只計入對應類別各一次。
    """
    batters: list[str] = []
    pitchers: list[str] = []
    seen_batters: set[str] = set()
    seen_pitchers: set[str] = set()

    for line in text.strip().split("\n"):
        line = line.strip()
        if "|" not in line:
            continue
        parts = line.split("|", 1)
        if len(parts) != 2:
            continue

        pos_raw = parts[0].strip().upper()
        name = _clean_name(parts[1])
        if not name:
            continue

        # 去掉括號，取主要位置
        pos = re.sub(r"[()（）]", "", pos_raw).strip()

        if pos in PITCHER_POSITIONS:
            if name not in seen_pitchers:
                pitchers.append(name)
                seen_pitchers.add(name)
        elif pos in BATTER_POSITIONS or pos in {"BN", "DL", "IL", "NA"}:
            # BN/DL 預設為打者；若截圖括號內是投手位置，Gemini 應已取代
            if name not in seen_batters:
                batters.append(name)
                seen_batters.add(name)
        else:
            # 不認識的位置 → 看名字有沒有已分類過
            if name not in seen_batters and name not in seen_pitchers:
                batters.append(name)   # 預設打者
                seen_batters.add(name)

    return {"batters": batters, "pitchers": pitchers}


def _parse_player_names(text: str) -> list[str]:
    """清理 Gemini 回傳的純球員名單文字"""
    lines = text.strip().split("\n")
    players = []
    for line in lines:
        line = re.sub(r"^\d+\.\s*", "", line.strip())
        line = re.sub(r"^[-•*]\s*", "", line.strip())
        line = line.rstrip("?").strip()
        if len(line) > 2:
            players.append(line)
    return players


def _clean_name(name: str) -> str:
    """移除名字中的雜訊（包含 Yahoo 可能附加的位置標籤）"""
    name = name.strip()
    # 移除括號內的位置/類型說明：(PITCHER), (SP), (Batter), (Two-Way) 等
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name)
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", name)
    # 移除序號和符號
    name = re.sub(r"^\d+\.\s*", "", name)
    name = re.sub(r"^[-•*]\s*", "", name)
    name = name.rstrip("?").strip()
    return name if len(name) > 2 else ""
