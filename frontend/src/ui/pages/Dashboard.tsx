import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadIndex, loadLatestSentiment, SentimentDayJson } from "../lib/data";

export default function Dashboard() {
  const [idx, setIdx] = useState<any>(null);
  const [sent, setSent] = useState<SentimentDayJson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setIdx(await loadIndex());
        setSent(await loadLatestSentiment());
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load");
      }
    })();
  }, []);

  const sentimentTop = useMemo(() => {
    if (!sent?.items?.length) return [];
    return [...sent.items].sort((a, b) => b.score - a.score).slice(0, 8);
  }, [sent]);

  if (err) return <div className="text-red-400">{err}</div>;
  if (!idx) return <div className="text-zinc-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="text-sm text-zinc-400">Benchmark</div>
          <div className="text-2xl font-semibold">{idx.benchmark}</div>
          <div className="text-xs text-zinc-500 mt-2">Generated: {idx.generated_at}</div>
        </div>
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div className="text-sm text-zinc-400">Universes</div>
          <div className="text-2xl font-semibold">{Object.keys(idx.universes).length}</div>
          <div className="text-xs text-zinc-500 mt-2">Prices + relative feeds</div>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="text-lg font-semibold">Universes</div>
        <div className="text-sm text-zinc-400">Click through for charts, benchmarking, and tickers.</div>
        <div className="mt-4 grid md:grid-cols-2 gap-3">
          {Object.entries(idx.universes).map(([k, u]: any) => (
            <Link key={k} to={`/u/${k}`} className="p-4 rounded-2xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 transition">
              <div className="font-semibold">{u.name}</div>
              <div className="text-xs text-zinc-500 mt-1">{u.tickers.length} tickers</div>
              <div className="text-xs text-zinc-500 mt-1">Relative vs {idx.benchmark}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="text-lg font-semibold">Latest Sentiment (with citations)</div>
        <div className="text-sm text-zinc-400">From Stocktwits + Reddit + News (optional). Drill-down on ticker pages.</div>
        {!sent ? (
          <div className="text-zinc-500 mt-3">No sentiment artifact found yet (run pipeline or set API secrets).</div>
        ) : (
          <>
            <div className="text-xs text-zinc-500 mt-2">Date: {sent.date}</div>
            <div className="mt-4 grid md:grid-cols-4 gap-3">
              {sentimentTop.map((it) => (
                <Link key={it.ticker} to={`/t/${it.ticker}`} className="p-4 rounded-2xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 transition">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{it.ticker}</div>
                    <div className="text-xs px-2 py-1 rounded-xl bg-zinc-900 border border-zinc-800">{it.label}</div>
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">Score: {it.score.toFixed(2)}</div>
                  <div className="text-xs text-zinc-500 mt-1">Sources: {it.sources.join(", ") || "—"}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
