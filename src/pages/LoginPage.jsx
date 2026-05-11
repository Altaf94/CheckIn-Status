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
    <div className="narrow">
      <h1>Sign in</h1>
      {error ? <p className="err">{error}</p> : null}
      <form onSubmit={onSubmit} autoComplete="on">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
