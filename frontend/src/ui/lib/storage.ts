const KEY = "markets.watchlist.v1";

export function getWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x).toUpperCase()).filter(Boolean);
  } catch {
    return [];
  }
}

export function setWatchlist(tickers: string[]) {
  const norm = Array.from(new Set(tickers.map((t) => String(t).toUpperCase().trim()).filter(Boolean)));
  localStorage.setItem(KEY, JSON.stringify(norm));
}

export function addToWatchlist(ticker: string) {
  const wl = getWatchlist();
  const t = ticker.toUpperCase().trim();
  if (!t) return;
  if (!wl.includes(t)) {
    wl.unshift(t);
    setWatchlist(wl);
  }
}

export function removeFromWatchlist(ticker: string) {
  const wl = getWatchlist().filter((t) => t !== ticker.toUpperCase().trim());
  setWatchlist(wl);
}
