import { Navigate, Route, Routes } from 'react-router-dom'
import { isLoggedIn, hasOperatorContext } from './lib/didarApi'
import LoginPage from './pages/LoginPage'
import EventGateSelectionPage from './pages/EventGateSelectionPage'
import CheckInPage from './pages/CheckInPage'
import DashboardPage from './pages/DashboardPage'
import AuditPage from './pages/AuditPage'

/** Requires a valid session token */
function AuthRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return children
}

/** Requires a valid session token AND operator context (event + gate) */
function SetupRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Step 1: Select event & gate */}
      <Route path="/setup" element={<AuthRoute><EventGateSelectionPage /></AuthRoute>} />

      {/* Step 2: Check-in screen */}
      <Route path="/checkin" element={<SetupRoute><CheckInPage /></SetupRoute>} />
      <Route path="/" element={<SetupRoute><CheckInPage /></SetupRoute>} />

      {/* Dashboard – auth only (no setup required to view) */}
      <Route path="/dashboard" element={<AuthRoute><DashboardPage /></AuthRoute>} />

      {/* Audit log – auth only */}
      <Route path="/audit" element={<AuthRoute><AuditPage /></AuthRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
