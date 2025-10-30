import 'dotenv/config'
import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.js'
import waitlistRoutes from './routes/waitlist.js'
import pool from './db.js'

const PORT = Number(process.env.PORT || 8787)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini'
const CRYPTONEWS_API_KEY = process.env.CRYPTONEWS_API_KEY || ''

// Allowed origins for CORS
const allowedOrigins = [
  'http://localhost:5173',           // Development - App
  'http://localhost:5174',           // Development - Landing
  'https://fluxfeed.news',            // Production main
  'https://www.fluxfeed.news',        // Production www
  'https://app.fluxfeed.news',        // Production app subdomain
  'https://fluxfeed-landing.vercel.app',  // Vercel landing preview
  'https://fluxfeed-app.vercel.app',      // Vercel app preview
]

const app = express()

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed for origin:', origin)
      callback(null, true)
    } else {
      console.log('❌ CORS blocked for origin:', origin)
      console.log('📋 Allowed origins:', allowedOrigins)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true, // Allow cookies
}))

app.use(express.json())
app.use(cookieParser())

// Auth routes
app.use('/api/auth', authRoutes)
// Waitlist routes
app.use('/api/waitlist', waitlistRoutes)

// ----------------------------- Types & Utils -----------------------------

type Sentiment = 'bullish' | 'bearish'
type NewsItem = {
  id: string
  title: string
  source: string
  url: string
  publishedAt: string
  tickers: string[]
  sentiment?: Sentiment
  score?: number
  image_url?: string
  text?: string
}

type AnalyzeRequest = {
  ticker: string
  tf: '15m'|'1h'|'4h'|'1d'
  sinceMinutes?: number
  news?: Array<Pick<NewsItem,'title'|'source'|'sentiment'|'score'|'publishedAt'>>
}

function minutesToMs(min: number) { return min * 60 * 1000 }

function mapTickerToPair(ticker: string) {
  const map: Record<string,string> = {
    BTC: 'BTCUSDT', ETH: 'ETHUSDT', BNB: 'BNBUSDT', SOL: 'SOLUSDT', XRP: 'XRPUSDT', ADA: 'ADAUSDT',
    DOGE: 'DOGEUSDT', AVAX: 'AVAXUSDT', TRX: 'TRXUSDT', DOT: 'DOTUSDT', LINK: 'LINKUSDT', MATIC: 'MATICUSDT',
    LTC: 'LTCUSDT', BCH: 'BCHUSDT', TON: 'TONUSDT', ARB: 'ARBUSDT', OP: 'OPUSDT', ATOM: 'ATOMUSDT', APT: 'APTUSDT'
  }
  return map[ticker] || `${ticker}USDT`
}

// ----------------------------- CryptoNews: STAT helpers -----------------------------

function mapUiWindowToStat(ui: string | undefined, sinceMinutes: number) {
  if (ui === '24h') return 'last24hours'
  if (ui === '7d')  return 'last7days'
  if (ui === '30d') return 'last30days'
  if (sinceMinutes <= 1440)  return 'last24hours'
  if (sinceMinutes <= 10080) return 'last7days'
  return 'last30days'
}

async function tryFetchStat(ticker: string, dateParam: string) {
  if (!CRYPTONEWS_API_KEY) {
    return { ok:false, score:0, count:0, bullish:0, bearish:0, drivers:[] as string[] }
  }
  const url = `https://cryptonews-api.com/api/v1/stat?tickers=${encodeURIComponent(
    ticker
  )}&date=${dateParam}&page=1&token=${CRYPTONEWS_API_KEY}`
  try {
    const r = await fetch(url)
    if (!r.ok) {
      return { ok:false, score:0, count:0, bullish:0, bearish:0, drivers:[] as string[] }
    }
    const j = await r.json()
    return {
      ok: true,
      score: Number(j?.score ?? 0),                 // -1.5..+1.5
      count: Number(j?.total ?? j?.items ?? j?.count ?? 0),
      bullish: Number(j?.bullish ?? 0),
      bearish: Number(j?.bearish ?? 0),
      drivers: Array.isArray(j?.drivers) ? j.drivers.slice(0, 5) : [],
    }
  } catch {
    return { ok:false, score:0, count:0, bullish:0, bearish:0, drivers:[] as string[] }
  }
}

// Fallback: fetch headlines and compute a STAT-like score with time-decay
async function fetchHeadlinesForTicker(ticker: string, sinceMinutes: number) {
  if (!CRYPTONEWS_API_KEY) return [] as Array<{ title: string; publishedAt: string; score: number }>
  const url = new URL('https://cryptonews-api.com/api/v1')
  url.searchParams.set('tickers-only', ticker)
  url.searchParams.set('items', '100')
  url.searchParams.set('page', '1')
  url.searchParams.set('token', CRYPTONEWS_API_KEY)
  const r = await fetch(url.toString())
  if (!r.ok) return []
  const data = await r.json()
  const arr: any[] = data?.data || data?.news || []
  const cutoff = Date.now() - sinceMinutes * 60 * 1000
  return arr
    .map((a) => {
      const t = String(a.title || '')
      const date = new Date(a.date || a.published_at || Date.now()).toISOString()
      const prov = (a.sentiment || '').toString().toLowerCase() // 'positive' | 'negative' | 'neutral'
      let s = prov === 'positive' ? 0.35 : prov === 'negative' ? -0.35 : 0
      if (!prov) {
        const low = t.toLowerCase()
        const pos = ['surge','rally','inflow','buy','support','breakout','approval','record','growth']
        const neg = ['hack','dump','sell','ban','lawsuit','crash','exploit','delist','outflow','fine']
        s = (pos.some(k => low.includes(k)) ? 0.3 : 0) - (neg.some(k => low.includes(k)) ? 0.4 : 0)
      }
      return { title: t, publishedAt: date, score: s }
    })
    .filter(x => new Date(x.publishedAt).getTime() >= cutoff)
}

function aggregateHeadlineScores(items: Array<{ title: string; publishedAt: string; score: number }>) {
  const now = Date.now()
  const tauMs = 6 * 60 * 60 * 1000 // 6h decay
  let wsum = 0, wtot = 0, bull = 0, bear = 0
  for (const it of items) {
    const s = Math.max(-1, Math.min(1, Number(it.score) || 0))
    const w = Math.exp(-(now - new Date(it.publishedAt).getTime()) / tauMs)
    wsum += w * s
    wtot += w
    if (s > 0) bull++
    else if (s < 0) bear++
  }
  const avg = wtot ? wsum / wtot : 0         // -1..1
  const statScore = Math.max(-1.5, Math.min(1.5, avg * 1.5)) // -1.5..+1.5
  return { score: statScore, count: items.length, bullish: bull, bearish: bear }
}

// ----------------------------- Generic News Fetch -----------------------------

async function fetchCryptoNews(tickers: string | string[], sinceMinutes = 1440, opts?: { sentiment?: 'positive'|'negative'|'neutral', items?: number, page?: number }): Promise<NewsItem[]> {
  if (!CRYPTONEWS_API_KEY) return []
  const list = Array.isArray(tickers) ? tickers : [tickers]
  const url = new URL('https://cryptonews-api.com/api/v1')
  if (list.length === 1) url.searchParams.set('tickers-only', list[0])
  else url.searchParams.set('tickers-include', list.join(','))
  url.searchParams.set('items', String(opts?.items || 50))
  url.searchParams.set('page', String(opts?.page || 1))
  if (opts?.sentiment) url.searchParams.set('sentiment', opts.sentiment)
  url.searchParams.set('token', CRYPTONEWS_API_KEY)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`CryptoNews API error ${res.status}`)
  const data = await res.json() as any
  const articles: any[] = data?.data || data?.news || []
  const mapped: NewsItem[] = articles.map((a) => {
    const id = String(a.news_url || a.id || a.url || (globalThis.crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
    const title = a.title
    const source = a.source_name || a.source || 'Unknown'
    const urlA = a.news_url || a.url
    const publishedAt = a.date || a.published_at || new Date().toISOString()
    const ticks = Array.isArray(a.tickers) ? a.tickers : (typeof a.ticker === 'string' ? [a.ticker] : list)
    let sentiment: Sentiment | undefined
    let score: number | undefined
    const prov = typeof a.sentiment === 'string' ? a.sentiment.toLowerCase() : undefined
    if (prov === 'positive') { sentiment = 'bullish'; score = 0.3 }
    else if (prov === 'negative') { sentiment = 'bearish'; score = -0.3 }
    else if (prov === 'neutral') { sentiment = undefined; score = 0 }
    return { id, title, source, url: urlA, publishedAt, tickers: ticks, sentiment, score }
  })
  const cutoff = Date.now() - minutesToMs(sinceMinutes)
  return mapped.filter(m => new Date(m.publishedAt).getTime() >= cutoff)
}

// ----------------------------- OpenAI helper -----------------------------

async function classifySentimentOpenAI(texts: string[]): Promise<{ sentiment: Sentiment; score: number }[]> {
  if (!OPENAI_API_KEY) {
    return texts.map((t) => {
      const low = t.toLowerCase()
      const pos = ['surge', 'rally', 'inflow', 'buy', 'support', 'breakout']
      const neg = ['hack', 'dump', 'sell', 'ban', 'lawsuit', 'crash']
      const score = (pos.some((k)=>low.includes(k)) ? 0.4 : 0) - (neg.some((k)=>low.includes(k)) ? 0.4 : 0)
      return { sentiment: score >= 0 ? 'bullish' : 'bearish', score }
    })
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: 'Label each headline bullish or bearish. Respond with JSON array of objects {sentiment, score:-1..1} in the same order as input.' },
          { role: 'user', content: JSON.stringify(texts) },
        ],
        temperature: 0
      })
    })
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content || '[]'
    const parsed = JSON.parse(content)
    return texts.map((_, i) => {
      const it = parsed?.[i] || {}
      const sRaw = String(it?.sentiment || 'bullish').toLowerCase()
      const sentiment: Sentiment = sRaw === 'bearish' ? 'bearish' : 'bullish'
      let score = Number(it?.score)
      if (!Number.isFinite(score)) score = sentiment === 'bullish' ? 0.1 : -0.1
      return { sentiment, score: Math.max(-1, Math.min(1, score)) }
    })
  } catch {
    return texts.map((t) => {
      const low = t.toLowerCase()
      const pos = ['surge', 'rally', 'inflow', 'buy', 'support', 'breakout']
      const neg = ['hack', 'dump', 'sell', 'ban', 'lawsuit', 'crash']
      const score = (pos.some((k)=>low.includes(k)) ? 0.4 : 0) - (neg.some((k)=>low.includes(k)) ? 0.5 : 0)
      return { sentiment: score >= 0 ? 'bullish' : 'bearish', score }
    })
  }
}

// ----------------------------- Price features (chart) -----------------------------

function computeFeaturesFromCloses(closes: number[]) {
  const last = closes.at(-1) || 0
  const first = closes[0] || 0
  const changePct = first ? ((last - first) / first) * 100 : 0
  const smaLen = 20
  const slice = closes.slice(-smaLen)
  const denom = Math.max(1, slice.length)
  const sma = slice.reduce((a,b)=>a+b,0) / denom
  const momentum = sma ? ((last - sma) / sma) * 100 : 0
  const rets = closes.slice(1).map((c,i)=> (c - closes[i]) / closes[i])
  const mean = rets.reduce((a,b)=>a+b,0)/Math.max(1,rets.length)
  const vol = Math.sqrt(rets.reduce((a,b)=> a + (b-mean)**2, 0) / Math.max(1, rets.length)) * 100
  return { last, changePct, momentum, vol }
}

async function fetchPriceFeaturesCoingecko(ticker: string, tf: string) {
  const idMap: Record<string,string> = {
    BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
    DOGE: 'dogecoin', AVAX: 'avalanche-2', TRX: 'tron', DOT: 'polkadot', LINK: 'chainlink',
    MATIC: 'polygon-pos', LTC: 'litecoin', BCH: 'bitcoin-cash', TON: 'toncoin', ARB: 'arbitrum',
    OP: 'optimism', ATOM: 'cosmos', APT: 'aptos'
  }
  const id = idMap[ticker] || ticker.toLowerCase()
  const daysMap: Record<string,number> = { '15m': 1, '1h': 1, '4h': 2, '1d': 7 }
  const days = daysMap[tf] || 1
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=hourly`
  const res = await fetch(url, { headers: { 'accept': 'application/json' } })
  if (!res.ok) throw new Error(`Coingecko error ${res.status}`)
  const data = await res.json() as any
  const prices: [number, number][] = data?.prices || []
  const closes = prices.map(p => Number(p[1])).filter(n => Number.isFinite(n))
  if (!closes.length) throw new Error('Coingecko empty prices')
  const feats = computeFeaturesFromCloses(closes)
  return { pair: `${ticker}USD`, interval: tf, ...feats, source: 'coingecko' }
}

async function fetchPriceFeatures(ticker: string, tf: string) {
  const pair = mapTickerToPair(ticker)
  const intervalMap: Record<string,string> = { '15m':'15m','1h':'1h','4h':'4h','1d':'1d' }
  const interval = intervalMap[tf] || '1h'
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=200`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Binance error ${res.status}`)
    const klines = await res.json() as any[]
    const closes = klines.map(k => Number(k[4]))
    const feats = computeFeaturesFromCloses(closes)
    return { pair, interval, ...feats, source: 'binance' }
  } catch {
    return await fetchPriceFeaturesCoingecko(ticker, tf)
  }
}

function aggregateSentiment(items: NewsItem[]) {
  const n = items.length
  if (!n) return { avg: 0, bullish: 0, bearish: 0 }
  let sum = 0, bullish = 0, bearish = 0
  for (const it of items) {
    const s = it.score ?? 0
    sum += s
    if ((it.sentiment||'bullish') === 'bullish') bullish++
    else bearish++
  }
  return { avg: sum / n, bullish, bearish }
}

// ----------------------------- Endpoints -----------------------------

// News feed for columns
app.get('/api/news', async (req: Request, res: Response) => {
  try {
    const tickerParam = (req.query.tickers as string | undefined) || (req.query.ticker as string | undefined) || 'BTC'
    const tickers = tickerParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    const since = Number(req.query.since || 1440)
    const items = Math.min(100, Number(req.query.items || 50))
    const page = Math.max(1, Number(req.query.page || 1))
    const sentimentRaw = (req.query.sentiment as string | undefined)?.toLowerCase()
    const sentiment = (sentimentRaw === 'positive' || sentimentRaw === 'negative' || sentimentRaw === 'neutral') ? sentimentRaw : undefined
    const raw = await fetchCryptoNews(tickers, since, { sentiment: sentiment as any, items, page })
    const toClassifyIdx: number[] = []
    const texts: string[] = []
    raw.forEach((r, i) => { if (!r.sentiment) { toClassifyIdx.push(i); texts.push(r.title) } })
    let labels: { sentiment: Sentiment; score: number }[] = []
    if (texts.length) labels = await classifySentimentOpenAI(texts)
    const withLabels = raw.map((r, i) => {
      if (r.sentiment) return r
      const k = toClassifyIdx.indexOf(i)
      const lab = k >= 0 ? labels[k] : undefined
      return { ...r, sentiment: lab?.sentiment || 'bullish', score: lab?.score ?? 0 }
    })
    res.json({ items: withLabels })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'news_error' })
  }
})

// Core signal used by your center card (resilient STAT + fallback)
app.get('/api/signal', async (req: Request, res: Response) => {
  try {
    const ticker = String(req.query.ticker || 'BTC').toUpperCase()
    const tf = String(req.query.tf || '1h')
    const since = Number(req.query.since || 1440)
    const uiWin = (req.query.window as string | undefined)
    const statDate = mapUiWindowToStat(uiWin, since)

    if (!CRYPTONEWS_API_KEY) {
      return res.status(500).json({ error: 'No CryptoNews API key' })
    }

    // 1) Try STAT
    const stat = await tryFetchStat(ticker, statDate)

    // 2) Fallback to headlines if STAT empty
    let score = stat.score, count = stat.count, bullish = stat.bullish, bearish = stat.bearish
    let method: 'stat' | 'fallback' = 'stat'
    let drivers: string[] = stat.drivers

    if (!(stat.ok && (stat.count > 0 || stat.score !== 0))) {
      const items = await fetchHeadlinesForTicker(ticker, since)
      const agg = aggregateHeadlineScores(items)
      score = agg.score
      count = agg.count
      bullish = agg.bullish
      bearish = agg.bearish
      method = 'fallback'
      drivers = []
    }

    // Price (optional, but we keep it light)
    let price
    try { price = await fetchPriceFeatures(ticker, tf) } 
    catch { price = { source: 'unavailable', last: 0, momentum: 0, changePct: 0, vol: 0 } }

    // Map to BUY/SELL/NEUTRAL
    let status: 'BUY'|'SELL'|'NEUTRAL' = 'NEUTRAL'
    if (score > 0.10) status = 'BUY'
    else if (score < -0.10) status = 'SELL'

    // Confidence: magnitude + coverage
    const base = Math.min(1, Math.abs(score) / 1.5) * 80
    const coverage = Math.min(1, count / 50) * 20
    let confidence = Math.round(base + coverage)
    if (price?.source === 'unavailable') confidence = Math.round(confidence * 0.9)

    const health = count < 10 ? 'LowCoverage' : 'Healthy'

    res.json({
      status,
      confidence,
      health,
      newsScore: score,
      count,
      skew: { bullish, bearish },
      drivers,
      method,
      window: statDate,
      ticker,
      tf,
      lastUpdated: new Date().toISOString()
    })
  } catch (e: any) {
    res.status(500).json({ error: 'signal_error', details: e?.message || String(e) })
  }
})

// Analyze (longer plan generator) – retains your logic but uses STAT when available
app.post('/api/analyze', async (req: Request, res: Response) => {
  try {
    const body = req.body as AnalyzeRequest
    const ticker = String(body.ticker || 'BTC').toUpperCase()
    const tf = (body.tf || '1h') as '15m'|'1h'|'4h'|'1d'
    const since = Number(body.sinceMinutes || 60)
    const statDate = mapUiWindowToStat(undefined, since)

    // Aggregate stat (best effort)
    const stat = await tryFetchStat(ticker, statDate)
    const usingStat = stat.ok && (stat.count > 0 || stat.score !== 0)

    // News list (for “Why” section)
    const news: NewsItem[] = Array.isArray(body.news) && body.news.length
      ? body.news.map((n, idx) => ({
          id: String(idx),
          title: n.title, source: n.source, url: '',
          publishedAt: n.publishedAt || new Date().toISOString(),
          tickers: [ticker], sentiment: n.sentiment, score: n.score
        }))
      : await fetchCryptoNews([ticker], since)

    // Label missing with OpenAI (optional)
    const toClassifyIdx: number[] = []
    const texts: string[] = []
    news.forEach((r, i) => { if (!r.sentiment) { toClassifyIdx.push(i); texts.push(r.title) } })
    let labels: { sentiment: Sentiment; score: number }[] = []
    if (texts.length) labels = await classifySentimentOpenAI(texts)
    const labeled = news.map((r, i) => {
      if (r.sentiment) return r
      const k = toClassifyIdx.indexOf(i)
      const lab = k >= 0 ? labels[k] : undefined
      return { ...r, sentiment: lab?.sentiment || 'bullish', score: lab?.score ?? 0 }
    })

    const agg = aggregateSentiment(labeled)
    let price
    try { price = await fetchPriceFeatures(ticker, tf) }
    catch { price = { pair: mapTickerToPair(ticker), interval: tf, last: 0, changePct: 0, momentum: 0, vol: 0, source: 'unavailable' } }

    const totalScore = usingStat ? stat.score : agg.avg
    const overallSentiment = usingStat ? (totalScore >= 0 ? 'bullish' : 'bearish') : (agg.avg >= 0 ? 'bullish' : 'bearish')

    // Simple plan (heuristic unless OpenAI available)
    let status: 'BUY'|'SELL'|'NEUTRAL' = 'NEUTRAL'
    let confidence = 50
    const volFrac = Math.min(0.02, Math.max(0.005, Math.abs(price.vol || 0) / 100))
    let entry = price.last || 0, stop = entry, take = entry
    let chartReasons: string[] = [], newsReasons: string[] = []

    const priceAvailable = price.source !== 'unavailable'
    if (priceAvailable) {
      if (totalScore > 0.1 && price.momentum > 0) { status = 'BUY'; confidence = Math.min(88, 55 + Math.round((Math.abs(totalScore)*30 + price.momentum)/2)) }
      else if (totalScore < -0.1 && price.momentum < 0) { status = 'SELL'; confidence = Math.min(88, 55 + Math.round((Math.abs(totalScore)*30 + Math.abs(price.momentum))/2)) }
      else { status = 'NEUTRAL'; confidence = 45 }
    } else {
      if (totalScore > 0.15) { status = 'BUY'; confidence = Math.min(80, 50 + Math.round(Math.abs(totalScore)*35)) }
      else if (totalScore < -0.15) { status = 'SELL'; confidence = Math.min(80, 50 + Math.round(Math.abs(totalScore)*35)) }
      else { status = 'NEUTRAL'; confidence = 35 }
    }

    if (status === 'BUY') {
      stop = entry * (1 - volFrac)
      take = entry * (1 + 2*volFrac)
      chartReasons = priceAvailable
        ? [`Price above SMA20 by ${price.momentum.toFixed(2)}%`, `Volatility ~ ${price.vol.toFixed(2)}% suggests ${Math.round(volFrac*100)}bp stop, 2R target`]
        : ['News-based signal: strong bullish sentiment', `Sentiment score ${totalScore.toFixed(2)} > 0`]
    } else if (status === 'SELL') {
      stop = entry * (1 + volFrac)
      take = entry * (1 - 2*volFrac)
      chartReasons = priceAvailable
        ? [`Price below SMA20 by ${Math.abs(price.momentum).toFixed(2)}%`, `Volatility ~ ${price.vol.toFixed(2)}% suggests ${Math.round(volFrac*100)}bp stop, 2R target`]
        : ['News-based signal: strong bearish sentiment', `Sentiment score ${totalScore.toFixed(2)} < 0`]
    } else {
      chartReasons = priceAvailable
        ? [`Mixed momentum (${price.momentum.toFixed(2)}%) and change (${price.changePct.toFixed(2)}%)`]
        : ['Neutral sentiment: balanced news signals', `Score ${totalScore.toFixed(2)} near 0`]
    }

    newsReasons = usingStat
      ? [
          `Aggregate sentiment score: ${totalScore.toFixed(2)} (${overallSentiment}) from ${stat.count} items`,
          `Recent headlines: ${agg.bullish} bullish vs ${agg.bearish} bearish`,
          labeled.length ? `Top headline: "${labeled[0].title.substring(0, 60)}..."` : 'No recent headlines'
        ]
      : [
          `${agg.bullish} bullish vs ${agg.bearish} bearish headlines`,
          `Average news score ${agg.avg.toFixed(2)}`,
          labeled.length ? `Top: "${labeled[0].title.substring(0, 60)}..."` : 'No headlines'
        ]

    res.json({
      status,
      confidence,
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: take,
      chartReasons,
      newsReasons,
      sentimentSummary: usingStat
        ? `Overall sentiment: ${overallSentiment} (score: ${totalScore.toFixed(2)} from ${stat.count} items). Recent: ${agg.bullish} bullish vs ${agg.bearish} bearish`
        : `News skew: bullish ${agg.bullish} vs bearish ${agg.bearish}, avg ${agg.avg.toFixed(2)}`,
      aggregateScore: totalScore,
      aggregateSentiment: overallSentiment,
      features: {
        price,
        news: agg,
        aggregateStat: usingStat ? { score: totalScore, sentiment: overallSentiment, items: stat.count } : null
      }
    })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'analyze_error' })
  }
})

// General sentiment/stat proxy
app.get('/api/stat/general', async (req: Request, res: Response) => {
  try {
    const dateRange = (req.query.dateRange as string) || 'last30days'
    const r = await tryFetchStat('BTC', dateRange) // use BTC as a proxy or change to 'alltickers' if your plan allows
    if (!r.ok) return res.json({ score: 0, sentiment: 'neutral', items: 0 })
    res.json({ score: r.score, sentiment: r.score >= 0 ? 'bullish' : 'bearish', items: r.count })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'stat_general_error' })
  }
})

// Landing “general” news
app.get('/api/news/general', async (req: Request, res: Response) => {
  try {
    if (!CRYPTONEWS_API_KEY) return res.json({ items: [] })
    const totalItems = Math.min(100, Number(req.query.items || 12))
    const itemsPerSentiment = Math.ceil(totalItems / 2)
    const page = Math.max(1, Number(req.query.page || 1))
    
    // Use the "All Ticker News" endpoint for fetching news across all crypto coins
    const urlPositive = new URL('https://cryptonews-api.com/api/v1/category')
    urlPositive.searchParams.set('section', 'alltickers')
    urlPositive.searchParams.set('items', String(itemsPerSentiment))
    urlPositive.searchParams.set('page', String(page))
    urlPositive.searchParams.set('sentiment', 'positive')
    urlPositive.searchParams.set('token', CRYPTONEWS_API_KEY)
    
    const urlNegative = new URL('https://cryptonews-api.com/api/v1/category')
    urlNegative.searchParams.set('section', 'alltickers')
    urlNegative.searchParams.set('items', String(itemsPerSentiment))
    urlNegative.searchParams.set('page', String(page))
    urlNegative.searchParams.set('sentiment', 'negative')
    urlNegative.searchParams.set('token', CRYPTONEWS_API_KEY)
    
    // Fetch both in parallel
    const [resPositive, resNegative] = await Promise.all([
      fetch(urlPositive.toString()),
      fetch(urlNegative.toString())
    ])
    
    if (!resPositive.ok) throw new Error(`CryptoNews positive error ${resPositive.status}`)
    if (!resNegative.ok) throw new Error(`CryptoNews negative error ${resNegative.status}`)
    
    const dataPositive = await resPositive.json() as any
    const dataNegative = await resNegative.json() as any
    
    const articlesPositive: any[] = dataPositive?.data || dataPositive?.news || []
    const articlesNegative: any[] = dataNegative?.data || dataNegative?.news || []
    
    // Map both sets of articles
    const mapArticle = (a: any) => ({
      id: String(a.news_url || a.id || a.url || (globalThis.crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      title: a.title,
      source: a.source_name || a.source || 'Unknown',
      url: a.news_url || a.url,
      publishedAt: a.date || a.published_at || new Date().toISOString(),
      tickers: Array.isArray(a.tickers) ? a.tickers : (typeof a.ticker === 'string' ? [a.ticker] : []),
      image_url: a.image_url || a.thumbnail || '',
      text: a.text || a.description || a.summary || '',
      // Preserve the original CryptoNews sentiment
      cryptoNewsSentiment: (a.sentiment || '').toLowerCase(),
    })
    
    const mappedPositive: NewsItem[] = articlesPositive.map(mapArticle)
    const mappedNegative: NewsItem[] = articlesNegative.map(mapArticle)
    
    // Filter valid articles
    const filterValid = (m: NewsItem) => m.url && m.url.startsWith('http') && m.source && m.source !== 'Unknown'
    const filteredPositive = mappedPositive.filter(filterValid)
    const filteredNegative = mappedNegative.filter(filterValid)
    
    // Use OpenAI only for scoring, preserve CryptoNews sentiment
    const labelsPositive = await classifySentimentOpenAI(filteredPositive.map(r => r.title))
    const labelsNegative = await classifySentimentOpenAI(filteredNegative.map(r => r.title))
    
    const labeledPositive = filteredPositive.map((r, i) => ({ 
      ...r, 
      sentiment: 'bullish' as const, // Force bullish for positive news
      score: labelsPositive[i]?.score ?? 0.3 
    }))
    
    const labeledNegative = filteredNegative.map((r, i) => ({ 
      ...r, 
      sentiment: 'bearish' as const, // Force bearish for negative news
      score: labelsNegative[i]?.score ?? -0.3 
    }))
    
    // Mix them together for balanced bullish/bearish feed
    const mixed: NewsItem[] = []
    const maxLen = Math.max(labeledPositive.length, labeledNegative.length)
    for (let i = 0; i < maxLen; i++) {
      if (i < labeledPositive.length) mixed.push(labeledPositive[i])
      if (i < labeledNegative.length) mixed.push(labeledNegative[i])
    }
    
    res.json({ items: mixed })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'general_error' })
  }
})

// Trending Headlines endpoint
app.get('/api/news/trending', async (req: Request, res: Response) => {
  try {
    if (!CRYPTONEWS_API_KEY) return res.json({ items: [] })
    const page = Math.max(1, Number(req.query.page || 1))
    
    // Fetch trending headlines without sentiment filter to avoid duplicates
    const url = `https://cryptonews-api.com/api/v1/trending-headlines?page=${page}&token=${CRYPTONEWS_API_KEY}`
    const resTrending = await fetch(url)
    
    if (!resTrending.ok) throw new Error(`CryptoNews trending error ${resTrending.status}`)
    
    const data = await resTrending.json() as any
    const articles: any[] = data?.data || []
    
    // Helper function to fetch full article details by news_id
    async function fetchArticleDetails(newsId: string): Promise<any> {
      try {
        const detailUrl = `https://cryptonews-api.com/api/v1/category?section=alltickers&news_id=${newsId}&items=1&page=1&token=${CRYPTONEWS_API_KEY}`
        const res = await fetch(detailUrl)
        if (!res.ok) return null
        const data = await res.json()
        const articles = data?.data || []
        return articles[0] || null
      } catch {
        return null
      }
    }
    
    // Remove duplicates by news_id and fetch full details
    const seenIds = new Set<string>()
    const uniqueArticles: any[] = []
    
    for (const a of articles) {
      const newsId = a.news_id || a.id
      if (!newsId || seenIds.has(newsId)) continue
      
      seenIds.add(newsId)
      uniqueArticles.push(a)
    }
    
    // Fetch full details for unique articles (limit to 20)
    const promises = uniqueArticles.slice(0, 20).map(async (a) => {
      const newsId = a.news_id || a.id
      if (!newsId) return null
      
      // Fetch full article details
      const fullArticle = await fetchArticleDetails(newsId)
      
      return {
        id: String(newsId),
        title: a.headline || a.title || fullArticle?.title || '',
        source: a.source_name || a.source || fullArticle?.source_name || 'CryptoNews',
        url: fullArticle?.news_url || a.news_url || a.url || `https://cryptonews-api.com/news/${newsId}`,
        publishedAt: a.date || a.published_at || fullArticle?.date || new Date().toISOString(),
        tickers: Array.isArray(fullArticle?.tickers) ? fullArticle.tickers : (Array.isArray(a.tickers) ? a.tickers : []),
        image_url: fullArticle?.image_url || fullArticle?.thumbnail || a.image_url || a.thumbnail || '',
        text: fullArticle?.text || fullArticle?.description || a.text || a.description || '',
      }
    })
    
    const results = await Promise.all(promises)
    const mapped = results.filter((r): r is NonNullable<typeof r> => r !== null && r.title && r.title.length > 0)
    
    // Get sentiment from OpenAI
    const labels = await classifySentimentOpenAI(mapped.map(r => r.title))
    const labeled = mapped.map((r, i) => ({ 
      ...r, 
      sentiment: labels[i]?.sentiment || 'bullish', 
      score: labels[i]?.score ?? 0 
    }))
    
    res.json({ items: labeled })
  } catch (e: any) {
    console.error('Trending news error:', e?.message || e)
    res.status(500).json({ error: e?.message || 'trending_error' })
  }
})

// Sundown Digest endpoint
app.get('/api/news/sundown', async (req: Request, res: Response) => {
  try {
    if (!CRYPTONEWS_API_KEY) return res.json({ items: [] })
    const page = Math.max(1, Number(req.query.page || 1))
    const url = `https://cryptonews-api.com/api/v1/sundown-digest?page=${page}&token=${CRYPTONEWS_API_KEY}`
    const resApi = await fetch(url)
    if (!resApi.ok) throw new Error(`CryptoNews sundown error ${resApi.status}`)
    const data = await resApi.json() as any
    
    console.log('Sundown digest raw data:', JSON.stringify(data).substring(0, 500))
    
    // Try different possible structures
    let allNewsItems: any[] = []
    
    // Check if data is directly an array of news items
    if (Array.isArray(data?.data)) {
      const digests = data.data
      
      for (const item of digests) {
        // Check if item itself is a news article
        if (item?.title || item?.headline) {
          allNewsItems.push(item)
        }
        // Check if item contains nested news array
        else if (item?.news && Array.isArray(item.news)) {
          allNewsItems = allNewsItems.concat(item.news)
        }
        // Check for items array
        else if (item?.items && Array.isArray(item.items)) {
          allNewsItems = allNewsItems.concat(item.items)
        }
      }
    }
    
    console.log(`Sundown digest: extracted ${allNewsItems.length} news items`)
    
    // Map the individual news items
    const mapped: NewsItem[] = allNewsItems.map((a) => ({
      id: String(a.id || a.news_id || `sundown-${Date.now()}-${Math.random()}`),
      title: a.headline || a.title || '',
      source: a.source_name || a.source || 'CryptoNews',
      url: '', // Sundown digest items don't have URLs
      publishedAt: a.date || a.published_at || new Date().toISOString(),
      tickers: [], // No tickers in sundown digest
      image_url: '', // No images in sundown digest
      text: a.text || a.description || a.summary || '',
    }))
    
    const filtered = mapped.filter(m => m.title && m.title.length > 0)
    const labels = await classifySentimentOpenAI(filtered.map(r => r.title))
    const labeled = filtered.map((r, i) => ({ ...r, sentiment: labels[i]?.sentiment || 'bullish', score: labels[i]?.score ?? 0 }))
    
    console.log(`Sundown digest: returning ${labeled.length} labeled items`)
    res.json({ items: labeled })
  } catch (e: any) {
    console.error('Sundown digest error:', e?.message || e)
    res.status(500).json({ error: e?.message || 'sundown_error' })
  }
})

// Health
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
