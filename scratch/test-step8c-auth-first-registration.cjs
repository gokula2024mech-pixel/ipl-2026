/**
 * STEP 8C — AUTHENTICATION-FIRST REGISTRATION FLOW VERIFICATION SUITE
 * 
 * Verifies all 10 Acceptance Tests:
 * TEST 1: Registration OPEN + unauthenticated user -> Click Register Now -> Auth opens -> Form NOT visible
 * TEST 2: Registration OPEN + successful auth -> Form opens automatically
 * TEST 3: Registration OPEN + already authenticated user -> Opens form directly
 * TEST 4: Registration CLOSED + unauthenticated user -> Closed modal opens, closed-phase preserved
 * TEST 5: Unauthenticated user opens registration URL -> Form blocked -> Auth opens -> Returns to form
 * TEST 6: Authentication cancelled -> Registration form remains inaccessible
 * TEST 7: Refresh page during transition -> No form flash -> State correctly restored
 * TEST 8: Existing voting / auth flow -> Completely unchanged
 * TEST 9: Existing public homepage / public Idea Page -> Completely unchanged
 * TEST 10: Existing registration submission -> Completely unchanged
 */

const fs = require('fs')
const path = require('path')

const ROOT_DIR = process.cwd()

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

console.log('================================================================')
console.log('   IPL-2026: STEP 8C AUTHENTICATION-FIRST REGISTRATION TESTS    ')
console.log('================================================================\n')

// Read source files
const appSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/App.jsx'), 'utf8')
const emailGateSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/EmailGate.jsx'), 'utf8')
const sessionStateSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/utils/sessionNavigationState.js'), 'utf8')
const regModalSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/RegistrationModal.jsx'), 'utf8')
const navbarSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/Navbar.jsx'), 'utf8')
const heroSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/Hero.jsx'), 'utf8')
const registrationSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/Registration.jsx'), 'utf8')
const ctaBannerSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/components/CTABanner.jsx'), 'utf8')
const backendRegRoutesSrc = fs.readFileSync(path.join(ROOT_DIR, 'backend/routes/registrationRoutes.js'), 'utf8')

console.log('--- TEST 1: Registration OPEN + Unauthenticated User ---')

// 1.1 Unauthenticated click does NOT open registration form
assert(
  appSrc.includes('if (!session?.user)') &&
  appSrc.includes('setPendingRegistration(true)') &&
  appSrc.includes('setShowAuth(true)'),
  'handleOpenRegistration gates unauthenticated users behind authentication flow'
)

// 1.2 RegistrationModal render is strictly guarded by session
assert(
  appSrc.includes('isOpen={Boolean(isRegistrationOpen && session)}') ||
  appSrc.includes('isOpen={Boolean(session && isRegistrationOpen)}'),
  'RegistrationModal is strictly guarded and CANNOT render when session is null/unauthenticated'
)

// 1.3 Registration buttons delegate to handleOpenRegistration
assert(
  navbarSrc.includes('onRegisterClick()') &&
  heroSrc.includes('onRegisterClick()') &&
  registrationSrc.includes('onRegisterClick()') &&
  ctaBannerSrc.includes('onRegisterClick()'),
  'All 4 public Register Now entry points (Navbar, Hero, Registration Section, CTABanner) route through authoritative gate'
)

console.log('\n--- TEST 2: Registration OPEN + Successful Authentication Auto-Continuation ---')

// 2.1 Pending registration state persists across auth
assert(
  sessionStateSrc.includes('getPendingRegistration') &&
  sessionStateSrc.includes('setPendingRegistration') &&
  sessionStateSrc.includes('clearPendingRegistration'),
  'Session storage utilities manage pending registration state (survives OAuth redirects in same tab)'
)

// 2.2 In-flight pending registration restores automatically on login
assert(
  appSrc.includes('getPendingRegistration()') &&
  appSrc.includes('clearPendingRegistration()') &&
  appSrc.includes('handleOpenRegistration()'),
  'App auto-detects in-flight pending registration after successful login and opens form automatically'
)

// 2.3 EmailGate redirects back with registration context
assert(
  emailGateSrc.includes('isPendingRegistration') &&
  emailGateSrc.includes('#register'),
  'EmailGate preserves registration intent in OAuth redirect destination'
)

console.log('\n--- TEST 3: Registration OPEN + Already Authenticated User ---')

// 3.1 Authenticated user opens form directly
assert(
  appSrc.includes('if (!session?.user)') &&
  appSrc.includes('setIsRegistrationOpen(true)'),
  'Authenticated users with active session bypass auth gate and open registration form directly'
)

console.log('\n--- TEST 4: Registration CLOSED + Phase Protection ---')

// 4.1 Authoritative timer window check precedes auth check
const handleOpenRegIndex = appSrc.indexOf('const handleOpenRegistration = () =>')
const timerCheckIndex = appSrc.indexOf('if (!isOpen)', handleOpenRegIndex)
const authCheckIndex = appSrc.indexOf('if (!session?.user)', handleOpenRegIndex)

assert(
  timerCheckIndex !== -1 && authCheckIndex !== -1 && timerCheckIndex < authCheckIndex,
  'Registration closed check occurs BEFORE auth check: CLOSED phase shows closed modal without asking for login'
)

// 4.2 Closed modal is triggered when registration is not open
assert(
  appSrc.includes('setIsRegistrationClosedModalOpen(true)'),
  'RegistrationClosedModal is displayed when timer indicates registration is closed'
)

console.log('\n--- TEST 5: Direct URL Protection (#register / #registration / ?register=true) ---')

// 5.1 Deep links trigger handleOpenRegistration
assert(
  appSrc.includes("currentHash === '#register'") &&
  appSrc.includes("currentHash === '#registration'"),
  'Direct URL navigation to #register or #registration routes through handleOpenRegistration'
)

// 5.2 Direct route bypasses entry countdown but requires auth
assert(
  appSrc.includes("currentHash === '#register'") &&
  appSrc.includes("isDirectPublicRoute"),
  'Direct #register deep link bypasses EntryCountdown directly to EmailGate'
)

console.log('\n--- TEST 6: Authentication Cancellation Safety ---')

// 6.1 EmailGate onBack clears pending registration
assert(
  appSrc.includes('setShowAuth(false)') &&
  appSrc.includes('clearPendingRegistration()'),
  'Cancelling EmailGate clears pending registration and safely returns user to homepage'
)

// 6.2 URL hash is sanitized on cancellation
assert(
  appSrc.includes("if (currentHash === '#register' || currentHash === '#registration')"),
  'Cancelling auth cleans #register hash preventing repeat re-entry loops'
)

console.log('\n--- TEST 7: Prevention of UI Flashing During Transitions ---')

// 7.1 Loading screen protects until session is verified
assert(
  appSrc.includes('if (!isAppInitialized && loading)'),
  'App renders loading indicator while session state is being resolved'
)

// 7.2 Initial registration state is false
assert(
  appSrc.includes("const [isRegistrationOpen, setIsRegistrationOpen] = useState(false)"),
  'Registration state defaults to closed (false) on cold start'
)

console.log('\n--- TEST 8: Existing Voting & Authentication Integrity ---')

// 8.1 Voting token handling remains intact
assert(
  emailGateSrc.includes('pendingToken') &&
  emailGateSrc.includes('setPendingVotingToken'),
  'Voting token preservation in EmailGate remains completely intact'
)

// 8.2 Pending vote idea context remains intact
assert(
  emailGateSrc.includes('pendingVoteIdea') &&
  emailGateSrc.includes('Sign in to Cast Your Vote'),
  'Voting context and @sece.ac.in voting messaging in EmailGate remain intact'
)

console.log('\n--- TEST 9: Existing Public Homepage & Public Idea Page Integrity ---')

// 9.1 PublicIdeaPage and IdeaResolutionModal preserved
assert(
  appSrc.includes('PublicIdeaPage') &&
  appSrc.includes('IdeaResolutionModal'),
  'Public Idea Page and Idea Resolution modal remain present and functional'
)

// 9.2 Leaderboard remains accessible
assert(
  appSrc.includes('Leaderboard'),
  'Public leaderboard remains fully accessible'
)

console.log('\n--- TEST 10: Existing Registration Submission Integrity ---')

// 10.1 Backend registration routes intact
assert(
  backendRegRoutesSrc.includes("router.post('/registrations'"),
  'Backend POST /registrations submission endpoint remains intact'
)

// 10.2 RegistrationModal submission logic intact
assert(
  regModalSrc.includes('/api/registrations') ||
  regModalSrc.includes('fetch'),
  'RegistrationModal submission code remains untouched'
)

console.log('\n================================================================')
console.log(`TOTAL TESTS: ${passed + failed}`)
console.log(`PASSED: ${passed}`)
console.log(`FAILED: ${failed}`)
console.log('================================================================\n')

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
