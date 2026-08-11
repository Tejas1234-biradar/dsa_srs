import { useEffect, useState, useCallback } from 'react'
import type { SettingKey } from '@shared/types'
import { getAllSettings, setSetting, refreshLeetCode } from '../ipc'

const DEFAULT_PATTERNS = [
  'Two Pointers', 'Sliding Window', 'Binary Search', 'Dynamic Programming',
  'Graphs / BFS / DFS', 'Trees', 'Greedy', 'Backtracking',
  'Monotonic Stack', 'Heap / Priority Queue', 'DSU / Union-Find',
  'Bit Manipulation', 'Math', 'Intervals',
]

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      {children}
    </div>
  )
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <h4>{label}</h4>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<Set<SettingKey>>(new Set())
  const [patterns, setPatterns] = useState<string[]>([])
  const [newPattern, setNewPattern] = useState('')
  const [lcRefreshing, setLcRefreshing] = useState(false)
  const [lcMsg, setLcMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await getAllSettings()
    if (res.success && res.data) {
      setSettings(res.data)
      try {
        setPatterns(JSON.parse(res.data.pattern_rotation ?? '[]'))
      } catch {
        setPatterns(DEFAULT_PATTERNS)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveSetting(key: SettingKey, value: string) {
    setSettings(s => ({ ...s, [key]: value }))
    await setSetting({ key, value })
    setSaved(p => new Set([...p, key]))
    setTimeout(() => setSaved(p => { const n = new Set(p); n.delete(key); return n }), 1500)
  }

  async function savePatterns(ps: string[]) {
    setPatterns(ps)
    await saveSetting('pattern_rotation', JSON.stringify(ps))
  }

  function addPattern() {
    const trimmed = newPattern.trim()
    if (!trimmed || patterns.includes(trimmed)) return
    savePatterns([...patterns, trimmed])
    setNewPattern('')
  }

  function removePattern(p: string) {
    savePatterns(patterns.filter(x => x !== p))
  }

  async function handleRefreshLC() {
    setLcRefreshing(true)
    setLcMsg(null)
    const res = await refreshLeetCode()
    setLcRefreshing(false)
    if (res.success && res.data) {
      setLcMsg(res.data.skipped
        ? 'Cache is up to date (refreshed < 24h ago)'
        : `Fetched ${res.data.fetched} problems`)
    } else {
      setLcMsg(`Error: ${res.error}`)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const retention = parseFloat(settings.desired_retention ?? '0.85')
  const minFirst = parseInt(settings.min_first_interval_days ?? '5', 10)
  const newPerDay = parseInt(settings.new_cards_per_day ?? '2', 10)
  const reviewCap = parseInt(settings.daily_review_cap ?? '30', 10)

  let diffBand = { Easy: 15, Medium: 70, Hard: 15 }
  try { diffBand = JSON.parse(settings.difficulty_progression ?? '{}') } catch { /* ok */ }

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Tune the scheduling parameters to match how you learn</p>
      </div>

      {/* FSRS Settings */}
      <SettingsSection title="FSRS Scheduling">
        <SettingsRow
          label="Desired Retention"
          description={`Target recall probability. Lower = fewer, more spaced reviews. (${Math.round(retention * 100)}%)`}
        >
          <div className="slider-container">
            <input
              id="setting-retention-slider"
              type="range"
              className="slider"
              min="0.75" max="0.95" step="0.01"
              value={retention}
              onChange={e => saveSetting('desired_retention', e.target.value)}
            />
            <span className="slider-value">{Math.round(retention * 100)}%</span>
          </div>
          {saved.has('desired_retention') && <p style={{ color: 'var(--green)', fontSize: 11, marginTop: 4 }}>Saved</p>}
        </SettingsRow>

        <SettingsRow
          label="Min First Interval"
          description="Minimum days before a newly-solved problem is reviewed. Prevents testing short-term memory."
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              id="setting-min-interval-input"
              type="number"
              className="form-input"
              min="1" max="30"
              value={minFirst}
              onChange={e => saveSetting('min_first_interval_days', e.target.value)}
              style={{ width: 80, textAlign: 'center' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>days</span>
          </div>
          {saved.has('min_first_interval_days') && <p style={{ color: 'var(--green)', fontSize: 11, marginTop: 4 }}>Saved</p>}
        </SettingsRow>
      </SettingsSection>

      {/* Daily Queue Settings */}
      <SettingsSection title="Daily Queue">
        <SettingsRow
          label="New Problems Per Day"
          description="How many new problems the app auto-selects each day."
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              id="setting-new-per-day-input"
              type="number"
              className="form-input"
              min="0" max="10"
              value={newPerDay}
              onChange={e => saveSetting('new_cards_per_day', e.target.value)}
              style={{ width: 80, textAlign: 'center' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/ day</span>
          </div>
          {saved.has('new_cards_per_day') && <p style={{ color: 'var(--green)', fontSize: 11, marginTop: 4 }}>Saved</p>}
        </SettingsRow>

        <SettingsRow
          label="Daily Review Cap"
          description="Maximum due reviews shown per day. Extras are deferred to the next day."
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <input
              id="setting-review-cap-input"
              type="number"
              className="form-input"
              min="5" max="200"
              value={reviewCap}
              onChange={e => saveSetting('daily_review_cap', e.target.value)}
              style={{ width: 80, textAlign: 'center' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>reviews</span>
          </div>
          {saved.has('daily_review_cap') && <p style={{ color: 'var(--green)', fontSize: 11, marginTop: 4 }}>Saved</p>}
        </SettingsRow>
      </SettingsSection>

      {/* Difficulty Progression */}
      <SettingsSection title="Difficulty Progression">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
          Probability weights for new problem difficulty selection (must sum to 100).
        </p>
        {(['Easy', 'Medium', 'Hard'] as const).map(diff => (
          <SettingsRow key={diff} label={diff} description="">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <input
                id={`setting-diff-${diff.toLowerCase()}-input`}
                type="number"
                className="form-input"
                min="0" max="100"
                value={diffBand[diff]}
                onChange={e => {
                  const newBand = { ...diffBand, [diff]: parseInt(e.target.value, 10) || 0 }
                  saveSetting('difficulty_progression', JSON.stringify(newBand))
                }}
                style={{ width: 80, textAlign: 'center' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>%</span>
            </div>
          </SettingsRow>
        ))}
      </SettingsSection>

      {/* Pattern Rotation */}
      <SettingsSection title="Pattern Rotation">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
          The app rotates through these patterns when selecting new problems each day.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
          {patterns.map(p => (
            <div
              key={p}
              id={`pattern-chip-${p.replace(/\s+/g, '-').toLowerCase()}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--purple-dim)', border: '1px solid rgba(168,85,247,0.2)',
                borderRadius: 999, padding: '4px 12px', fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--purple)' }}>{p}</span>
              <button
                onClick={() => removePattern(p)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 0 }}
                title={`Remove ${p}`}
              >×</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <input
            id="setting-new-pattern-input"
            className="form-input"
            placeholder="Add a new pattern category…"
            value={newPattern}
            onChange={e => setNewPattern(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPattern())}
          />
          <button
            id="setting-add-pattern-btn"
            className="btn btn-secondary"
            onClick={addPattern}
            disabled={!newPattern.trim()}
          >Add</button>
        </div>
      </SettingsSection>

      {/* LeetCode Cache */}
      <SettingsSection title="LeetCode Problem Cache">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
          The app fetches and locally caches all LeetCode problems for autocomplete and daily selection.
          Cache refreshes automatically once per day.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <button
            id="settings-refresh-lc-btn"
            className="btn btn-secondary"
            onClick={handleRefreshLC}
            disabled={lcRefreshing}
          >
            {lcRefreshing ? '↻ Fetching…' : '↻ Refresh Cache Now'}
          </button>
          {lcMsg && (
            <span style={{ fontSize: 13, color: lcMsg.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>
              {lcMsg}
            </span>
          )}
        </div>
      </SettingsSection>
    </div>
  )
}
