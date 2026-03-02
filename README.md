# Markets Analysis (GitHub Pages)

Static-first markets dashboard:
- Fast UI (Vite + React + Tailwind + ECharts)
- Watchlist (browser localStorage)
- Deterministic benchmarking artifacts (server-side in GitHub Actions)
- Sentiment artifacts with citations (Stocktwits + Reddit + News optional)

## Pipeline
Scheduled workflow runs:
- prices -> `frontend/public/data/prices/*.json`
- relative vs benchmark -> `frontend/public/data/relative/*.json`
- sentiment with citations -> `frontend/public/data/sentiment/YYYY-MM-DD.json` + `latest.json`

## GitHub Pages
Repo Settings → Pages → Source: **GitHub Actions**

Set repo variable:
- `VITE_BASE` = `/<YOUR_REPO_NAME>/`

## Optional secrets (for sentiment)
- `TAVILY_API_KEY` (news search)
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT` (e.g. `markets-analysis/1.0 (by u/yourusername)`)

Stocktwits runs without a key but may be rate-limited.

## Local dev
UI:
```bash
cd frontend
npm install
npm run dev
```

Data:
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/scripts/fetch_prices.py
python backend/scripts/build_public_data.py
python backend/scripts/fetch_sentiment_with_citations.py
```
