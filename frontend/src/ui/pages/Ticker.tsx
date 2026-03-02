import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { addToWatchlist, removeFromWatchlist, getWatchlist } from "../lib/storage";
import { lineChart } from "../lib/chart";
import { loadIndex, loadLatestSentiment, loadSeries, SentimentDayJson, SeriesJson } from "../lib/data";

export default function Ticker() {
  const { ticker } = useParams();
  const T = (ticker ?? "").toUpperCase();
  const [idx, setIdx] = useState<any>(null);
  const [prices, setPrices] = useState<SeriesJson | null>(null);
  const [relative, setRelative] = useState<SeriesJson | null>(null);
  const [sent, setSent] = useState<SentimentDayJson | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inWl, setInWl] = useState<boolean>(false);

  const priceEl = useRef<HTMLDivElement>(null);
  const relEl = useRef<HTMLDivElement>(null);

  useEffect(() => setInWl(getWatchlist().includes(T)), [T]);

  useEffect(() => {
    (async () => {
      try {
        const i = await loadIndex();
        setIdx(i);
        const universeKey =
          Object.keys(i.universes).find((k) => (i.universes[k].tickers ?? []).includes(T)) ?? Object.keys(i.universes)[0];

        const p = await loadSeries(i.feeds.prices[universeKey]);
        const r = await loadSeries(i.feeds.relative[universeKey]);

        setPrices({ dates: p.dates, series: { [T]: p.series[T] ?? [] }, meta: p.meta });
        setRelative({ dates: r.dates, series: { [T]: r.series[T] ?? [] }, meta: r.meta });
        setSent(await loadLatestSentiment());
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load ticker");
      }
    })();
  }, [T]);

  useEffect(() => {
    if (!prices || !priceEl.current) return;
    return lineChart(priceEl.current, `${T} Price (Adj Close)`, prices.dates, prices.series);
  }, [prices, T]);

  useEffect(() => {
    if (!relative || !relEl.current) return;
    return lineChart(relEl.current, `${T} Relative vs ${relative.meta?.benchmark ?? "Benchmark"}`, relative.dates, relative.series);
  }, [relative, T]);

  const sentiment = useMemo(() => (sent ? sent.items.find((x) => x.ticker === T) ?? null : null), [sent, T]);

  if (err) return <div className="text-red-400">{err}</div>;
  if (!idx || !ticker) return <div className="text-zinc-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-zinc-500">Ticker</div>
          <div className="text-2xl font-semibold">{T}</div>
          <div className="text-sm text-zinc-400">Benchmark: {idx.benchmark}</div>
        </div>
        <button
          onClick={() => {
            if (inWl) {
              removeFromWatchlist(T);
              setInWl(false);
            } else {
              addToWatchlist(T);
              setInWl(true);
            }
          }}
          className="px-4 py-2 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition text-sm"
        >
          {inWl ? "Remove from Watchlist" : "Add to Watchlist"}
        </button>
      </div>

      <div className="grid gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div ref={priceEl as any} className="h-[320px] w-full" />
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div ref={relEl as any} className="h-[320px] w-full" />
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="text-lg font-semibold">Sentiment (with citations)</div>
        {!sentiment ? (
          <div className="text-zinc-500 mt-3">No sentiment entry found yet (run pipeline and/or set API secrets).</div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="text-sm px-3 py-1 rounded-xl bg-zinc-950/40 border border-zinc-800">{sentiment.label}</div>
              <div className="text-sm text-zinc-300">Score: {sentiment.score.toFixed(2)}</div>
              <div className="text-xs text-zinc-500">Confidence: {(sentiment.confidence * 100).toFixed(0)}%</div>
            </div>
            <div className="text-xs text-zinc-500">
              Sources: {sentiment.sources.join(", ") || "—"} • Items used: {sentiment.counts?.used ?? 0} / {sentiment.counts?.total ?? 0}
            </div>

            <div className="pt-2">
              <div className="text-sm font-semibold mb-2">Citations</div>
              <div className="space-y-2">
                {(sentiment.citations ?? []).map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-3 rounded-2xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-zinc-400">{c.source}</div>
                      <div className="text-xs text-zinc-500">{c.created_at ?? ""}</div>
                    </div>
                    <div className="text-sm text-zinc-200 mt-1">{c.title ?? c.snippet ?? c.url}</div>
                    {c.snippet ? <div className="text-xs text-zinc-500 mt-1">{c.snippet}</div> : null}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
