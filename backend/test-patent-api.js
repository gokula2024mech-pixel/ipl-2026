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

  server.stdout.on('data', d => console.log('  [Server Out]:', d.toString().trim()))
  server.stderr.on('data', d => console.error('  [Server Err]:', d.toString().trim()))

  await sleep(3000)

  try {
    const base = 'http://localhost:5001/api'

    // 1. Health check
    console.log('\n--- Testing GET /api/health ---')
    const healthRes = await fetch(`${base}/health`)
    const healthData = await healthRes.json()
    console.log('  Health Status:', healthRes.status, healthData)
    if (healthRes.status !== 200 || !healthData.success) throw new Error('Health check failed')
    console.log('✓ Health check passed.')

    // 2. Templates endpoint
    console.log('\n--- Testing GET /api/patents/templates ---')
    const tmplRes = await fetch(`${base}/patents/templates`)
    const tmplData = await tmplRes.json()
    console.log('  Templates Status:', tmplRes.status, `(Count: ${tmplData.count})`)
    if (tmplRes.status !== 200 || !tmplData.success || tmplData.templates.length === 0) {
      throw new Error('Templates API failed')
    }
    console.log('✓ Dynamic templates API passed.')

    // 3. Structure endpoint
    console.log('\n--- Testing GET /api/patents/structure ---')
    const structRes = await fetch(`${base}/patents/structure?phase=phase%201`)
    const structData = await structRes.json()
    console.log('  Structure Status:', structRes.status, `(Departments: ${structData.departments?.length})`)
    if (structRes.status !== 200 || !structData.success) throw new Error('Structure API failed')
    console.log('✓ Dynamic structure discovery API passed.')

    // 4. Download template stream
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
