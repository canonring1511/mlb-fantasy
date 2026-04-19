"""
MLB Fantasy Baseball API Backend
FastAPI backend for the React mobile frontend
"""

import logging
import os
import sys
import traceback
from datetime import datetime, timedelta
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add the MLB_fantasy_app directory to path so we can reuse existing modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "MLB_fantasy_app"))

from analyzer import (
    analyze_batters,
    analyze_fa_players,
    analyze_pitchers,
    analyze_savant_luck,
    compute_pr,
)
from config import (
    BATTING_CATEGORIES,
    BATTING_FG_COLS,
    BATTING_LOWER_IS_BETTER,
    PITCHING_CATEGORIES,
    PITCHING_FG_COLS,
    PITCHING_LOWER_IS_BETTER,
)
from data_fetcher import (
    _fetch_mlb_stats,
    get_savant_batting_stats,
    get_savant_bat_tracking,
    get_savant_exit_velo,
    get_savant_plate_discipline,
    get_savant_sprint_speed,
    match_players_to_df,
)
from ocr import extract_fa_players_from_screenshot, extract_roster_from_screenshot

app = FastAPI(
    title="MLB Fantasy Baseball API",
    description="Backend API for MLB Fantasy Baseball mobile app",
    version="1.0.0",
)

# CORS — allow all origins in dev; restrict in production via env var
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── In-memory cache (simple dict, good enough for single-instance Render free tier) ──
_cache: dict = {}


def _cache_key(name: str, year: int, period: str) -> str:
    return f"{name}:{year}:{period}"


def _get_cached_df(key: str) -> Optional[pd.DataFrame]:
    entry = _cache.get(key)
    if entry and (datetime.now() - entry["ts"]).seconds < 3600:
        return entry["df"]
    return None


def _set_cache(key: str, df: pd.DataFrame):
    _cache[key] = {"df": df, "ts": datetime.now()}


def _period_days(period: str) -> int | None:
    """Return number of days for a rolling-window period, or None for full season."""
    if period == "30d":
        return 30
    if period == "14d":
        return 14
    return None


def _get_batters(year: int, period: str) -> pd.DataFrame:
    key = _cache_key("batters", year, period)
    df = _get_cached_df(key)
    if df is not None:
        return df
    days = _period_days(period)
    if days:
        end = datetime.now()
        start = end - timedelta(days=days)
        df = _fetch_mlb_stats(
            "hitting", year,
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
        )
        if df.empty:
            df = _fetch_mlb_stats("hitting", year)
    else:
        df = _fetch_mlb_stats("hitting", year)
    _set_cache(key, df)
    return df


def _get_pitchers(year: int, period: str) -> pd.DataFrame:
    key = _cache_key("pitchers", year, period)
    df = _get_cached_df(key)
    if df is not None:
        return df
    days = _period_days(period)
    if days:
        end = datetime.now()
        start = end - timedelta(days=days)
        df = _fetch_mlb_stats(
            "pitching", year,
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
        )
        if df.empty:
            df = _fetch_mlb_stats("pitching", year)
    else:
        df = _fetch_mlb_stats("pitching", year)
    _set_cache(key, df)
    return df


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to JSON-serializable records, replacing NaN with None."""
    return df.where(pd.notna(df), None).to_dict(orient="records")


# ── Request / Response models ──────────────────────────────

class PlayerListRequest(BaseModel):
    batters: list[str] = []
    pitchers: list[str] = []
    year: int = datetime.now().year
    period: str = "season"  # "season" or "30d"
    batting_categories: list[str] = BATTING_CATEGORIES
    pitching_categories: list[str] = PITCHING_CATEGORIES


class FAAnalysisRequest(BaseModel):
    batter_names: list[str] = []
    pitcher_names: list[str] = []
    year: int = datetime.now().year
    period: str = "season"
    batting_categories: list[str] = BATTING_CATEGORIES
    pitching_categories: list[str] = PITCHING_CATEGORIES


class AddDropRequest(BaseModel):
    roster_batters: list[str] = []
    roster_pitchers: list[str] = []
    drop_player: str
    add_player: str
    drop_type: str = "batter"   # "batter" or "pitcher"
    year: int = datetime.now().year
    period: str = "season"
    batting_categories: list[str] = BATTING_CATEGORIES
    pitching_categories: list[str] = PITCHING_CATEGORIES


class SavantRequest(BaseModel):
    player_names: list[str]
    year: int = datetime.now().year


# ── Health check ──────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "message": "MLB Fantasy API is running"}

@app.get("/health")
def health():
    return {"status": "ok"}


# ── OCR endpoints ─────────────────────────────────────────

@app.post("/ocr/roster")
async def ocr_roster(
    file: UploadFile = File(...),
    gemini_api_key: str = Form(...),
):
    """Extract batter/pitcher lists from a Yahoo Fantasy roster screenshot."""
    os.environ["GEMINI_API_KEY"] = gemini_api_key
    try:
        image_bytes = await file.read()
        result = extract_roster_from_screenshot(image_bytes)
        return result  # {"batters": [...], "pitchers": [...]}
    except Exception as e:
        logger.error("OCR roster error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ocr/fa")
async def ocr_fa(
    file: UploadFile = File(...),
    gemini_api_key: str = Form(...),
):
    """Extract player names from a Yahoo Fantasy FA screenshot."""
    os.environ["GEMINI_API_KEY"] = gemini_api_key
    try:
        image_bytes = await file.read()
        names = extract_fa_players_from_screenshot(image_bytes)
        return {"players": names}
    except Exception as e:
        logger.error("OCR FA error: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ── Roster analysis endpoint ──────────────────────────────

@app.post("/analyze/roster")
def analyze_roster(req: PlayerListRequest):
    """
    Given a list of batter and pitcher names, compute PR values
    for each player relative to all MLB players.
    """
    try:
        all_batters = _get_batters(req.year, req.period)
        all_pitchers = _get_pitchers(req.year, req.period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API fetch failed: {e}")

    result = {}

    # ── Batters ──
    if req.batters:
        roster_df, unmatched_b = match_players_to_df(req.batters, all_batters)
        if not roster_df.empty:
            batter_analysis = analyze_batters(
                roster_df, all_batters,
                time_period=req.period,
                categories=req.batting_categories,
            )
            result["batters"] = {
                "pr_table": _df_to_records(batter_analysis["pr_table"]),
                "team_avg": {
                    k: (None if (isinstance(v, float) and np.isnan(v)) else round(float(v), 1))
                    for k, v in batter_analysis["team_avg"].items()
                },
                "strengths": batter_analysis["strengths"],
                "weaknesses": batter_analysis["weaknesses"],
                "categories": req.batting_categories,
            }
        else:
            result["batters"] = None
        result["unmatched_batters"] = unmatched_b
    else:
        result["batters"] = None
        result["unmatched_batters"] = []

    # ── Pitchers ──
    if req.pitchers:
        roster_df_p, unmatched_p = match_players_to_df(req.pitchers, all_pitchers)
        if not roster_df_p.empty:
            pitcher_analysis = analyze_pitchers(
                roster_df_p, all_pitchers,
                time_period=req.period,
                categories=req.pitching_categories,
            )
            result["pitchers"] = {
                "pr_table": _df_to_records(pitcher_analysis["pr_table"]),
                "team_avg": {
                    k: (None if (isinstance(v, float) and np.isnan(v)) else round(float(v), 1))
                    for k, v in pitcher_analysis["team_avg"].items()
                },
                "strengths": pitcher_analysis["strengths"],
                "weaknesses": pitcher_analysis["weaknesses"],
                "categories": req.pitching_categories,
            }
        else:
            result["pitchers"] = None
        result["unmatched_pitchers"] = unmatched_p
    else:
        result["pitchers"] = None
        result["unmatched_pitchers"] = []

    return result


# ── FA analysis endpoint ──────────────────────────────────

@app.post("/analyze/fa")
def analyze_fa(req: FAAnalysisRequest):
    """
    Rank free agent players by PR score.
    """
    try:
        all_batters = _get_batters(req.year, req.period)
        all_pitchers = _get_pitchers(req.year, req.period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API fetch failed: {e}")

    result = {}

    if req.batter_names:
        fa_batter_df, unmatched_b = match_players_to_df(req.batter_names, all_batters)
        if not fa_batter_df.empty:
            ranked = analyze_fa_players(
                fa_batter_df, all_batters,
                req.batting_categories, BATTING_FG_COLS,
            )
            result["batters"] = _df_to_records(ranked)
            result["batter_categories"] = req.batting_categories
        else:
            result["batters"] = []
        result["unmatched_batters"] = unmatched_b
    else:
        result["batters"] = []
        result["unmatched_batters"] = []

    if req.pitcher_names:
        fa_pitcher_df, unmatched_p = match_players_to_df(req.pitcher_names, all_pitchers)
        if not fa_pitcher_df.empty:
            ranked_p = analyze_fa_players(
                fa_pitcher_df, all_pitchers,
                req.pitching_categories, PITCHING_FG_COLS,
                is_pitcher=True,
            )
            result["pitchers"] = _df_to_records(ranked_p)
            result["pitcher_categories"] = req.pitching_categories
        else:
            result["pitchers"] = []
        result["unmatched_pitchers"] = unmatched_p
    else:
        result["pitchers"] = []
        result["unmatched_pitchers"] = []

    return result


# ── Add/Drop analysis endpoint ───────────────────────────

@app.post("/analyze/add-drop")
def analyze_add_drop(req: AddDropRequest):
    """
    Compare team PR before and after swapping one player.
    Returns current_team_avg, new_team_avg, delta, and individual player PRs.
    """
    try:
        all_batters = _get_batters(req.year, req.period)
        all_pitchers = _get_pitchers(req.year, req.period)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API fetch failed: {e}")

    is_batter = req.drop_type == "batter"
    categories = req.batting_categories if is_batter else req.pitching_categories
    col_map = BATTING_FG_COLS if is_batter else PITCHING_FG_COLS
    lower_list = BATTING_LOWER_IS_BETTER if is_batter else PITCHING_LOWER_IS_BETTER
    all_df = all_batters if is_batter else all_pitchers

    # Current roster names
    current_names = req.roster_batters if is_batter else req.roster_pitchers

    # New roster: remove drop_player (case-insensitive), append add_player
    new_names = [
        n for n in current_names
        if n.lower() != req.drop_player.lower()
    ] + [req.add_player]

    def _roster_avg(names):
        if not names:
            return {}, []
        roster_df, unmatched = match_players_to_df(names, all_df)
        if roster_df.empty:
            return {cat: None for cat in categories}, unmatched
        if is_batter:
            analysis = analyze_batters(roster_df, all_df, time_period=req.period, categories=categories)
        else:
            analysis = analyze_pitchers(roster_df, all_df, time_period=req.period, categories=categories)
        avg = {
            k: (None if (isinstance(v, float) and np.isnan(v)) else round(float(v), 1))
            for k, v in analysis["team_avg"].items()
        }
        return avg, unmatched

    def _player_pr(name):
        player_df, _ = match_players_to_df([name], all_df)
        if player_df.empty:
            return {cat: None for cat in categories}, None
        matched_name = player_df.iloc[0].get("Name", name)
        pr_dict = {}
        for cat in categories:
            col = col_map.get(cat)
            if col and col in player_df.columns and col in all_df.columns:
                val = player_df[col].iloc[0]
                lower = cat in lower_list
                pr = compute_pr(val, all_df[col], lower_is_better=lower)
                pr_dict[cat] = None if (isinstance(pr, float) and np.isnan(pr)) else round(pr, 1)
            else:
                pr_dict[cat] = None
        return pr_dict, matched_name

    current_avg, _ = _roster_avg(current_names)
    new_avg, unmatched = _roster_avg(new_names)
    drop_pr, drop_matched = _player_pr(req.drop_player)
    add_pr, add_matched = _player_pr(req.add_player)

    # Delta: new - current (positive = improvement)
    delta = {}
    for cat in categories:
        curr = current_avg.get(cat)
        nw = new_avg.get(cat)
        if curr is not None and nw is not None:
            delta[cat] = round(nw - curr, 1)
        else:
            delta[cat] = None

    return {
        "drop_player": drop_matched or req.drop_player,
        "add_player": add_matched or req.add_player,
        "drop_type": req.drop_type,
        "categories": categories,
        "current_team_avg": current_avg,
        "new_team_avg": new_avg,
        "delta": delta,
        "drop_pr": drop_pr,
        "add_pr": add_pr,
        "unmatched": unmatched,
    }


# ── Savant analysis endpoint ──────────────────────────────

@app.post("/analyze/savant")
def analyze_savant(req: SavantRequest):
    """
    Analyze Statcast / Baseball Savant data for the given players.
    Returns per-category verdicts (up/hold/down).
    """
    try:
        savant_df = get_savant_batting_stats(req.year)
        ev_df = get_savant_exit_velo(req.year)
        sprint_df = get_savant_sprint_speed(req.year)
        bat_tracking_df = get_savant_bat_tracking(req.year)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Savant fetch failed: {e}")

    mlb_df = _get_batters(req.year, "season")
    results = analyze_savant_luck(
        req.player_names, savant_df, ev_df,
        sprint_df=sprint_df, bat_tracking_df=bat_tracking_df,
        mlb_df=mlb_df,
    )

    def _safe_str(val):
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return ""
        return str(val)

    # Enrich each result with Team and Pos from mlb_df
    for r in results:
        matched = match_players_to_df([r.get("name", "")], mlb_df)[0]
        if not matched.empty:
            r["Team"] = _safe_str(matched.iloc[0].get("Team"))
            r["Pos"]  = _safe_str(matched.iloc[0].get("Pos"))
        else:
            r["Team"] = ""
            r["Pos"]  = ""

    def _sanitize(val):
        """Recursively replace NaN floats with None for JSON serialization."""
        if isinstance(val, float) and np.isnan(val):
            return None
        if isinstance(val, dict):
            return {k: _sanitize(v) for k, v in val.items()}
        return val

    # Sanitize NaN values for JSON
    sanitized = []
    for r in results:
        sanitized.append({k: _sanitize(v) for k, v in r.items()})

    return {"players": sanitized}


# ── MLB data endpoints (for debugging / pre-fetch) ─────────

@app.get("/mlb/batters")
def get_batters(year: int = datetime.now().year, period: str = "season"):
    """Return raw batter stats (for debugging)."""
    df = _get_batters(year, period)
    return {"count": len(df), "sample": _df_to_records(df.head(5))}


@app.get("/mlb/pitchers")
def get_pitchers(year: int = datetime.now().year, period: str = "season"):
    """Return raw pitcher stats (for debugging)."""
    df = _get_pitchers(year, period)
    return {"count": len(df), "sample": _df_to_records(df.head(5))}


@app.get("/debug/plate-discipline")
def debug_plate_discipline(year: int = 2025):
    """Debug: show plate discipline CSV columns and sample row."""
    df = get_savant_plate_discipline(year)
    if df.empty:
        return {"error": "empty dataframe"}
    return {
        "count": len(df),
        "columns": df.columns.tolist(),
        "sample": _df_to_records(df.head(3)),
    }


@app.get("/debug/statcast")
def debug_statcast(year: int = 2025):
    """Debug: show statcast/exit-velo CSV columns."""
    df = get_savant_exit_velo(year)
    if df.empty:
        return {"error": "empty dataframe"}
    return {
        "count": len(df),
        "columns": df.columns.tolist(),
        "sample": _df_to_records(df.head(2)),
    }
