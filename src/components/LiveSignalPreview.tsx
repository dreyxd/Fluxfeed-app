import React, { useState, useEffect } from 'react';

// A mock fetch function - replace with your actual API call
async function fetchLiveSignal() {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // In a real app, you'd fetch from /api/signal for a popular ticker
  // For this mock, we'll cycle through a few states
  const states = [
    {
      status: 'BUY',
      confidence: 78,
      newsSkew: 6,
      reasons: [
        "Positive regulatory news from a major economy.",
        "Breakout above key resistance on high volume.",
        "Sustained bullish sentiment across multiple news sources.",
      ],
    },
    {
      status: 'SELL',
      confidence: 65,
      newsSkew: -4,
      reasons: [
        "Major exchange reports technical issues, pausing withdrawals.",
        "Price rejected at the 50-day moving average.",
        "Spike in bearish sentiment following a whale alert.",
      ],
    },
    {
      status: 'NEUTRAL',
      confidence: 55,
      newsSkew: 1,
      reasons: [
        "Conflicting news reports with no clear market direction.",
        "Price is consolidating within a tight range.",
        "Sentiment is mixed, with no strong bullish or bearish consensus.",
      ],
    },
  ];

  return states[Math.floor(Math.random() * states.length)];
}


export default function LiveSignalPreview() {
  const [signal, setSignal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadSignal = async () => {
    setLoading(true);
    const data = await fetchLiveSignal();
    setSignal(data);
    setLoading(false);
  };

  useEffect(() => {
    loadSignal();
  }, []);

  const getStatusColor = () => {
    if (loading || !signal) return 'bg-zinc-700';
    switch (signal.status) {
      case 'BUY': return 'bg-emerald-500';
      case 'SELL': return 'bg-rose-500';
      default: return 'bg-yellow-500';
    }
  };

  return (
    <div className="mt-12 animate-fade-in">
      <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-2xl">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Left: Status & Confidence */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <div className="text-sm font-medium text-zinc-400">Signal Status</div>
            <div className={`mt-2 text-3xl font-bold ${loading ? 'text-zinc-400' : signal.status === 'BUY' ? 'text-emerald-400' : signal.status === 'SELL' ? 'text-rose-400' : 'text-yellow-400'}`}>
              {loading ? 'Loading...' : signal.status}
            </div>
            <div className="mt-4 text-sm font-medium text-zinc-400">Confidence</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {loading ? '--' : `${signal.confidence}%`}
            </div>
          </div>

          {/* Middle: Reasons */}
          <div className="md:col-span-2">
            <h3 className="text-sm font-semibold text-zinc-300">Key Drivers:</h3>
            <ul className="mt-3 space-y-3">
              {loading ? (
                <>
                  <li className="h-4 bg-zinc-800 rounded-md animate-pulse"></li>
                  <li className="h-4 bg-zinc-800 rounded-md animate-pulse w-5/6"></li>
                  <li className="h-4 bg-zinc-800 rounded-md animate-pulse w-4/6"></li>
                </>
              ) : (
                signal.reasons.map((reason: string, i: number) => (
                  <li key={i} className="flex items-start gap-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-orange-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>
                    <span className="text-sm text-zinc-300">{reason}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4">
          <div className="text-sm text-zinc-400">
            This is a live example. Data is refreshed periodically.
          </div>
          <button
            onClick={loadSignal}
            disabled={loading}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh Preview'}
          </button>
        </div>
        
        {/* Live Status Indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor()}`}></div>
          <span className="text-xs font-medium text-zinc-400">Live</span>
        </div>
      </div>
    </div>
  );
}
