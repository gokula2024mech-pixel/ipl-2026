const { spawn } = require('child_process')
const path = require('path')

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function run() {
  console.log('====================================================')
  console.log('STARTING PATENT API INTEGRATION TESTS')
  console.log('====================================================')

  const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname),
    env: { ...process.env, PORT: '5001' }
  })

  let serverReady = false
  server.stdout.on('data', d => {
    const out = d.toString().trim()
    console.log('  [Server Out]:', out)
    if (out.includes('running on port')) serverReady = true
  })
  server.stderr.on('data', d => console.error('  [Server Err]:', d.toString().trim()))

  let waitCount = 0
  while (!serverReady && waitCount < 30) {
    await sleep(200)
    waitCount++
  }

  try {
    const base = 'http://localhost:5001/api'

    // 1. Health check
    console.log('\n--- Testing GET /api/health ---')
    const healthRes = await fetch(`${base}/health`)
    const healthData = await healthRes.json()
    console.log('  Health Status:', healthRes.status, healthData)
    if (healthRes.status !== 200 || !healthData.success) throw new Error('Health check failed')
    console.log('✓ Health check passed.')

    // 2. Templates endpoint (All)
    console.log('\n--- Testing GET /api/patents/templates ---')
    const tmplRes = await fetch(`${base}/patents/templates`)
    const tmplData = await tmplRes.json()
    console.log('  Templates Status:', tmplRes.status, `(Count: ${tmplData.count})`)
    if (tmplRes.status !== 200 || !tmplData.success || tmplData.templates.length === 0) {
      throw new Error('Templates API failed')
    }
    console.log('✓ Dynamic templates API passed.')

    // 2b. Templates filtered by Utility Patent Type
    console.log('\n--- Testing GET /api/patents/templates?patentType=Utility%20Patent ---')
    const utilRes = await fetch(`${base}/patents/templates?patentType=Utility%20Patent`)
    const utilData = await utilRes.json()
    console.log('  Utility Templates Status:', utilRes.status, `(Count: ${utilData.count})`)
    if (utilRes.status !== 200 || !utilData.success || utilData.count !== 4) {
      throw new Error('Utility filtered templates API failed')
    }
    console.log('✓ Utility patent templates filtering passed (4 templates returned).')

    // 2c. Templates filtered by Design Patent Type
    console.log('\n--- Testing GET /api/patents/templates?patentType=Design%20Patent ---')
    const designRes = await fetch(`${base}/patents/templates?patentType=Design%20Patent`)
    const designData = await designRes.json()
    console.log('  Design Templates Status:', designRes.status, `(Count: ${designData.count})`)
    if (designRes.status !== 200 || !designData.success || designData.count !== 0) {
      throw new Error('Design filtered templates API failed')
    }
    console.log('✓ Design patent templates filtering passed (0 templates currently in folder).')

    // 3. Structure endpoint
    console.log('\n--- Testing GET /api/patents/structure ---')
    const structRes = await fetch(`${base}/patents/structure?phase=phase%201`)
    const structData = await structRes.json()
    console.log('  Structure Status:', structRes.status, `(Departments: ${structData.departments?.length})`)
    if (structRes.status !== 200 || !structData.success) throw new Error('Structure API failed')
    console.log('✓ Dynamic structure discovery API passed.')

    // 4. Submissions endpoint
    console.log('\n--- Testing GET /api/patents/submissions ---')
    const subsRes = await fetch(`${base}/patents/submissions?teamId=IPL26-0247&category=Hardware&patentType=Design%20Patent`)
    const subsData = await subsRes.json()
    console.log('  Submissions Status:', subsRes.status, `(Count: ${subsData.count})`)
    if (subsRes.status !== 200 || !subsData.success) throw new Error('Submissions query API failed')
    console.log('✓ Team submissions query API passed.')

    // 5. Download template stream
    const sampleTmpl = tmplData.templates[0]
    console.log(`\n--- Testing GET /api/patents/templates/${sampleTmpl.id} (${sampleTmpl.name}) ---`)
    const dlRes = await fetch(`${base}/patents/templates/${sampleTmpl.id}`)
    console.log('  Download Status:', dlRes.status)
    console.log('  Content-Disposition:', dlRes.headers.get('content-disposition'))
    console.log('  Content-Type:', dlRes.headers.get('content-type'))
    if (dlRes.status !== 200) throw new Error('Template download failed')
    console.log('✓ Template stream API passed.')

    console.log('\n====================================================')
    console.log('🎉 ALL LIVE API ENDPOINT CHECKS PASSED!')
    console.log('====================================================')
  } finally {
    server.kill()
  }
}

run()
