# MLB Fantasy App — 部署指南

架構：
- **後端 (FastAPI)** → Render.com（免費 Python 服務）
- **前端 (React PWA)** → Netlify（免費靜態網站）

---

## 一、本地測試

### 後端（FastAPI）

```bash
cd MLB_fantasy_api
pip install -r requirements.txt
uvicorn main:app --reload
# → http://localhost:8000
# API 文件：http://localhost:8000/docs
```

### 前端（React）

```bash
cd MLB_fantasy_web
npm install
cp .env.example .env.local  # VITE_API_URL=http://localhost:8000
npm run dev
# → http://localhost:3000
```

---

## 二、部署後端到 Render.com

1. 到 [render.com](https://render.com) 建立帳號（可用 GitHub 登入）

2. 點「New +」→「Web Service」

3. 連接你的 GitHub repo，或選擇「Deploy from Git URL」

4. 設定：
   - **Name**：`mlb-fantasy-api`
   - **Root Directory**：`MLB_fantasy_api`
   - **Runtime**：Python 3
   - **Build Command**：`pip install -r requirements.txt`
   - **Start Command**：`uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**：Free

5. 在「Environment Variables」設定：
   - `GEMINI_API_KEY` → 你的 Gemini API Key（可不設，用戶在 App 設定頁輸入）
   - `ALLOWED_ORIGINS` → `https://your-app.netlify.app`（部署 Netlify 後再更新）

6. 點「Create Web Service」，等待部署完成
   - 記下你的 URL，格式為：`https://mlb-fantasy-api.onrender.com`
   - ⚠️ 免費方案在 15 分鐘無流量後會休眠，第一次請求約需 30-60 秒

---

## 三、部署前端到 Netlify

1. 到 [netlify.com](https://netlify.com) 建立帳號

2. 點「Add new site」→「Import an existing project」→ 連接 GitHub

3. 設定：
   - **Base directory**：`MLB_fantasy_web`
   - **Build command**：`npm run build`
   - **Publish directory**：`MLB_fantasy_web/dist`

4. 在「Environment variables」設定：
   - `VITE_API_URL` → `https://mlb-fantasy-api.onrender.com`（你在 Render 拿到的 URL）

5. 點「Deploy」

6. 部署成功後，將 Netlify URL 更新回 Render 的 `ALLOWED_ORIGINS` 設定

---

## 四、在手機安裝為 App（PWA）

### iPhone (Safari)
1. 用 Safari 開啟 Netlify URL
2. 點下方分享按鈕 →「加入主畫面」
3. App 就會出現在桌面，像原生 App 一樣

### Android (Chrome)
1. 用 Chrome 開啟 Netlify URL
2. 點右上角三點選單 →「安裝應用程式」

---

## 五、本地測試（不用部署）

如果只想在手機上測試：

```bash
# 後端
cd MLB_fantasy_api
uvicorn main:app --host 0.0.0.0 --port 8000

# 前端
cd MLB_fantasy_web
npm run dev -- --host 0.0.0.0
```

然後在前端 `.env.local` 設定 `VITE_API_URL=http://你的電腦IP:8000`，手機和電腦連同一個 WiFi 就能訪問。
