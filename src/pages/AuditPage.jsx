import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAuditLogs,
  getOperatorContext,
  getOperatorInfo,
  clearTokens,
  clearOperatorContext,
} from '../lib/didarApi'

const ACTION_TYPES = ['All', 'CHECK_IN', 'QR_BIND', 'QR_REASSIGN', 'OVERRIDE', 'REJECTED', 'FAILED_VALIDATION']

const ACTION_BADGE = {
  CHECK_IN: 'hp-badge-approved',
  QR_BIND: 'hp-badge-applied',
  QR_REASSIGN: 'hp-badge-pending',
  OVERRIDE: 'hp-badge-pending',
  REJECTED: 'ci-badge-danger',
  FAILED_VALIDATION: 'ci-badge-danger',
}

const PAGE_SIZE = 50

export default function AuditPage() {
  const navigate = useNavigate()
  const ctx = getOperatorContext()
  const opInfo = getOperatorInfo()

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const loadLogs = useCallback(async (pg = 1, append = false) => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAuditLogs({ eventId: ctx.event?.Id, pageNumber: pg, pageSize: PAGE_SIZE })
      setHasMore(data.length === PAGE_SIZE)
      setLogs(prev => append ? [...prev, ...data] : data)
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [ctx.event?.Id, navigate])

  useEffect(() => { void loadLogs(1, false) }, [loadLogs])

  function loadMore() {
    const next = page + 1
    setPage(next)
    void loadLogs(next, true)
  }

  function logout() { clearTokens(); clearOperatorContext(); navigate('/login', { replace: true }) }

  const filtered = filterType === 'All'
    ? logs
    : logs.filter(l => (l.ActionType || l.actionType || '') === filterType)

  return (
    <div className="hp-layout">

      {/* ── Header ── */}
      <header className="hp-header">
        <div className="hp-header-brand">
          <div className="hp-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <div className="hp-header-title">Audit &amp; Log Viewer</div>
            <div className="hp-header-sub">{ctx.event?.Name || 'All Events'}</div>
          </div>
        </div>
        <div className="hp-header-actions">
          <button type="button" className="ci-nav-btn" onClick={() => navigate('/checkin')}>Check In Status</button>
          <button type="button" className="ci-nav-btn" onClick={() => navigate('/dashboard')}>Dashboard</button>
          <button type="button" className="hp-logout" onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </header>

      <div className="db-container">

        {/* ── Filter toolbar ── */}
        <div className="db-toolbar">
          <div className="ci-filter-row">
            {ACTION_TYPES.map(t => (
              <button
                key={t}
                type="button"
                className={`ci-filter-btn ${filterType === t ? 'ci-filter-btn-active' : ''}`}
                onClick={() => setFilterType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ci-nav-btn hp-toolbar-refresh"
            onClick={() => void loadLogs(1, false)}
          >
            Refresh
          </button>
        </div>

        {loading && <div className="loading-overlay"><div className="spinner" /><span className="loading-text">Loading audit logs…</span></div>}
        {error && <div className="hp-msg hp-msg-err">{error}</div>}

        {!loading && (
          <>
            <div className="hp-table-wrap">
              <table className="hp-tbl">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Operator</th>
                    <th>Member</th>
                    <th>Family ID</th>
                    <th>Gate</th>
                    <th>Details</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                        No audit records found
                      </td>
                    </tr>
                  ) : filtered.map((log, i) => {
                    const actionType = log.ActionType || log.actionType || ''
                    const result = log.Result || log.result || ''
                    return (
                      <tr key={i}>
                        <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {log.Timestamp || log.timestamp
                            ? new Date(log.Timestamp || log.timestamp).toLocaleString()
                            : '—'}
                        </td>
                        <td>
                          <span className={`hp-badge ${ACTION_BADGE[actionType] || 'hp-badge-not'}`}>
                            {actionType || '—'}
                          </span>
                        </td>
                        <td>{log.OperatorId || log.operatorId || '—'}</td>
                        <td className="hp-tbl-name">{log.MemberName || log.memberName || '—'}</td>
                        <td className="mono">{log.FamilyId || log.familyId || '—'}</td>
                        <td>{log.Gate || log.gate || '—'}</td>
                        <td style={{ maxWidth: 240, fontSize: 12, color: '#6b7280' }}>
                          {log.Details || log.details || '—'}
                        </td>
                        <td>
                          <span className={`hp-badge ${result === 'SUCCESS' ? 'hp-badge-approved' : result ? 'ci-badge-danger' : 'hp-badge-not'}`}>
                            {result || '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button type="button" className="ci-nav-btn" onClick={loadMore}>
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
