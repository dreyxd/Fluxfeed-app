import React, { useEffect, useMemo, useState } from "react";
import TradingViewChart from "../components/TradingViewChart";
import Logo from "../components/Logo";
import { Link, useSearchParams } from "react-router-dom";
import API_BASE_URL from "../config/api";

// ----------------------------- Utility Types -----------------------------

type Sentiment = "bullish" | "bearish";

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string; // ISO
  tickers: string[];
  sentiment: Sentiment;
  score: number; // -1..1
};

type Signal = {
  status: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;              // 0..100
  newsScore: number;               // -1.5..+1.5 (STAT-compatible)
  count: number;                   // items used for the score
  skew: { bullish: number; bearish: number };
  drivers: string[];
  health: "Healthy" | "LowCoverage";
  method: "stat" | "fallback";
  window: string;                  // last24hours|last7days|last30days (or UI alias)
  lastUpdated: string;             // ISO
  ticker: string;
  timeframe: string;
};

// ----------------------------- Constants -----------------------------

const START_NEWS: NewsItem[] = [];

const TICKER_OPTIONS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","AVAX","TRX","DOT",
  "LINK","MATIC","LTC","BCH","TON","ARB","OP","ATOM","APT"
];

// ----------------------------- Helpers -----------------------------

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.round(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

function cn(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

function timeframeToInterval(tf: string): string {
  switch (tf) {
    case "15m": return "15";
    case "1h":  return "60";
    case "4h":  return "240";
    case "1d":  return "D";
    default:    return "60";
  }
}

function getTvSymbol(ticker: string): string {
  const map: Record<string, string> = {
    BTC: "COINBASE:BTCUSD", ETH: "COINBASE:ETHUSD", BNB: "BINANCE:BNBUSDT", SOL: "COINBASE:SOLUSD",
    XRP: "BITSTAMP:XRPUSD", ADA: "COINBASE:ADAUSD", DOGE: "BINANCE:DOGEUSDT", AVAX: "COINBASE:AVAXUSD",
    TRX: "BINANCE:TRXUSDT", DOT: "COINBASE:DOTUSD", LINK: "COINBASE:LINKUSD", MATIC: "COINBASE:MATICUSD",
    LTC: "COINBASE:LTCUSD", BCH: "COINBASE:BCHUSD", TON: "BINANCE:TONUSDT", ARB: "BINANCE:ARBUSDT",
    OP: "BINANCE:OPUSDT", ATOM: "COINBASE:ATOMUSD", APT: "BINANCE:APTUSDT",
  };
  return map[ticker] ?? `COINBASE:${ticker}USD`;
}

function windowToMinutes(w: string) {
  switch (w) {
    case "15m": return 15;
    case "1h":  return 60;
    case "4h":  return 240;
    case "24h": return 1440;
    case "7d":  return 10080;
    case "30d": return 43200;
    default:    return 1440;
  }
}

// ----------------------------- Main -----------------------------

export default function FluxfeedSignals() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [news, setNews] = useState<NewsItem[]>(START_NEWS);
  const [ticker, setTicker] = useState<string>("BTC");
  const [timeframe] = useState<string>("1h"); // TV widget controls user-facing TF
  const [windowSel, setWindowSel] = useState<string>(searchParams.get("window") || "24h");
  const [query, setQuery] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [manualTick, setManualTick] = useState<number>(0);
  const [refreshMs, setRefreshMs] = useState<number>(30000);
  const [selectedAI, setSelectedAI] = useState<string>(searchParams.get("ai") || "fluxai");
  const [showToast, setShowToast] = useState<string | null>(null);

  // signal state
  const [signal, setSignal] = useState<Signal>({
    status: "NEUTRAL",
    confidence: 0,
    newsScore: 0,
    count: 0,
    skew: { bullish: 0, bearish: 0 },
    drivers: [],
    health: "Healthy",
    method: "stat",
    window: "last24hours",
    lastUpdated: "",
    ticker: "BTC",
    timeframe: "1h",
  });
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // keep URL in sync without dropping other params
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    p.set("ai", selectedAI);
    p.set("window", windowSel);
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAI, windowSel]);

  // toast auto-hide
  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(null), 3000);
    return () => clearTimeout(t);
  }, [showToast]);

  // Load news
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const mins = windowToMinutes(windowSel);
        const res = await fetch(`${API_BASE_URL}/api/news?ticker=${encodeURIComponent(ticker)}&since=${mins}`);
        const json = await res.json();
        if (cancelled) return;
        const items: NewsItem[] = (json.items || []).map((r: any) => ({
          id: r.id,
          title: r.title,
          source: r.source,
          url: r.url,
          publishedAt: r.publishedAt,
          tickers: Array.isArray(r.tickers) ? r.tickers : [ticker],
          sentiment: r.sentiment === "bearish" ? "bearish" : "bullish",
          score: typeof r.score === "number" ? r.score : 0,
        }));
        setNews((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const it of items) map.set(it.id, it);
          const merged = Array.from(map.values());
          merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
          return merged.slice(0, 200);
        });
      } catch {
        /* ignore */
      }
    };
    load();
    const iv = autoRefresh ? setInterval(load, refreshMs) : undefined;
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [ticker, windowSel, autoRefresh, manualTick, refreshMs]);

  // Load AI signal (news-only FluxAI)
  useEffect(() => {
    if (selectedAI !== "fluxai") return;
    let cancelled = false;
    const load = async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const mins = windowToMinutes(windowSel);
        const res = await fetch(
          `${API_BASE_URL}/api/signal?ticker=${encodeURIComponent(ticker)}&tf=${encodeURIComponent(timeframe)}&since=${mins}&window=${encodeURIComponent(windowSel)}`
        );
        const json = await res.json();
        if (cancelled) return;
        if (json && !json.error) {
          setSignal({
            status: json.status || "NEUTRAL",
            confidence: clamp(Number(json.confidence) || 0, 0, 100),
            newsScore: Number(json.newsScore ?? 0),
            count: Number(json.count ?? 0),
            skew: { bullish: Number(json.skew?.bullish ?? 0), bearish: Number(json.skew?.bearish ?? 0) },
            drivers: Array.isArray(json.drivers) ? json.drivers : [],
            health: json.health === "LowCoverage" ? "LowCoverage" : "Healthy",
            method: json.method === "fallback" ? "fallback" : "stat",
            window: json.window || "last24hours",
            lastUpdated: json.lastUpdated || new Date().toISOString(),
            ticker,
            timeframe,
          });
        } else {
          setAnalysisError(json?.error || "Failed to fetch signal");
        }
      } catch (e) {
        setAnalysisError(e instanceof Error ? e.message : "Network error");
        setSignal((prev) => ({ ...prev, health: "LowCoverage" }));
      } finally {
        setAnalysisLoading(false);
      }
    };
    load();
    const iv = autoRefresh ? setInterval(load, refreshMs) : undefined;
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [ticker, timeframe, windowSel, autoRefresh, manualTick, refreshMs, selectedAI]);

  // Filters
  const filtered = useMemo(() => {
    const minMs = windowToMinutes(windowSel) * 60 * 1000;
    const cutoff = Date.now() - minMs;
    return news.filter((n) => {
      const matchesTicker = n.tickers.includes(ticker);
      const matchesTime = new Date(n.publishedAt).getTime() >= cutoff;
      const matchesQuery = !query || n.title.toLowerCase().includes(query.toLowerCase());
      return matchesTicker && matchesTime && matchesQuery;
    });
  }, [news, ticker, windowSel, query]);

  const bearish = filtered.filter((n) => n.sentiment === "bearish");
  const bullish = filtered.filter((n) => n.sentiment === "bullish");

  const tvSymbol = useMemo(() => getTvSymbol(ticker), [ticker]);
  const tvInterval = useMemo(() => timeframeToInterval(timeframe), [timeframe]);

  // Manual refresh triggers both news + signal hooks
  function refreshAnalysis() {
    setManualTick((t) => t + 1);
  }

  // Build analysis meta from current signal
  const analysisMeta = useMemo(() => {
    const score = signal.newsScore;
    const aggSent =
      score > 0.05 ? "bullish" : score < -0.05 ? "bearish" : "neutral";
    return {
      aggregateScore: score,
      aggregateSentiment: aggSent,
      sentimentSummary: `Aggregated news score ${score.toFixed(2)} (${signal.window}); skew ${signal.skew.bullish} bullish vs ${signal.skew.bearish} bearish from ${signal.count} items.`,
      newsReasons: (signal.drivers || []).slice(0, 3),
    };
  }, [signal]);

  // ----------------------------- Render -----------------------------

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/app"
              className="flex items-center gap-3 rounded-lg transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-600"
            >
              <Logo size={48} />
              <div className="leading-tight">
                <div className="text-lg font-bold tracking-tight text-orange-400">Fluxfeed</div>
                <div className="text-sm text-zinc-400">
                  AI-Powered News → Signals
                </div>
              </div>
            </Link>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2 md:gap-3">
              {/* Ticker */}
              <label className="sr-only" htmlFor="ticker">Ticker</label>
              <select
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
              >
                {TICKER_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* News window */}
              <label className="sr-only" htmlFor="window">News window</label>
              <select
                id="window"
                value={windowSel}
                onChange={(e) => setWindowSel(e.target.value)}
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
              >
                {["15m", "1h", "4h", "24h", "7d", "30d"].map((t) => (
                  <option key={t} value={t}>{t} window</option>
                ))}
              </select>

              {/* Search */}
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search headlines…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 w-44 rounded-xl border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-600 md:w-72"
                  aria-label="Search headlines"
                />
                <span className="pointer-events-none absolute left-2 top-2.5 text-zinc-500">🔎</span>
              </div>

              {/* Refresh interval */}
              <label className="sr-only" htmlFor="refresh">Refresh interval</label>
              <select
                id="refresh"
                value={String(refreshMs)}
                onChange={(e) => setRefreshMs(Number(e.target.value))}
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
                title="Auto-refresh interval"
              >
                <option value="10000">10s</option>
                <option value="30000">30s</option>
                <option value="60000">60s</option>
              </select>

              {/* Auto-refresh toggle */}
              <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-600"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  aria-label="Auto-refresh news and signal"
                />
                Auto-refresh
              </label>

              {/* Manual refresh */}
              <button
                onClick={refreshAnalysis}
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-600"
                title="Refresh now"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Demo Banner */}
      <div className="border-b border-orange-900/30 bg-gradient-to-r from-orange-950/20 via-orange-900/10 to-orange-950/20">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-center gap-3 text-center">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-orange-300">DEMO MODE</span>
            </div>
            <span className="hidden text-sm text-zinc-400 sm:inline">•</span>
            <p className="text-sm text-zinc-400">
              This platform is currently under active development. Features and data may be limited or experimental.
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <section aria-label="Chart" className="border-b border-zinc-900/60">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-medium text-zinc-300">Chart • {ticker}</h2>
              <div className="text-xs text-zinc-500">TradingView</div>
            </div>
            <div className="mt-2 h-[340px] w-full overflow-hidden rounded-xl">
              <TradingViewChart symbol={tvSymbol} interval={tvInterval} />
            </div>
          </div>
        </div>
      </section>

      {/* Toast */}
      {showToast && (
        <div className="fixed top-20 right-4 z-50">
          <div className="rounded-xl border border-yellow-800/40 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200 shadow-lg">
            {showToast}
          </div>
        </div>
      )}

      {/* AI Selector */}
      <section className="mx-auto max-w-7xl px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">AI Model:</span>
          {[
            { id: "fluxai", label: "FluxAI", available: true },
            { id: "fluxai-charts", label: "FluxAI + Charts", available: false },
            { id: "gpt5", label: "GPT-5 Analyst", available: false },
            { id: "claude", label: "Claude Sonnet 4.5", available: false },
            { id: "llama", label: "Llama 3.1", available: false },
            { id: "mistral", label: "Mistral Large", available: false },
            { id: "ensemble", label: "Ensemble", available: false },
            { id: "fast-mini", label: "Fast Mini", available: false },
          ].map((m) => {
            const selected = selectedAI === m.id && m.available;
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (m.available) {
                    const p = new URLSearchParams(searchParams);
                    p.set("ai", m.id);
                    setSearchParams(p, { replace: true });
                    setSelectedAI(m.id);
                  } else {
                    setShowToast("Not available yet—using FluxAI.");
                  }
                }}
                disabled={!m.available}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  selected
                    ? "border-orange-600 bg-orange-600/20 text-orange-300"
                    : m.available
                    ? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800"
                    : "cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600"
                )}
                title={m.available ? "" : "Coming soon"}
              >
                {m.label}
                {!m.available && (
                  <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                    Coming soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Three Columns */}
      <main className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <NewsColumn
            title="Bearish"
            items={bearish}
            accent="bearish"
            emptyHint="No bearish headlines match your filters."
            autoLabel={autoRefresh ? "Auto-refresh On" : "Auto-refresh Off"}
          />

          <SignalCenter
            signal={signal}
            onStart={refreshAnalysis}
            onRefresh={refreshAnalysis}
            hasAnalysis={signal.count > 0 || signal.confidence > 0 || Boolean(signal.lastUpdated)}
            analysisMeta={analysisMeta}
            loading={analysisLoading}
            error={analysisError}
          />

          <NewsColumn
            title="Bullish"
            items={bullish}
            accent="bullish"
            emptyHint="No bullish headlines match your filters."
            autoLabel={autoRefresh ? "Auto-refresh On" : "Auto-refresh Off"}
          />
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-2 text-center text-xs text-zinc-500">
        Built with ❤️ for traders.
      </footer>
    </div>
  );
}

// ----------------------------- Subcomponents -----------------------------

function Pill({ children, kind = "neutral" }: { children: React.ReactNode; kind?: "neutral" | "good" | "bad" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        kind === "neutral" && "bg-zinc-800 text-zinc-300",
        kind === "good" && "bg-emerald-700/30 text-emerald-300 ring-1 ring-emerald-700/40",
        kind === "bad" && "bg-rose-700/30 text-rose-300 ring-1 ring-rose-700/40"
      )}
    >
      {children}
    </span>
  );
}

function NewsColumn({
  title,
  items,
  accent,
  emptyHint,
  autoLabel,
}: {
  title: string;
  items: NewsItem[];
  accent: "bullish" | "bearish";
  emptyHint: string;
  autoLabel?: string;
}) {
  return (
    <section aria-label={`${title} news`} className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <h3
          className={cn(
            "text-sm font-semibold uppercase tracking-wide",
            accent === "bearish" ? "text-rose-300" : "text-emerald-300"
          )}
        >
          {title}
        </h3>
        <div className="text-xs text-zinc-500">{autoLabel ?? "Auto-updating"}</div>
      </div>
      <ul className="max-h-[720px] divide-y divide-zinc-800 overflow-y-auto">
        {items.length === 0 && <li className="p-4 text-sm text-zinc-400">{emptyHint}</li>}
        {items.map((n) => (
          <li key={n.id} className="group flex items-start gap-3 p-4 hover:bg-zinc-900/60">
            <div
              className={cn(
                "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                n.sentiment === "bullish" ? "bg-emerald-400" : "bg-rose-400"
              )}
            />
            <div className="min-w-0">
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="line-clamp-2 font-medium text-zinc-100 underline-offset-2 hover:underline"
              >
                {n.title}
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>{n.source}</span>
                <span>•</span>
                <span>{timeAgo(n.publishedAt)}</span>
                <span>•</span>
                <Pill kind={n.sentiment === "bullish" ? "good" : "bad"}>
                  {(n.sentiment === "bullish" ? "+" : "") + n.score.toFixed(2)}
                </Pill>
                <span className="hidden md:inline">•</span>
                <div className="hidden gap-1 md:flex">
                  {n.tickers.map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SignalCenter({
  signal,
  onStart,
  onRefresh,
  hasAnalysis,
  analysisMeta,
  loading,
  error,
}: {
  signal: Signal;
  onStart?: () => void;
  onRefresh?: () => void;
  hasAnalysis?: boolean;
  analysisMeta?: {
    sentimentSummary?: string;
    chartReasons?: string[];
    newsReasons?: string[];
    aggregateScore?: number;
    aggregateSentiment?: "bullish" | "bearish" | "neutral" | string;
  };
  loading?: boolean;
  error?: string | null;
}) {
  const statusColor =
    signal.status === "BUY" ? "text-emerald-400" : signal.status === "SELL" ? "text-rose-400" : "text-zinc-300";

  const scoreColor = (score?: number) => {
    if (score === undefined) return "text-zinc-400";
    if (score > 0.5) return "text-emerald-400";
    if (score > 0) return "text-emerald-500";
    if (score < -0.5) return "text-rose-400";
    if (score < 0) return "text-rose-500";
    return "text-zinc-400";
  };

  const showStart = !(hasAnalysis ?? (signal.count > 0 || signal.confidence > 0 || Boolean(signal.lastUpdated)));

  const barPct = Math.min(100, Math.abs(((analysisMeta?.aggregateScore ?? 0) / 1.5) * 100));
  const barLeft = Math.max(0, 50 - barPct / 2);
  const barRight = Math.max(0, 50 - barPct / 2);

  return (
    <section aria-label="AI trading signal" className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">FluxAI</h3>
        <div className="text-xs text-zinc-500">
          <span>Updated {timeAgo(signal.lastUpdated)}</span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* CTA */}
        {!loading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 text-center">
            {showStart ? (
              <>
                <div className="text-sm text-zinc-400">FluxAI is ready to analyze headlines.</div>
                <button
                  onClick={onStart}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-600"
                >
                  Start Analysis
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-zinc-400">
                  Analysis complete. Click refresh to re-analyze with latest news.
                </div>
                <button
                  onClick={onRefresh}
                  className="rounded-xl bg-zinc-700 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-600"
                >
                  Refresh Analysis
                </button>
              </>
            )}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 text-center">
            <div className="text-sm text-zinc-400">Analyzing...</div>
            <div className="h-1 w-32 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-1/2 animate-pulse bg-orange-600"></div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-800/40 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</div>
        )}

        {/* Signal header */}
        <div className="flex items-center justify-between">
          <div>
            <div className={cn("text-4xl font-black tracking-tight", statusColor)}>{signal.status}</div>
            <div className="mt-1 text-sm text-zinc-400">
              {signal.ticker} • TF {signal.timeframe}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-zinc-100">{signal.confidence}%</div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Confidence</div>
          </div>
        </div>

        {/* Aggregate Sentiment */}
        {analysisMeta && analysisMeta.aggregateScore !== undefined && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="mb-1 text-xs uppercase text-zinc-500">Aggregated News Sentiment</div>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-2xl font-bold", scoreColor(analysisMeta.aggregateScore))}>
                    {analysisMeta.aggregateScore > 0 ? "+" : ""}
                    {analysisMeta.aggregateScore.toFixed(2)}
                  </span>
                  <span className="text-sm text-zinc-500">/ ±1.5</span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "text-lg font-semibold capitalize",
                    analysisMeta.aggregateSentiment === "bullish"
                      ? "text-emerald-400"
                      : analysisMeta.aggregateSentiment === "bearish"
                      ? "text-rose-400"
                      : "text-zinc-400"
                  )}
                >
                  {analysisMeta.aggregateSentiment || "Neutral"}
                </div>
                <div className="text-xs text-zinc-500">Overall</div>
              </div>
            </div>
            {/* Centered bar from neutral (50%) */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn("h-full", (analysisMeta.aggregateScore ?? 0) >= 0 ? "bg-emerald-500" : "bg-rose-500")}
                style={{
                  width: `${barPct}%`,
                  marginLeft:
                    (analysisMeta.aggregateScore ?? 0) >= 0
                      ? "50%"
                      : `${barLeft}%`, // visually expand left
                  marginRight:
                    (analysisMeta.aggregateScore ?? 0) < 0 ? "50%" : `${barRight}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Health */}
        {signal.health !== "Healthy" && (
          <div className="rounded-xl border border-yellow-800/40 bg-yellow-900/20 p-3">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">⚠️</span>
              <div>
                <div className="text-sm font-semibold text-yellow-200">System Status: {signal.health}</div>
                <div className="text-xs text-yellow-300/80">Data may be limited in this window</div>
              </div>
            </div>
          </div>
        )}

        {/* News Items Analyzed */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-zinc-500">News Items Analyzed</div>
            <div className="text-lg font-semibold text-zinc-200">{signal.count}</div>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Skew: {signal.skew.bullish} bullish vs {signal.skew.bearish} bearish • Source:{" "}
            {signal.method === "stat" ? "STAT" : "Fallback"}
          </div>
        </div>

        {/* Why */}
        {(analysisMeta?.sentimentSummary || (analysisMeta?.newsReasons?.length ?? 0) > 0) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Why</div>
            {analysisMeta?.sentimentSummary && (
              <div className="mb-2 text-xs text-zinc-400">{analysisMeta.sentimentSummary}</div>
            )}
            {analysisMeta?.newsReasons?.length ? (
              <>
                <div className="mb-1 text-xs uppercase text-zinc-500">News Drivers</div>
                <ul className="ml-4 list-disc space-y-1 text-sm text-zinc-300">
                  {analysisMeta.newsReasons.map((r, i) => (
                    <li key={`n-${i}`}>{r}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
