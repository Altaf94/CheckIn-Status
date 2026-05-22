import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearTokens,
  fetchRegistrations,
  fetchFormsByCnic,
  fetchFormById,
  fetchWristbandIssuances,
  fetchEvents,
  fetchJamatKhanas,
  resolveEventName,
  resolveJamatKhanaName,
  isAuthorizedForJK,
  // approveMember,
} from '../lib/didarApi'

export default function HouseholdPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [resolvedFamilyId, setResolvedFamilyId] = useState('')
  const [formData, setFormData] = useState(null)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [rows, setRows] = useState(null)
  const [wristbandMap, setWristbandMap] = useState({})
  const [events, setEvents] = useState([])
  const [jamatKhanas, setJamatKhanas] = useState([])
  const [loading, setLoading] = useState(false)
  // const [approvingKey, setApprovingKey] = useState(null)

  const setOk = (text) => {
    setMessage(text)
    setMessageIsError(false)
  }
  const setErr = (text) => {
    setMessage(text)
    setMessageIsError(true)
  }

  const isCnic = (val) => !val.includes('-')

  const handleSearch = useCallback(async () => {
    const input = searchInput.trim()
    if (!input) {
      setErr('Enter a Form ID or CNIC.')
      return
    }

    setLoading(true)
    setRows(null)
    setWristbandMap({})
    setResolvedFamilyId('')
    setFormData(null)

    try {
      let familyId = input
      let form = null
      let searchedCnic = null

      if (isCnic(input)) {
        searchedCnic = input
        setOk('Looking up CNIC…')
        const forms = await fetchFormsByCnic(input)
        if (!forms.length) {
          setErr('No household found for this CNIC.')
          return
        }
        familyId = forms[0].FormId || forms[0].formId || forms[0].FamilyId || forms[0].familyId || ''
        if (!familyId) {
          setErr('CNIC lookup did not return a Form ID.')
          return
        }
      }

      setOk('Loading household form…')
      form = await fetchFormById(familyId)

      const jkId = form?.JamatKhanaId || ''
      if (!isAuthorizedForJK(jkId)) {
        setErr('Not authorized to view this household.')
        return
      }

      if (searchedCnic && form.FamilyMembers) {
        form = { ...form, FamilyMembers: form.FamilyMembers.filter((m) => m.IdNumber === searchedCnic) }
      }

      setFormData(form)

      setResolvedFamilyId(familyId)

      setOk('Loading registrations…')
      const list = await fetchRegistrations(familyId)

      setOk('Loading wristband data…')
      const wb = await fetchWristbandIssuances(familyId)
      const wbLookup = {}
      if (wb?.members && Array.isArray(wb.members)) {
        for (const m of wb.members) {
          wbLookup[String(m.familyMemberId)] = {
            wristbandChoice: m.wristbandChoice,
            qrScannedValue: m.qrScannedValue || '',
          }
        }
      }
      setWristbandMap(wbLookup)

      setOk('Loading events…')
      const evList = await fetchEvents()
      setEvents(evList)

      setOk('Loading Jamat Khana list…')
      const jkList = await fetchJamatKhanas()
      setJamatKhanas(jkList)

      setRows(list)
      setMessage('')
    } catch (e) {
      if (e instanceof Error && e.message === 'SESSION_EXPIRED') {
        navigate('/login', { replace: true })
        return
      }
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [searchInput, navigate])

  function logout() {
    clearTokens()
    navigate('/login', { replace: true })
  }

  // async function handleApprove(famId, memberId) {
  //   if (!famId || memberId == null || memberId === '') {
  //     setErr('Missing FamilyId or FamilyMemberId for this row.')
  //     return
  //   }
  //
  //   const key = `${memberId}`
  //   setApprovingKey(key)
  //   setOk('Approving…')
  //   try {
  //     await approveMember(famId, memberId)
  //     setOk('Approved. Refreshing…')
  //     await handleSearch()
  //   } catch (e) {
  //     if (e instanceof Error && e.message === 'SESSION_EXPIRED') {
  //       navigate('/login', { replace: true })
  //       return
  //     }
  //     setErr(e instanceof Error ? e.message : String(e))
  //   } finally {
  //     setApprovingKey(null)
  //   }
  // }

  function onKeyDown(e) {
    if (e.key === 'Enter') handleSearch()
  }

  const wristbandIssuedCount = Object.values(wristbandMap).filter((m) => Boolean(m?.qrScannedValue)).length

  const relationshipToHeadName = (id) => {
    const map = {
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
    return map[id] || '—'
  }

  return (
    <div className="hp-layout">

      {/* ── Top bar ── */}
      <header className="hp-header">
        <div className="hp-header-brand">
          <div className="hp-header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3m0 4h4v-4m-4 0h4"/>
            </svg>
          </div>
          <div>
            <div className="hp-header-title">GBC Check In</div>
            <div className="hp-header-sub">Family Verification Portal</div>
                                    <div className="login-brand-sub">For Regional council only</div>

          </div>
        </div>
        <button type="button" className="hp-logout" onClick={logout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Log out
        </button>
      </header>

      {/* ── Search card ── */}
      <div className="hp-search-card">
        <label htmlFor="search_input" className="hp-search-label">Form ID or CNIC</label>
        <div className="hp-search-row">
          <input
            id="search_input"
            type="text"
            className="hp-search-input"
            placeholder="e.g. JK001-39366661 or 3474744884844"
            autoComplete="off"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="hp-search-btn" onClick={() => void handleSearch()} disabled={loading}>
            {loading ? (
              <><span className="login-btn-spinner" /> Searching…</>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Search
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Status messages ── */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <span className="loading-text">{message || 'Loading…'}</span>
        </div>
      )}
      {!loading && message ? (
        <div className={messageIsError ? 'hp-msg hp-msg-err' : 'hp-msg hp-msg-ok'}>{message}</div>
      ) : null}
      {resolvedFamilyId && resolvedFamilyId !== searchInput.trim() ? (
        <div className="hp-msg hp-msg-ok">
           Form ID: <strong>{resolvedFamilyId}</strong>
        </div>
      ) : null}

      {formData ? (
        <div className="hp-results">

          {/* ── Household info grid ── */}
          <div className="hp-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <h2>Household Info</h2>
          </div>
          <div className="hp-info-grid">
            <div className="hp-info-cell"><span className="hp-info-label">Form ID</span><span className="hp-info-value mono">{formData.FormId}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Jamat Khana</span><span className="hp-info-value">{formData.JamatKhanaId ? `${formData.JamatKhanaId} - ${resolveJamatKhanaName(formData.JamatKhanaId, jamatKhanas)}` : resolveJamatKhanaName(formData.JamatKhanaId, jamatKhanas)}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Household CNIC</span><span className="hp-info-value mono">{formData.HouseHoldCNIC}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Registration Form Status</span><span className="hp-info-value">{formData.FormStatus === 3 || formData.FormStatus === '3' ? <span className="hp-badge hp-badge-approved">Approved</span> : formData.FormStatus}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Created</span><span className="hp-info-value">{formData.CreatedAt ? new Date(formData.CreatedAt).toLocaleString() : '—'}</span></div>
            <div className="hp-info-cell"><span className="hp-info-label">Updated</span><span className="hp-info-value">{formData.UpdatedAt ? new Date(formData.UpdatedAt).toLocaleString() : '—'}</span></div>
          </div>

          {/* ── Family members table ── */}
          {formData.FamilyMembers?.length > 0 ? (
            <>
              <div className="hp-section-header" style={{marginTop: '28px'}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <h2>
                  Family Members <span className="hp-count">{formData.FamilyMembers.length}</span>
                  <span className="hp-badge hp-badge-not" style={{ marginLeft: 10 }}>Family Member: {formData.FamilyMembers.length}</span>
                  <span className="hp-badge hp-badge-applied" style={{ marginLeft: 10 }}>Wristband Issued: {wristbandIssuedCount}</span>
                </h2>
              </div>
              <div className="hp-table-wrap">
                <table className="hp-tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>CNIC</th>
                      <th>Mobile</th>
                      <th>Relationship To Head</th>
                      <th>DOB</th>
                      <th>Gender</th>
                      <th>Ismaili</th>
                      <th>Intent</th>
                      <th>Intent Event</th>
                      <th>Wristband</th>
                      <th>QR</th>
                      <th>Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.FamilyMembers.map((m, idx) => {
                      const reg = rows?.find((r) => String(r.FamilyMemberId ?? r.familyMemberId) === String(m.Id))
                      const intent = reg?.ApprovalStatus || reg?.approval_status || '—'
                      const intentEventId = reg?.EventId ?? reg?.eventId
                      const intentEventName = intentEventId != null ? (events.find(e => e.Id === intentEventId)?.Name || '—') : '—'
                      const wbData = wristbandMap[String(m.Id)]
                      const wbLabel = wbData == null ? '—' : wbData.wristbandChoice?.toLowerCase() === 'yes' ? 'Applied' : 'Not Applied'
                      const qrVal = wbData?.qrScannedValue || ''
                      const eventName = resolveEventName(qrVal, events)
                      const relationshipToHead = relationshipToHeadName(m.RelationshipToHeadId)
                      const mobileNumber = m.MobileNumber ?? '—'
                      const dob = m.MonthYearOfBirth ?? '—'
                      const gender = m.Gender ?? m.Sex ?? (m.GenderId === 1 ? 'Male' : m.GenderId === 2 ? 'Female' : m.GenderId === 3 ? 'Other' : '—')
                      const ismaili = m.CommunityAffiliation === true ? 'Yes' : m.CommunityAffiliation === false ? 'No' : '—'
                      return (
                        <tr key={m.Id}>
                          <td className="hp-tbl-num">{idx + 1}</td>
                          <td className="hp-tbl-name">{m.FullName}</td>
                          <td><span className="mono">{m.IdNumber}</span></td>
                          <td>{mobileNumber}</td>
                          <td>{relationshipToHead}</td>
                          <td className="hp-tbl-dob">{dob}</td>
                          <td>{gender}</td>
                          <td>{ismaili}</td>
                          <td>{intent !== '—' ? <span className={`hp-badge hp-badge-${intent.toLowerCase()}`}>{intent}</span> : '—'}</td>
                          <td>{intentEventName}</td>
                          <td>{wbLabel !== '—' ? <span className={`hp-badge ${wbLabel === 'Applied' ? 'hp-badge-applied' : 'hp-badge-not'}`}>{wbLabel}</span> : '—'}</td>
                          <td><span className="mono hp-qr">{qrVal || '—'}</span></td>
                          <td>{eventName !== '—' ? <span className="hp-event-chip">{eventName}</span> : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
