import { useState, useRef, useCallback } from 'react'
import type { LeetCodeProblem } from '@shared/types'
import { addProblem, searchLeetCode } from '../ipc'

const DIFFICULTY_OPTIONS = ['Easy', 'Medium', 'Hard'] as const
type Diff = (typeof DIFFICULTY_OPTIONS)[number]

function DifficultyTag({ d }: { d: string }) {
  return (
    <span className={`tag tag-${d.toLowerCase()}`}>{d}</span>
  )
}

export default function AddProblem() {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('LeetCode')
  const [difficulty, setDifficulty] = useState<Diff | ''>('')
  const [tagsInput, setTagsInput] = useState('')
  const [cue, setCue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<LeetCodeProblem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [lcFilled, setLcFilled] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced LC search
  const searchLC = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const res = await searchLeetCode(q)
    if (res.success && res.data) {
      setSuggestions(res.data)
      setShowSuggestions(res.data.length > 0)
      setHighlighted(-1)
    }
  }, [])

  function handleTitleChange(value: string) {
    setTitle(value)
    setLcFilled(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchLC(value), 300)
  }

  function selectSuggestion(lc: LeetCodeProblem) {
    setTitle(lc.title)
    setUrl(lc.url)
    setSource('LeetCode')
    setDifficulty((lc.difficulty ?? '') as Diff | '')
    const tags = JSON.parse(lc.tags || '[]') as string[]
    setTagsInput(tags.join(', '))
    setShowSuggestions(false)
    setLcFilled(true)
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, -1))
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[highlighted])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)

    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    const res = await addProblem({
      title: title.trim(),
      url: url.trim() || undefined,
      source: source.trim() || undefined,
      pattern_tags: tags,
      recognition_cue: cue.trim() || undefined,
      difficulty: (difficulty || undefined) as Diff | undefined,
    })

    setSubmitting(false)

    if (res.success) {
      setSuccess(true)
      setTimeout(() => {
        setTitle(''); setUrl(''); setSource('LeetCode')
        setDifficulty(''); setTagsInput(''); setCue('')
        setSuccess(false); setLcFilled(false)
      }, 1500)
    } else {
      setError(res.error ?? 'Failed to add problem')
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h1 className="page-title">Add Problem</h1>
        <p className="page-subtitle">Log a problem you solved outside today's auto-picks</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} id="add-problem-form">

          {/* Title + autocomplete */}
          <div className="form-group">
            <label className="form-label" htmlFor="problem-title-input">Problem Title</label>
            <div className="autocomplete-wrapper">
              <input
                ref={inputRef}
                id="problem-title-input"
                className="form-input"
                placeholder="Start typing a LeetCode problem title…"
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                autoComplete="off"
                required
              />
              {showSuggestions && (
                <div className="autocomplete-dropdown" id="lc-autocomplete-dropdown">
                  {suggestions.map((lc, i) => (
                    <div
                      key={lc.slug}
                      className={`autocomplete-item ${i === highlighted ? 'highlighted' : ''}`}
                      onMouseDown={() => selectSuggestion(lc)}
                      id={`ac-item-${lc.slug}`}
                    >
                      <span className="autocomplete-item-title">{lc.title}</span>
                      <div className="autocomplete-item-meta">
                        {lc.difficulty && <DifficultyTag d={lc.difficulty} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {lcFilled && (
              <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
                ✓ Auto-filled from LeetCode cache
              </p>
            )}
          </div>

          {/* URL */}
          <div className="form-group">
            <label className="form-label" htmlFor="problem-url-input">URL</label>
            <input
              id="problem-url-input"
              className="form-input"
              placeholder="https://leetcode.com/problems/…"
              value={url}
              onChange={e => setUrl(e.target.value)}
              type="url"
            />
          </div>

          {/* Source + Difficulty row */}
          <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="problem-source-input">Source</label>
              <input
                id="problem-source-input"
                className="form-input"
                placeholder="LeetCode"
                value={source}
                onChange={e => setSource(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="problem-difficulty-select">Difficulty</label>
              <select
                id="problem-difficulty-select"
                className="form-select"
                value={difficulty}
                onChange={e => setDifficulty(e.target.value as Diff | '')}
              >
                <option value="">— Select —</option>
                {DIFFICULTY_OPTIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pattern tags */}
          <div className="form-group">
            <label className="form-label" htmlFor="problem-tags-input">
              Pattern Tags
              <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 8, color: 'var(--text-muted)' }}>
                comma-separated
              </span>
            </label>
            <input
              id="problem-tags-input"
              className="form-input"
              placeholder="e.g. Dynamic Programming, Greedy, Sliding Window"
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
            />
            {tagsInput && (
              <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                {tagsInput.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                  <span key={tag} className="tag tag-pattern">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Recognition cue */}
          <div className="form-group">
            <label className="form-label" htmlFor="problem-cue-input">
              Recognition Cue
              <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 8, color: 'var(--text-muted)' }}>
                optional — what tipped you off to the approach?
              </span>
            </label>
            <textarea
              id="problem-cue-input"
              className="form-textarea"
              placeholder="e.g. 'Saw subarray sum → prefix sums + hash map for O(n)'"
              value={cue}
              onChange={e => setCue(e.target.value)}
              rows={3}
            />
          </div>

          {error && (
            <div style={{ padding: 'var(--space-3)', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', color: 'var(--red)', fontSize: 13, marginBottom: 'var(--space-4)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            id="add-problem-submit"
            className="btn btn-primary btn-lg w-full"
            disabled={submitting || !title.trim() || success}
          >
            {success ? '✓ Problem Added!' : submitting ? 'Saving…' : 'Add Problem'}
          </button>
        </form>
      </div>
    </div>
  )
}
