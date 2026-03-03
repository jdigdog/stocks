import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadIndex, loadSeries, IndexJson, SeriesJson } from "../lib/data";

type Mode = "top10" | "bottom10" | "all" | "selected";

type WindowDef = { key: string; label: string; days: number };

const WINDOWS: WindowDef[] = [
  { key: "d5", label: "5D", days: 5 },
  { key: "d10", label: "10D", days: 10 },
  { key: "d30", label: "30D", days: 30 },
  { key: "d60", label: "60D", days: 60 },
  { key: "d90", label: "90D", days: 90 },
  { key: "d180", label: "180D", days: 180 },
  { key: "y1", label: "1Y", days: 252 },
  { key: "y2", label: "2Y", days: 504 },
  { key: "y5", label: "5Y", days: 1260 },
];

function pct(a: number) {
  return `${(a * 100).toFixed(2)}%`;
}

function classFor(val: number | null) {
  if (val === null) return "text-zinc-500";
  if (val > 0) return "text-emerald-300";
  if (val < 0) return "text-rose-300";
  return "text-zinc-200";
}

function findBenchUniverseKey(idx: IndexJson): string {
  // Prefer an explicit "indices" key; otherwise find a name containing "bench"
  const keys = Object.keys(idx.universes || {});
  if (keys.includes("indices")) return "indices";
  const byName = keys.find((k) => String(idx.universes[k]?.name || "").toLowerCase().includes("bench"));
  return byName ?? keys[0];
}

function buildDateIndex(dates: string[]) {
  // dates are ISO YYYY-MM-DD
  const map = new Map<string, number>();
  dates.forEach((d, i) => map.set(d, i));
  return map;
}

function lastCommonDateIndex(
  aDates: string[],
  aMap: Map<string, number>,
  bDates: string[],
  bMap: Map<string, number>,
  aSeries: Array<number | null>,
  bSeries: Array<number | null>
): { aIdx: number; bIdx: number; date: string } | null {
  // Walk backwards on the shorter end list; find last date where both values exist and non-null
  const len = Math.min(aDates.length, bDates.length);
  // Choose an anchor: iterate over the longer list’s tail by date existence checks
  // We'll iterate over aDates backwards and check if date exists in bMap.
  for (let ai = aDates.length - 1; ai >= 0; ai--) {
    const d = aDates[ai];
    const bi = bMap.get(d);
    if (bi === undefined) continue;
    const av = aSeries[ai];
    const bv = bSeries[bi];
    if (av === null || av === undefined) continue;
    if (bv === null || bv === undefined) continue;
    return { aIdx: ai, bIdx: bi, date: d };
  }
  // fallback: iterate bDates backwards
  for (let bi = bDates.length - 1; bi >= 0; bi--) {
    const d = bDates[bi];
    const ai = aMap.get(d);
    if (ai === undefined) continue;
    const av = aSeries[ai];
    const bv = bSeries[bi];
    if (av === null || av === undefined) continue;
    if (bv === null || bv === undefined) continue;
    return { aIdx: ai, bIdx: bi, date: d };
  }
  return null;
}

function computeReturnOnCommonCalendar(
  datesA: string[],
  mapA: Map<string, number>,
  seriesA: Array<number | null>,
  datesB: string[],
  mapB: Map<string, number>,
  seriesB: Array<number | null>,
  days: number
): { aRet: number | null; bRet: number | null; rel: number | null } {
  // Returns are computed over "days" common trading days ending at last common valid date.
  const end = lastCommonDateIndex(datesA, mapA, datesB, mapB, seriesA, seriesB);
  if (!end) return { aRet: null, bRet: null, rel: null };

  // Build list of common dates up to end.date (inclusive), preserving chronological order using A's dates.
  const commonDates: string[] = [];
  for (let i = 0; i <= end.aIdx; i++) {
    const d = datesA[i];
    if (mapB.has(d)) commonDates.push(d);
  }
  if (commonDates.length < days + 1) {
    return { aRet: null, bRet: null, rel: null };
  }

  const startDate = commonDates[commonDates.length - 1 - days];
  const endDate = commonDates[commonDates.length - 1];

  const aStartIdx = mapA.get(startDate);
  const aEndIdx = mapA.get(endDate);
  const bStartIdx = mapB.get(startDate);
  const bEndIdx = mapB.get(endDate);

  if (aStartIdx === undefined || aEndIdx === undefined || bStartIdx === undefined || bEndIdx === undefined) {
    return { aRet: null, bRet: null, rel: null };
  }

  const a0 = seriesA[aStartIdx];
  const a1 = seriesA[aEndIdx];
  const b0 = seriesB[bStartIdx];
  const b1 = seriesB[bEndIdx];

  if (a0 === null || a1 === null || b0 === null || b1 === null) return { aRet: null, bRet: null, rel: null };
  if (a0 === 0 || b0 === 0) return { aRet: null, bRet: null, rel: null };

  const aRet = a1 / a0 - 1;
  const bRet = b1 / b0 - 1;
  return { aRet, bRet, rel: aRet - bRet };
}

export default function RelativePerformance() {
  const [idx, setIdx] = useState<IndexJson | null>(null);
  const [universeKey, setUniverseKey] = useState<string>("");
  const [benchKey, setBenchKey] = useState<string>("");

  const [univPrices, setUnivPrices] = useState<SeriesJson | null>(null);
  const [benchPrices, setBenchPrices] = useState<SeriesJson | null>(null);

  const [mode, setMode] = useState<Mode>("top10");
  const [rankWindowKey, setRankWindowKey] = useState<string>("d30");

  const [search, setSearch] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [err, setErr] = useState<string | null>(null);

  // Load index + set defaults
  useEffect(() => {
    (async () => {
      try {
        const i = await loadIndex();
        setIdx(i);

        const uKeys = Object.keys(i.universes || {});
        const defaultUniverse = uKeys[0] ?? "";
        const benchUniverse = findBenchUniverseKey(i);

        setUniverseKey(defaultUniverse);
        setBenchKey(benchUniverse);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load index.json");
      }
    })();
  }, []);

  // Load selected universe prices
  useEffect(() => {
    (async () => {
      try {
        if (!idx || !universeKey) return;
        const path = idx.feeds.prices[universeKey];
        const data = await loadSeries(path);
        setUnivPrices(data);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load universe prices");
      }
    })();
  }, [idx, universeKey]);

  // Load benchmark (base comparisons) universe prices
  useEffect(() => {
    (async () => {
      try {
        if (!idx || !benchKey) return;
        const path = idx.feeds.prices[benchKey];
        const data = await loadSeries(path);
        setBenchPrices(data);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load benchmark universe prices");
      }
    })();
  }, [idx, benchKey]);

  const benchTickers = useMemo(() => {
    if (!idx || !benchKey) return [];
    return idx.universes[benchKey]?.tickers ?? [];
  }, [idx, benchKey]);

  const universeTickers = useMemo(() => {
    if (!idx || !universeKey) return [];
    return idx.universes[universeKey]?.tickers ?? [];
  }, [idx, universeKey]);

  const baseTicker = useMemo(() => {
    // Default to idx.benchmark if present in benchTickers, else first bench ticker.
    if (!idx) return "";
    const preferred = (idx.benchmark || "").toUpperCase();
    if (benchPrices?.series?.[preferred]) return preferred;
    const first = benchTickers[0]?.toUpperCase() ?? "";
    return first;
  }, [idx, benchTickers, benchPrices]);

  const [base, setBase] = useState<string>("");

  useEffect(() => {
    if (!baseTicker) return;
    // Only set base if not already set or if current base no longer exists.
    setBase((cur) => {
      if (!cur) return baseTicker;
      if (benchPrices?.series?.[cur]) return cur;
      return baseTicker;
    });
  }, [baseTicker, benchPrices]);

  const matrix = useMemo(() => {
    if (!univPrices || !benchPrices || !base) return null;

    const datesA = univPrices.dates || [];
    const mapA = buildDateIndex(datesA);

    const datesB = benchPrices.dates || [];
    const mapB = buildDateIndex(datesB);

    const baseSeries = benchPrices.series?.[base];
    if (!baseSeries) return null;

    const results: Array<{
      ticker: string;
      relByWindow: Record<string, number | null>;
      absByWindow: Record<string, { t: number | null; b: number | null }>;
    }> = [];

    for (const t of universeTickers) {
      const T = String(t).toUpperCase();
      const seriesT = univPrices.series?.[T];
      if (!seriesT) continue;

      const relByWindow: Record<string, number | null> = {};
      const absByWindow: Record<string, { t: number | null; b: number | null }> = {};

      for (const w of WINDOWS) {
        const { aRet, bRet, rel } = computeReturnOnCommonCalendar(
          datesA,
          mapA,
          seriesT,
          datesB,
          mapB,
          baseSeries,
          w.days
        );
        relByWindow[w.key] = rel;
        absByWindow[w.key] = { t: aRet, b: bRet };
      }

      results.push({ ticker: T, relByWindow, absByWindow });
    }

    return {
      datesA,
      datesB,
      base,
      rows: results,
    };
  }, [univPrices, benchPrices, base, universeTickers]);

  const rankWindow = useMemo(() => WINDOWS.find((w) => w.key === rankWindowKey) ?? WINDOWS[2], [rankWindowKey]);

  const filteredRows = useMemo(() => {
    if (!matrix) return [];

    let rows = matrix.rows;

    // Search filter (applies in all modes)
    const q = search.trim().toUpperCase();
    if (q) {
      rows = rows.filter((r) => r.ticker.includes(q));
    }

    // Mode filters
    if (mode === "selected") {
      rows = rows.filter((r) => selected.has(r.ticker));
      return rows;
    }

    if (mode === "all") return rows;

    // Rank-based
    const key = rankWindow.key;
    const scored = rows
      .map((r) => ({ r, v: r.relByWindow[key] }))
      .filter((x) => x.v !== null) as Array<{ r: any; v: number }>;

    scored.sort((a, b) => b.v - a.v);

    if (mode === "top10") return scored.slice(0, 10).map((x) => x.r);
    if (mode === "bottom10") return scored.slice(-10).map((x) => x.r);

    return rows;
  }, [matrix, mode, rankWindow, search, selected]);

  const toggleSelect = (t: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visible = filteredRows.map((r) => r.ticker);
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((t) => next.add(t));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  if (err) return <div className="text-red-400">{err}</div>;
  if (!idx) return <div className="text-zinc-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Relative Performance</div>
        <div className="text-sm text-zinc-400">
          Compare universe members vs a base ticker (typically an index fund). Values shown are{" "}
          <span className="text-zinc-200">outperformance</span>: (ticker return − base return).
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">Universe</div>
          <select
            className="w-full px-3 py-2 rounded-2xl bg-zinc-950/40 border border-zinc-800 outline-none focus:border-zinc-600"
            value={universeKey}
            onChange={(e) => {
              setUniverseKey(e.target.value);
              setSelected(new Set());
            }}
          >
            {Object.keys(idx.universes).map((k) => (
              <option key={k} value={k}>
                {idx.universes[k].name} ({k})
              </option>
            ))}
          </select>
          <div className="text-xs text-zinc-500 mt-2">{universeTickers.length} tickers</div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">Base comparisons universe</div>
          <select
            className="w-full px-3 py-2 rounded-2xl bg-zinc-950/40 border border-zinc-800 outline-none focus:border-zinc-600"
            value={benchKey}
            onChange={(e) => {
              setBenchKey(e.target.value);
              setBase("");
            }}
          >
            {Object.keys(idx.universes).map((k) => (
              <option key={k} value={k}>
                {idx.universes[k].name} ({k})
              </option>
            ))}
          </select>
          <div className="text-xs text-zinc-500 mt-2">{benchTickers.length} base tickers</div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">Base ticker</div>
          <select
            className="w-full px-3 py-2 rounded-2xl bg-zinc-950/40 border border-zinc-800 outline-none focus:border-zinc-600"
            value={base}
            onChange={(e) => setBase(e.target.value.toUpperCase())}
          >
            {benchTickers.map((t) => {
              const T = String(t).toUpperCase();
              return (
                <option key={T} value={T}>
                  {T}
                </option>
              );
            })}
          </select>
          <div className="text-xs text-zinc-500 mt-2">
            Base return is computed on the shared calendar (common trading days).
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Filter</div>
              <select
                className="px-3 py-2 rounded-2xl bg-zinc-950/40 border border-zinc-800 outline-none focus:border-zinc-600"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="top10">Top 10</option>
                <option value="bottom10">Bottom 10</option>
                <option value="all">All</option>
                <option value="selected">Selected</option>
              </select>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Rank window</div>
              <select
                className="px-3 py-2 rounded-2xl bg-zinc-950/40 border border-zinc-800 outline-none focus:border-zinc-600"
                value={rankWindowKey}
                onChange={(e) => setRankWindowKey(e.target.value)}
              >
                {WINDOWS.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Search</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g., AAPL"
                className="px-4 py-2 rounded-2xl bg-zinc-950/40 border border-zinc-800 outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={selectAllVisible}
              className="text-xs px-3 py-2 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
            >
              Select visible
            </button>
            <button
              onClick={clearSelection}
              className="text-xs px-3 py-2 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
            >
              Clear selection
            </button>
          </div>
        </div>

        <div className="text-xs text-zinc-500">
          Showing <span className="text-zinc-200">{filteredRows.length}</span> rows • mode:{" "}
          <span className="text-zinc-200">{mode}</span> • ranked by{" "}
          <span className="text-zinc-200">{rankWindow.label}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-zinc-950/40">
            <tr className="text-left">
              <th className="px-4 py-3 text-xs text-zinc-400">Select</th>
              <th className="px-4 py-3 text-xs text-zinc-400">Ticker</th>
              {WINDOWS.map((w) => (
                <th key={w.key} className="px-4 py-3 text-xs text-zinc-400">
                  {w.label} vs {base}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!matrix ? (
              <tr>
                <td colSpan={2 + WINDOWS.length} className="px-4 py-6 text-zinc-400">
                  Loading price feeds…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={2 + WINDOWS.length} className="px-4 py-6 text-zinc-400">
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.ticker} className="border-t border-zinc-800">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.ticker)}
                      onChange={() => toggleSelect(r.ticker)}
                      className="accent-zinc-200"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/t/${r.ticker}`} className="font-semibold hover:underline">
                      {r.ticker}
                    </Link>
                    <div className="text-xs text-zinc-500 mt-1">
                      {mode === "selected" ? "Selected set" : `Universe: ${universeKey}`}
                    </div>
                  </td>
                  {WINDOWS.map((w) => {
                    const v = r.relByWindow[w.key];
                    return (
                      <td key={w.key} className={`px-4 py-3 ${classFor(v)}`}>
                        {v === null ? "—" : pct(v)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-zinc-500">
        Notes:
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>
            Returns are computed using the <span className="text-zinc-200">last common date</span> where both ticker and
            base have non-null prices, then stepping back{" "}
            <span className="text-zinc-200">{rankWindow.days}</span> common trading days for the selected window.
          </li>
          <li>
            1Y/2Y/5Y use approximations of <span className="text-zinc-200">252/504/1260 trading days</span>.
          </li>
        </ul>
      </div>
    </div>
  );
}
