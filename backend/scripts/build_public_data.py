from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

from backend.scripts.utils import load_config, artifacts_dir, public_data_dir, universe_map


@dataclass(frozen=True)
class SeriesOut:
    dates: List[str]
    series: Dict[str, List[float | None]]


def _pivot(prices: pd.DataFrame, tickers: List[str], field: str) -> pd.DataFrame:
    p = prices[prices["ticker"].isin(tickers)].copy()
    p[field] = pd.to_numeric(p[field], errors="coerce")
    pv = p.pivot_table(index="date", columns="ticker", values=field, aggfunc="last").sort_index()
    return pv


def _rebased_index(series: pd.Series) -> pd.Series:
    s = series.dropna()
    if s.empty:
        return series * np.nan
    base = s.iloc[0]
    return series / base * 100.0


def build_relative(pv: pd.DataFrame, tickers: List[str], bench: str) -> Tuple[SeriesOut, Dict[str, str]]:
    if bench not in pv.columns:
        raise RuntimeError(f"Benchmark {bench} not found in prices.")
    bench_idx = _rebased_index(pv[bench])

    dates = [d.date().isoformat() for d in pv.index.to_pydatetime()]
    series: Dict[str, List[float | None]] = {}
    notes: Dict[str, str] = {}

    for t in tickers:
        if t not in pv.columns:
            continue
        rel = _rebased_index(pv[t]) - bench_idx
        first_valid = rel.dropna().index.min()
        if pd.isna(first_valid):
            notes[t] = "No overlapping data with benchmark in window."
        else:
            notes[t] = f"Relative series begins on {first_valid.date().isoformat()} (first overlapping trading day)."
        series[t] = [None if pd.isna(v) else float(v) for v in rel.values]

    return SeriesOut(dates=dates, series=series), notes


def main() -> None:
    cfg = load_config()
    art = artifacts_dir(cfg)
    pub = public_data_dir(cfg)
    bench = str(cfg.settings.get("benchmark_ticker", "QQQ")).upper()

    prices_path = art / "prices.parquet"
    if not prices_path.exists():
        raise SystemExit("Missing artifacts/prices.parquet. Run fetch_prices.py first.")

    prices = pd.read_parquet(prices_path)
    prices["date"] = pd.to_datetime(prices["date"])

    u_map = universe_map(cfg)
    all_tickers = sorted(set([t for ts in u_map.values() for t in ts] + [bench]))

    field = "adj_close" if "adj_close" in prices.columns else "close"
    pv = _pivot(prices, all_tickers, field=field)
    if bench not in pv.columns:
        field = "close"
        pv = _pivot(prices, all_tickers, field=field)

    (pub / "prices").mkdir(parents=True, exist_ok=True)
    (pub / "relative").mkdir(parents=True, exist_ok=True)

    for ukey, tickers in u_map.items():
        cols = [c for c in tickers if c in pv.columns]
        pv_u = pv[cols].copy()

        price_payload = {
            "dates": [d.date().isoformat() for d in pv_u.index.to_pydatetime()],
            "series": {t: [None if pd.isna(v) else float(v) for v in pv_u[t].values] for t in pv_u.columns},
            "meta": {"universe": ukey, "price_field": field},
        }
        (pub / "prices" / f"{ukey}.json").write_text(pd.io.json.dumps(price_payload), encoding="utf-8")

        pv_rel = pv[[c for c in set(cols + [bench]) if c in pv.columns]].copy()
        rel_out, notes = build_relative(pv_rel, cols, bench)
        rel_payload = {"dates": rel_out.dates, "series": rel_out.series, "meta": {"benchmark": bench, "notes": notes}}
        (pub / "relative" / f"{ukey}_vs_{bench}.json").write_text(pd.io.json.dumps(rel_payload), encoding="utf-8")

    index = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "benchmark": bench,
        "universes": {ukey: {"name": cfg.universes[ukey].get("name", ukey), "tickers": u_map[ukey]} for ukey in u_map},
        "feeds": {
            "prices": {ukey: f"data/prices/{ukey}.json" for ukey in u_map},
            "relative": {ukey: f"data/relative/{ukey}_vs_{bench}.json" for ukey in u_map},
        },
    }
    (pub / "index.json").write_text(pd.io.json.dumps(index), encoding="utf-8")
    print(f"Wrote public data -> {pub}")


if __name__ == "__main__":
    main()
