import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../lib/storage";

export default function Watchlist() {
  const [input, setInput] = useState("");
  const [tick, setTick] = useState(0);

  const wl = useMemo(() => getWatchlist(), [tick]);

  const add = () => {
    const t = input.toUpperCase().trim();
    if (!t) return;
    addToWatchlist(t);
    setInput("");
    setTick((x) => x + 1);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Watchlist</div>
        <div className="text-sm text-zinc-400">Stored in your browser (localStorage). Add tickers and click through.</div>
      </div>

      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add ticker (e.g., AAPL)"
            className="flex-1 px-4 py-3 rounded-2xl bg-zinc-950/40 border border-zinc-800 outline-none focus:border-zinc-600"
          />
          <button onClick={add} className="px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition">
            Add
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        {wl.length === 0 ? (
          <div className="text-zinc-500">No tickers yet.</div>
        ) : (
          wl.map((t) => (
            <div key={t} className="p-4 rounded-2xl bg-zinc-950/40 border border-zinc-800">
              <div className="flex items-center justify-between">
                <Link to={`/t/${t}`} className="font-semibold hover:underline">{t}</Link>
                <button
                  onClick={() => {
                    removeFromWatchlist(t);
                    setTick((x) => x + 1);
                  }}
                  className="text-xs px-2 py-1 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
                >
                  Remove
                </button>
              </div>
              <div className="text-xs text-zinc-500 mt-1">Click to compare & view citations</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
