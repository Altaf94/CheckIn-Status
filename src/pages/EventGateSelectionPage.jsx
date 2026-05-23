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
      <div className="login-card login-card-wide">

        {/* Page heading removed per UI update */}

        {/* Selection controls removed per request */}
      </div>
    </div>
  )
}
