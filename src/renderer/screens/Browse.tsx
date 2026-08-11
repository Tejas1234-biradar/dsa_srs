import { useEffect, useState, useCallback } from 'react'
import type { Problem } from '@shared/types'
import { listProblems, searchProblems } from '../ipc'

type DiffFilter = 'All' | 'Easy' | 'Medium' | 'Hard'

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function parseTags(s: string): string[] {
  try { return JSON.parse(s) } catch { return [] }
}

export default function Browse() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('All')
  const [leechOnly, setLeechOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let res
    if (searchQuery.trim().length > 0) {
      res = await searchProblems(searchQuery.trim())
    } else {
      res = await listProblems({
        is_leech: leechOnly ? true : undefined,
        limit: 300,
      })
    }
    if (res.success && res.data) {
      let data = res.data
      if (diffFilter !== 'All') {
        data = data.filter(p => p.difficulty === diffFilter)
      }
      if (leechOnly && searchQuery) {
        data = data.filter(p => p.is_leech)
      }
      setProblems(data)
    }
    setLoading(false)
  }, [searchQuery, diffFilter, leechOnly])

  useEffect(() => {
    const timer = setTimeout(load, 200)
    return () => clearTimeout(timer)
  }, [load])

  const diffs: DiffFilter[] = ['All', 'Easy', 'Medium', 'Hard']

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Browse</h1>
        <p className="page-subtitle">{problems.length} problem{problems.length !== 1 ? 's' : ''} logged</p>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          id="browse-search-input"
          className="form-input"
          style={{ maxWidth: 280, marginBottom: 0 }}
          placeholder="Search by title or tag…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {diffs.map(d => (
          <button
            key={d}
            id={`filter-diff-${d}`}
            className={`filter-chip ${diffFilter === d ? 'active' : ''}`}
            onClick={() => setDiffFilter(d)}
          >
            {d}
          </button>
        ))}
        <button
          id="filter-leech"
          className={`filter-chip ${leechOnly ? 'active' : ''}`}
          onClick={() => setLeechOnly(v => !v)}
          style={leechOnly ? { borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-dim)' } : {}}
        >
          🐛 Leeches only
        </button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : problems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No problems found</div>
          <div className="empty-state-desc">
            {searchQuery ? `No results for "${searchQuery}"` : 'Add some problems to get started.'}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Tags</th>
                <th>Difficulty</th>
                <th>Added</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p, i) => {
                const tags = parseTags(p.pattern_tags)
                return (
                  <tr key={p.id} id={`browse-row-${p.id}`}>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                    <td>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
                      ) : (
                        <span style={{ color: 'var(--text-primary)' }}>{p.title}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                        {tags.slice(0, 2).map(tag => (
                          <span key={tag} className="tag tag-pattern">{tag}</span>
                        ))}
                        {tags.length > 2 && (
                          <span className="text-muted text-sm">+{tags.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {p.difficulty
                        ? <span className={`tag tag-${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
                        : <span className="text-muted">—</span>
                      }
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.created_at)}</td>
                    <td>
                      {p.is_leech
                        ? <span className="tag tag-leech">🐛 Leech</span>
                        : <span style={{ color: 'var(--green)', fontSize: 12 }}>● Active</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
