"""
截圖 OCR 模組：優先用 Tesseract（不需 API Key），有 Gemini Key 時自動升級
"""

import os
import re
import io
import logging

from dotenv import load_dotenv
from PIL import Image, ImageEnhance, ImageFilter

load_dotenv()
logger = logging.getLogger(__name__)

# ── 常數 ──────────────────────────────────────────────────────────

BATTER_POSITIONS  = {"C", "1B", "2B", "3B", "SS", "OF", "LF", "CF", "RF", "DH", "UTIL", "BN", "IL", "DL", "NA"}
PITCHER_POSITIONS = {"SP", "RP", "P"}
ALL_POSITIONS     = BATTER_POSITIONS | PITCHER_POSITIONS

MLB_TEAMS = {
    "ARI", "ATL", "BAL", "BOS", "CHC", "CWS", "CHW", "CIN", "CLE", "COL",
    "DET", "HOU", "KC",  "KCR", "LAA", "LAD", "MIA", "MIL", "MIN", "NYM",
    "NYY", "OAK", "PHI", "PIT", "SD",  "SDP", "SEA", "SF",  "SFG", "STL",
    "TB",  "TBR", "TEX", "TOR", "WSH", "WSN",
}

NAME_SUFFIXES = {"Jr.", "Sr.", "Jr", "Sr", "II", "III", "IV"}


# ═══════════════════════════════════════════════════════════════════
# Tesseract OCR（主要路徑，不需 API Key）
# ═══════════════════════════════════════════════════════════════════

def _preprocess(image: Image.Image) -> Image.Image:
    """灰階 + 放大 2x + 提高對比，讓 Tesseract 辨識率更好。"""
    img = image.convert("L")
    w, h = img.size
    # 最多放大到 2000px 寬，避免記憶體暴增
    scale = min(2, 2000 / max(w, 1))
    if scale > 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    img = ImageEnhance.Contrast(img).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def _is_team_token(token: str) -> bool:
    """判斷是否為球隊縮寫（含 LAD-C、LAD-SP 這類合併格式）。"""
    t = re.sub(r"[^\w]", "", token).upper()
    if t in MLB_TEAMS:
        return True
    # 處理 "LAD-C"、"LADSP" 等 Tesseract 合併讀取的情況
    for team in MLB_TEAMS:
        if t.startswith(team) and len(t) > len(team):
            return True
    return False


def _is_name_word(word: str) -> bool:
    """判斷是否可能是球員名字的一部分。"""
    clean = re.sub(r"[^\w.]", "", word)
    if not clean or len(clean) < 2:
        return False
    if clean.upper() in ALL_POSITIONS or clean.upper() in MLB_TEAMS:
        return False
    if re.match(r"^[\d.%/-]+$", clean):
        return False
    if not clean[0].isupper():
        return False
    return True


def _extract_name(tokens: list[str]) -> str:
    """從 token 列表中提取球員名字（遇到球隊縮寫停止）。"""
    parts = []
    for token in tokens:
        clean = re.sub(r"[^\w.]", "", token)
        if not clean:
            continue
        # 遇到球隊縮寫停止
        if _is_team_token(clean):
            break
        # 遇到位置標籤且名字已有至少一個字停止
        if clean.upper() in ALL_POSITIONS and parts:
            break
        # 允許名字後綴
        if clean in NAME_SUFFIXES and parts:
            parts.append(clean)
            break
        if _is_name_word(clean):
            parts.append(clean)
        elif parts:
            # 已開始收集名字後遇到非名字 token，停止
            break

    return " ".join(parts) if len(parts) >= 2 else ""


def _tesseract_roster(image: Image.Image) -> dict:
    """用 Tesseract 解析陣容截圖。"""
    import pytesseract
    img = _preprocess(image)
    raw = pytesseract.image_to_string(img, config="--psm 6 --oem 3")
    logger.info("Tesseract roster raw:\n%s", raw[:500])

    batters, pitchers = [], []
    seen_b, seen_p = set(), set()

    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        tokens = line.split()
        if not tokens:
            continue

        # 找行首的位置標籤（允許 OCR 誤讀，如 "1b" → "1B"）
        pos = None
        name_start = 0
        for i, tok in enumerate(tokens[:3]):
            candidate = re.sub(r"[^\w]", "", tok).upper()
            if candidate in ALL_POSITIONS:
                pos = candidate
                name_start = i + 1
                break

        if pos is None:
            continue

        # 跳過 IL / DL 括號旁的位置說明，如 "(SP)"
        if name_start < len(tokens):
            skip = re.sub(r"[^\w]", "", tokens[name_start]).upper()
            if skip in ALL_POSITIONS:
                name_start += 1

        name = _extract_name(tokens[name_start:])
        if not name:
            continue

        if pos in PITCHER_POSITIONS:
            if name not in seen_p:
                pitchers.append(name)
                seen_p.add(name)
        else:
            if name not in seen_b:
                batters.append(name)
                seen_b.add(name)

    return {"batters": batters, "pitchers": pitchers}


def _tesseract_fa(image: Image.Image) -> list[str]:
    """用 Tesseract 解析 FA 列表截圖。"""
    import pytesseract
    img = _preprocess(image)
    raw = pytesseract.image_to_string(img, config="--psm 6 --oem 3")
    logger.info("Tesseract FA raw:\n%s", raw[:500])

    players = []
    seen = set()

    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        tokens = line.split()
        if not tokens:
            continue

        # 跳過 "Add" / "Drop" 等按鈕文字
        start = 0
        if tokens[0].lower() in ("add", "added", "drop", "waiver", "+"):
            start = 1

        # 跳過行首的位置標籤（FA 頁面偶爾會出現）
        if start < len(tokens):
            candidate = re.sub(r"[^\w]", "", tokens[start]).upper()
            if candidate in ALL_POSITIONS:
                start += 1

        name = _extract_name(tokens[start:])
        if name and name not in seen:
            players.append(name)
            seen.add(name)

    return players


# ═══════════════════════════════════════════════════════════════════
# Gemini OCR（有 API Key 時使用，準確度更高）
# ═══════════════════════════════════════════════════════════════════

def _gemini_client():
    from google import genai
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


def _generate_with_fallback(client, contents):
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
            return client.models.generate_content(model=model_name, contents=contents)
        except Exception as e:
            err_str = str(e)
            if any(code in err_str for code in ["429", "RESOURCE_EXHAUSTED", "404", "NOT_FOUND", "503", "UNAVAILABLE"]):
                last_error = e
                continue
            raise
    raise RuntimeError(f"所有 Gemini 模型均無法使用。最後錯誤：{last_error}")


def _gemini_roster(image: Image.Image) -> dict:
    client = _gemini_client()
    prompt = """This is a Yahoo Fantasy Baseball roster screenshot.
For EACH player visible, output ONE line in this exact format:
  POSITION|Player Full Name
Where POSITION is the slot label (C, 1B, 2B, 3B, SS, OF, Util, SP, RP, BN, IL).
- If BN/IL player has a position in parentheses like (SP), use that instead.
- Two-way players like Ohtani who appear twice: output BOTH lines.
- Full English name only. No stats, team names, or ownership%.
Example:
C|Will Smith
SP|Gerrit Cole
BN|Luis Arraez"""
    resp = _generate_with_fallback(client, [prompt, image])
    return _parse_roster_lines(resp.text)


def _gemini_fa(image: Image.Image) -> list[str]:
    client = _gemini_client()
    prompt = """This is a Yahoo Fantasy Baseball Free Agent list screenshot.
Extract ALL player names visible. Return ONLY names, one per line.
No positions, teams, stats, or ownership%.
Example:
Luis Arraez
Jake McCarthy"""
    resp = _generate_with_fallback(client, [prompt, image])
    return _parse_name_lines(resp.text)


# ═══════════════════════════════════════════════════════════════════
# 解析工具
# ═══════════════════════════════════════════════════════════════════

def _parse_roster_lines(text: str) -> dict:
    batters, pitchers = [], []
    seen_b, seen_p = set(), set()
    for line in text.strip().splitlines():
        line = line.strip()
        if "|" not in line:
            continue
        parts = line.split("|", 1)
        pos_raw = re.sub(r"[()（）]", "", parts[0].strip()).upper()
        name = _clean_name(parts[1])
        if not name:
            continue
        if pos_raw in PITCHER_POSITIONS:
            if name not in seen_p:
                pitchers.append(name)
                seen_p.add(name)
        elif pos_raw in BATTER_POSITIONS or pos_raw in {"BN", "DL", "IL", "NA"}:
            if name not in seen_b:
                batters.append(name)
                seen_b.add(name)
        else:
            if name not in seen_b and name not in seen_p:
                batters.append(name)
                seen_b.add(name)
    return {"batters": batters, "pitchers": pitchers}


def _parse_name_lines(text: str) -> list[str]:
    players = []
    for line in text.strip().splitlines():
        line = re.sub(r"^\d+\.\s*", "", line.strip())
        line = re.sub(r"^[-•*]\s*", "", line.strip())
        line = line.rstrip("?").strip()
        if len(line) > 2:
            players.append(line)
    return players


def _clean_name(name: str) -> str:
    name = name.strip()
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name)
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", name)
    name = re.sub(r"^\d+\.\s*", "", name)
    name = re.sub(r"^[-•*]\s*", "", name)
    return name.rstrip("?").strip() if len(name.strip()) > 2 else ""


# ═══════════════════════════════════════════════════════════════════
# 公開 API（優先 Gemini，沒有 Key 就用 Tesseract）
# ═══════════════════════════════════════════════════════════════════

def extract_roster_from_screenshot(image_bytes: bytes) -> dict:
    """從 Yahoo Fantasy 陣容截圖辨識球員，自動選擇 OCR 引擎。"""
    image = Image.open(io.BytesIO(image_bytes))

    # 有 Gemini Key → 用 Gemini（準確度更高）
    if os.getenv("GEMINI_API_KEY"):
        try:
            return _gemini_roster(image)
        except Exception as e:
            logger.warning("Gemini roster failed (%s), falling back to Tesseract", e)

    # 沒有 Key 或 Gemini 失敗 → 用 Tesseract
    try:
        return _tesseract_roster(image)
    except Exception as e:
        logger.error("Tesseract roster failed: %s", e)
        raise RuntimeError(
            "OCR 辨識失敗。請確認伺服器已安裝 tesseract-ocr，"
            "或在設定頁面填入 Gemini API Key。"
        )


def extract_fa_players_from_screenshot(image_bytes: bytes) -> list:
    """從 Yahoo Fantasy FA 截圖辨識球員名單，自動選擇 OCR 引擎。"""
    image = Image.open(io.BytesIO(image_bytes))

    if os.getenv("GEMINI_API_KEY"):
        try:
            return _gemini_fa(image)
        except Exception as e:
            logger.warning("Gemini FA failed (%s), falling back to Tesseract", e)

    try:
        return _tesseract_fa(image)
    except Exception as e:
        logger.error("Tesseract FA failed: %s", e)
        raise RuntimeError(
            "OCR 辨識失敗。請確認伺服器已安裝 tesseract-ocr，"
            "或在設定頁面填入 Gemini API Key。"
        )
