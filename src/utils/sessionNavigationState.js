/**
 * Global Session Navigation & State Restoration Service for IPL 2026.
 * 
 * Manages session-scoped persistence via sessionStorage.
 * - Survives tab switches, mobile app switches (WhatsApp, backgrounding, lock/unlock), and page reloads.
 * - Automatically expires and resets to Home when the browser tab/session is completely closed.
 */

const SESSION_STATE_KEY = 'ipl2026_global_session_state'

/**
 * Safely retrieve the parsed session state object.
 */
export function getSessionState() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_STATE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.warn('[SessionState] Failed to read sessionStorage', err)
    return null
  }
}

/**
 * Merge partial state and write to sessionStorage.
 */
export function saveSessionState(partialState) {
  if (typeof window === 'undefined' || !partialState) return
  try {
    const existing = getSessionState() || {}
    const updated = {
      ...existing,
      ...partialState,
      lastUpdated: Date.now()
    }
    // Deep merge scrollPositions if provided
    if (partialState.scrollPositions && existing.scrollPositions) {
      updated.scrollPositions = {
        ...existing.scrollPositions,
        ...partialState.scrollPositions
      }
    }
    // Deep merge adminFilters if provided
    if (partialState.adminFilters && existing.adminFilters) {
      updated.adminFilters = {
        ...existing.adminFilters,
        ...partialState.adminFilters
      }
    }
    sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(updated))
  } catch (err) {
    console.warn('[SessionState] Failed to write sessionStorage', err)
  }
}

/**
 * Save scroll position for a specific view ('public' | 'submissions' | 'admin').
 */
export function saveViewScroll(viewKey, scrollY) {
  if (typeof window === 'undefined' || !viewKey) return
  try {
    const existing = getSessionState() || {}
    const scrollPositions = existing.scrollPositions || {}
    scrollPositions[viewKey] = Math.max(0, Math.round(scrollY))
    existing.scrollPositions = scrollPositions
    existing.lastUpdated = Date.now()
    sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(existing))
  } catch (err) {
    console.warn('[SessionState] Failed to save view scroll', err)
  }
}

/**
 * Get saved scroll position for a specific view.
 */
export function getViewScroll(viewKey) {
  const state = getSessionState()
  return state?.scrollPositions?.[viewKey] ?? null
}

/**
 * Clear all session restoration data (e.g. on logout or user switch).
 */
export function clearSessionState() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(SESSION_STATE_KEY)
    sessionStorage.removeItem('admin_active_tab')
    sessionStorage.removeItem('admin_scroll_position')
    sessionStorage.removeItem('admin_teams_search')
    sessionStorage.removeItem('admin_current_page')
    sessionStorage.removeItem('admin_filter_dept')
    sessionStorage.removeItem('admin_filter_domain')
    sessionStorage.removeItem('admin_filter_trl')
    sessionStorage.removeItem('ipl2026_home_scroll_position')
  } catch (err) {
    console.warn('[SessionState] Failed to clear sessionStorage', err)
  }
}

/**
 * Check if a hash/href string represents root/home navigation (e.g. '', '#', '#/', '#top').
 */
export function isRootOrHomeHash(hash) {
  if (!hash || typeof hash !== 'string') return true
  const trimmed = hash.trim()
  return trimmed === '' || trimmed === '#' || trimmed === '#/' || trimmed === '#top'
}

/**
 * Normalizes a hash/href string. Returns empty string for root/bare hash.
 */
export function normalizeHash(hash) {
  if (isRootOrHomeHash(hash)) return ''
  return hash.trim()
}

/**
 * Safely resolves an element by ID or CSS selector without throwing DOMExceptions.
 * Never executes document.querySelector on bare '#', empty string, or invalid selectors.
 */
export function safeFindElement(targetOrHash) {
  if (!targetOrHash || typeof targetOrHash !== 'string') return null
  const trimmed = targetOrHash.trim()
  if (isRootOrHomeHash(trimmed)) return null

  // Extract ID if it starts with '#'
  const idCandidate = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  if (idCandidate && typeof document !== 'undefined') {
    const elById = document.getElementById(idCandidate)
    if (elById) return elById
  }

  // Fall back to querySelector only if safe and valid selector
  if (typeof document !== 'undefined') {
    try {
      return document.querySelector(trimmed)
    } catch (e) {
      // Invalid selector (e.g. bare '#', malformed special characters)
      return null
    }
  }

  return null
}

const PENDING_VOTING_TOKEN_KEY = 'ipl2026_pending_voting_token'

/**
 * Structurally extract QR voting token from location.
 * Prioritizes URLSearchParams (?token=...) followed by controlled hash query parsing (#vote?token=...).
 * Does NOT perform loose text search across window.location.href.
 */
export function extractVotingTokenFromUrl(urlObj) {
  if (typeof window === 'undefined' && !urlObj) return null
  const loc = urlObj || window.location

  // 1. Structured query parameter extraction (?token=...)
  if (loc.search) {
    try {
      const searchParams = new URLSearchParams(loc.search)
      const token = searchParams.get('token')
      if (token && token.trim()) {
        return token.trim()
      }
    } catch (e) {}
  }

  // 2. Controlled hash query extraction (#vote?token=... or #token=...)
  if (loc.hash) {
    try {
      const hashStr = loc.hash
      const qIndex = hashStr.indexOf('?')
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hashStr.slice(qIndex))
        const token = hashParams.get('token')
        if (token && token.trim()) {
          return token.trim()
        }
      } else if (hashStr.startsWith('#token=')) {
        const hashParams = new URLSearchParams(hashStr.slice(1))
        const token = hashParams.get('token')
        if (token && token.trim()) {
          return token.trim()
        }
      }
    } catch (e) {}
  }

  return null
}

/**
 * Session storage management for pending voting token across authentication redirects.
 */
export function getPendingVotingToken() {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(PENDING_VOTING_TOKEN_KEY) || null
  } catch (e) {
    return null
  }
}

export function setPendingVotingToken(token) {
  if (typeof window === 'undefined' || !token) return
  try {
    sessionStorage.setItem(PENDING_VOTING_TOKEN_KEY, String(token).trim())
  } catch (e) {}
}

export function clearPendingVotingToken() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PENDING_VOTING_TOKEN_KEY)
  } catch (e) {}
}

/**
 * Clean up voting token and #vote hash from the browser URL without retriggering a page reload.
 * Optionally updates hash to targetHash (e.g. #idea?id=...) atomically.
 */
export function cleanVotingUrl(targetHash = null) {
  if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return
  try {
    const url = new URL(window.location.href)
    let changed = false

    if (url.searchParams.has('token')) {
      url.searchParams.delete('token')
      changed = true
    }

    if (targetHash !== null) {
      url.hash = targetHash
      changed = true
    } else if (url.hash.includes('vote') || url.hash.includes('token=')) {
      url.hash = ''
      changed = true
    }

    if (changed) {
      const searchStr = url.searchParams.toString() ? '?' + url.searchParams.toString() : ''
      const hashStr = url.hash || ''
      const newUrl = url.pathname + searchStr + hashStr
      window.history.replaceState(null, '', newUrl || '/')
    }
  } catch (e) {}
}

const VISITOR_TOKEN_KEY = 'ipl2026_visitor_token'
const SESSION_TOKEN_KEY = 'ipl2026_session_token'
const PENDING_VOTE_IDEA_KEY = 'ipl2026_pending_vote_idea'
const PASSED_COUNTDOWN_KEY = 'ipl2026_passed_countdown'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Structurally extract Product / Idea ID from location.
 * Supports:
 * - Hash query: #idea?id=<productId> or #idea?productId=<productId>
 * - Hash path: #idea/<productId>
 * - Hash assign: #idea=<productId>
 * - Query search: ?idea=<productId> or ?id=<productId>
 */
export function extractIdeaIdFromUrl(urlObj) {
  if (typeof window === 'undefined' && !urlObj) return null
  const loc = urlObj || window.location

  // 1. Structured hash extraction (#idea?id=... or #idea?productId=...)
  if (loc.hash) {
    try {
      const hashStr = loc.hash
      const qIndex = hashStr.indexOf('?')
      if (qIndex !== -1) {
        const hashPrefix = hashStr.slice(0, qIndex).toLowerCase()
        if (hashPrefix === '#idea' || hashPrefix === '#/idea') {
          const hashParams = new URLSearchParams(hashStr.slice(qIndex))
          const id = hashParams.get('id') || hashParams.get('productId') || hashParams.get('ideaId')
          if (id && id.trim()) {
            return id.trim()
          }
        }
      } else if (hashStr.toLowerCase().startsWith('#idea/')) {
        const candidate = hashStr.slice(6).trim()
        if (candidate) return candidate
      } else if (hashStr.toLowerCase().startsWith('#idea=')) {
        const candidate = hashStr.slice(6).trim()
        if (candidate) return candidate
      }
    } catch (e) {}
  }

  // 2. Structured query parameter extraction (?idea=... or ?id=...)
  if (loc.search) {
    try {
      const searchParams = new URLSearchParams(loc.search)
      const id = searchParams.get('idea') || searchParams.get('productId') || searchParams.get('id')
      if (id && id.trim()) {
        return id.trim()
      }
    } catch (e) {}
  }

  return null
}

/**
 * Visitor Token management (localStorage).
 * Provides anonymous identity for public Like submissions and visit telemetry.
 */
export function getStoredVisitorToken() {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(VISITOR_TOKEN_KEY) || null
  } catch (e) {
    return null
  }
}

export function setStoredVisitorToken(token) {
  if (typeof window === 'undefined' || !token) return
  try {
    localStorage.setItem(VISITOR_TOKEN_KEY, String(token).trim())
  } catch (e) {}
}

/**
 * Session Token management (sessionStorage).
 * Provides anonymous session identity for approximate unique sessions calculation.
 * Survives page reloads in the same tab, resets on new tab/session.
 */
export function getStoredSessionToken() {
  if (typeof window === 'undefined') return null
  try {
    let token = sessionStorage.getItem(SESSION_TOKEN_KEY)
    if (!token || !token.trim()) {
      token = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    }
    return token
  } catch (e) {
    return null
  }
}

/**
 * Pending Idea Vote context across authentication redirects (sessionStorage).
 * Preserves strictly: productId, teamId, productTitle, teamName.
 */
export function getPendingVoteIdea() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PENDING_VOTE_IDEA_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && (parsed.productId || parsed.teamId)) {
      return {
        productId: parsed.productId || null,
        teamId: parsed.teamId || null,
        productTitle: parsed.productTitle || '',
        teamName: parsed.teamName || ''
      }
    }
    return null
  } catch (e) {
    return null
  }
}

export function setPendingVoteIdea(ideaData) {
  if (typeof window === 'undefined' || !ideaData) return
  try {
    const safeData = {
      productId: ideaData.productId || null,
      teamId: ideaData.teamId || null,
      productTitle: ideaData.productTitle || '',
      teamName: ideaData.teamName || ''
    }
    sessionStorage.setItem(PENDING_VOTE_IDEA_KEY, JSON.stringify(safeData))
  } catch (e) {}
}

export function clearPendingVoteIdea() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PENDING_VOTE_IDEA_KEY)
  } catch (e) {}
}

/**
 * Session-scoped countdown bypass state (sessionStorage).
 * Allows unauthenticated visitors to explore the public homepage once they click "Continue to IPL 2026".
 */
export function getHasPassedCountdown() {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(PASSED_COUNTDOWN_KEY) === 'true'
  } catch (e) {
    return false
  }
}

export function setHasPassedCountdown(passed) {
  if (typeof window === 'undefined') return
  try {
    if (passed) {
      sessionStorage.setItem(PASSED_COUNTDOWN_KEY, 'true')
    } else {
      sessionStorage.removeItem(PASSED_COUNTDOWN_KEY)
    }
  } catch (e) {}
}

const PENDING_REGISTRATION_KEY = 'ipl2026_pending_registration'

/**
 * Pending Team Registration context across authentication redirects (sessionStorage).
 */
export function getPendingRegistration() {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(PENDING_REGISTRATION_KEY) === 'true'
  } catch (e) {
    return false
  }
}

export function setPendingRegistration(pending = true) {
  if (typeof window === 'undefined') return
  try {
    if (pending) {
      sessionStorage.setItem(PENDING_REGISTRATION_KEY, 'true')
    } else {
      sessionStorage.removeItem(PENDING_REGISTRATION_KEY)
    }
  } catch (e) {}
}

export function clearPendingRegistration() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PENDING_REGISTRATION_KEY)
  } catch (e) {}
}

