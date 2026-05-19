import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchCheckIns,
  fetchEvents,
  fetchDashboardStats,
  getOperatorContext,
  getOperatorInfo,
  clearTokens,
  clearOperatorContext,
} from '../lib/didarApi'

function NavHeader({ opInfo, ctx, onLogout }) {
  const navigate = useNavigate()
  return (
    <header className="hp-header">
      <div className="hp-header-brand">
        <div className="hp-header-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
          </svg>
        </div>
        <div>
          <div className="hp-header-title">Live Dashboard</div>
          <div className="hp-header-sub">{ctx.event?.Name || 'All Events'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="ci-nav-btn" onClick={() => navigate('/checkin')}>Check-IN</button>
        {['admin', 'rc'].includes(opInfo.role?.toLowerCase()) && (
          <button type="button" className="ci-nav-btn" onClick={() => navigate('/audit')}>Audit Log</button>
        )}
        <button type="button" className="hp-logout" onClick={onLogout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Log out
        </button>
      </div>
    </header>
  )
}

function KpiCard({ value, label, variant }) {
  return (
    <div className={`db-kpi-card ${variant ? `db-kpi-${variant}` : ''}`}>
      <div className="db-kpi-value">{value ?? '—'}</div>
      <div className="db-kpi-label">{label}</div>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const ctx = getOperatorContext()
  const opInfo = getOperatorInfo()

  const [stats, setStats] = useState(null)
  const [checkIns, setCheckIns] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error, setError] = useState('')
  const [selectedGateFilter, setSelectedGateFilter] = useState('All')

  const loadData = useCallback(async () => {
    try {
      const [evList, ciList] = await Promise.allSettled([
        fetchEvents(),
        fetchCheckIns({ eventId: ctx.event?.Id, pageSize: 1000 }),
      ])

      const cis = ciList.status === 'fulfilled' ? ciList.value : []
      setCheckIns(cis)

      // Try dedicated stats endpoint first
      try {
        const s = await fetchDashboardStats(ctx.event?.Id)
        setStats(s)
      } catch {
        // Compute stats client-side from check-ins
        const gateMap = {}
        const opMap = {}
        for (const ci of cis) {
          const g = ci.Gate || ci.gate || 'Unknown'
          gateMap[g] = (gateMap[g] || 0) + 1
          const op = ci.OperatorId || ci.operatorId || 'Unknown'
          opMap[op] = (opMap[op] || 0) + 1
        }
        setStats({
          totalCheckIns: cis.length,
          gateBreakdown: gateMap,
          operatorBreakdown: opMap,
        })
      }

      setLastUpdate(new Date())
      setError('')
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [ctx.event?.Id, navigate])

  useEffect(() => {
    void loadData()
    const id = setInterval(() => void loadData(), 30_000)
    return () => clearInterval(id)
  }, [loadData])

  function logout() { clearTokens(); clearOperatorContext(); navigate('/login', { replace: true }) }

  const gateBreakdown = stats?.gateBreakdown || {}
  const opBreakdown = stats?.operatorBreakdown || {}
  const gateNames = Object.keys(gateBreakdown)

  const filteredCheckIns = selectedGateFilter === 'All'
    ? checkIns
    : checkIns.filter(c => (c.Gate || c.gate) === selectedGateFilter)

  const recentCheckIns = [...filteredCheckIns]
    .sort((a, b) => new Date(b.Timestamp || b.timestamp || 0) - new Date(a.Timestamp || a.timestamp || 0))
    .slice(0, 25)

  const maxGateCount = Math.max(...Object.values(gateBreakdown), 1)

  return (
    <div className="hp-layout">
      <NavHeader opInfo={opInfo} ctx={ctx} onLogout={logout} />

      <div className="db-container">
        {/* ── Toolbar ── */}
        <div className="db-toolbar">
          <div style={{ lineHeight: 1.2 }}>
            {lastUpdate && (
              <span className="db-update-time">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                Last updated {lastUpdate.toLocaleTimeString()} · Auto-refresh every 30s
              </span>
            )}
          </div>
          <button type="button" className="ci-nav-btn" onClick={() => void loadData()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>

        {loading && <div className="loading-overlay"><div className="spinner" /><span className="loading-text">Loading dashboard…</span></div>}
        {error && <div className="hp-msg hp-msg-err">{error}</div>}

        {/* ── KPI Cards ── */}
        <div className="db-kpi-grid">
          <KpiCard value={stats?.totalCheckIns ?? checkIns.length} label="Total Checked-In" variant="primary" />
          <KpiCard value={stats?.totalRegistrations} label="Total Registered" />
          <KpiCard value={stats?.allowedEntries} label="Allowed Entries" variant="success" />
          <KpiCard value={stats?.deniedEntries} label="Denied Entries" variant="danger" />
          <KpiCard value={stats?.missedAttendees} label="Not Yet Arrived" variant="warn" />
          <KpiCard value={stats?.duplicateAttempts} label="Duplicate Attempts" variant="danger" />
          <KpiCard value={stats?.qrBound} label="QR Assigned" />
          <KpiCard value={stats?.qrUnassigned} label="Unassigned QR Scans" variant="warn" />
        </div>

        {/* ── Two panel row ── */}
        <div className="db-panels-row">

          {/* Gate-wise Traffic */}
          <div className="db-panel">
            <div className="db-panel-header">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M3 9h6M3 15h6" />
              </svg>
              Gate-wise Traffic
            </div>
            <div className="db-panel-body">
              {gateNames.length === 0 ? (
                <div className="db-empty">No gate data yet</div>
              ) : (
                <div className="db-bar-list">
                  {Object.entries(gateBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([gate, count]) => (
                      <div key={gate} className="db-bar-item">
                        <div className="db-bar-label">{gate}</div>
                        <div className="db-bar-track">
                          <div className="db-bar-fill" style={{ width: `${(count / maxGateCount) * 100}%` }} />
                        </div>
                        <div className="db-bar-count">{count}</div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Operator Activity */}
          <div className="db-panel">
            <div className="db-panel-header">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
              Operator Activity
            </div>
            <div className="db-panel-body">
              {Object.keys(opBreakdown).length === 0 ? (
                <div className="db-empty">No operator data yet</div>
              ) : (
                <table className="db-mini-tbl">
                  <thead>
                    <tr><th>Operator</th><th>Check-Ins</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(opBreakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([op, count]) => (
                        <tr key={op}>
                          <td>{op}</td>
                          <td><span className="hp-count">{count}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* ── Recent Check-Ins ── */}
        <div className="db-panel" style={{ marginTop: 20 }}>
          <div className="db-panel-header">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Recent Check-Ins
            {/* Gate filter */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['All', ...gateNames].map(g => (
                <button
                  key={g}
                  type="button"
                  className={`ci-filter-btn ${selectedGateFilter === g ? 'ci-filter-btn-active' : ''}`}
                  onClick={() => setSelectedGateFilter(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="hp-table-wrap" style={{ borderRadius: '0 0 10px 10px', border: 'none' }}>
            {recentCheckIns.length === 0 ? (
              <div className="db-empty" style={{ padding: 32 }}>No check-ins recorded yet</div>
            ) : (
              <table className="hp-tbl">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Member</th>
                    <th>Family ID</th>
                    <th>Gate</th>
                    <th>Session</th>
                    <th>Operator</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCheckIns.map((ci, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {ci.Timestamp || ci.timestamp
                          ? new Date(ci.Timestamp || ci.timestamp).toLocaleTimeString()
                          : '—'}
                      </td>
                      <td className="hp-tbl-name">{ci.MemberName || ci.memberName || '—'}</td>
                      <td className="mono">{ci.FamilyId || ci.familyId || '—'}</td>
                      <td>{ci.Gate || ci.gate || '—'}</td>
                      <td>{ci.Session || ci.session || '—'}</td>
                      <td>{ci.OperatorId || ci.operatorId || '—'}</td>
                      <td>
                        <span className="hp-event-chip">{ci.CheckInType || ci.checkInType || 'Manual'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
