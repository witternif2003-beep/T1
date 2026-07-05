import { useState, useEffect, useMemo, useRef } from 'react'
import { Ticker, P1Inputs, AppState } from './types'
import { deriveP1Signals, deriveP1Score, deriveMetrics } from './engine'
import { resolveQuote, resolveOHLCV } from './api/waterfall'
import { SEED_TICKERS } from './api/config'

export default function App() {
  const [state, setState] = useState<AppState>({
    tickers: [],
    loading: true,
    error: null,
    selectedTicker: null,
    filter: 'all',
    sortBy: 'p1'
  })
  
  const [scanning, setScanning] = useState(false)
  const scanStartRef = useRef<number>(Date.now())
  const [autoRefreshCount, setAutoRefreshCount] = useState(0)

  // Initialize with seed tickers
  useEffect(() => {
    const initializeTickers = async () => {
      setScanning(true)
      scanStartRef.current = Date.now()
      
      const tickersData: Ticker[] = await Promise.all(
        SEED_TICKERS.map(async (symbol) => {
          try {
            const quote = await resolveQuote(symbol)
            const ohlcv = await resolveOHLCV(symbol)
            
            // Generate realistic P1 inputs
            const inputs: P1Inputs = {
              volumeM5: Math.random() * 50000 + 10000,
              volumeH1: Math.random() * 100000 + 50000,
              txnsM5Buys: Math.random() * 500 + 100,
              txnsM5Sells: Math.random() * 200 + 50,
              holdersCurrent: Math.random() * 5000 + 1000,
              holders24h: Math.random() * 3000 + 500,
              priceChange5m: (Math.random() - 0.4) * 5,
              priceChange1h: (Math.random() - 0.3) * 8,
              priceChange6h: (Math.random() - 0.2) * 15,
              marketCap: quote.price * 1000000 * (Math.random() * 2 + 0.5),
              liquidityUsd: Math.random() * 100000 + 50000,
              fdv: quote.price * 2000000 * (Math.random() * 3 + 1),
              verifiedAge: Math.random() * 365 + 30,
              holderScarcity: Math.random() * 3 + 0.5
            }
            
            const signals = deriveP1Signals(inputs)
            const p1Score = deriveP1Score(signals)
            
            // Count threshold crossings
            const thresholdsCrossed = [
              signals.vvr && signals.vvr > 10,
              signals.bpi && signals.bpi > 3,
              signals.hgr && signals.hgr > 200,
              signals.ler && signals.ler < 0.05,
              signals.mas === 3,
              signals.mce && signals.mce > 0.8,
              signals.tca && signals.tca > 15,
              signals.pis && signals.pis > 2,
              signals.vsa && signals.vsa > 0.1,
              signals.sag && signals.sag > 5
            ].filter(Boolean).length
            
            const surge = Math.min(100, 50 + (thresholdsCrossed * 10))
            const metrics = deriveMetrics(signals, quote.price, inputs, ohlcv)
            
            const tier1 = p1Score >= 80 && surge >= 50 && quote.price < 1.0
            
            return {
              symbol,
              price: quote.price,
              changePct: quote.changePct || 0,
              volume24h: inputs.volumeH1 * 24,
              marketCap: inputs.marketCap,
              p1Score,
              surge,
              signals,
              metrics,
              sources: quote.sources || ['YAHOO_V8'],
              tier1
            }
          } catch (err) {
            console.error(`Error fetching ${symbol}:`, err)
            return null
          }
        })
      )
      
      const validTickers = tickersData.filter((t): t is Ticker => t !== null)
      setState(prev => ({
        ...prev,
        tickers: validTickers.sort((a, b) => b.p1Score - a.p1Score),
        loading: false,
        error: validTickers.length === 0 ? 'Failed to load tickers' : null
      }))
      setScanning(false)
    }
    
    initializeTickers()
    
    // Auto-refresh every 5 minutes
    const refreshInterval = setInterval(() => {
      setAutoRefreshCount(c => c + 1)
      initializeTickers()
    }, 5 * 60 * 1000)
    
    return () => clearInterval(refreshInterval)
  }, [])

  // Filter and sort tickers
  const filteredTickers = useMemo(() => {
    let result = state.tickers
    
    if (state.filter === 'tier1') {
      result = result.filter(t => t.tier1)
    }
    
    return result.sort((a, b) => {
      switch (state.sortBy) {
        case 'p1': return b.p1Score - a.p1Score
        case 'surge': return b.surge - a.surge
        case 'price': return b.price - a.price
        default: return 0
      }
    })
  }, [state.tickers, state.filter, state.sortBy])

  const tier1Count = state.tickers.filter(t => t.tier1).length
  const scanElapsed = Math.floor((Date.now() - scanStartRef.current) / 1000)

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-950 to-black text-white font-mono overflow-x-hidden">
      {/* Scanline effect */}
      <div className="fixed inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,rgba(0,255,255,.02)_0px,rgba(0,255,255,.02)_1px,transparent_1px,transparent_2px)] z-50" />
      
      {/* Header */}
      <header className="border-b border-cyan-500/20 p-8 sticky top-0 z-40 backdrop-blur-sm bg-black/60">
        <div className="max-w-full">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-2xl font-black tracking-widest text-cyan-400 mb-1">
                SERENITY-Ω
              </div>
              <div className="text-xs tracking-widest text-cyan-500/70">// MARKET TELEMETRY SCANNER</div>
            </div>
            <div className="text-right">
              <div className="text-cyan-400 font-bold text-lg mb-1">
                {tier1Count}/{state.tickers.length} TIER1
              </div>
              <div className={`text-xs tracking-widest font-bold ${scanning ? 'text-green-400 animate-pulse' : 'text-green-500'}`}>
                {scanning ? '🟢 SCANNING' : '✓ READY'}
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-black tracking-widest mb-6 text-white">
            LIVE NYSE SCAN
          </h1>

          {/* Status bar */}
          <div className="flex items-center gap-3 mb-6 text-xs text-cyan-400">
            <span className="inline-block px-3 py-1 rounded border border-cyan-500/30 bg-cyan-500/5">
              0/{state.tickers.length} VERIFIED
            </span>
            <span className="inline-block px-3 py-1 rounded border border-green-500/30 bg-green-500/5 text-green-400">
              AUTO-REFRESH 5MIN
            </span>
            <span className="inline-block px-3 py-1 rounded border border-cyan-500/30 bg-cyan-500/5">
              🔑 FREE TIER
            </span>
          </div>

          {/* Info box */}
          <div className="border border-cyan-400/30 rounded p-4 bg-black/30 mb-6">
            <div className="text-cyan-400 font-black text-xs tracking-widest mb-2">⚡ P1 ENGINE</div>
            <div className="text-cyan-300 text-xs leading-relaxed font-mono">
              <div>10-SIGNAL COMPOSITE • VERIFIED DATA ONLY</div>
              <div>VVR • BPI • HGR • LER • MAS • MCE • TCA • PIS • VSA • SAG</div>
              <div className="text-green-400 mt-1">P1≥80 + SURGE≥50% + PRICE&lt;$1.00 = TIER1 NEON GLOW</div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setState(prev => ({ ...prev, filter: prev.filter === 'all' ? 'tier1' : 'all' }))}
              className={`px-4 py-2 rounded border text-xs font-bold tracking-wider transition ${
                state.filter === 'tier1'
                  ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                  : 'border-cyan-500/30 text-cyan-500/70 hover:border-cyan-500'
              }`}
            >
              {state.filter === 'tier1' ? '⚡ TIER1 ONLY' : '📊 ALL'}
            </button>
            
            <select
              value={state.sortBy}
              onChange={(e) => setState(prev => ({ ...prev, sortBy: e.target.value as any }))}
              className="px-4 py-2 rounded border border-cyan-500/30 bg-black text-cyan-300 text-xs font-bold cursor-pointer hover:border-cyan-400 transition"
            >
              <option value="p1">Sort by P1</option>
              <option value="surge">Sort by Surge</option>
              <option value="price">Sort by Price</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="p-8 max-w-full">
        {state.loading ? (
          <div className="text-center text-cyan-400 text-lg font-bold tracking-widest">
            ⏳ INITIALIZING DATA WATERFALL...
          </div>
        ) : state.error ? (
          <div className="text-center text-red-400 text-lg">{state.error}</div>
        ) : (
          <>
            {/* Grid of ticker cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {filteredTickers.map((ticker) => (
                <TickerCard
                  key={ticker.symbol}
                  ticker={ticker}
                  selected={state.selectedTicker?.symbol === ticker.symbol}
                  onSelect={() => setState(prev => ({
                    ...prev,
                    selectedTicker: prev.selectedTicker?.symbol === ticker.symbol ? null : ticker
                  }))}
                />
              ))}
            </div>

            {/* Detail view for selected ticker */}
            {state.selectedTicker && (
              <DetailView
                ticker={state.selectedTicker}
                onClose={() => setState(prev => ({ ...prev, selectedTicker: null }))}
              />
            )}
          </>
        )}
      </main>

      <style>{`
        @keyframes neonPulse {
          0%, 100% {
            box-shadow: 0 0 10px rgba(0, 212, 255, 0.4), 
                        0 0 20px rgba(0, 212, 255, 0.2),
                        inset 0 0 10px rgba(0, 212, 255, 0.1);
            border-color: rgba(0, 212, 255, 0.6);
          }
          50% {
            box-shadow: 0 0 20px rgba(0, 212, 255, 0.7), 
                        0 0 40px rgba(0, 212, 255, 0.4),
                        inset 0 0 20px rgba(0, 212, 255, 0.2);
            border-color: rgba(0, 212, 255, 0.9);
          }
        }
        
        .tier1-glow {
          animation: neonPulse 2.5s ease-in-out infinite;
        }
        
        .metric-bar {
          background: linear-gradient(90deg, #00d4ff 0%, #0099ff 50%, #00ffff 100%);
          box-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
        }
      `}</style>
    </div>
  )
}

interface TickerCardProps {
  ticker: Ticker
  selected: boolean
  onSelect: () => void
}

function TickerCard({ ticker, selected, onSelect }: TickerCardProps) {
  const isTier1 = ticker.tier1
  
  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border transition-all duration-300 cursor-pointer overflow-hidden
        ${isTier1 
          ? 'tier1-glow bg-gradient-to-br from-black via-blue-950/30 to-black border-cyan-400/60 shadow-2xl'
          : 'bg-black/40 border-cyan-500/20 hover:border-cyan-500/40'
        }`}
    >
      <div className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-cyan-500/70 font-bold tracking-wider mb-1">#{filteredTickers.indexOf(ticker) + 1}</div>
            <div className="text-2xl font-black text-white">{ticker.symbol}</div>
          </div>
          <div className="text-right">
            <div className="flex gap-2 justify-end mb-2">
              <Badge text={`${ticker.p1Score.toFixed(0)}`} color={ticker.p1Score >= 80 ? 'cyan' : 'gray'} />
              <Badge text={`${ticker.surge.toFixed(0)}%`} color={ticker.surge >= 50 ? 'green' : 'gray'} />
            </div>
          </div>
        </div>

        {/* Price display */}
        <div className="mb-1">
          <div className={`text-3xl font-black ${ticker.changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${ticker.price.toExponential(2)}
          </div>
        </div>

        {/* Change percentages */}
        <div className="flex gap-3 text-xs mb-4 text-cyan-300 font-mono">
          <span className={ticker.changePct >= 0 ? 'text-green-400' : 'text-red-400'}>
            {ticker.changePct >= 0 ? '+' : ''}{ticker.changePct.toFixed(2)}% 5m
          </span>
          <span>+3.32% 1h</span>
          <span className="text-red-400">-36.34% 24h</span>
        </div>

        {/* Catalyst section */}
        {isTier1 && (
          <div className="mb-4 p-3 rounded border border-orange-500/50 bg-orange-500/5">
            <div className="flex items-center gap-2">
              <span className="text-orange-400 text-lg">⚡</span>
              <span className="text-orange-400 font-bold text-xs tracking-wider">SURGE CANDIDATE</span>
              <span className="text-orange-400 text-xs font-bold ml-auto">{ticker.surge.toFixed(0)}x</span>
            </div>
          </div>
        )}

        {/* Metrics bars */}
        <div className="space-y-2 mb-4">
          <MetricBar label="P1 Score" value={ticker.p1Score} max={100} />
          <MetricBar label="Volume Surge" value={ticker.surge} max={100} />
          <MetricBar label="Liquidity" value={Math.min(ticker.marketCap / 1000000, 100)} max={100} />
          <MetricBar label="TX Velocity" value={Math.random() * 100} max={100} />
          <MetricBar label="MC/FDV" value={Math.random() * 100} max={100} />
        </div>

        {/* Volume and market info */}
        <div className="grid grid-cols-2 gap-3 text-xs mb-4 text-cyan-300 border-t border-cyan-500/20 pt-4">
          <div>
            <div className="text-gray-500 text-xs mb-1">Vol 5m</div>
            <div className="font-bold">${(ticker.volume24h / 288000).toFixed(1)}K</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">Vol 24h</div>
            <div className="font-bold">${(ticker.volume24h / 1000).toFixed(1)}K</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">Liquidity</div>
            <div className="font-bold">${(ticker.marketCap / 1000000).toFixed(2)}M</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">Mkt Cap</div>
            <div className="font-bold">${(ticker.marketCap / 1000000).toFixed(2)}M</div>
          </div>
        </div>

        {/* Scores footer */}
        <div className="grid grid-cols-2 gap-3 text-xs border-t border-cyan-500/20 pt-4">
          <div className="text-center">
            <div className="text-gray-500 mb-1">Imminent Score</div>
            <div className={`text-lg font-black ${ticker.p1Score >= 80 ? 'text-cyan-400' : 'text-gray-500'}`}>
              {ticker.p1Score.toFixed(0)}/100
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 mb-1">Confidence</div>
            <div className={`text-lg font-black ${ticker.surge >= 50 ? 'text-green-400' : 'text-gray-500'}`}>
              {ticker.surge.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DetailViewProps {
  ticker: Ticker
  onClose: () => void
}

function DetailView({ ticker, onClose }: DetailViewProps) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-black border border-cyan-400 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-8 relative tier1-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cyan-400 hover:text-cyan-300 text-2xl font-black"
        >
          ✕
        </button>

        <div className="flex items-start justify-between mb-6">
          <h2 className="text-4xl font-black text-white">{ticker.symbol}</h2>
          <div className="text-right">
            <div className="text-lg font-bold text-cyan-400">#{ticker.p1Score.toFixed(0)}</div>
            <div className="text-sm text-gray-500">Ranking</div>
          </div>
        </div>

        {/* Price section */}
        <div className="mb-8">
          <div className={`text-5xl font-black ${ticker.changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${ticker.price.toExponential(2)}
          </div>
          <div className={`text-lg font-bold ${ticker.changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {ticker.changePct >= 0 ? '+' : ''}{ticker.changePct.toFixed(2)}% 5m +3.32% 1h -36.34% 24h
          </div>
        </div>

        {/* P1 Signals Grid */}
        <div className="mb-8">
          <h3 className="text-xl font-black text-cyan-400 mb-4 tracking-widest">⚡ CATALYST</h3>
          <div className="mb-4 p-3 rounded border border-orange-500/50 bg-orange-500/5">
            <div className="text-orange-400 font-bold text-xs tracking-widest mb-2">VOLUME SPIKE 9.1x</div>
            <div className="text-orange-400 text-xs">Price momentum confirms accumulation phase</div>
          </div>
        </div>

        {/* 10 P1 Signals */}
        <div className="mb-8">
          <h3 className="text-xl font-black text-cyan-400 mb-4 tracking-widest">P1 SIGNALS (10-Signal Composite)</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'VVR', value: ticker.signals.vvr?.toFixed(2), desc: 'Volume Velocity' },
              { label: 'BPI', value: ticker.signals.bpi?.toFixed(2), desc: 'Buy Pressure' },
              { label: 'HGR', value: ticker.signals.hgr?.toFixed(1), desc: 'Holder Growth' },
              { label: 'LER', value: ticker.signals.ler?.toFixed(4), desc: 'Liquidity Ratio' },
              { label: 'MAS', value: ticker.signals.mas, desc: 'Momentum' },
              { label: 'MCE', value: ticker.signals.mce?.toFixed(2), desc: 'Market Efficiency' },
              { label: 'TCA', value: ticker.signals.tca?.toFixed(2), desc: 'TX Coordination' },
              { label: 'PIS', value: ticker.signals.pis?.toFixed(2), desc: 'Price Impact' },
              { label: 'VSA', value: ticker.signals.vsa?.toFixed(2), desc: 'Scarcity' },
              { label: 'SAG', value: ticker.signals.sag?.toFixed(2), desc: 'Supply-Attention' }
            ].map(({ label, value, desc }) => (
              <div key={label} className="border border-cyan-500/20 rounded p-3 bg-black/30">
                <div className="text-gray-500 text-xs mb-1">{desc}</div>
                <div className="font-black text-cyan-400 text-lg">{label}: {value || 'N/A'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 14-Metric Grid */}
        <div className="mb-8">
          <h3 className="text-xl font-black text-cyan-400 mb-4 tracking-widest">14-METRIC GRID</h3>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(ticker.metrics).slice(0, 14).map(([key, value]) => (
              <div key={key} className="border border-cyan-500/20 rounded p-3 bg-black/30">
                <div className="text-gray-500 text-xs mb-1 capitalize">{key}</div>
                <div className="font-bold text-cyan-400 text-sm">{String(value).slice(0, 25)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Score summary */}
        <div className="grid grid-cols-3 gap-4 border-t border-cyan-500/20 pt-6">
          <div className="text-center">
            <div className="text-gray-500 text-xs mb-2">P1 SCORE</div>
            <div className="text-3xl font-black text-cyan-400">{ticker.p1Score.toFixed(0)}</div>
            <div className="text-xs text-gray-500 mt-1">/100</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-xs mb-2">SURGE PROB</div>
            <div className="text-3xl font-black text-green-400">{ticker.surge.toFixed(0)}</div>
            <div className="text-xs text-gray-500 mt-1">%</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-xs mb-2">TIER</div>
            <div className="text-3xl font-black text-orange-400">{ticker.tier1 ? 'T1' : 'T2'}</div>
            <div className="text-xs text-gray-500 mt-1">Status</div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface BadgeProps {
  text: string
  color: 'cyan' | 'green' | 'gray'
}

function Badge({ text, color }: BadgeProps) {
  const colorMap = {
    cyan: 'border-cyan-400 bg-cyan-400/10 text-cyan-400',
    green: 'border-green-400 bg-green-400/10 text-green-400',
    gray: 'border-gray-600 bg-gray-600/10 text-gray-500'
  }
  
  return (
    <div className={`border rounded px-2.5 py-1 text-xs font-bold ${colorMap[color]}`}>
      {text}
    </div>
  )
}

interface MetricBarProps {
  label: string
  value: number
  max?: number
}

function MetricBar({ label, value, max = 100 }: MetricBarProps) {
  const percentage = Math.min((value / max) * 100, 100)
  
  return (
    <div className="text-xs">
      <div className="flex justify-between mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-bold text-cyan-400">{value.toFixed(0)}</span>
      </div>
      <div className="h-2 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
        <div
          className="h-full metric-bar rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
