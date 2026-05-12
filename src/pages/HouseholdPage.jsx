import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearTokens,
  fetchRegistrations,
  fetchFormsByCnic,
  fetchWristbandIssuances,
  fetchEvents,
  resolveEventName,
  isAuthorizedForFamily,
  // approveMember,
} from '../lib/didarApi'

export default function HouseholdPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [resolvedFamilyId, setResolvedFamilyId] = useState('')
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [rows, setRows] = useState(null)
  const [wristbandMap, setWristbandMap] = useState({})
  const [events, setEvents] = useState([])
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
      setErr('Enter a Household ID or CNIC.')
      return
    }

    setLoading(true)
    setRows(null)
    setWristbandMap({})
    setResolvedFamilyId('')

    try {
      let familyId = input

      if (isCnic(input)) {
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

      if (!isAuthorizedForFamily(familyId)) {
        setErr('Not authorized to view this household.')
        return
      }

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

      setRows(list)
      if (!list.length) setOk('No registrations for this household.')
      else setOk(`${list.length} registration(s) for ${familyId}.`)
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

  return (
    <div className="layout">
      <p className="topbar">
        <button type="button" className="linkish" onClick={logout}>
          Log out
        </button>
      </p>
      <h1>Didar household utility</h1>

      <label htmlFor="search_input">Household ID or CNIC</label>
      <input
        id="search_input"
        type="text"
        placeholder="e.g. JK001-39366661 or 3474744884844"
        autoComplete="off"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        onKeyDown={onKeyDown}
      />

      <div className="actions">
        <button type="button" className="btn-primary" onClick={() => void handleSearch()} disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {message ? <div className={messageIsError ? 'err' : 'ok'}>{message}</div> : null}
      {resolvedFamilyId && resolvedFamilyId !== searchInput.trim() ? (
        <div className="ok">Household ID: <strong>{resolvedFamilyId}</strong></div>
      ) : null}

      {rows && rows.length > 0 ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Registration Id</th>
              <th>Family member Id</th>
              <th>Family member</th>
              <th>CNIC</th>
              <th>Decision status</th>
              <th>Wristband</th>
              <th>QR Value</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row.Id ?? row.id
              const memId = row.FamilyMemberId ?? row.familyMemberId ?? ''
              const stat = row.ApprovalStatus || row.approval_status || ''
              const wbData = wristbandMap[String(memId)]
              const wbLabel = wbData == null ? '—' : wbData.wristbandChoice?.toLowerCase() === 'yes' ? 'Applied' : 'Not Applied'
              const qrVal = wbData?.qrScannedValue || ''
              const eventName = resolveEventName(qrVal, events)
              return (
                <tr key={`${id}-${memId}`}>
                  <td>{id}</td>
                  <td>{memId}</td>
                  <td>{row.FullName || ''}</td>
                  <td>{row.CNIC || ''}</td>
                  <td>{stat}</td>
                  <td>{wbLabel}</td>
                  <td>{qrVal || '—'}</td>
                  <td>{eventName}</td>
                  {/* <td className="row-actions">
                    <button
                      type="button"
                      disabled={approved || busy}
                      onClick={() => void handleApprove(famRow, memId)}
                    >
                      {busy ? '…' : 'Approve'}
                    </button>
                  </td> */}
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
