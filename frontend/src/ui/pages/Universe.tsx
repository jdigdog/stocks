import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { loadIndex, loadSeries, SeriesJson } from "../lib/data";
import { lineChart } from "../lib/chart";

export default function Universe() {
  const { universeId } = useParams();
  const [idx, setIdx] = useState<any>(null);
  const [prices, setPrices] = useState<SeriesJson | null>(null);
  const [relative, setRelative] = useState<SeriesJson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const priceEl = useRef<HTMLDivElement>(null);
  const relEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const i = await loadIndex();
        setIdx(i);
        if (!universeId) return;

        setPrices(await loadSeries(i.feeds.prices[universeId]));
        setRelative(await loadSeries(i.feeds.relative[universeId]));
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load universe");
      }
    })();
  }, [universeId]);

  useEffect(() => {
    if (!prices || !priceEl.current) return;
    return lineChart(priceEl.current, "Prices (Adj Close)", prices.dates, prices.series);
  }, [prices]);

  useEffect(() => {
    if (!relative || !relEl.current) return;
    return lineChart(relEl.current, `Relative vs ${relative.meta?.benchmark ?? "Benchmark"}`, relative.dates, relative.series);
  }, [relative]);

  const tickers = useMemo(() => {
    if (!idx || !universeId) return [];
    return (idx.universes[universeId]?.tickers ?? []) as string[];
  }, [idx, universeId]);

  if (err) return <div className="text-red-400">{err}</div>;
  if (!idx || !universeId) return <div className="text-zinc-400">Loading…</div>;

  const title = idx.universes[universeId]?.name ?? universeId;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-zinc-500">Universe</div>
        <div className="text-2xl font-semibold">{title}</div>
        <div className="text-sm text-zinc-400">Benchmark: {idx.benchmark}</div>
      </div>

      <div className="grid gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div ref={priceEl as any} className="h-[360px] w-full" />
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800">
          <div ref={relEl as any} className="h-[360px] w-full" />
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="text-lg font-semibold">Tickers</div>
        <div className="text-sm text-zinc-400">Click a ticker for a focused comparison and sentiment citations.</div>
        <div className="mt-4 grid md:grid-cols-4 gap-3">
          {tickers.map((t) => (
            <Link key={t} to={`/t/${t}`} className="p-4 rounded-2xl bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 transition">
              <div className="font-semibold">{t}</div>
              <div className="text-xs text-zinc-500 mt-1">Compare vs {idx.benchmark}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
