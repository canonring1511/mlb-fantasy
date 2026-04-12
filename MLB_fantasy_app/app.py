"""
Yahoo Fantasy Baseball 分析工具
=============================
功能：
  1. 上傳己方陣容截圖 → 各球員 PR 值 + 陣容強弱分析
  2. 上傳 FA 截圖 → FA 球員 PR 排名
  3. Baseball Savant 運氣分析

使用方式：
  cd MLB_fantasy_app
  streamlit run app.py
"""

import os
from io import BytesIO

import plotly.graph_objects as go
import streamlit as st
from dotenv import load_dotenv

from analyzer import (
    analyze_batters,
    analyze_fa_players,
    analyze_pitchers,
    analyze_savant_luck,
    get_radar_data,
    style_pr_table,
)
from config import BATTING_CATEGORIES, BATTING_FG_COLS, PITCHING_CATEGORIES, PITCHING_FG_COLS
from data_fetcher import (
    get_all_batters_last30,
    get_all_batters_season,
    get_all_pitchers_last30,
    get_all_pitchers_season,
    get_savant_batting_stats,
    get_savant_exit_velo,
    match_players_to_df,
)
from ocr import extract_fa_players_from_screenshot, extract_roster_from_screenshot
from roster_manager import delete_roster, list_rosters, load_roster, save_roster

load_dotenv()

# ── 頁面設定 ────────────────────────────────────────
st.set_page_config(
    page_title="MLB Fantasy 分析工具",
    page_icon="⚾",
    layout="wide",
)

st.title("⚾ Yahoo Fantasy Baseball 分析工具")
st.caption("上傳截圖 → 自動分析陣容 PR 值、FA 建議、Savant 運氣判斷")

# ── Sidebar 設定 ────────────────────────────────────
with st.sidebar:
    st.header("⚙️ 設定")

    # API Key 設定
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        api_key = st.text_input(
            "Google Gemini API Key",
            type="password",
            help="前往 aistudio.google.com/apikey 取得免費 API Key",
        )
        if api_key:
            os.environ["GEMINI_API_KEY"] = api_key
    else:
        st.success("✅ Gemini API Key 已載入")

    st.divider()

    # 數據時間範圍
    time_period = st.radio(
        "📅 數據時間範圍",
        options=["season", "30d"],
        format_func=lambda x: "本季全季" if x == "season" else "近 30 天",
        index=0,
        help="影響 PR 計算的基準數據範圍",
    )

    year = st.number_input("賽季年份", min_value=2020, max_value=2027, value=2026)

    st.divider()

    # 得分類別設定
    st.subheader("🏆 聯盟類別設定")
    batting_cats = st.multiselect(
        "打者類別",
        options=["R", "HR", "RBI", "SB", "AVG", "BB", "2B", "3B", "K", "H", "OBP", "OPS"],
        default=BATTING_CATEGORIES,
    )
    pitching_cats = st.multiselect(
        "投手類別",
        options=["W", "SV", "ERA", "WHIP", "SO", "HLD", "BB", "IP", "K/9"],
        default=PITCHING_CATEGORIES,
    )

    if not batting_cats:
        batting_cats = BATTING_CATEGORIES
    if not pitching_cats:
        pitching_cats = PITCHING_CATEGORIES

    st.divider()
    st.caption("資料來源：FanGraphs / Baseball Savant")
    st.caption("OCR：Claude Vision API")


# ── 載入全聯盟數據（背景快取）──────────────────────
@st.cache_data(show_spinner=False)
def load_league_data(period: str, yr: int):
    if period == "season":
        batters = get_all_batters_season(yr)
        pitchers = get_all_pitchers_season(yr)
    else:
        batters = get_all_batters_last30(yr)
        pitchers = get_all_pitchers_last30(yr)
    return batters, pitchers


# ── Tab 頁面 ────────────────────────────────────────
tab1, tab2, tab3 = st.tabs([
    "📋 我的陣容分析",
    "🔍 FA 球員分析",
    "🔬 Savant 運氣分析",
])


# ════════════════════════════════════════════════
# Tab 1：陣容分析
# ════════════════════════════════════════════════
with tab1:
    st.header("我的陣容分析")

    # ── 陣容管理（儲存 / 讀取 / 刪除）──────────────
    with st.expander("💾 陣容管理（儲存 / 讀取）", expanded=False):
        saved_rosters = list_rosters()

        mgmt_col1, mgmt_col2 = st.columns([1, 1])

        with mgmt_col1:
            st.markdown("**📂 讀取已儲存的陣容**")
            if saved_rosters:
                selected_roster = st.selectbox(
                    "選擇陣容",
                    options=[""] + saved_rosters,
                    format_func=lambda x: "（請選擇）" if x == "" else x,
                    key="select_roster",
                )
                col_load, col_del = st.columns([1, 1])
                with col_load:
                    load_btn = st.button("📥 載入陣容", key="load_roster_btn")
                with col_del:
                    del_btn = st.button("🗑️ 刪除陣容", key="del_roster_btn", type="secondary")

                if load_btn and selected_roster:
                    roster_data = load_roster(selected_roster)
                    # 直接寫入 text_area 的 widget key，才能讓畫面更新
                    st.session_state["manual_batters_area"] = "\n".join(roster_data["batters"])
                    st.session_state["manual_pitchers_area"] = "\n".join(roster_data["pitchers"])
                    st.session_state["loaded_roster_name"] = roster_data["name"]
                    st.success(f"✅ 已載入「{roster_data['name']}」（儲存於 {roster_data['saved_at']}）")
                    st.rerun()

                if del_btn and selected_roster:
                    if delete_roster(selected_roster):
                        st.success(f"🗑️ 已刪除「{selected_roster}」")
                        st.rerun()
            else:
                st.info("尚無已儲存的陣容")

        with mgmt_col2:
            st.markdown("**💾 儲存目前陣容**")
            roster_name_input = st.text_input(
                "陣容名稱",
                value=st.session_state.get("loaded_roster_name", "我的陣容"),
                key="roster_name_input",
            )
            if st.button("💾 儲存陣容", key="save_roster_btn"):
                b_names = [n.strip() for n in st.session_state.get("manual_batters_area", "").split("\n") if n.strip()]
                p_names = [n.strip() for n in st.session_state.get("manual_pitchers_area", "").split("\n") if n.strip()]
                if not b_names and not p_names:
                    st.warning("請先在下方輸入球員名單再儲存")
                else:
                    path = save_roster(roster_name_input, b_names, p_names)
                    st.session_state["loaded_roster_name"] = roster_name_input
                    st.success(f"✅ 已儲存「{roster_name_input}」（{len(b_names)} 打者 / {len(p_names)} 投手）")
                    st.rerun()

    st.divider()

    # ── 截圖 + 手動輸入 ────────────────────────────
    col_upload, col_manual = st.columns([1, 1])

    with col_upload:
        st.subheader("📸 截圖上傳")
        roster_images = st.file_uploader(
            "上傳陣容截圖（可多張）",
            type=["png", "jpg", "jpeg"],
            accept_multiple_files=True,
            key="roster_upload",
        )

    with col_manual:
        st.subheader("✏️ 手動輸入 / 編輯球員名單")
        manual_batters = st.text_area(
            "打者（每行一個英文名）",
            placeholder="Shohei Ohtani\nRonald Acuna Jr.\nYordan Alvarez",
            height=150,
            key="manual_batters_area",
        )
        manual_pitchers = st.text_area(
            "投手（每行一個英文名）",
            placeholder="Gerrit Cole\nCorbin Burnes\nEmmanuel Clase",
            height=100,
            key="manual_pitchers_area",
        )

    if st.button("🔄 開始分析陣容", type="primary", key="analyze_roster"):
        if not os.getenv("GEMINI_API_KEY") and roster_images:
            st.error("請先在左側 Sidebar 輸入 Anthropic API Key！")
            st.stop()

        # 收集球員名單
        batter_names: list[str] = []
        pitcher_names: list[str] = []

        # OCR 截圖
        if roster_images:
            with st.spinner("🤖 Gemini 正在辨識截圖中的球員（含打者/投手分類）..."):
                for img_file in roster_images:
                    img_bytes = img_file.read()
                    try:
                        classified = extract_roster_from_screenshot(img_bytes)
                        b_ocr = classified["batters"]
                        p_ocr = classified["pitchers"]
                        st.info(
                            f"📸 **{img_file.name}**\n"
                            f"  🏏 打者（{len(b_ocr)}）：{', '.join(b_ocr) or '無'}\n"
                            f"  ⚾ 投手（{len(p_ocr)}）：{', '.join(p_ocr) or '無'}"
                        )
                        batter_names.extend(b_ocr)
                        pitcher_names.extend(p_ocr)
                    except RuntimeError as e:
                        st.error(f"❌ OCR 失敗：{e}")
                        st.info("💡 請改用下方「手動輸入」欄位填入球員名字")
                        st.stop()

        # 手動輸入
        if manual_batters:
            batter_names.extend([n.strip() for n in manual_batters.split("\n") if n.strip()])
        if manual_pitchers:
            pitcher_names.extend([n.strip() for n in manual_pitchers.split("\n") if n.strip()])

        if not batter_names and not pitcher_names:
            st.warning("請上傳截圖或手動輸入球員名單")
            st.stop()

        # 載入全聯盟數據
        with st.spinner("📊 載入全聯盟數據..."):
            all_batters, all_pitchers = load_league_data(time_period, year)

        # ── 打者分析 ──
        if batter_names:
            st.subheader("🏏 打者 PR 分析")

            matched_batters, unmatched_b = match_players_to_df(batter_names, all_batters)

            if unmatched_b:
                st.warning(f"⚠️ 找不到這些打者（請手動確認名字拼寫）：{', '.join(unmatched_b)}")

            if not matched_batters.empty:
                result = analyze_batters(
                    matched_batters, all_batters, time_period, batting_cats
                )
                pr_table = result["pr_table"]
                team_avg = result["team_avg"]

                # PR 表格
                display_cols = ["Name"] + [c for c in batting_cats if c in pr_table.columns]
                styled = style_pr_table(pr_table[display_cols], batting_cats)
                st.dataframe(styled, use_container_width=True)

                # 強弱項摘要
                col_s, col_w = st.columns(2)
                with col_s:
                    st.success(f"💪 **強項**：{' / '.join(result['strengths'])}")
                with col_w:
                    st.error(f"⚠️ **弱項**：{' / '.join(result['weaknesses'])}")

                # 雷達圖
                radar = get_radar_data(team_avg, batting_cats)
                fig = go.Figure(go.Scatterpolar(
                    r=radar["values"] + [radar["values"][0]],
                    theta=radar["categories"] + [radar["categories"][0]],
                    fill="toself",
                    name="陣容平均 PR",
                    line_color="#1f77b4",
                ))
                fig.update_layout(
                    polar=dict(radialaxis=dict(visible=True, range=[0, 100])),
                    title="打者陣容 PR 雷達圖（越大越強）",
                    showlegend=False,
                    height=400,
                )
                st.plotly_chart(fig, use_container_width=True)

                # PR 加總條形圖
                fig2 = go.Figure(go.Bar(
                    x=batting_cats,
                    y=[team_avg.get(c, 0) for c in batting_cats],
                    marker_color=["#1a7a1a" if team_avg.get(c, 0) >= 60 else
                                  "#f0ad4e" if team_avg.get(c, 0) >= 40 else
                                  "#d9534f" for c in batting_cats],
                    text=[f"{team_avg.get(c, 0):.1f}" for c in batting_cats],
                    textposition="outside",
                ))
                fig2.update_layout(
                    title="各打者類別 平均 PR 值",
                    yaxis=dict(range=[0, 100], title="平均 PR"),
                    height=350,
                )
                st.plotly_chart(fig2, use_container_width=True)

        # ── 投手分析 ──
        if pitcher_names:
            st.subheader("⚾ 投手 PR 分析")

            matched_pitchers, unmatched_p = match_players_to_df(pitcher_names, all_pitchers)

            if unmatched_p:
                st.warning(f"⚠️ 找不到這些投手：{', '.join(unmatched_p)}")

            if not matched_pitchers.empty:
                result_p = analyze_pitchers(
                    matched_pitchers, all_pitchers, time_period, pitching_cats
                )
                pr_table_p = result_p["pr_table"]
                team_avg_p = result_p["team_avg"]

                display_cols_p = ["Name"] + [c for c in pitching_cats if c in pr_table_p.columns]
                styled_p = style_pr_table(pr_table_p[display_cols_p], pitching_cats)
                st.dataframe(styled_p, use_container_width=True)

                col_s2, col_w2 = st.columns(2)
                with col_s2:
                    st.success(f"💪 **投手強項**：{' / '.join(result_p['strengths'])}")
                with col_w2:
                    st.error(f"⚠️ **投手弱項**：{' / '.join(result_p['weaknesses'])}")

                # 雷達圖
                radar_p = get_radar_data(team_avg_p, pitching_cats)
                fig_p = go.Figure(go.Scatterpolar(
                    r=radar_p["values"] + [radar_p["values"][0]],
                    theta=radar_p["categories"] + [radar_p["categories"][0]],
                    fill="toself",
                    name="投手陣容平均 PR",
                    line_color="#d62728",
                ))
                fig_p.update_layout(
                    polar=dict(radialaxis=dict(visible=True, range=[0, 100])),
                    title="投手陣容 PR 雷達圖",
                    showlegend=False,
                    height=400,
                )
                st.plotly_chart(fig_p, use_container_width=True)

                # 各投手類別平均 PR 條形圖
                valid_pitch_cats = [c for c in pitching_cats if not team_avg_p.get(c, float("nan")) != team_avg_p.get(c, float("nan"))]
                fig_p2 = go.Figure(go.Bar(
                    x=pitching_cats,
                    y=[team_avg_p.get(c, 0) for c in pitching_cats],
                    marker_color=[
                        "#1a7a1a" if team_avg_p.get(c, 0) >= 60 else
                        "#f0ad4e" if team_avg_p.get(c, 0) >= 40 else
                        "#d9534f" for c in pitching_cats
                    ],
                    text=[f"{team_avg_p.get(c, 0):.1f}" for c in pitching_cats],
                    textposition="outside",
                ))
                fig_p2.update_layout(
                    title="各投手類別 平均 PR 值",
                    yaxis=dict(range=[0, 110], title="平均 PR"),
                    height=350,
                )
                st.plotly_chart(fig_p2, use_container_width=True)


# ════════════════════════════════════════════════
# Tab 2：FA 分析
# ════════════════════════════════════════════════
with tab2:
    st.header("FA 球員分析")
    st.write("上傳 FA 列表截圖，系統將分析哪些球員值得 Add。")

    col_fa_upload, col_fa_manual = st.columns([1, 1])

    with col_fa_upload:
        st.subheader("📸 FA 截圖上傳")
        fa_images = st.file_uploader(
            "上傳 FA 截圖（可多張）",
            type=["png", "jpg", "jpeg"],
            accept_multiple_files=True,
            key="fa_upload",
        )

    with col_fa_manual:
        st.subheader("✏️ 或手動輸入 FA 名單")
        fa_type = st.radio("FA 球員類型", ["打者", "投手"], key="fa_type")
        manual_fa = st.text_area(
            "FA 球員（每行一個英文名）",
            placeholder="Luis Arraez\nJake McCarthy\nCedric Mullins",
            height=200,
        )

    # 弱項聚焦設定
    st.subheader("🎯 針對弱項尋找 FA（選填）")
    focus_col1, focus_col2 = st.columns(2)
    with focus_col1:
        focus_batting = st.multiselect(
            "我的打者弱項（優先排序）",
            options=["R", "HR", "RBI", "SB", "AVG", "OBP"],
            help="選擇後，FA 排名會加重這些類別的權重",
        )
    with focus_col2:
        focus_pitching = st.multiselect(
            "我的投手弱項（優先排序）",
            options=["W", "SV", "ERA", "WHIP", "SO"],
        )

    if st.button("🔍 分析 FA 球員", type="primary", key="analyze_fa"):
        if not os.getenv("GEMINI_API_KEY") and fa_images:
            st.error("請先輸入 API Key！")
            st.stop()

        fa_batter_names: list[str] = []
        fa_pitcher_names: list[str] = []

        # OCR 截圖
        if fa_images:
            with st.spinner("🤖 Gemini 辨識截圖..."):
                for img_file in fa_images:
                    img_bytes = img_file.read()
                    try:
                        names = extract_fa_players_from_screenshot(img_bytes)
                        st.info(f"📸 {img_file.name}：{', '.join(names)}")
                        fa_batter_names.extend(names)
                    except RuntimeError as e:
                        st.error(f"❌ OCR 失敗：{e}")
                        st.info("💡 請改用下方「手動輸入」欄位填入球員名字")
                        st.stop()

        # 手動輸入
        if manual_fa:
            names_manual = [n.strip() for n in manual_fa.split("\n") if n.strip()]
            if fa_type == "打者":
                fa_batter_names.extend(names_manual)
            else:
                fa_pitcher_names.extend(names_manual)

        if not fa_batter_names and not fa_pitcher_names:
            st.warning("請上傳截圖或輸入球員名單")
            st.stop()

        with st.spinner("📊 載入全聯盟數據..."):
            all_batters, all_pitchers = load_league_data(time_period, year)

        # ── FA 打者分析 ──
        if fa_batter_names:
            st.subheader("🏏 FA 打者推薦排名")

            matched_fa_b, unmatched_fa_b = match_players_to_df(fa_batter_names, all_batters)
            if unmatched_fa_b:
                st.warning(f"找不到：{', '.join(unmatched_fa_b)}")

            if not matched_fa_b.empty:
                # 若有弱項聚焦，調整類別順序
                cats_to_use = batting_cats
                if focus_batting:
                    cats_to_use = focus_batting + [c for c in batting_cats if c not in focus_batting]

                fa_pr = analyze_fa_players(
                    matched_fa_b, all_batters, cats_to_use, BATTING_FG_COLS
                )

                # 顯示推薦排名
                display_cols = ["Name", "PR_Total", "PR_Avg"] + [
                    c for c in cats_to_use if c in fa_pr.columns
                ]
                display_cols = [c for c in display_cols if c in fa_pr.columns]
                styled_fa = style_pr_table(fa_pr[display_cols], cats_to_use)
                st.dataframe(styled_fa, use_container_width=True)

                # Top 3 推薦
                st.subheader("⭐ 最建議 Add 的打者")
                top3 = fa_pr.head(3)
                cols_top = st.columns(min(3, len(top3)))
                for i, (_, row) in enumerate(top3.iterrows()):
                    with cols_top[i]:
                        st.metric(
                            label=row["Name"],
                            value=f"PR 總分：{row['PR_Total']:.0f}",
                            delta=f"平均 PR：{row['PR_Avg']:.1f}",
                        )

        # ── FA 投手分析 ──
        if fa_pitcher_names:
            st.subheader("⚾ FA 投手推薦排名")

            matched_fa_p, unmatched_fa_p = match_players_to_df(fa_pitcher_names, all_pitchers)
            if unmatched_fa_p:
                st.warning(f"找不到：{', '.join(unmatched_fa_p)}")

            if not matched_fa_p.empty:
                cats_to_use_p = pitching_cats
                if focus_pitching:
                    cats_to_use_p = focus_pitching + [c for c in pitching_cats if c not in focus_pitching]

                fa_pr_p = analyze_fa_players(
                    matched_fa_p, all_pitchers, cats_to_use_p, PITCHING_FG_COLS, is_pitcher=True
                )

                display_cols_p = ["Name", "PR_Total", "PR_Avg"] + [
                    c for c in cats_to_use_p if c in fa_pr_p.columns
                ]
                display_cols_p = [c for c in display_cols_p if c in fa_pr_p.columns]
                styled_fa_p = style_pr_table(fa_pr_p[display_cols_p], cats_to_use_p)
                st.dataframe(styled_fa_p, use_container_width=True)


# ════════════════════════════════════════════════
# Tab 3：Savant 運氣分析
# ════════════════════════════════════════════════
with tab3:
    st.header("🔬 Baseball Savant 擊球品質分析")
    st.write("根據擊球初速、仰角、BABIP、xStats 等指標，判斷球員各 Fantasy 類別成績未來是**看漲 / 維持 / 看跌**。")

    with st.expander("📖 指標說明"):
        st.markdown("""
| 指標 | 意義 | Fantasy 用途 |
|------|------|------------|
| **xBA** | 預期打擊率（根據擊球品質） | xBA > BA → AVG/H 有上漲空間 |
| **xSLG** | 預期長打率 | xSLG > SLG → HR/2B 被低估 |
| **xwOBA** | 預期加權上壘率（最綜合指標） | xwOBA > wOBA → 整體攻擊被壓低 |
| **BABIP** | 場內球打擊率（均值約 .300） | 過高（>.340）→ AVG 可能下修；過低（<.260）→ AVG 有上漲空間 |
| **Barrel%** | 桶打率（最強預測 HR 指標） | ≥15% 精英；<6% 長打靠運氣 |
| **Hard Hit%** | 硬擊率（出球速 ≥95mph） | ≥50% 擊球品質佳可持續 |
| **出球初速** | 平均離手速度 | ≥92mph 強，<87mph 偏軟 |
| **仰角** | 平均仰角 | HR最佳：15-30°；2B最佳：8-20° |
""")

    savant_players = st.text_area(
        "輸入要分析的球員名字（每行一個）",
        placeholder="Shohei Ohtani\nRonald Acuna Jr.\nYordan Alvarez",
        height=150,
    )

    col_savant1, col_savant2 = st.columns(2)
    with col_savant1:
        min_pa_savant = st.number_input("最低打席門檻", min_value=10, max_value=200, value=25)
    with col_savant2:
        savant_year = st.number_input("年份", min_value=2020, max_value=2026, value=year, key="savant_yr")

    if st.button("🔬 開始 Savant 分析", type="primary"):
        if not savant_players.strip():
            st.warning("請輸入球員名字")
            st.stop()

        player_list = [n.strip() for n in savant_players.split("\n") if n.strip()]

        with st.spinner("正在從 Baseball Savant 下載數據..."):
            savant_df = get_savant_batting_stats(savant_year, min_pa_savant)
            ev_df = get_savant_exit_velo(savant_year, min_pa_savant)

        if savant_df.empty:
            st.error("Savant 數據載入失敗，請稍後再試")
            st.stop()

        results = analyze_savant_luck(player_list, savant_df, ev_df)
        found = [r for r in results if r["found"]]
        not_found = [r["name"] for r in results if not r["found"]]

        if not_found:
            st.warning(f"找不到以下球員（可能資料不足）：{', '.join(not_found)}")
        if not found:
            st.error("所有球員均無法匹配 Savant 資料")
            st.stop()

        # ── 各球員分析卡片 ──────────────────────────
        st.subheader("📋 各球員詳細分析")

        VERDICT_COLOR = {"up": "success", "hold": "info", "down": "warning"}
        CAT_LABELS = {
            "AVG/H": "AVG / H（打擊率/安打）",
            "HR":    "HR（全壘打）",
            "RBI":   "RBI（打點）",
            "SB":    "SB（盜壘）",
            "2B/3B": "2B / 3B（二三壘打）",
            "BB":    "BB（四壞球）",
            "K":     "K（被三振）",
        }

        for r in found:
            with st.expander(f"**{r['name']}**　　整體展望：{r['summary'][:60]}...", expanded=True):

                # 原始數據列
                raw_col1, raw_col2, raw_col3, raw_col4 = st.columns(4)
                def fmt(val, decimals=3):
                    return f"{val:.{decimals}f}" if not (val != val) else "—"

                raw_col1.metric("出球初速", fmt(r["ev"], 1) + " mph" if r["ev"] == r["ev"] else "—")
                raw_col2.metric("仰角", fmt(r["la"], 1) + "°" if r["la"] == r["la"] else "—")
                raw_col3.metric("Barrel%", fmt(r["brl"], 1) + "%" if r["brl"] == r["brl"] else "—")
                raw_col4.metric("Hard Hit%", fmt(r["hard_hit"], 1) + "%" if r["hard_hit"] == r["hard_hit"] else "—")

                xstats_col1, xstats_col2, xstats_col3, xstats_col4 = st.columns(4)
                xstats_col1.metric("BA → xBA",
                    f"{fmt(r['ba'])} → {fmt(r['xba'])}",
                    delta=f"{r['xba']-r['ba']:+.3f}" if r["xba"] == r["xba"] and r["ba"] == r["ba"] else None)
                xstats_col2.metric("SLG → xSLG",
                    f"{fmt(r['slg'])} → {fmt(r['xslg'])}",
                    delta=f"{r['xslg']-r['slg']:+.3f}" if r["xslg"] == r["xslg"] and r["slg"] == r["slg"] else None)
                xstats_col3.metric("wOBA → xwOBA",
                    f"{fmt(r['woba'])} → {fmt(r['xwoba'])}",
                    delta=f"{r['xwoba']-r['woba']:+.3f}" if r["xwoba"] == r["xwoba"] and r["woba"] == r["woba"] else None)
                xstats_col4.metric("BABIP", fmt(r["babip"]),
                    delta="偏高" if r["babip"] == r["babip"] and r["babip"] > 0.340 else
                          "偏低" if r["babip"] == r["babip"] and r["babip"] < 0.260 else "正常")

                st.divider()

                # 各類別結論
                st.markdown("**各 Fantasy 類別展望：**")
                verdicts = r.get("verdicts", {})
                cols = st.columns(len(verdicts))
                for i, (cat, vd) in enumerate(verdicts.items()):
                    with cols[i]:
                        icon  = vd["icon"]
                        label = vd["label"]
                        color_map = {"up": "🟢", "hold": "🟡", "down": "🔴"}
                        dot = color_map[vd["verdict"]]
                        st.markdown(f"**{CAT_LABELS.get(cat, cat)}**")
                        st.markdown(f"### {icon} {label}")
                        for reason in vd["reasons"]:
                            st.caption(f"• {reason}")

                # 整體一句話結論
                st.info(f"**整體結論：** {r['summary']}")

        # ── 所有球員比較圖 ──────────────────────────
        if len(found) > 1:
            st.subheader("📊 球員擊球品質比較")

            names_plot = [r["name"] for r in found]

            # xwOBA vs wOBA
            fig_woba = go.Figure(data=[
                go.Bar(name="wOBA（實際）", x=names_plot,
                       y=[r["woba"] if r["woba"] == r["woba"] else 0 for r in found],
                       marker_color="#1f77b4"),
                go.Bar(name="xwOBA（預期）", x=names_plot,
                       y=[r["xwoba"] if r["xwoba"] == r["xwoba"] else 0 for r in found],
                       marker_color="#aec7e8"),
            ])
            fig_woba.update_layout(barmode="group", title="wOBA vs xwOBA（差距越大，未來越可能修正）", height=320)
            st.plotly_chart(fig_woba, use_container_width=True)

            # BA vs xBA
            fig_ba = go.Figure(data=[
                go.Bar(name="BA（實際）", x=names_plot,
                       y=[r["ba"] if r["ba"] == r["ba"] else 0 for r in found],
                       marker_color="#d62728"),
                go.Bar(name="xBA（預期）", x=names_plot,
                       y=[r["xba"] if r["xba"] == r["xba"] else 0 for r in found],
                       marker_color="#ff9896"),
            ])
            fig_ba.update_layout(barmode="group", title="BA vs xBA（xBA > BA → AVG 有上漲空間）", height=320)
            st.plotly_chart(fig_ba, use_container_width=True)

            # Barrel% 比較
            brl_vals = [r["brl"] if r["brl"] == r["brl"] else 0 for r in found]
            fig_brl = go.Figure(go.Bar(
                x=names_plot, y=brl_vals,
                marker_color=["#1a7a1a" if v >= 15 else "#f0ad4e" if v >= 8 else "#d9534f" for v in brl_vals],
                text=[f"{v:.1f}%" for v in brl_vals], textposition="outside",
            ))
            fig_brl.add_hline(y=15, line_dash="dash", line_color="green",  annotation_text="精英 15%")
            fig_brl.add_hline(y=8,  line_dash="dash", line_color="orange", annotation_text="中等 8%")
            fig_brl.update_layout(title="Barrel%（桶打率）比較 — 最強 HR 可持續性指標", yaxis_title="Barrel%", height=320)
            st.plotly_chart(fig_brl, use_container_width=True)


# ── 頁腳 ────────────────────────────────────────────
st.divider()
st.caption(
    "資料來源：FanGraphs (via pybaseball) · Baseball Savant (MLB) · "
    "截圖辨識：Claude Vision API · 本工具僅供個人 Fantasy 決策參考"
)
