"""
陣容儲存/讀取模組
將陣容以 JSON 格式存在 rosters/ 資料夾
"""

import json
import os
from datetime import datetime
from pathlib import Path

ROSTER_DIR = Path(__file__).parent / "rosters"
ROSTER_DIR.mkdir(exist_ok=True)


def list_rosters() -> list[str]:
    """回傳所有已儲存的陣容名稱（不含副檔名）"""
    files = sorted(ROSTER_DIR.glob("*.json"), key=os.path.getmtime, reverse=True)
    return [f.stem for f in files]


def save_roster(
    roster_name: str,
    batters: list[str],
    pitchers: list[str],
) -> str:
    """
    儲存陣容到 JSON 檔案。

    Returns:
        儲存的檔案路徑
    """
    # 檔名安全化（移除特殊字元）
    safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in roster_name).strip()
    if not safe_name:
        safe_name = "my_roster"

    path = ROSTER_DIR / f"{safe_name}.json"
    data = {
        "name": roster_name,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "batters": [b.strip() for b in batters if b.strip()],
        "pitchers": [p.strip() for p in pitchers if p.strip()],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return str(path)


def load_roster(roster_name: str) -> dict:
    """
    讀取指定陣容。

    Returns:
        {"name": str, "saved_at": str, "batters": list, "pitchers": list}
    """
    path = ROSTER_DIR / f"{roster_name}.json"
    if not path.exists():
        raise FileNotFoundError(f"找不到陣容檔案：{path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def delete_roster(roster_name: str) -> bool:
    """刪除指定陣容，回傳是否成功"""
    path = ROSTER_DIR / f"{roster_name}.json"
    if path.exists():
        path.unlink()
        return True
    return False
