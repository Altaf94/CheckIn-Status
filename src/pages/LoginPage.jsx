import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, isLoggedIn } from '../lib/didarApi'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (isLoggedIn()) navigate('/', { replace: true })
  }, [navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3m0 4h4v-4m-4 0h4"/>
            </svg>
          </div>
          <div>
            <div className="login-brand-title">GBC Check In</div>
            <div className="login-brand-sub">Family Verification Portal</div>
                        <div className="login-brand-sub">For Regional council only</div>

          </div>
        </div>

        <h2 className="login-heading">Sign in to continue</h2>

        {error ? <div className="login-error">{error}</div> : null}

        <form onSubmit={onSubmit} autoComplete="on">
          <div className="login-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              placeholder="you@example.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="login-btn" disabled={pending}>
            {pending ? (
              <>
                <span className="login-btn-spinner" />
                Signing in…
              </>
            ) : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}
