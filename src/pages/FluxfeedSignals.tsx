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
  // Top 20 by Market Cap
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "TRX", "DOT",
  "LINK", "MATIC", "LTC", "BCH", "TON", "SHIB", "UNI", "ATOM", "XLM", "HBAR",
  // DeFi & Layer 2
  "ARB", "OP", "APT", "SUI", "SEI", "INJ", "RUNE", "FTM", "AAVE", "MKR",
  // Memecoins
  "PEPE", "BONK", "FLOKI", "WIF",
  // Gaming & Metaverse
  "IMX", "SAND", "MANA", "AXS", "GALA",
  // AI & Infrastructure
  "FET", "RNDR", "GRT", "THETA", "FIL",
  // Other Popular
  "NEAR", "VET", "ALGO", "ICP", "STX", "KAVA", "EGLD", "FLOW", "ROSE"
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
    // Top Cryptos
    BTC: "COINBASE:BTCUSD", ETH: "COINBASE:ETHUSD", BNB: "BINANCE:BNBUSDT", SOL: "COINBASE:SOLUSD",
    XRP: "BITSTAMP:XRPUSD", ADA: "COINBASE:ADAUSD", DOGE: "BINANCE:DOGEUSDT", AVAX: "COINBASE:AVAXUSD",
    TRX: "BINANCE:TRXUSDT", DOT: "COINBASE:DOTUSD", LINK: "COINBASE:LINKUSD", MATIC: "COINBASE:MATICUSD",
    LTC: "COINBASE:LTCUSD", BCH: "COINBASE:BCHUSD", TON: "BINANCE:TONUSDT", SHIB: "BINANCE:SHIBUSDT",
    UNI: "COINBASE:UNIUSD", ATOM: "COINBASE:ATOMUSD", XLM: "COINBASE:XLMUSD", HBAR: "BINANCE:HBARUSDT",
    // Layer 2 & DeFi
    ARB: "BINANCE:ARBUSDT", OP: "BINANCE:OPUSDT", APT: "BINANCE:APTUSDT", SUI: "BINANCE:SUIUSDT",
    SEI: "BINANCE:SEIUSDT", INJ: "BINANCE:INJUSDT", RUNE: "BINANCE:RUNEUSDT", FTM: "BINANCE:FTMUSDT",
    AAVE: "COINBASE:AAVEUSD", MKR: "COINBASE:MKRUSD",
    // Memecoins
    PEPE: "BINANCE:PEPEUSDT", BONK: "BINANCE:BONKUSDT", FLOKI: "BINANCE:FLOKIUSDT", WIF: "BINANCE:WIFUSDT",
    // Gaming & Metaverse
    IMX: "BINANCE:IMXUSDT", SAND: "BINANCE:SANDUSDT", MANA: "BINANCE:MANAUSDT", 
    AXS: "BINANCE:AXSUSDT", GALA: "BINANCE:GALAUSDT",
    // AI & Infrastructure
    FET: "BINANCE:FETUSDT", RNDR: "COINBASE:RNDRUSD", GRT: "COINBASE:GRTUSD", 
    THETA: "BINANCE:THETAUSDT", FIL: "COINBASE:FILUSD",
    // Other Popular
    NEAR: "BINANCE:NEARUSDT", VET: "BINANCE:VETUSDT", ALGO: "COINBASE:ALGOUSD", 
    ICP: "BINANCE:ICPUSDT", STX: "BINANCE:STXUSDT", KAVA: "BINANCE:KAVAUSDT",
    EGLD: "BINANCE:EGLDUSDT", FLOW: "BINANCE:FLOWUSDT", ROSE: "BINANCE:ROSEUSDT",
  };
  return map[ticker] ?? `BINANCE:${ticker}USDT`;
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
  
  // Ticker search state
  const [tickerSearch, setTickerSearch] = useState<string>("");
  const [showTickerDropdown, setShowTickerDropdown] = useState<boolean>(false);

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
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{role: 'user' | 'ai', content: string}>>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Filtered ticker options based on search
  const filteredTickers = useMemo(() => {
    if (!tickerSearch.trim()) return TICKER_OPTIONS;
    const search = tickerSearch.toLowerCase();
    return TICKER_OPTIONS.filter(t => t.toLowerCase().includes(search));
  }, [tickerSearch]);

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

  // Reset analysis state when ticker or window changes
  useEffect(() => {
    setAnalysisStarted(false);
    setAiMessages([]);
    setIsTyping(false);
    setAnalysisError(null);
    setSignal({
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
      ticker,
      timeframe,
    });
  }, [ticker, windowSel, timeframe]);

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

  // Load AI signal (news-only FluxAI) - only when analysis is started
  useEffect(() => {
    if (selectedAI !== "fluxai" || !analysisStarted) return;
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
    // No auto-refresh for AI signal - manual refresh only via button
  }, [ticker, timeframe, windowSel, manualTick, selectedAI, analysisStarted]);

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

  // Start analysis manually
  function startAnalysis() {
    setAnalysisStarted(true);
    setAiMessages([]);
    setManualTick((t) => t + 1);
  }

  // Manual refresh triggers both news + signal hooks
  function refreshAnalysis() {
    setManualTick((t) => t + 1);
  }

  // Handle AI quick questions
  async function askAI(question: string) {
    setAiMessages(prev => [...prev, { role: 'user', content: question }]);
    setIsTyping(true);
    
    // Simulate typing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate AI response based on current signal data
    let response = "";
    
    if (question.includes("Why")) {
      response = `Based on my analysis of ${signal.count} news items (${signal.skew.bullish} bullish, ${signal.skew.bearish} bearish), the sentiment is ${signal.newsScore > 0 ? 'positive' : signal.newsScore < 0 ? 'negative' : 'neutral'}. ${signal.drivers.slice(0, 2).join('. ')}.`;
    } else if (question.includes("confident")) {
      response = `My confidence level of ${signal.confidence}% is based on ${signal.count} analyzed news items with a ${signal.method === 'stat' ? 'statistical' : 'fallback'} methodology. The news score of ${signal.newsScore.toFixed(2)} indicates ${Math.abs(signal.newsScore) > 0.5 ? 'strong' : 'moderate'} sentiment.`;
    } else if (question.includes("risk")) {
      const riskLevel = signal.confidence < 50 ? 'high' : signal.confidence < 70 ? 'medium' : 'low';
      response = `Risk assessment: ${riskLevel.toUpperCase()}. With ${signal.count} news items analyzed and ${signal.confidence}% confidence, ${signal.health === 'LowCoverage' ? 'data coverage is limited which increases risk' : 'data coverage is healthy'}. ${signal.status === 'NEUTRAL' ? 'Market sentiment is mixed - consider waiting for clearer signals' : `Current ${signal.status} signal suggests ${signal.status === 'BUY' ? 'upside' : 'downside'} momentum`}.`;
    } else if (question.includes("timeframe")) {
      response = `For ${ticker} on ${timeframe} timeframe with ${windowSel} news window: ${signal.status === 'BUY' ? 'Consider entering long positions with tight stop-loss' : signal.status === 'SELL' ? 'Consider short positions or exit longs' : 'Wait for clearer directional bias'}. News sentiment ${signal.newsScore > 0 ? 'supports bullish' : signal.newsScore < 0 ? 'supports bearish' : 'shows no clear'} bias.`;
    } else {
      response = `I've analyzed ${signal.count} news items for ${ticker}. Current signal: ${signal.status} with ${signal.confidence}% confidence. News score: ${signal.newsScore.toFixed(2)}. ${signal.drivers[0] || 'Market sentiment is evolving'}.`;
    }
    
    setIsTyping(false);
    setAiMessages(prev => [...prev, { role: 'ai', content: response }]);
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
              {/* Ticker Search */}
              <div className="relative">
                <label className="sr-only" htmlFor="ticker-search">Search Ticker</label>
                <input
                  id="ticker-search"
                  type="text"
                  value={tickerSearch}
                  onChange={(e) => {
                    setTickerSearch(e.target.value);
                    setShowTickerDropdown(true);
                  }}
                  onFocus={() => setShowTickerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowTickerDropdown(false), 200)}
                  placeholder={`${ticker} - Search ticker...`}
                  className="h-10 w-32 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-600"
                />
                {showTickerDropdown && filteredTickers.length > 0 && (
                  <div className="absolute top-11 z-50 max-h-64 w-32 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
                    {filteredTickers.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTicker(t);
                          setTickerSearch("");
                          setShowTickerDropdown(false);
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 transition-colors",
                          ticker === t && "bg-orange-600/20 text-orange-500"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
            onStart={startAnalysis}
            onRefresh={refreshAnalysis}
            hasAnalysis={analysisStarted}
            analysisMeta={analysisMeta}
            loading={analysisLoading}
            error={analysisError}
            aiMessages={aiMessages}
            isTyping={isTyping}
            onAskAI={askAI}
            bearishCount={bearish.length}
            bullishCount={bullish.length}
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
  aiMessages = [],
  isTyping = false,
  onAskAI,
  bearishCount = 0,
  bullishCount = 0,
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
  aiMessages?: Array<{role: 'user' | 'ai', content: string}>;
  isTyping?: boolean;
  onAskAI?: (question: string) => void;
  bearishCount?: number;
  bullishCount?: number;
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

  const quickQuestions = [
    "Why this signal?",
    "How confident are you?",
    "What are the risks?",
    "Best entry for this timeframe?",
  ];

  const barPct = Math.min(100, Math.abs(((analysisMeta?.aggregateScore ?? 0) / 1.5) * 100));

  return (
    <section aria-label="AI trading signal" className="rounded-2xl border border-zinc-800 bg-zinc-900/40 flex flex-col max-h-[720px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-200">FluxAI</h3>
          {hasAnalysis && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              </span>
              ACTIVE
            </span>
          )}
        </div>
        {hasAnalysis && (
          <div className="text-xs text-zinc-500">
            <span>Updated {timeAgo(signal.lastUpdated)}</span>
          </div>
        )}
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {/* Initial State - Start Analysis Button */}
          {!hasAnalysis && !loading && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center">
              <div className="rounded-full bg-orange-600/10 p-4 ring-1 ring-orange-600/20">
                <svg className="h-8 w-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-zinc-100">Ready to Analyze</h4>
                <p className="mt-2 text-sm text-zinc-400">
                  FluxAI will analyze all fetched news from both Bearish and Bullish streams
                </p>
                <div className="mt-3 flex items-center justify-center gap-4 text-xs text-zinc-500">
                  <span>{bearishCount} Bearish</span>
                  <span>•</span>
                  <span>{bullishCount} Bullish</span>
                </div>
              </div>
              <button
                onClick={onStart}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-600/20 transition-all hover:shadow-xl hover:shadow-orange-600/30 focus:outline-none focus:ring-2 focus:ring-orange-600"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Start Analysis
                </span>
                <div className="absolute inset-0 -z-0 bg-gradient-to-r from-orange-500 to-orange-400 opacity-0 transition-opacity group-hover:opacity-100"></div>
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center">
              <div className="relative">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-zinc-800 border-t-orange-500"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-orange-500/20"></div>
                </div>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-zinc-100">Analyzing News...</h4>
                <p className="mt-2 text-sm text-zinc-400">
                  Processing {bearishCount + bullishCount} news items
                </p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full w-full animate-pulse bg-gradient-to-r from-orange-600 via-orange-500 to-orange-600 bg-[length:200%_100%]" style={{animation: 'pulse 1.5s ease-in-out infinite, shimmer 2s linear infinite'}}></div>
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="rounded-xl border border-rose-800/40 bg-rose-900/20 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-rose-200">Analysis Error</h4>
                  <p className="mt-1 text-sm text-rose-300/80">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Complete - Signal Display */}
          {hasAnalysis && !loading && (
            <>
              {/* Signal Header */}
              <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-950/80 to-zinc-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Signal</div>
                    <div className={cn("text-4xl font-black tracking-tight", statusColor)}>{signal.status}</div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {signal.ticker} • {signal.timeframe}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Confidence</div>
                    <div className="text-4xl font-black text-zinc-100">{signal.confidence}<span className="text-xl text-zinc-500">%</span></div>
                    <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={cn("h-full transition-all", signal.confidence >= 70 ? "bg-emerald-500" : signal.confidence >= 50 ? "bg-yellow-500" : "bg-rose-500")}
                        style={{ width: `${signal.confidence}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* News Analysis Summary */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">News Analysis</div>
                  <div className="text-xs text-zinc-500">{signal.count} items</div>
                </div>
                
                {/* Sentiment Score */}
                {analysisMeta && analysisMeta.aggregateScore !== undefined && (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className={cn("text-3xl font-bold", scoreColor(analysisMeta.aggregateScore))}>
                          {analysisMeta.aggregateScore > 0 ? "+" : ""}
                          {analysisMeta.aggregateScore.toFixed(2)}
                        </span>
                        <span className="ml-2 text-sm text-zinc-500">/ ±1.5</span>
                      </div>
                      <div className={cn("text-lg font-semibold capitalize", analysisMeta.aggregateSentiment === "bullish" ? "text-emerald-400" : analysisMeta.aggregateSentiment === "bearish" ? "text-rose-400" : "text-zinc-400")}>
                        {analysisMeta.aggregateSentiment || "Neutral"}
                      </div>
                    </div>
                    
                    {/* Sentiment Bar */}
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div className="absolute left-1/2 h-full w-0.5 bg-zinc-600"></div>
                      <div
                        className={cn("h-full transition-all", (analysisMeta.aggregateScore ?? 0) >= 0 ? "bg-emerald-500" : "bg-rose-500")}
                        style={{
                          width: `${barPct}%`,
                          marginLeft: (analysisMeta.aggregateScore ?? 0) >= 0 ? "50%" : `${50 - barPct}%`,
                        }}
                      ></div>
                    </div>

                    {/* Skew Stats */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-rose-400">
                        <div className="h-2 w-2 rounded-full bg-rose-500"></div>
                        <span>{signal.skew.bearish} Bearish</span>
                      </div>
                      <div className="text-zinc-500">vs</div>
                      <div className="flex items-center gap-2 text-emerald-400">
                        <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                        <span>{signal.skew.bullish} Bullish</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Key Drivers */}
              {signal.drivers && signal.drivers.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Key Drivers</div>
                  <ul className="space-y-2">
                    {signal.drivers.slice(0, 5).map((driver, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <svg className="h-4 w-4 shrink-0 mt-0.5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                        </svg>
                        <span className="text-zinc-300">{driver}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Health Warning */}
              {signal.health !== "Healthy" && (
                <div className="rounded-xl border border-yellow-800/40 bg-yellow-900/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400">⚠️</span>
                    <div>
                      <div className="text-sm font-semibold text-yellow-200">Low Coverage</div>
                      <div className="text-xs text-yellow-300/80">Limited data in this window</div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Chat Messages */}
              {aiMessages.length > 0 && (
                <div className="space-y-3">
                  {aiMessages.map((msg, idx) => (
                    <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[85%] rounded-xl px-4 py-2.5 text-sm", msg.role === 'user' ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-100")}>
                        {msg.role === 'ai' ? (
                          <TypewriterText text={msg.content} />
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-xl bg-zinc-800 px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{animationDelay: '0ms'}}></div>
                          <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{animationDelay: '150ms'}}></div>
                          <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" style={{animationDelay: '300ms'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer - Quick Questions (only show when analysis is complete) */}
      {hasAnalysis && !loading && (
        <div className="border-t border-zinc-800 p-3 shrink-0">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Quick Questions</div>
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => onAskAI?.(q)}
                disabled={isTyping}
                className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-300 transition-all hover:border-orange-600 hover:bg-orange-600/10 hover:text-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {q}
              </button>
            ))}
          </div>
          {hasAnalysis && (
            <button
              onClick={onRefresh}
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Analysis
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// Typewriter effect component
function TypewriterText({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 20); // typing speed
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text]);

  useEffect(() => {
    setDisplayText('');
    setCurrentIndex(0);
  }, [text]);

  return <span className="font-mono">{displayText}<span className="animate-pulse">|</span></span>;
}

