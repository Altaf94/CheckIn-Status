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
  isAuthorizedForJK,
  getOperatorContext,
  getOperatorInfo,
  performCheckIn,
  fetchCheckIns,
  bindQRToMember,
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

// ── Inline QR Binding Modal ───────────────────────────────────────────
function QRBindModal({ member, onClose, onBound }) {
  const [qrInput, setQrInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleBind() {
    const q = qrInput.trim()
    if (!q) { setError('Enter a QR code number.'); return }
    if (!/^\d+$/.test(q)) { setError('QR code must be numeric.'); return }
    setLoading(true)
    setError('')
    try {
      await onBound(q)
      onClose()
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ci-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ci-modal">
        <div className="ci-modal-header">
          <h3>Bind QR Code</h3>
          <button type="button" className="ci-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="ci-modal-body">
          <div className="ci-modal-member">
            <div className="hp-info-label">Member</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{member.FullName}</div>
            <div className="mono" style={{ fontSize: 13, color: '#6b7280' }}>{member.IdNumber}</div>
          </div>
          {error && <div className="login-error" style={{ marginBottom: 0 }}>{error}</div>}
          <div className="login-field" style={{ marginTop: 12 }}>
            <label>QR Code Number</label>
            <input
              type="text"
              className="setup-input"
              placeholder="Scan or enter QR number"
              value={qrInput}
              autoFocus
              onChange={e => { setQrInput(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') void handleBind() }}
            />
          </div>
        </div>
        <div className="ci-modal-footer">
          <button type="button" className="ci-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="login-btn"
            style={{ width: 'auto', padding: '9px 24px', marginTop: 0 }}
            disabled={loading || !qrInput.trim()}
            onClick={() => void handleBind()}
          >
            {loading ? <><span className="login-btn-spinner" /> Binding…</> : 'Bind QR'}
          </button>
        </div>
      </div>
    </div>
  )
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
  const [checkIns, setCheckIns] = useState([])

  // Action state
  const [checkingInId, setCheckingInId] = useState(null)
  const [bindingMember, setBindingMember] = useState(null)

  useEffect(() => {
    if (!ctx.event) navigate('/setup', { replace: true })
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
    setCheckIns([])
    clearMsg()

    try {
      const inputType = detectInputType(val)
      let fId = val

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
        fetchCheckIns({ familyId: fId, eventId: ctx.event?.Id }),
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
      setCheckIns(ciList.status === 'fulfilled' ? ciList.value : [])
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
    if (!ctx.event) return
    setCheckingInId(String(member.Id))
    try {
      const wbData = wristbandMap[String(member.Id)]
      await performCheckIn({
        familyId,
        familyMemberId: member.Id,
        eventId: ctx.event.Id,
        gate: ctx.gate,
        session: ctx.session,
        qrCode: wbData?.qrScannedValue || null,
        checkInType: detectInputType(input) === 'qr' ? 'QR' : 'CNIC',
      })
      showMsg(`${member.FullName} checked in successfully!`, 'success')
      // Refresh check-ins silently
      const updated = await fetchCheckIns({ familyId, eventId: ctx.event?.Id }).catch(() => checkIns)
      setCheckIns(updated)
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      showMsg(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setCheckingInId(null)
    }
  }

  // ── QR Binding ──────────────────────────────────────────────────────
  async function handleQRBound(qrCode) {
    await bindQRToMember({ familyId, familyMemberId: bindingMember.Id, qrCode })
    showMsg(`QR ${qrCode} bound to ${bindingMember.FullName}.`, 'success')
    // Refresh wristband data
    const wb = await fetchWristbandIssuances(familyId).catch(() => null)
    const wbLookup = {}
    if (wb?.members) {
      for (const m of wb.members) {
        wbLookup[String(m.familyMemberId)] = { wristbandChoice: m.wristbandChoice, qrScannedValue: m.qrScannedValue || '' }
      }
    }
    setWristbandMap(wbLookup)
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function getRegistration(memberId) {
    return registrations.find(r => String(r.FamilyMemberId ?? r.familyMemberId) === String(memberId))
  }
  function getCheckIn(memberId) {
    return checkIns.find(c => String(c.FamilyMemberId ?? c.familyMemberId) === String(memberId))
  }
  function isEligible(member) {
    if (!ctx.event) return false
    const reg = getRegistration(member.Id)
    return reg && String(reg.EventId ?? reg.eventId) === String(ctx.event.Id)
  }

  function logout() { clearTokens(); clearOperatorContext(); navigate('/login', { replace: true }) }
  function changeSetup() { clearOperatorContext(); navigate('/setup', { replace: true }) }

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
            <div className="hp-header-sub">
              {ctx.event?.Name || '—'}&nbsp;·&nbsp;{ctx.gate || '—'}&nbsp;·&nbsp;{ctx.session || '—'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="ci-nav-btn" onClick={() => navigate('/dashboard')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            Dashboard
          </button>
          {['admin', 'rc'].includes(operatorInfo.role?.toLowerCase()) && (
            <button type="button" className="ci-nav-btn" onClick={() => navigate('/audit')}>Audit Log</button>
          )}
          <button type="button" className="ci-nav-btn" onClick={changeSetup}>Change Setup</button>
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
        <label htmlFor="ci_input" className="hp-search-label">CNIC · QR Code Number · Form ID</label>
        <div className="hp-search-row">
          <input
            id="ci_input"
            type="text"
            className="hp-search-input"
            placeholder="e.g. 3474744884844 · 12345 · JK001-39366661"
            autoComplete="off"
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
          />
          <button
            type="button"
            className="hp-search-btn"
            onClick={() => void handleSearch()}
            disabled={loading}
          >
            {loading
              ? <><span className="login-btn-spinner" /> Scanning…</>
              : <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Check
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
          <div className="hp-info-grid">
            <div className="hp-info-cell"><span className="hp-info-label">Form ID</span><span className="hp-info-value mono">{formData.FormId}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Jamat Khana</span><span className="hp-info-value">{formData.JamatKhanaId}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Household CNIC</span><span className="hp-info-value mono">{formData.HouseHoldCNIC}</span></div>
            <div className="hp-info-cell">
              <span className="hp-info-label">Form Status</span>
              <span className="hp-info-value">
                {formData.FormStatus === 3 || formData.FormStatus === '3'
                  ? <span className="hp-badge hp-badge-approved">Approved</span>
                  : formData.FormStatus}
              </span>
            </div>
          </div>

          {/* Family members */}
          {formData.FamilyMembers?.length > 0 && (
            <>
              <div className="hp-section-header" style={{ marginTop: 28 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <h2>Family Members <span className="hp-count">{formData.FamilyMembers.length}</span></h2>
              </div>

              <div className="hp-table-wrap">
                <table className="hp-tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>CNIC</th>
                      <th>QR Code</th>
                      <th>Registered Event</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.FamilyMembers.map((m, idx) => {
                      const reg = getRegistration(m.Id)
                      const ci = getCheckIn(m.Id)
                      const wbData = wristbandMap[String(m.Id)]
                      const qrVal = wbData?.qrScannedValue || ''
                      const eligible = isEligible(m)
                      const alreadyIn = Boolean(ci)
                      const regEventName = reg
                        ? (events.find(e => String(e.Id) === String(reg.EventId ?? reg.eventId))?.Name || '—')
                        : '—'
                      const status = getMemberStatus(m, reg, ci, wbData, ctx.event)
                      const isCheckingIn = checkingInId === String(m.Id)

                      return (
                        <tr key={m.Id} className={alreadyIn ? 'ci-row-checkedin' : ''}>
                          <td className="hp-tbl-num">{idx + 1}</td>
                          <td className="hp-tbl-name">{m.FullName}</td>
                          <td><span className="mono">{m.IdNumber}</span></td>

                          {/* QR Code / Bind */}
                          <td>
                            {qrVal
                              ? <span className="mono hp-qr">{qrVal}</span>
                              : <button
                                  type="button"
                                  className="ci-bind-btn"
                                  onClick={() => setBindingMember(m)}
                                >
                                  + Bind QR
                                </button>
                            }
                          </td>

                          {/* Registered event */}
                          <td>
                            {regEventName !== '—'
                              ? <span className="hp-event-chip">{regEventName}</span>
                              : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                          </td>

                          {/* Status pill */}
                          <td>
                            <span className={`ci-status-pill ${status.cls}`}>{status.label}</span>
                          </td>

                          {/* Action */}
                          <td>
                            {alreadyIn ? (
                              <span className="ci-done-mark">
                                ✓ Done
                                {ci.Timestamp && (
                                  <span style={{ color: '#9ca3af', fontWeight: 400 }}>
                                    &nbsp;{new Date(ci.Timestamp).toLocaleTimeString()}
                                  </span>
                                )}
                              </span>
                            ) : eligible && qrVal ? (
                              <button
                                type="button"
                                className="ci-checkin-btn"
                                disabled={isCheckingIn}
                                onClick={() => void handleCheckIn(m)}
                              >
                                {isCheckingIn
                                  ? <><span className="login-btn-spinner" style={{ borderTopColor: '#0d9668', borderColor: '#c3e6d8' }} /> In…</>
                                  : 'Check In'}
                              </button>
                            ) : eligible && !qrVal ? (
                              <button
                                type="button"
                                className="ci-bind-btn"
                                onClick={() => setBindingMember(m)}
                              >
                                Bind QR First
                              </button>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                            )}
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

      {/* ── QR Binding Modal ── */}
      {bindingMember && (
        <QRBindModal
          member={bindingMember}
          onClose={() => setBindingMember(null)}
          onBound={handleQRBound}
        />
      )}
    </div>
  )
}
