export type IndexJson = {
  generated_at: string;
  benchmark: string;
  universes: Record<string, { name: string; tickers: string[] }>;
  feeds: { prices: Record<string, string>; relative: Record<string, string> };
};

export type SeriesJson = {
  dates: string[];
  series: Record<string, Array<number | null>>;
  meta?: any;
};

export type SentimentDayJson = {
  generated_at: string;
  date: string;
  items: Array<{
    date: string;
    ticker: string;
    score: number;
    label: string;
    confidence: number;
    sources: string[];
    counts: any;
    citations: Array<{
      source: string;
      url: string;
      title?: string | null;
      created_at?: string | null;
      snippet?: string | null;
      engagement?: any;
    }>;
  }>;
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadIndex(): Promise<IndexJson> {
  return fetchJson<IndexJson>(`${import.meta.env.BASE_URL}data/index.json`);
}

export async function loadSeries(pathFromIndex: string): Promise<SeriesJson> {
  return fetchJson<SeriesJson>(`${import.meta.env.BASE_URL}${pathFromIndex}`);
}

export async function loadLatestSentiment(): Promise<SentimentDayJson | null> {
  try {
    const pointer = await fetchJson<{ latest: string }>(`${import.meta.env.BASE_URL}data/sentiment/latest.json`);
    if (!pointer.latest) return null;
    return fetchJson<SentimentDayJson>(`${import.meta.env.BASE_URL}${pointer.latest}`);
  } catch {
    return null;
  }
}
