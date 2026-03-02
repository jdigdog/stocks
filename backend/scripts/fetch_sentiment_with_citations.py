from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

import pandas as pd
import requests
from tqdm import tqdm

from backend.scripts.utils import load_config, artifacts_dir, public_data_dir, tickers_from_cfg


@dataclass
class Citation:
    source: str
    url: str
    title: str | None
    created_at: str | None
    snippet: str | None
    engagement: Dict[str, Any] | None


def _env(name: str) -> str | None:
    v = os.getenv(name)
    return v.strip() if v else None


def fetch_stocktwits(ticker: str, limit: int) -> List[Citation]:
    # Stocktwits docs: https://api-docs.stocktwits.com/
    url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
    r = requests.get(url, timeout=30)
    if r.status_code != 200:
        return []
    data = r.json()
    out: List[Citation] = []
    for m in (data.get("messages") or [])[:limit]:
        created = m.get("created_at")
        body = m.get("body")
        msg_id = m.get("id")
        out.append(
            Citation(
                source="stocktwits",
                url=f"https://stocktwits.com/message/{msg_id}",
                title=None,
                created_at=created,
                snippet=body[:280] if isinstance(body, str) else None,
                engagement={
                    "likes": (m.get("likes") or {}).get("total"),
                    "reshares": (m.get("reshares") or {}).get("total"),
                },
            )
        )
    return out


def fetch_reddit(ticker: str, limit: int, client_id: str, client_secret: str, user_agent: str) -> List[Citation]:
    # Reddit Data API docs: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
    token_url = "https://www.reddit.com/api/v1/access_token"
    auth = requests.auth.HTTPBasicAuth(client_id, client_secret)
    tr = requests.post(
        token_url,
        data={"grant_type": "client_credentials"},
        auth=auth,
        headers={"User-Agent": user_agent},
        timeout=30,
    )
    if tr.status_code != 200:
        return []
    token = tr.json().get("access_token")
    if not token:
        return []
    headers = {"Authorization": f"bearer {token}", "User-Agent": user_agent}

    q = f'("{ticker}" OR "${ticker}") (stock OR shares OR earnings OR guidance)'
    url = "https://oauth.reddit.com/search"
    params = {"q": q, "sort": "new", "limit": limit, "t": "week", "restrict_sr": False, "type": "link"}
    r = requests.get(url, headers=headers, params=params, timeout=30)
    if r.status_code != 200:
        return []
    data = r.json()

    out: List[Citation] = []
    for child in ((data.get("data") or {}).get("children") or [])[:limit]:
        d = child.get("data") or {}
        permalink = d.get("permalink")
        out.append(
            Citation(
                source="reddit",
                url=f"https://www.reddit.com{permalink}" if permalink else "https://www.reddit.com",
                title=d.get("title"),
                created_at=datetime.fromtimestamp(d.get("created_utc", 0), tz=timezone.utc).isoformat() if d.get("created_utc") else None,
                snippet=(d.get("selftext") or "")[:280] if isinstance(d.get("selftext"), str) else None,
                engagement={"score": d.get("score"), "num_comments": d.get("num_comments")},
            )
        )
    return out


def fetch_tavily_news(ticker: str, limit: int, tavily_key: str, lookback_hours: int) -> List[Citation]:
    url = "https://api.tavily.com/search"
    since = (datetime.now(timezone.utc) - timedelta(hours=lookback_hours)).date().isoformat()
    q = f"{ticker} stock news since:{since}"
    payload = {"api_key": tavily_key, "query": q, "max_results": limit, "include_answer": False, "include_raw_content": False}
    r = requests.post(url, json=payload, timeout=45)
    if r.status_code != 200:
        return []
    data = r.json()

    out: List[Citation] = []
    for item in (data.get("results") or [])[:limit]:
        out.append(
            Citation(
                source="news",
                url=item.get("url") or "",
                title=item.get("title"),
                created_at=None,
                snippet=item.get("content") or item.get("snippet"),
                engagement=None,
            )
        )
    return out


def score_rulebased(citations: List[Citation]) -> Tuple[float, str, float]:
    pos = {"beat","beats","surge","soar","bull","upgrade","strong","record","win","growth"}
    neg = {"miss","misses","drop","plunge","bear","downgrade","weak","fraud","lawsuit","cut"}

    if not citations:
        return 0.0, "neutral", 0.0

    vals = []
    for c in citations:
        txt = f"{c.title or ''} {c.snippet or ''}".lower()
        v = 0.0
        if any(w in txt for w in pos):
            v += 1.0
        if any(w in txt for w in neg):
            v -= 1.0
        # engagement weight (small)
        e = c.engagement or {}
        eng = 0.0
        for k in ["likes","score","num_comments","reshares"]:
            if e.get(k) is not None:
                try:
                    eng += float(e.get(k))
                except Exception:
                    pass
        w = 1.0 + (0.15 * (float(pd.Series([eng]).apply(lambda x: __import__("math").log1p(x)).iloc[0]) if eng > 0 else 0.0))
        vals.append(v * w)

    raw = sum(vals) / max(len(vals), 1)
    score = float(max(-1.0, min(1.0, raw / 2.0)))
    label = "bullish" if score > 0.15 else "bearish" if score < -0.15 else "neutral"
    confidence = float(min(1.0, 0.15 + 0.85 * (min(1.0, len(citations) / 25.0))))
    return score, label, confidence


def main() -> None:
    cfg = load_config()
    art = artifacts_dir(cfg)
    pub = public_data_dir(cfg)

    lookback = int(cfg.settings.get("sentiment_lookback_hours", 48))
    max_items = int(cfg.settings.get("max_items_per_source", 40))
    max_cites = int(cfg.settings.get("max_citations_per_ticker_day", 12))

    tavily_key = _env("TAVILY_API_KEY")
    reddit_id = _env("REDDIT_CLIENT_ID")
    reddit_secret = _env("REDDIT_CLIENT_SECRET")
    reddit_ua = _env("REDDIT_USER_AGENT") or "markets-analysis/1.0 (by u/yourusername)"

    tickers = tickers_from_cfg(cfg)
    rows = []
    today = datetime.now(timezone.utc).date().isoformat()

    for t in tqdm(tickers, desc="Sentiment", ncols=100):
        cites: List[Citation] = []

        try:
            cites.extend(fetch_stocktwits(t, limit=max_items))
        except Exception:
            pass

        if reddit_id and reddit_secret:
            try:
                cites.extend(fetch_reddit(t, limit=max_items, client_id=reddit_id, client_secret=reddit_secret, user_agent=reddit_ua))
            except Exception:
                pass

        if tavily_key:
            try:
                cites.extend(fetch_tavily_news(t, limit=max_items, tavily_key=tavily_key, lookback_hours=lookback))
            except Exception:
                pass

        # keep latest-ish
        cites_sorted = sorted(cites, key=lambda c: c.created_at or "", reverse=True)[:max_cites]
        score, label, conf = score_rulebased(cites_sorted)

        rows.append({
            "date": today,
            "ticker": t,
            "score": score,
            "label": label,
            "confidence": conf,
            "citations": [c.__dict__ for c in cites_sorted],
            "sources": sorted(list({c.source for c in cites_sorted})),
            "counts": {
                "total": len(cites),
                "used": len(cites_sorted),
                "stocktwits": sum(1 for c in cites if c.source == "stocktwits"),
                "reddit": sum(1 for c in cites if c.source == "reddit"),
                "news": sum(1 for c in cites if c.source == "news"),
            },
        })

    df = pd.DataFrame(rows)
    (art / "sentiment.parquet").parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(art / "sentiment.parquet", index=False)

    out = {"generated_at": pd.Timestamp.utcnow().isoformat(), "date": today, "items": df.to_dict(orient="records")}
    out_path = pub / "sentiment" / f"{today}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(pd.io.json.dumps(out), encoding="utf-8")

    # pointer for static hosting
    (pub / "sentiment" / "latest.json").write_text(pd.io.json.dumps({"latest": f"data/sentiment/{today}.json"}), encoding="utf-8")

    print(f"Wrote sentiment -> {out_path}")


if __name__ == "__main__":
    main()
