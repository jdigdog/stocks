from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List

import pandas as pd
import yfinance as yf

from .utils import load_config, artifacts_dir, tickers_from_cfg


def _start_date(years: int) -> str:
    d = datetime.now(timezone.utc).date() - timedelta(days=int(years * 365.25))
    return d.isoformat()


def _normalize_download(df: pd.DataFrame, tickers: List[str]) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["date", "ticker", "open", "high", "low", "close", "adj_close", "volume"])

    if isinstance(df.columns, pd.MultiIndex):
        # Handle (Field, Ticker) vs (Ticker, Field)
        fields = {"Open", "High", "Low", "Close", "Adj Close", "Volume"}
        lvl0 = set(df.columns.get_level_values(0))
        if lvl0 & fields:
            stacked = df.stack(level=1).rename_axis(index=["date", "ticker"]).reset_index()
        else:
            stacked = df.stack(level=0).rename_axis(index=["date", "ticker"]).reset_index()
    else:
        stacked = df.reset_index().copy()
        stacked.insert(1, "ticker", tickers[0])

    stacked = stacked.rename(
        columns={
            "Date": "date",
            "Adj Close": "adj_close",
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
            "ticker": "ticker",
        }
    )

    for c in ["date", "ticker", "open", "high", "low", "close", "adj_close", "volume"]:
        if c not in stacked.columns:
            if c == "adj_close":
                stacked[c] = pd.NA
            else:
                raise RuntimeError(f"Missing expected column: {c}. Got {stacked.columns.tolist()}")

    out = stacked[["date", "ticker", "open", "high", "low", "close", "adj_close", "volume"]].copy()
    out["date"] = pd.to_datetime(out["date"]).dt.tz_localize(None)
    out["ticker"] = out["ticker"].astype(str).str.upper()
    return out


def main() -> None:
    cfg = load_config()
    out_dir = artifacts_dir(cfg)
    years = int(cfg.settings.get("price_history_years", 2))

    tickers = tickers_from_cfg(cfg)
    if not tickers:
        raise SystemExit("No tickers found in universes_config.yml")

    raw = yf.download(
        tickers=" ".join(tickers),
        start=_start_date(years),
        auto_adjust=False,
        group_by="ticker",
        threads=True,
        progress=False,
    )

    prices = _normalize_download(raw, tickers)
    out_path = out_dir / "prices.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    prices.to_parquet(out_path, index=False)
    print(f"Wrote {len(prices):,} rows -> {out_path}")


if __name__ == "__main__":
    main()    out_path = out_dir / "prices.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    prices.to_parquet(out_path, index=False)
    print(f"Wrote {len(prices):,} rows -> {out_path}")


if __name__ == "__main__":
    main()
