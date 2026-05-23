import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearTokens,
  clearOperatorContext,
  fetchFormsByCnic,
  fetchFormById,
  fetchFormsByQR,
  fetchWristbandIssuances,
  fetchEvents,
  fetchJamatKhanas,
  resolveEventName,
  resolveJamatKhanaName,
  isAuthorizedForJK,
  getOperatorContext,
  getOperatorInfo,
  findAttendance,
} from '../lib/didarApi'

// ── Input type detection ──────────────────────────────────────────────
function detectInputType(val) {
  const v = val.trim()
  if (v.includes('-')) return 'formId'
  if (/^\d{13,20}$/.test(v)) return 'cnic'
  if (/^\d+$/.test(v) && v.length <= 8) return 'qr'
  return 'formId'
}

const RELATIONSHIP_TO_HEAD = {
  1: 'Self - Household Head',
  2: 'Spouse',
  3: 'Child',
  4: 'Parent',
  5: 'Grand Parent',
  6: 'Sibling',
  7: 'Cousin',
  8: 'Uncle / Aunt',
  9: 'Nephew / Niece',
  10: 'In Laws',
  11: 'Grand Child',
}

function relationshipToHeadName(id) {
  return RELATIONSHIP_TO_HEAD[id] || '—'
}

function getCheckInAtFromRecord(record) {
  if (!record || typeof record !== 'object') return null
  return record.createdAt ?? record.CreatedAt ?? record.checkInAt ?? record.CheckInAt ?? null
}

/** API createdAt is Pakistan local time — show as-is in 12-hour format with AM/PM. */
function formatCheckInAt(value) {
  if (!value) return '—'
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return '—'

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour24 = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6])
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n) => String(n).padStart(2, '0')
  const hour12 = hour24 % 12 || 12
  const ampm = hour24 >= 12 ? 'PM' : 'AM'

  return `${monthNames[month - 1]} ${day}, ${year}, ${hour12}:${pad(minute)}:${pad(second)} ${ampm}`
}

function FamilyMembersTable({
  members,
  wristbandMap,
  events,
  checkInByMember,
  attendanceReady = true,
}) {
  return (
    <div className="hp-table-wrap">
      <table className="hp-tbl">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Name</th>
            <th>CNIC</th>
            <th>Mobile</th>
            <th>DOB</th>
            <th>Gender</th>
            <th>Ismaili</th>
            <th>Register Event</th>
            <th>Wristband</th>
            <th>QR</th>
            <th style={{ width: 140 }}>Actions</th>
            <th style={{ minWidth: 150 }}>Check in at</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m, idx) => {
            const wbData = wristbandMap[String(m.Id)]
            const qrVal = wbData?.qrScannedValue || ''
            const wristLabel = qrVal && wbData?.wristbandChoice ? 'Applied' : 'Not Applied'
            const memberKey = String(m.Id)
            const alreadyIn = Object.hasOwn(checkInByMember, memberKey)
            const checkInAt = checkInByMember[memberKey]
            const registerEventName = resolveEventName(qrVal, events)
            const relationshipToHead = relationshipToHeadName(m.RelationshipToHeadId)
            const mobileNumber = m.MobileNumber ?? '—'
            const dob = m.MonthYearOfBirth ?? '—'
            const gender = m.Gender ?? m.Sex ?? (m.GenderId === 1 ? 'Male' : m.GenderId === 2 ? 'Female' : m.GenderId === 3 ? 'Other' : '—')
            const ismaili = m.CommunityAffiliation === true ? 'Yes' : m.CommunityAffiliation === false ? 'No' : '—'

            return (
              <tr key={m.Id} className={alreadyIn ? 'ci-row-checkedin' : ''}>
                <td className="hp-tbl-num">{idx + 1}</td>
                <td className="hp-tbl-name">
                  <div>{m.FullName}</div>
                  <div>
                    <span className="hp-badge hp-badge-not" style={{ marginTop: 4, display: 'inline-block' }}>{relationshipToHead}</span>
                  </div>
                </td>
                <td><span className="mono">{m.IdNumber}</span></td>
                <td>{mobileNumber}</td>
                <td className="hp-tbl-dob">{dob}</td>
                <td>{gender}</td>
                <td>{ismaili}</td>
                <td>{registerEventName !== '—' ? <span className="hp-event-chip">{registerEventName}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                <td>{wristLabel === 'Applied' ? <span style={{ color: '#10b981', fontWeight: 700 }}>{wristLabel}</span> : <span style={{ color: '#9ca3af' }}>{wristLabel}</span>}</td>
                <td>{qrVal ? <span className="mono" style={{ color: '#10b981', fontWeight: 700 }}>{qrVal}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                <td>
                  {!attendanceReady ? (
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>…</span>
                  ) : alreadyIn ? (
                    <span className="ci-done-mark">Checked In</span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>Not Checked In</span>
                  )}
                </td>
                <td className="hp-tbl-dob">
                  {!attendanceReady ? (
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>…</span>
                  ) : alreadyIn ? (
                    <span className="mono">{formatCheckInAt(checkInAt)}</span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main Check-In Page ────────────────────────────────────────────────
export default function CheckInPage() {
  const navigate = useNavigate()
  const ctx = getOperatorContext()
  const operatorInfo = getOperatorInfo()

  const [cnicInput, setCnicInput] = useState('')
  const [qrInput, setQrInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: '' })

  // Data state
  const [formData, setFormData] = useState(null)
  const [wristbandMap, setWristbandMap] = useState({})
  const [events, setEvents] = useState([])
  const [jamatKhanas, setJamatKhanas] = useState([])
  const [checkInByMember, setCheckInByMember] = useState({})
  const [attendanceReady, setAttendanceReady] = useState(false)
  const [lastSearchType, setLastSearchType] = useState('')
  const [lastSearchValue, setLastSearchValue] = useState('')

  useEffect(() => {
    // Do not force redirect to /setup here — allow check-in page to load even without operator context.
  }, [ctx.event, navigate])

  function showMsg(text, type = 'info') { setMsg({ text, type }) }
  function clearMsg() { setMsg({ text: '', type: '' }) }

  // ── Search ──────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const cnic = cnicInput.trim()
    const qr = qrInput.trim()
    if (!cnic && !qr) { showMsg('Enter CNIC, Form ID, or Wristband code.', 'error'); return }

    const val = cnic || qr
    const inputType = cnic ? (cnic.includes('-') ? 'formId' : 'cnic') : 'qr'

    setLoading(true)
    setFormData(null)
    setWristbandMap({})
    setCheckInByMember({})
    setAttendanceReady(false)
    clearMsg()

    try {
      let fId = val
      setLastSearchType(inputType)
      setLastSearchValue(val)

      if (inputType === 'formId') {
        showMsg('Loading household…', 'info')
      } else if (inputType === 'cnic') {
        showMsg('Looking up CNIC…', 'info')
        const forms = await fetchFormsByCnic(val)
        if (!forms.length) { showMsg('No household found for this CNIC.', 'error'); return }
        fId = forms[0].FormId || forms[0].formId || forms[0].FamilyId || forms[0].familyId || ''
        if (!fId) { showMsg('CNIC lookup returned no Form ID.', 'error'); return }

      } else if (inputType === 'qr') {
        showMsg('Looking up wristband code…', 'info')
        const forms = await fetchFormsByQR(val)
        if (!forms.length) { showMsg('No household found for this wristband code.', 'error'); return }
        fId = forms[0].FormId || forms[0].formId || forms[0].FamilyId || forms[0].familyId || ''
        if (!fId) { showMsg('Wristband lookup returned no Form ID.', 'error'); return }
      }

      showMsg('Loading household…', 'info')
      const form = await fetchFormById(fId)
      const jkId = form?.JamatKhanaId || ''
      if (!isAuthorizedForJK(jkId)) { showMsg('Not authorised to view this household.', 'error'); return }

      setFormData(form)

      showMsg('Loading attendance data…', 'info')
      const [wb, evList, jkList] = await Promise.allSettled([
        fetchWristbandIssuances(fId),
        fetchEvents(),
        fetchJamatKhanas(),
      ])

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
      setJamatKhanas(jkList.status === 'fulfilled' ? jkList.value : [])

      const members = form?.FamilyMembers || []
      if (members.length) {
        const attendanceResults = await Promise.allSettled(
          members.map((m) => findAttendance({ familyId: fId, familyMemberId: m.Id })),
        )
        const byMember = {}
        attendanceResults.forEach((result, i) => {
          if (result.status === 'fulfilled' && result.value.checkedIn) {
            const memberKey = String(members[i].Id)
            byMember[memberKey] = getCheckInAtFromRecord(result.value.record)
          }
        })
        setCheckInByMember(byMember)
      }

      clearMsg()

    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') { navigate('/login', { replace: true }); return }
      showMsg(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setAttendanceReady(true)
      setLoading(false)
    }
  }, [cnicInput, qrInput, navigate, ctx.event])

  function logout() { clearTokens(); clearOperatorContext(); navigate('/login', { replace: true }) }
  function changeSetup() { clearOperatorContext(); navigate('/setup', { replace: true }) }

  const searchedValue = lastSearchValue.trim()
  const searchedType = lastSearchType || detectInputType(searchedValue)
  const allMembers = formData?.FamilyMembers || []
  const visibleMembers = (() => {
    if (!searchedValue) return []
    if (searchedType === 'cnic') return allMembers.filter(m => String(m.IdNumber) === searchedValue)
    if (searchedType === 'qr') {
      return allMembers.filter(m => String(wristbandMap[String(m.Id)]?.qrScannedValue || '') === searchedValue)
    }
    return allMembers
  })()
  const wristbandIssuedCount = Object.values(wristbandMap).filter((m) => Boolean(m?.qrScannedValue)).length

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
            <div className="hp-header-title">GBC Check In Status</div>
          </div>
        </div>
        <div className="hp-header-actions">
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
        <div className="hp-search-row hp-search-pill">
          <input
            id="ci_cnic"
            type="text"
            className="hp-search-input hp-search-main"
            placeholder="CNIC or Form id"
            autoComplete="off"
            autoFocus
            maxLength={30}
            value={cnicInput}
            onChange={e => {
              const raw = e.target.value
              const next = raw.includes('-')
                ? raw.replace(/[^\dA-Za-z-]/g, '').slice(0, 30)
                : raw.replace(/\D/g, '').slice(0, 13)
              setCnicInput(next)
              if (next) setQrInput('')
            }}
            onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
          />
          <div className="hp-search-wrist-wrap">
            <span className="hp-search-wrist-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
            </span>
            <input
              id="ci_qr"
              type="text"
              inputMode="numeric"
              className="hp-search-input hp-search-wrist"
              placeholder="QR code"
              autoComplete="off"
              maxLength={8}
              value={qrInput}
              onChange={e => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 8)
                setQrInput(next)
                if (next) setCnicInput('')
              }}
              onKeyDown={e => { if (e.key === 'Enter') void handleSearch() }}
            />
          </div>
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
          <div className="hp-info-grid hp-info-grid-4">
            <div className="hp-info-cell"><span className="hp-info-label">Form ID</span><span className="hp-info-value mono">{formData.FormId}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Jamat Khana</span><span className="hp-info-value">{formData.JamatKhanaId ? `${formData.JamatKhanaId} - ${resolveJamatKhanaName(formData.JamatKhanaId, jamatKhanas)}` : resolveJamatKhanaName(formData.JamatKhanaId, jamatKhanas)}</span></div>
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
            <div className="hp-info-cell hp-info-cell-span-2" />
          </div>

          {/* Matched member(s) — CNIC / QR search */}
          {visibleMembers.length > 0 && (
            <>
              <div className="hp-section-header hp-section-header-spaced">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <h2 className="hp-section-title-wrap">
                  Family Members <span className="hp-count">{visibleMembers.length}</span>
                  <span className="hp-badge hp-badge-applied">Wristband Issued: {wristbandIssuedCount}</span>
                </h2>
              </div>
              <FamilyMembersTable
                members={visibleMembers}
                wristbandMap={wristbandMap}
                events={events}
                checkInByMember={checkInByMember}
                attendanceReady={attendanceReady}
              />
            </>
          )}
        </div>
      )}

    </div>
  )
}
