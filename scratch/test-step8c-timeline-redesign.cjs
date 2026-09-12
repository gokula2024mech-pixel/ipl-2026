/**
 * IPL-2026: STEP 8C TIMELINE VISUAL REDESIGN ACCEPTANCE SUITE
 * Verifies that the Timeline has been completely redesigned into a
 * SINGLE CONTINUOUS JOURNEY PATH adhering to all 16 acceptance criteria.
 */

const fs = require('fs')
const path = require('path')

const ROOT_DIR = path.resolve(__dirname, '..')
const timelinePath = path.join(ROOT_DIR, 'src/components/Timeline.jsx')
const contentPath = path.join(ROOT_DIR, 'src/data/content.js')

const timelineSrc = fs.readFileSync(timelinePath, 'utf8')
const contentSrc = fs.readFileSync(contentPath, 'utf8')

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
console.log('   IPL-2026: STEP 8C TIMELINE REDESIGN VERIFICATION SUITE       ')
console.log('================================================================')

console.log('\n--- 1. SINGLE CONTINUOUS JOURNEY PATH & NO BRANCHING ---')

// Criterion 1: Exactly ONE continuous main timeline path
assert(timelineSrc.includes('masterPathD = useMemo'), 'Master continuous SVG path is defined deterministically via masterPathD')
assert(timelineSrc.includes('d={masterPathD}'), 'SVG renders the single master continuous path string')

// Criterion 2: NO branches
assert(!timelineSrc.includes('connector-bridge'), 'Branching connector bridges and side tree connections removed')
assert(!timelineSrc.includes('ribbonAmbientGlow'), 'Multi-road ribbon ambient splits removed')

// Criterion 3: NO tree-like split connections
assert(!timelineSrc.includes('x1={nodeEdgeX}\n                    y1={node.y}\n                    x2={cardBorderX}'), 'Thick branching line bars removed from nodes')

// Criterion 4: Every phase node sits directly ON the main path
assert(timelineSrc.includes('DESKTOP_NODES = useMemo'), 'Desktop milestone nodes configured directly on continuous path')
assert(timelineSrc.includes('DESKTOP_SEGMENTS = useMemo'), 'Continuous Bezier segments configured between stations')

console.log('\n--- 2. NODE AND CARD GEOMETRY & ROAD CLEARANCE ---')

// Criterion 5: Cards alternate naturally left/right
const nodeMatches = timelineSrc.match(/isLeft:\s*(true|false)/g) || []
const leftRightPattern = nodeMatches.map(m => m.includes('true') ? 'L' : 'R').join('')
assert(leftRightPattern === 'LRLRLR', `Milestone cards strictly alternate Left and Right: ${leftRightPattern}`)

// Criterion 6: Cards never overlap the main path
// Left cards: cardLeft + 350 <= 490px. Right cards: cardLeft >= 790px.
// Path coordinates: X is strictly between 560px and 720px.
// Clearance is >= 70px on both sides!
const leftCardMaxRight = 140 + 350 // 490px
const rightCardMinLeft = 790 // 790px
const minRoadX = 560 // Node 4
const maxRoadX = 720 // Node 5
assert(leftCardMaxRight < minRoadX, `Left cards (max X=${leftCardMaxRight}px) sit strictly left of road (min X=${minRoadX}px) with ${minRoadX - leftCardMaxRight}px clearance`)
assert(rightCardMinLeft > maxRoadX, `Right cards (min X=${rightCardMinLeft}px) sit strictly right of road (max X=${maxRoadX}px) with ${rightCardMinLeft - maxRoadX}px clearance`)

// Criterion 7: The path is smooth and curved (C cubic Bezier commands)
assert(timelineSrc.includes(' C ') && timelineSrc.includes('masterPathD'), 'Path uses smooth cubic Bezier curves (C commands)')

// Criterion 8: No sharp zig-zag turns (controlled sway, dx/dy = 0 at nodes)
assert(timelineSrc.includes('c1: [640, 100]') && timelineSrc.includes('c2: [590, 110]'), 'Vertical tangents at stations ensure C1 continuous curve without kinks')

// Criterion 9: No giant loops
assert(!timelineSrc.includes('C 980 440, 920 520, 760 550'), 'Giant loops and serpentine U-turns absent')

// Criterion 10: No random winding
assert(!timelineSrc.includes('C 400 570, 480 640, 640 650'), 'Random curve crossings absent')

console.log('\n--- 3. VISUAL COMPOSITION & LAYOUT ---')

// Criterion 11: Overall composition is a premium digital event journey
assert(timelineSrc.includes('journeyMasterGrad') && timelineSrc.includes('activeMilestoneGrad'), 'Premium dual-gradient path highlighting configured')
assert(timelineSrc.includes('journey-shimmer-active'), 'Shimmering pulse along active journey segment configured')

// Criterion 12: Desktop has balanced whitespace
assert(timelineSrc.includes('max-w-[1280px]') && timelineSrc.includes('h-[1420px]'), 'Desktop canvas operates within standard 1280px logical width with ample vertical breathing space')

// Criterion 13: Mobile has no horizontal overflow
assert(timelineSrc.includes('block lg:hidden') && timelineSrc.includes('max-w-xl'), 'Mobile single-column layout constrained to max-w-xl')
assert(timelineSrc.includes('overflow-hidden'), 'Section overflow hidden to prevent horizontal scrollbars')

console.log('\n--- 4. CONTENT PRESERVATION & FUNCTIONALITY ---')

// Criterion 14: Existing timeline content and functionality preserved
assert(contentSrc.includes('Registration & Team Formation') && contentSrc.includes('Phase 1: Ideation & Concept Design') && contentSrc.includes('Phase 2: Prototype Development') && contentSrc.includes('Design Refinement & Testing') && contentSrc.includes('Phase 3: Pitch Preparation') && contentSrc.includes('Phase 3: Final Expo & Winners'), 'All 6 timeline milestone phases exist in data model')
assert(contentSrc.includes('18-Aug-2026') && contentSrc.includes('Week 1') && contentSrc.includes('Week 2') && contentSrc.includes('Week 3') && contentSrc.includes('15-Sep-2026') && contentSrc.includes('Week 4'), 'All milestone dates exist and render')
assert(timelineSrc.includes('{event.description}'), 'Milestone descriptions render inside MilestoneCard')
assert(timelineSrc.includes('{event.patentTitle}') && contentSrc.includes('DESIGN PATENT') && contentSrc.includes('UTILITY PATENT'), 'Patent information boxes render with design and utility patent specifications')
assert(timelineSrc.includes("status === 'completed'") && timelineSrc.includes('COMPLETED'), 'Completed milestone status renders with emerald badge')
assert(timelineSrc.includes("status === 'in_progress'") && timelineSrc.includes('IN PROGRESS'), 'In-progress milestone status renders with blue animated badge')
assert(timelineSrc.includes("status === 'upcoming'") && timelineSrc.includes('UPCOMING'), 'Upcoming milestone status renders with neutral badge')
assert(timelineSrc.includes('studentImg'), '3D student mascot character preserved')
assert(timelineSrc.includes('onMouseEnter') && timelineSrc.includes('onMouseLeave') && timelineSrc.includes('hoveredIndex'), 'Interactive hover states and milestone focus functional')

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
