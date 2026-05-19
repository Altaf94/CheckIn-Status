import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchEvents, setOperatorContext, clearTokens, getOperatorInfo } from '../lib/didarApi'

const PRESET_GATES = [
  'Main Entrance', 'Gate A', 'Gate B', 'Gate C', 'Gate D',
  'Gate E', 'Gate F', 'VIP Gate', 'Side Entrance', 'Other…',
]

const SESSIONS = ['Morning', 'Afternoon', 'Evening', 'Night', 'Full Day']

export default function EventGateSelectionPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedGate, setSelectedGate] = useState('')
  const [customGate, setCustomGate] = useState('')
  const [selectedSession, setSelectedSession] = useState('Morning')
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [error, setError] = useState('')
  const operatorInfo = getOperatorInfo()

  useEffect(() => {
    fetchEvents()
      .then(list => { setEvents(list); setLoadingEvents(false) })
      .catch(e => { setError(e.message); setLoadingEvents(false) })
  }, [])

  function handleProceed() {
    setError('')
    const evt = events.find(e => String(e.Id) === selectedEventId)
    if (!evt) { setError('Please select an event.'); return }
    const gate = selectedGate === 'Other…' ? customGate.trim() : selectedGate
    if (!gate) { setError('Please select or enter a gate / location.'); return }
    setOperatorContext(evt, gate, selectedSession)
    navigate('/checkin', { replace: true })
  }

  function logout() {
    clearTokens()
    navigate('/login', { replace: true })
  }

  return (
    <div className="login-bg">
      <div className="login-card" style={{ maxWidth: 480 }}>

        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3m0 4h4v-4m-4 0h4" />
            </svg>
          </div>
          <div>
            <div className="login-brand-title">GBC Check-IN System</div>
            <div className="login-brand-sub">
              {operatorInfo.username && `Operator: ${operatorInfo.username}`}
              {operatorInfo.role && ` · ${operatorInfo.role.toUpperCase()}`}
            </div>
          </div>
        </div>

        <h2 className="login-heading">Select Event &amp; Gate</h2>

        {error && <div className="login-error">{error}</div>}
        {loadingEvents && <div className="hp-msg hp-msg-ok" style={{ margin: '0 0 16px' }}>Loading events…</div>}

        {!loadingEvents && (
          <>
            {/* Event */}
            <div className="login-field">
              <label>Current Event</label>
              <select
                className="setup-select"
                value={selectedEventId}
                onChange={e => { setSelectedEventId(e.target.value); setError('') }}
              >
                <option value="">— Select event —</option>
                {events.map(ev => (
                  <option key={ev.Id} value={String(ev.Id)}>{ev.Name}</option>
                ))}
              </select>
            </div>

            {/* Gate */}
            <div className="login-field">
              <label>Gate / Location</label>
              <select
                className="setup-select"
                value={selectedGate}
                onChange={e => { setSelectedGate(e.target.value); setCustomGate(''); setError('') }}
              >
                <option value="">— Select gate —</option>
                {PRESET_GATES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {selectedGate === 'Other…' && (
                <input
                  type="text"
                  className="setup-input"
                  placeholder="Enter gate name"
                  value={customGate}
                  onChange={e => setCustomGate(e.target.value)}
                  style={{ marginTop: 8 }}
                  autoFocus
                />
              )}
            </div>

            {/* Session */}
            <div className="login-field">
              <label>Session</label>
              <select
                className="setup-select"
                value={selectedSession}
                onChange={e => setSelectedSession(e.target.value)}
              >
                {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <button type="button" className="login-btn" onClick={handleProceed}>
              Proceed to Check-IN →
            </button>
            <button
              type="button"
              style={{ marginTop: 12, background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', width: '100%' }}
              onClick={logout}
            >
              Log out
            </button>
          </>
        )}
      </div>
    </div>
  )
}
