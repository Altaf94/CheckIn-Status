import { Navigate, Route, Routes } from 'react-router-dom'
import { isLoggedIn } from './lib/didarApi'
import LoginPage from './pages/LoginPage'
import HouseholdPage from './pages/HouseholdPage'

function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HouseholdPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
