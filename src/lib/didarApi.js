const SK_ACCESS = 'didar_access_token'
const SK_REFRESH = 'didar_refresh_token'

export function getApiBase() {
  const b = (import.meta.env.VITE_API_BASE || 'https://api.registration-pakistan.com').trim()
  return b.replace(/\/$/, '')
}

export function isLoggedIn() {
  return Boolean(sessionStorage.getItem(SK_ACCESS))
}

export function setTokens(access, refresh) {
  sessionStorage.setItem(SK_ACCESS, access)
  sessionStorage.setItem(SK_REFRESH, refresh || '')
}

export function clearTokens() {
  sessionStorage.removeItem(SK_ACCESS)
  sessionStorage.removeItem(SK_REFRESH)
}

function getAccessToken() {
  return sessionStorage.getItem(SK_ACCESS) || ''
}

function getRefreshToken() {
  return sessionStorage.getItem(SK_REFRESH) || ''
}

export async function login(username, password) {
  const base = getApiBase()
  const body = new URLSearchParams({ username, password })
  const r = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const d = data.detail
    let msg
    if (Array.isArray(d)) msg = d.length ? String(d[0]) : r.statusText || 'Login failed'
    else msg = (typeof d === 'string' ? d : null) || data.message || r.statusText || 'Login failed'
    throw new Error(msg)
  }
  if (!data.access_token) throw new Error('API did not return access_token')
  setTokens(data.access_token, data.refresh_token || '')
}

async function tryRefresh() {
  const rt = getRefreshToken()
  if (!rt) return false
  const base = getApiBase()
  const r = await fetch(`${base}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  })
  if (!r.ok) return false
  const data = await r.json().catch(() => ({}))
  if (!data.access_token) return false
  setTokens(data.access_token, getRefreshToken())
  return true
}

function formatHttpError(r, data) {
  if (data && typeof data.error === 'string') return data.error
  if (data && data.detail != null) {
    const d = data.detail
    return Array.isArray(d) ? d.map(String).join(' ') : String(d)
  }
  if (data && typeof data === 'object' && Object.keys(data).length) return JSON.stringify(data, null, 2)
  return r.statusText || 'Request failed'
}

/** @param {string} url Absolute URL to the API */
export async function didarFetch(url, options = {}) {
  const hdr = { Accept: 'application/json' }
  const at = getAccessToken()
  if (at) hdr.Authorization = `Bearer ${at}`
  if (options.headers) Object.assign(hdr, options.headers)
  let r = await fetch(url, { ...options, headers: hdr })
  if (r.status === 401 && !options._retry) {
    if (await tryRefresh()) return didarFetch(url, { ...options, _retry: true })
    clearTokens()
    throw new Error('SESSION_EXPIRED')
  }
  return r
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

export function getJamatKhanaIds() {
  const token = getAccessToken()
  if (!token) return []
  const payload = decodeJwtPayload(token)
  return Array.isArray(payload?.JamatKhanaIds) ? payload.JamatKhanaIds : []
}

export function isAuthorizedForFamily(familyId) {
  const ids = getJamatKhanaIds()
  const fam = familyId.trim().toUpperCase()
  return ids.some((jkId) => {
    const prefix = jkId.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
    return prefix && fam.startsWith(prefix)
  })
}

export async function fetchFormsByCnic(cnic) {
  const base = getApiBase()
  const q = new URLSearchParams({
    FamilyMemberCNIC: cnic.trim(),
    PageNumber: '1',
    PageSize: '10',
  })
  const r = await didarFetch(`${base}/queryforms/?${q}`, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  const forms = data?.Forms || data?.forms || []
  if (!Array.isArray(forms)) throw new Error('Unexpected response from queryforms API')
  return forms
}

export async function fetchRegistrations(familyId) {
  const base = getApiBase()
  const q = new URLSearchParams({ FamilyId: familyId.trim() })
  const r = await didarFetch(`${base}/event-registrations/?${q}`, { method: 'GET' })
  const rows = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = rows && typeof rows === 'object' ? rows : {}
    throw new Error(formatHttpError(r, errObj))
  }
  if (!Array.isArray(rows)) throw new Error('Expected a JSON array from the API')
  return rows
}

export async function fetchWristbandIssuances(familyId) {
  const base = getApiBase()
  const r = await didarFetch(`${base}/wristband-issuances/${encodeURIComponent(familyId.trim())}`, { method: 'GET' })
  if (r.status === 404) return null
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  return data
}

export async function fetchEvents() {
  const base = getApiBase()
  const r = await didarFetch(`${base}/events/`, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  if (!Array.isArray(data)) throw new Error('Expected a JSON array from the events API')
  return data
}

export function resolveEventName(qrValue, events) {
  if (!qrValue) return '—'
  const qr = Number(qrValue)
  if (!qr) return '—'
  for (const ev of events) {
    const start = Number(ev.QRCodeStartSeries)
    const end = Number(ev.QRCodeEndSeries)
    if (qr >= start && qr <= end) return ev.Name
    const cStart = Number(ev.ChairQRCodeStartSeries)
    const cEnd = Number(ev.ChairQRCodeEndSeries)
    if (qr >= cStart && qr <= cEnd) return ev.Name
  }
  return '—'
}

export async function approveMember(familyId, familyMemberId) {
  const base = getApiBase()
  const outbound = {
    familyId: String(familyId),
    familyMemberId: Number(familyMemberId),
    status: 'Approved',
  }
  const r = await didarFetch(`${base}/event-registrations/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outbound),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(formatHttpError(r, data))
}
