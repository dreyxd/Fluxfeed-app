import React, { useEffect, useMemo, useRef } from 'react'

type TVProps = {
  symbol: string
  interval: string // e.g. '15', '60', '240', 'D'
  theme?: 'light' | 'dark'
}

const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js'

function loadTradingViewScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.TradingView) return resolve()
    const existing = document.getElementById('tradingview-widget-script') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load TradingView script')))
      return
    }
    const script = document.createElement('script')
    script.id = 'tradingview-widget-script'
    script.type = 'text/javascript'
    script.async = true
    script.src = TV_SCRIPT_SRC
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load TradingView script'))
    document.head.appendChild(script)
  })
}

export default function TradingViewChart({ symbol, interval, theme = 'dark' }: TVProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetRef = useRef<any>(null)
  const tvContainerId = useMemo(
    () => `tv_container_${symbol.replace(/[:]/g, '_')}_${interval}`,
    [symbol, interval]
  )

  useEffect(() => {
    let cancelled = false
    loadTradingViewScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.TradingView) return
        // Ensure a child container with a stable id exists
        containerRef.current.innerHTML = `<div id="${tvContainerId}" style="width:100%;height:100%"></div>`
        try {
          widgetRef.current = new window.TradingView.widget({
            autosize: true,
            symbol,
            interval,
            container_id: tvContainerId, // TradingView expects an element id
            theme: theme === 'dark' ? 'dark' : 'light',
            locale: 'en',
            style: '1', // candles
            toolbar_bg: 'rgba(0,0,0,0)',
            enable_publishing: false,
            withdateranges: true,
            hide_side_toolbar: false,
            hide_top_toolbar: false,
            allow_symbol_change: false,
            studies: [],
          })
        } catch {
          // keep silent on init failure to avoid runtime noise
        }
      })
      .catch(() => {
        // no-op: keep placeholder empty on failure
      })

    return () => {
      cancelled = true
      if (containerRef.current) containerRef.current.innerHTML = ''
      widgetRef.current = null
    }
  }, [symbol, interval, theme, tvContainerId])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
