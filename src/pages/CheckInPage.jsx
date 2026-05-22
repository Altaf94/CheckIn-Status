import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearTokens,
  clearOperatorContext,
  fetchFormsByCnic,
  fetchFormById,
  fetchFormsByQR,
  fetchRegistrations,
  fetchWristbandIssuances,
  fetchEvents,
  resolveEventName,
  resolveEventId,
  isAuthorizedForJK,
  getOperatorContext,
  getOperatorInfo,
  performCheckIn,
} from '../lib/didarApi'

// ── Input type detection ──────────────────────────────────────────────
function detectInputType(val) {
  const v = val.trim()
  if (v.includes('-')) return 'formId'
  if (/^\d{13,20}$/.test(v)) return 'cnic'
  if (/^\d+$/.test(v) && v.length <= 8) return 'qr'
  return 'formId'
}

// ── Member status logic ───────────────────────────────────────────────
function getMemberStatus(member, registration, checkIn, wbData, currentEvent) {
  if (!registration) return { label: 'Not Registered', cls: 'ci-status-unregistered' }
  const eventMatches = currentEvent && String(registration.EventId ?? registration.eventId) === String(currentEvent.Id)
  const hasQR = Boolean(wbData?.qrScannedValue)
  if (checkIn) return { label: 'Checked-In', cls: 'ci-status-checkedin' }
  if (!eventMatches) return { label: 'Wrong Event', cls: 'ci-status-wrong' }
  if (!hasQR) return { label: 'QR Required', cls: 'ci-status-qr' }
  return { label: 'Pending Check-In', cls: 'ci-status-pending' }
}

// ── Main Check-In Page ────────────────────────────────────────────────
export default function CheckInPage() {
  const navigate = useNavigate()
  const ctx = getOperatorContext()
  const operatorInfo = getOperatorInfo()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: '' })

  // Data state
  const [formData, setFormData] = useState(null)
  const [familyId, setFamilyId] = useState('')
  const [registrations, setRegistrations] = useState([])
  const [wristbandMap, setWristbandMap] = useState({})
  const [events, setEvents] = useState([])
  const [checkedInIds, setCheckedInIds] = useState(() => new Set())
  const [lastSearchType, setLastSearchType] = useState('')

  // Action state
  const [checkingInId, setCheckingInId] = useState(null)

  useEffect(() => {
    // Do not force redirect to /setup here — allow check-in page to load even without operator context.
  }, [ctx.event, navigate])

  function showMsg(text, type = 'info') { setMsg({ text, type }) }
  function clearMsg() { setMsg({ text: '', type: '' }) }

  // ── Search ──────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const val = input.trim()
    if (!val) { showMsg('Enter a CNIC, QR code, or Form ID.', 'error'); return }

    setLoading(true)
    setFormData(null)
    setRegistrations([])
    setWristbandMap({})
    clearMsg()

    try {
      const inputType = detectInputType(val)
      let fId = val
      setLastSearchType(inputType)

      if (inputType === 'cnic') {
        showMsg('Looking up CNIC…', 'info')
        const forms = await fetchFormsByCnic(val)
        if (!forms.length) { showMsg('No household found for this CNIC.', 'error'); return }
        fId = forms[0].FormId || forms[0].formId || forms[0].FamilyId || forms[0].familyId || ''
        if (!fId) { showMsg('CNIC lookup returned no Form ID.', 'error'); return }

      } else if (inputType === 'qr') {
        showMsg('Looking up QR code…', 'info')
        try {
          const forms = await fetchFormsByQR(val)
          if (forms.length) {
            fId = forms[0].FormId || forms[0].formId || forms[0].FamilyId || forms[0].familyId || ''
          }
        } catch {
          // endpoint may not exist; fall through
        }
        if (!fId || fId === val) {
          showMsg('QR code not assigned to any household. Lookup a member by CNIC to bind this QR.', 'error')
          return
        }
      }

      showMsg('Loading household…', 'info')
      const form = await fetchFormById(fId)
      const jkId = form?.JamatKhanaId || ''
      if (!isAuthorizedForJK(jkId)) { showMsg('Not authorised to view this household.', 'error'); return }

      setFormData(form)
      setFamilyId(fId)

      showMsg('Loading attendance data…', 'info')
      const [regs, wb, evList, ciList] = await Promise.allSettled([
        fetchRegistrations(fId),
        fetchWristbandIssuances(fId),
        fetchEvents(),
      ])

      setRegistrations(regs.status === 'fulfilled' ? regs.value : [])

      const wbRaw = wb.status === 'fulfilled' ? wb.value : null
      const wbLookup = {}
      if (wbRaw?.members && Array.isArray(wbRaw.members)) {
        for (const m of wbRaw.members) {
          wbLookup[String(m.familyMemberId)] = {
            wristbandChoice: m.wristbandChoice,
            qrScannedValue: m.qrScannedValue || '',
          }
        }
      }
      setWristbandMap(wbLookup)
      setEvents(evList.status === 'fulfilled' ? evList.value : [])
      clearMsg()

    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      showMsg(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [input, navigate, ctx.event])

  // ── Check-In ────────────────────────────────────────────────────────
  async function handleCheckIn(member) {
    setCheckingInId(String(member.Id))
    try {
      const wbData = wristbandMap[String(member.Id)]
      const registerEventId = resolveEventId(wbData?.qrScannedValue, events) || ctx.event?.Id
      if (!registerEventId) {
        showMsg('Register event not found for this QR.', 'error')
        return
      }
      await performCheckIn({
        familyId,
        familyMemberId: member.Id,
        eventId: registerEventId,
        qrScannedValue: wbData?.qrScannedValue || '',
      })
      showMsg(`${member.FullName} checked in successfully!`, 'success')
      setCheckedInIds(prev => {
        const next = new Set(prev)
        next.add(String(member.Id))
        return next
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      showMsg(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setCheckingInId(null)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function getRegistration(memberId) {
    return registrations.find(r => String(r.FamilyMemberId ?? r.familyMemberId) === String(memberId))
  }

  function logout() { clearTokens(); clearOperatorContext(); navigate('/login', { replace: true }) }
  function changeSetup() { clearOperatorContext(); navigate('/setup', { replace: true }) }

  const searchedValue = input.trim()
  const searchedType = lastSearchType || detectInputType(searchedValue)
  const visibleMembers = (() => {
    const members = formData?.FamilyMembers || []
    if (!searchedValue) return members
    if (searchedType === 'cnic') return members.filter(m => String(m.IdNumber) === searchedValue)
    if (searchedType === 'qr') {
      return members.filter(m => String(wristbandMap[String(m.Id)]?.qrScannedValue || '') === searchedValue)
    }
    return members
  })()

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="hp-layout">

      {/* ── Header ── */}
      <header className="hp-header">
        <div className="hp-header-brand">
          <div className="hp-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3m0 4h4v-4m-4 0h4" />
            </svg>
          </div>
          <div>
            <div className="hp-header-title">GBC Check-IN</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['admin', 'rc'].includes(operatorInfo.role?.toLowerCase()) && (
            <button type="button" className="ci-nav-btn" onClick={() => navigate('/audit')}>Audit Log</button>
          )}
          <button type="button" className="hp-logout" onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </header>

      {/* ── Search ── */}
      <div className="hp-search-card">
        <label htmlFor="ci_input" className="hp-search-label">CNIC</label>
        <div className="hp-search-row hp-search-pill">
          <input
            id="ci_input"
            type="text"
            className="hp-search-input hp-search-main"
            placeholder="CNIC"
            autoComplete="off"
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
          />
          <button
            type="button"
            className="hp-search-btn hp-search-btn-green"
            onClick={() => void handleSearch()}
            disabled={loading}
          >
            {loading
              ? <><span className="login-btn-spinner" /> Scanning…</>
              : <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Search
              </>}
          </button>
        </div>
      </div>

      {/* ── Status messages ── */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <span className="loading-text">{msg.text || 'Processing…'}</span>
        </div>
      )}
      {!loading && msg.text && (
        <div className={`hp-msg ${msg.type === 'error' ? 'hp-msg-err' : msg.type === 'success' ? 'hp-msg-success' : 'hp-msg-ok'}`}>
          {msg.text}
        </div>
      )}

      {/* ── Results ── */}
      {formData && (
        <div className="hp-results">

          {/* Household info */}
          <div className="hp-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <h2>Household Info</h2>
          </div>
          <div className="hp-info-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <div className="hp-info-cell"><span className="hp-info-label">Form ID</span><span className="hp-info-value mono">{formData.FormId}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Jamat Khana</span><span className="hp-info-value">{formData.JamatKhanaId}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Household CNIC</span><span className="hp-info-value mono">{formData.HouseHoldCNIC}</span></div>
            <div className="hp-info-cell">
              <span className="hp-info-label">Registration Status</span>
              <span className="hp-info-value">
                {formData.FormStatus === 3 || formData.FormStatus === '3'
                  ? <span className="hp-badge hp-badge-approved">Approved</span>
                  : <span className="hp-badge hp-badge-pending">{formData.FormStatus}</span>}
              </span>
            </div>

            <div className="hp-info-cell"><span className="hp-info-label">Created</span><span className="hp-info-value mono">{formData.CreatedAt ? new Date(formData.CreatedAt).toLocaleString() : '—'}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Updated</span><span className="hp-info-value mono">{formData.UpdatedAt ? new Date(formData.UpdatedAt).toLocaleString() : '—'}</span></div>
            <div className="hp-info-cell" style={{ gridColumn: 'span 2' }} />
          </div>

          {/* Family members */}
          {visibleMembers.length > 0 && (
            <>
              <div className="hp-section-header" style={{ marginTop: 28 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <h2>Family Members <span className="hp-count">{visibleMembers.length}</span></h2>
              </div>

              <div className="hp-table-wrap">
                <table className="hp-tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Name</th>
                      <th>CNIC</th>
                      <th>Intent Event</th>
                      <th>Register Event</th>
                      <th>Wristband</th>
                      <th>QR</th>
                      <th style={{ width: 220 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMembers.map((m, idx) => {
                      const reg = getRegistration(m.Id)
                      const wbData = wristbandMap[String(m.Id)]
                      const qrVal = wbData?.qrScannedValue || ''
                      const wristLabel = wbData?.wristbandChoice ? 'Assigned' : ''
                      const alreadyIn = checkedInIds.has(String(m.Id))
                      const regEventName = reg
                        ? (events.find(e => String(e.Id) === String(reg.EventId ?? reg.eventId))?.Name || '—')
                        : '—'
                      const registerEventName = resolveEventName(qrVal, events)
                      const isCheckingIn = checkingInId === String(m.Id)

                      return (
                        <tr key={m.Id} className={alreadyIn ? 'ci-row-checkedin' : ''}>
                          <td className="hp-tbl-num">{idx + 1}</td>
                          <td className="hp-tbl-name">
                            <div>{m.FullName}</div>
                            <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{m.Relationship || ''}</div>
                          </td>
                          <td><span className="mono">{m.IdNumber}</span></td>
                          <td>{regEventName !== '—' ? <span className="hp-event-chip">{regEventName}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                          <td>{registerEventName !== '—' ? <span className="hp-event-chip">{registerEventName}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                          <td>{wristLabel ? <span style={{ color: '#10b981', fontWeight: 700 }}>{wristLabel}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                          <td>{qrVal ? <span className="mono" style={{ color: '#10b981', fontWeight: 700 }}>{qrVal}</span> : <span style={{ color: '#f3f4f6' }}>—</span>}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              {alreadyIn ? (
                                <span className="ci-done-mark">Checked In</span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="ci-bind-btn"
                                    disabled={isCheckingIn}
                                    onClick={() => void handleCheckIn(m)}
                                  >
                                    {isCheckingIn ? 'In…' : 'Check In'}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  )
}
