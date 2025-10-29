# Fluxfeed App# Fluxfeed (Landing + Signals)



This is the main application for Fluxfeed (app.fluxfeed.news). It contains the trading signals dashboard, authentication, and all app-specific functionality.Vite + React + TypeScript + Tailwind frontend with a Signals page, plus a small TypeScript Express API for news sentiment and signals.



## Development## Quick start



```bash```powershell

# Install dependencies# From the project root (d:\SentineX)

npm installnpm install



# Run development server only# Optional: create .env for API keys (copy from .env.example)

npm run devcopy .env.example .env

# then edit .env and set CRYPTONEWS_API_KEY and OPENAI_API_KEY if available

# Run backend server only

npm run server# Start both client and API server

npm run dev:all

# Run both frontend and backend# Client: http://localhost:5173  (proxied /api -> http://localhost:8787)

npm run dev:all# API:    http://localhost:8787

```

# Initialize database

npm run init-db## Build for production



# Build for production```powershell

npm run buildnpm run build

npm run preview

# Preview production build```

npm run preview

```## Notes



The dev server runs on `http://localhost:5173`- The "Launch App" button points to `/app`.

- Tailwind is configured to scan `index.html` and all files under `src/`.

## Deployment- Dev proxy: Vite proxies `/api/*` to the local API server on port 8787.



This project is designed to be deployed to Vercel and accessible at **app.fluxfeed.news**.## API overview



### Vercel Configuration- GET `/api/news?ticker=BTC&since=60` → latest headlines annotated with sentiment and score.

- GET `/api/signal?ticker=BTC&tf=1h&since=60` → aggregated signal with confidence and reasons.

1. Create a new project in Vercel

2. Connect to this repository folder: `Fluxfeed-app`Notes:

3. Configure build settings:- Without API keys, the server uses safe heuristic fallbacks (still functional for demos).

   - Build Command: `npm run build`- With keys set in `.env`, it will fetch real headlines (CryptoNews) and use OpenAI to classify.

   - Output Directory: `dist`
4. Add custom domain: `app.fluxfeed.news`

### Environment Variables

Required for production:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `VITE_API_BASE_URL` - API endpoint (defaults to current domain)

## Project Structure

```
server/            # Backend Express server
  routes/          # API routes (auth, waitlist)
  middleware/      # Auth middleware
  db.ts           # Database connection
  index.ts        # Server entry point
src/
  components/     # Reusable components
    Auth/         # Login, Register components
  contexts/       # React contexts (AuthContext)
  pages/          # Page components
    FluxfeedSignals.tsx  # Main app dashboard
  config/         # Configuration files
  App.tsx         # Main routing component
  main.tsx        # Entry point
  index.css       # Global styles
```

## Features

- **Real-time Trading Signals** - AI-powered BUY/SELL/NEUTRAL signals
- **News Sentiment Analysis** - Live crypto news with sentiment scoring
- **TradingView Integration** - Interactive price charts
- **Multi-ticker Support** - 19+ cryptocurrencies
- **Customizable Filters** - Timeframes, news windows, sentiment filters
- **User Authentication** - Secure login and registration

## External Links

Marketing pages (about, pricing, docs, etc.) are hosted separately at: **https://fluxfeed.news**
