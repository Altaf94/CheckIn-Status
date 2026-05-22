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

export function isAuthorizedForJK(jamatKhanaId) {
  const ids = getJamatKhanaIds()
  if (!jamatKhanaId) return false
  const normalise = (v) => v.replace(/[^A-Z0-9]/g, '').toUpperCase()
  const target = normalise(jamatKhanaId)
  return ids.some((jkId) => normalise(jkId) === target)
}

export async function fetchFormById(formId) {
  const base = getApiBase()
  const r = await didarFetch(`${base}/forms/${encodeURIComponent(formId.trim())}`, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  return data
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

export function resolveEventId(qrValue, events) {
  if (!qrValue) return null
  const qr = Number(qrValue)
  if (!qr) return null
  for (const ev of events) {
    const start = Number(ev.QRCodeStartSeries)
    const end = Number(ev.QRCodeEndSeries)
    if (qr >= start && qr <= end) return ev.Id
    const cStart = Number(ev.ChairQRCodeStartSeries)
    const cEnd = Number(ev.ChairQRCodeEndSeries)
    if (qr >= cStart && qr <= cEnd) return ev.Id
  }
  return null
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

// ── Operator context ──────────────────────────────────────────────────

export function getOperatorInfo() {
  const token = sessionStorage.getItem('didar_access_token') || ''
  if (!token) return { username: '', role: '', jkIds: [] }
  try {
    const parts = token.split('.')
    if (parts.length < 2) return { username: '', role: '', jkIds: [] }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    return {
      username: payload?.sub || payload?.username || payload?.email || payload?.name || '',
      role: String(payload?.role || payload?.Role || payload?.UserType || payload?.user_type || ''),
      jkIds: Array.isArray(payload?.JamatKhanaIds) ? payload.JamatKhanaIds : [],
    }
  } catch {
    return { username: '', role: '', jkIds: [] }
  }
}

export function getOperatorContext() {
  try {
    const event = sessionStorage.getItem('op_event')
    return {
      event: event ? JSON.parse(event) : null,
      gate: sessionStorage.getItem('op_gate') || '',
      session: sessionStorage.getItem('op_session') || '',
    }
  } catch {
    return { event: null, gate: '', session: '' }
  }
}

export function setOperatorContext(event, gate, session) {
  sessionStorage.setItem('op_event', JSON.stringify(event))
  sessionStorage.setItem('op_gate', gate)
  sessionStorage.setItem('op_session', session)
}

export function clearOperatorContext() {
  sessionStorage.removeItem('op_event')
  sessionStorage.removeItem('op_gate')
  sessionStorage.removeItem('op_session')
}

export function hasOperatorContext() {
  return Boolean(sessionStorage.getItem('op_event') && sessionStorage.getItem('op_gate'))
}

// ── QR / CNIC lookup ─────────────────────────────────────────────────

export async function fetchFormsByQR(qrCode) {
  const base = getApiBase()
  const q = new URLSearchParams({ QRCode: String(qrCode).trim(), PageNumber: '1', PageSize: '5' })
  const r = await didarFetch(`${base}/queryforms/?${q}`, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  const forms = data?.Forms || data?.forms || []
  return Array.isArray(forms) ? forms : []
}

// ── Check-In ─────────────────────────────────────────────────────────

export async function performCheckIn({ familyId, familyMemberId, eventId, qrScannedValue }) {
  const base = getApiBase()
  const body = {
    familyId: String(familyId),
    familyMemberId: Number(familyMemberId),
    eventId: Number(eventId),
    qrScannedValue: qrScannedValue ? String(qrScannedValue) : '',
  }
  const r = await didarFetch(`${base}/attendance/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(formatHttpError(r, data))
  return data
}

export async function fetchCheckIns({ eventId, familyId, gate, pageNumber = 1, pageSize = 200 } = {}) {
  const base = getApiBase()
  const q = new URLSearchParams({ PageNumber: String(pageNumber), PageSize: String(pageSize) })
  if (eventId) q.set('EventId', String(eventId))
  if (familyId) q.set('FamilyId', String(familyId))
  if (gate) q.set('Gate', gate)
  const r = await didarFetch(`${base}/checkins/?${q}`, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.Items)) return data.Items
  return []
}

// ── QR Binding ───────────────────────────────────────────────────────

export async function bindQRToMember({ familyId, familyMemberId, qrCode }) {
  const base = getApiBase()
  const body = {
    FamilyId: String(familyId),
    FamilyMemberId: Number(familyMemberId),
    QRCode: Number(qrCode),
    Timestamp: new Date().toISOString(),
  }
  const r = await didarFetch(`${base}/qr-binding/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(formatHttpError(r, data))
  return data
}

// ── Dashboard ────────────────────────────────────────────────────────

export async function fetchDashboardStats(eventId) {
  const base = getApiBase()
  const q = new URLSearchParams()
  if (eventId) q.set('EventId', String(eventId))
  const r = await didarFetch(`${base}/dashboard/stats?${q}`, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  return data
}

// ── Audit Logs ───────────────────────────────────────────────────────

export async function fetchAuditLogs({ eventId, pageNumber = 1, pageSize = 50 } = {}) {
  const base = getApiBase()
  const q = new URLSearchParams({ PageNumber: String(pageNumber), PageSize: String(pageSize) })
  if (eventId) q.set('EventId', String(eventId))
  const r = await didarFetch(`${base}/audit-logs/?${q}`, { method: 'GET' })
  const data = await r.json().catch(() => null)
  if (!r.ok) {
    const errObj = data && typeof data === 'object' ? data : {}
    throw new Error(formatHttpError(r, errObj))
  }
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.Items)) return data.Items
  return []
}
