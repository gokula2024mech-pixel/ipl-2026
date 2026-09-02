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
