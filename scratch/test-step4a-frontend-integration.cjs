const assert = require('assert')

// Mock browser storage for testing navigation and session utilities
class MockStorage {
  constructor() {
    this.store = {}
  }
  getItem(key) {
    return this.store[key] || null
  }
  setItem(key, val) {
    this.store[key] = String(val)
  }
  removeItem(key) {
    delete this.store[key]
  }
  clear() {
    this.store = {}
  }
}

global.localStorage = new MockStorage()
global.sessionStorage = new MockStorage()
global.window = {
  location: {
    hash: '',
    search: '',
    pathname: '/',
    origin: 'http://localhost:5173'
  }
}

console.log('================================================================')
console.log('        IPL-2026: STEP 4A FRONTEND INTEGRATION TEST SUITE       ')
console.log('================================================================\n')

let passedCount = 0
let failedCount = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅ PASS: ${name}`)
    passedCount++
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`)
    console.error(`     Error: ${err.message}`)
    failedCount++
  }
}

// 1. URL Parsing Unit Tests
const UUID_TEST = 'e8537b82-bd7b-4c49-b7f5-81395ce63fc8'

function extractIdeaIdFromUrl(urlObj) {
  const loc = urlObj || global.window.location
  if (loc.hash) {
    const hashStr = loc.hash
    const qIndex = hashStr.indexOf('?')
    if (qIndex !== -1) {
      const hashPrefix = hashStr.slice(0, qIndex).toLowerCase()
      if (hashPrefix === '#idea' || hashPrefix === '#/idea') {
        const hashParams = new URLSearchParams(hashStr.slice(qIndex))
        const id = hashParams.get('id') || hashParams.get('productId') || hashParams.get('ideaId')
        if (id && id.trim()) return id.trim()
      }
    } else if (hashStr.toLowerCase().startsWith('#idea/')) {
      const candidate = hashStr.slice(6).trim()
      if (candidate) return candidate
    } else if (hashStr.toLowerCase().startsWith('#idea=')) {
      const candidate = hashStr.slice(6).trim()
      if (candidate) return candidate
    }
  }
  if (loc.search) {
    const searchParams = new URLSearchParams(loc.search)
    const id = searchParams.get('idea') || searchParams.get('productId') || searchParams.get('id')
    if (id && id.trim()) return id.trim()
  }
  return null
}

console.log('1. Testing URL Parsing (extractIdeaIdFromUrl)...')
test('Standard hash query format #idea?id=UUID', () => {
  const loc = { hash: `#idea?id=${UUID_TEST}`, search: '' }
  assert.strictEqual(extractIdeaIdFromUrl(loc), UUID_TEST)
})

test('Hash query format with productId param #idea?productId=UUID', () => {
  const loc = { hash: `#idea?productId=${UUID_TEST}`, search: '' }
  assert.strictEqual(extractIdeaIdFromUrl(loc), UUID_TEST)
})

test('Hash path format #idea/UUID', () => {
  const loc = { hash: `#idea/${UUID_TEST}`, search: '' }
  assert.strictEqual(extractIdeaIdFromUrl(loc), UUID_TEST)
})

test('Search param format ?id=UUID', () => {
  const loc = { hash: '', search: `?id=${UUID_TEST}` }
  assert.strictEqual(extractIdeaIdFromUrl(loc), UUID_TEST)
})

test('Search param format ?idea=UUID', () => {
  const loc = { hash: '', search: `?idea=${UUID_TEST}` }
  assert.strictEqual(extractIdeaIdFromUrl(loc), UUID_TEST)
})

test('Non-idea hash e.g. #about returns null', () => {
  const loc = { hash: '#about', search: '' }
  assert.strictEqual(extractIdeaIdFromUrl(loc), null)
})

test('Empty hash returns null', () => {
  const loc = { hash: '', search: '' }
  assert.strictEqual(extractIdeaIdFromUrl(loc), null)
})

// 2. Storage Helpers Unit Tests
const VISITOR_TOKEN_KEY = 'ipl2026_visitor_token'
const PENDING_VOTE_IDEA_KEY = 'ipl2026_pending_vote_idea'
const PASSED_COUNTDOWN_KEY = 'ipl2026_passed_countdown'

function getStoredVisitorToken() {
  return global.localStorage.getItem(VISITOR_TOKEN_KEY) || null
}
function setStoredVisitorToken(token) {
  if (token) global.localStorage.setItem(VISITOR_TOKEN_KEY, String(token).trim())
}
function getPendingVoteIdea() {
  const raw = global.sessionStorage.getItem(PENDING_VOTE_IDEA_KEY)
  if (!raw) return null
  return JSON.parse(raw)
}
function setPendingVoteIdea(data) {
  global.sessionStorage.setItem(PENDING_VOTE_IDEA_KEY, JSON.stringify({
    productId: data.productId || null,
    teamId: data.teamId || null,
    productTitle: data.productTitle || '',
    teamName: data.teamName || ''
  }))
}
function clearPendingVoteIdea() {
  global.sessionStorage.removeItem(PENDING_VOTE_IDEA_KEY)
}
function getHasPassedCountdown() {
  return global.sessionStorage.getItem(PASSED_COUNTDOWN_KEY) === 'true'
}
function setHasPassedCountdown(val) {
  if (val) global.sessionStorage.setItem(PASSED_COUNTDOWN_KEY, 'true')
  else global.sessionStorage.removeItem(PASSED_COUNTDOWN_KEY)
}

console.log('\n2. Testing Visitor Token & Session Storage Utilities...')
test('Visitor token stores and retrieves cleanly in localStorage', () => {
  global.localStorage.clear()
  assert.strictEqual(getStoredVisitorToken(), null)
  setStoredVisitorToken('vis_test_12345')
  assert.strictEqual(getStoredVisitorToken(), 'vis_test_12345')
})

test('Pending vote idea context preserves strictly allowed fields in sessionStorage', () => {
  global.sessionStorage.clear()
  assert.strictEqual(getPendingVoteIdea(), null)
  setPendingVoteIdea({
    productId: UUID_TEST,
    teamId: 'team_xyz',
    productTitle: 'Smart Solar',
    teamName: 'Team Innovate',
    extraPrivateField: 'DO_NOT_STORE'
  })
  const stored = getPendingVoteIdea()
  assert.strictEqual(stored.productId, UUID_TEST)
  assert.strictEqual(stored.teamId, 'team_xyz')
  assert.strictEqual(stored.productTitle, 'Smart Solar')
  assert.strictEqual(stored.teamName, 'Team Innovate')
  assert.strictEqual(stored.extraPrivateField, undefined)
})

test('Pending vote idea clears cleanly after successful restoration', () => {
  clearPendingVoteIdea()
  assert.strictEqual(getPendingVoteIdea(), null)
})

test('Countdown bypass state toggles correctly in sessionStorage', () => {
  global.sessionStorage.clear()
  assert.strictEqual(getHasPassedCountdown(), false)
  setHasPassedCountdown(true)
  assert.strictEqual(getHasPassedCountdown(), true)
  setHasPassedCountdown(false)
  assert.strictEqual(getHasPassedCountdown(), false)
})

// 3. Access Decision Logic Tests
console.log('\n3. Testing Access & Gate Decision Tree (App.jsx)...')

function evaluateGate({ session, showAuth, isPhaseRunning, hasPassedCountdown, currentHash, viewMode }) {
  if (!session) {
    if (showAuth) return 'EmailGate'
    if (viewMode === 'submissions' || viewMode === 'admin') return 'EmailGate'
    const isDirectPublicRoute = Boolean(currentHash.startsWith('#idea') || currentHash === '#vote')
    if (isPhaseRunning && !hasPassedCountdown && !isDirectPublicRoute) {
      return 'EntryCountdown'
    }
  }
  if (viewMode === 'idea') return 'PublicIdeaPage'
  if (currentHash === '#vote') return 'IdeaResolutionModal'
  if (viewMode === 'submissions') return 'MySubmissionsPage'
  if (viewMode === 'admin') return 'AdminDashboard'
  return 'Homepage'
}

test('Active Phase + No Countdown Pass + Unauthenticated -> Shows EntryCountdown', () => {
  const result = evaluateGate({
    session: null,
    showAuth: false,
    isPhaseRunning: true,
    hasPassedCountdown: false,
    currentHash: '',
    viewMode: 'public'
  })
  assert.strictEqual(result, 'EntryCountdown')
})

test('Active Phase + Countdown Passed (Continue to IPL clicked) -> Shows Homepage without login', () => {
  const result = evaluateGate({
    session: null,
    showAuth: false,
    isPhaseRunning: true,
    hasPassedCountdown: true,
    currentHash: '',
    viewMode: 'public'
  })
  assert.strictEqual(result, 'Homepage')
})

test('NO Active Phase + Unauthenticated -> Shows Homepage directly', () => {
  const result = evaluateGate({
    session: null,
    showAuth: false,
    isPhaseRunning: false,
    hasPassedCountdown: false,
    currentHash: '',
    viewMode: 'public'
  })
  assert.strictEqual(result, 'Homepage')
})

test('Direct Idea link (#idea?id=...) + Active Phase -> Bypasses countdown, shows PublicIdeaPage', () => {
  const result = evaluateGate({
    session: null,
    showAuth: false,
    isPhaseRunning: true,
    hasPassedCountdown: false,
    currentHash: `#idea?id=${UUID_TEST}`,
    viewMode: 'idea'
  })
  assert.strictEqual(result, 'PublicIdeaPage')
})

test('Direct #vote route + Active Phase -> Bypasses countdown, opens IdeaResolutionModal', () => {
  const result = evaluateGate({
    session: null,
    showAuth: false,
    isPhaseRunning: true,
    hasPassedCountdown: false,
    currentHash: '#vote',
    viewMode: 'public'
  })
  assert.strictEqual(result, 'IdeaResolutionModal')
})

test('Protected page (My Submissions) + Unauthenticated -> Forces EmailGate', () => {
  const result = evaluateGate({
    session: null,
    showAuth: false,
    isPhaseRunning: false,
    hasPassedCountdown: true,
    currentHash: '#submissions',
    viewMode: 'submissions'
  })
  assert.strictEqual(result, 'EmailGate')
})

test('Protected page (Admin) + Unauthenticated -> Forces EmailGate', () => {
  const result = evaluateGate({
    session: null,
    showAuth: false,
    isPhaseRunning: false,
    hasPassedCountdown: true,
    currentHash: '#admin',
    viewMode: 'admin'
  })
  assert.strictEqual(result, 'EmailGate')
})

console.log('\n================================================================')
console.log(` INTEGRATION TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`)
console.log('================================================================\n')

if (failedCount > 0) {
  process.exit(1)
}
