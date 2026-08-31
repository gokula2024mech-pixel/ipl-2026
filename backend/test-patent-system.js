const dotenv = require('dotenv')
const path = require('path')
const http = require('http')
const googleDriveService = require('./services/googleDriveService')

dotenv.config({ path: path.join(__dirname, '.env') })

async function runTests() {
  console.log('====================================================')
  console.log('STARTING GOOGLE DRIVE PATENT SYSTEM VERIFICATION')
  console.log('====================================================')

  let passedChecks = 0
  let totalChecks = 0

  function assert(condition, message) {
    totalChecks++
    if (condition) {
      console.log(`✓ CHECK ${totalChecks} PASSED: ${message}`)
      passedChecks++
    } else {
      console.error(`✗ CHECK ${totalChecks} FAILED: ${message}`)
      throw new Error(`Assertion failed: ${message}`)
    }
  }

  try {
    // Check 1: Authentication & Identity
    console.log('\n--- 1. Testing Authentication & User Identity ---')
    const driveClient = googleDriveService.getDriveClient()
    const about = await driveClient.about.get({ fields: 'user(displayName, emailAddress)' })
    console.log('  Authenticated Email:', about.data.user?.emailAddress)
    console.log('  Display Name:', about.data.user?.displayName)
    assert(
      about.data.user?.emailAddress === 'gokul.a2024mech@sece.ac.in',
      `Authenticated as college account (gokul.a2024mech@sece.ac.in)`
    )

    // Check 2: Root Folder Access
    console.log('\n--- 2. Testing Root Folder Access ---')
    const rootId = googleDriveService.ROOT_FOLDER_ID
    console.log('  Root Folder ID:', rootId)
    assert(rootId === '1dWIKn-jEu8-BCZrpw8YAUTeKvoJy2R5H', 'Root folder ID is 1dWIKn-jEu8-BCZrpw8YAUTeKvoJy2R5H')

    const rootMeta = await googleDriveService.getFileMetadata(rootId)
    console.log('  Root Folder Name:', rootMeta.name)
    assert(rootMeta.name.toLowerCase() === 'ipl 2026', 'Root folder name is "ipl 2026"')

    // Check 3: Dynamic Template Listing
    console.log('\n--- 3. Testing Dynamic Template Listing ---')
    const templates = await googleDriveService.listTemplates()
    console.log(`  Found ${templates.length} templates in 'templetes' folder:`)
    templates.forEach(t => console.log(`  - [${t.name}] (ID: ${t.id}, Size: ${t.size} bytes)`))
    assert(templates.length >= 4, 'Templates listed dynamically from Drive (at least 4 found)')

    // Check 4: Template Validation & Streaming
    console.log('\n--- 4. Testing Template Validation & Streaming ---')
    const firstTemplate = templates[0]
    const validated = await googleDriveService.validateTemplate(firstTemplate.id)
    assert(validated && validated.name === firstTemplate.name, `Template validation succeeded for '${firstTemplate.name}'`)

    const { stream, metadata } = await googleDriveService.streamFile(firstTemplate.id)
    assert(metadata.name === firstTemplate.name, `Stream metadata retrieved for '${firstTemplate.name}'`)
    assert(typeof stream.pipe === 'function', 'Stream object is a readable stream')

    // Check 5: Phase Folder Discovery
    console.log('\n--- 5. Testing Phase Folder Discovery ---')
    const phase1Folder = await googleDriveService.getPhaseFolder('phase 1')
    console.log('  Discovered Phase 1 Folder ID:', phase1Folder.id, 'Name:', phase1Folder.name)
    assert(phase1Folder.id === '11qARJIKCPNhn4mCwe-5X2OeLJYl2x0g5', 'Phase 1 folder ID matches 11qARJIKCPNhn4mCwe-5X2OeLJYl2x0g5')

    // Check 6: Department Folder Discovery
    console.log('\n--- 6. Testing Department Folder Discovery ---')
    const mechDept = await googleDriveService.getDepartmentFolder(phase1Folder.id, 'Mechanical Engineering')
    console.log('  Discovered Mechanical Engineering Folder ID:', mechDept.id)
    assert(mechDept.id === '1mXY0HS_aZu1pD7nAfsYRn0OFJhA4BE-0', 'Mechanical Engineering ID matches 1mXY0HS_aZu1pD7nAfsYRn0OFJhA4BE-0')

    const itDept = await googleDriveService.getDepartmentFolder(phase1Folder.id, 'Information Technology')
    console.log('  Discovered Information Technology Folder ID:', itDept.id)
    assert(itDept.id === '1dWHJgY0xXJvFcpyJivr7KRXtTe8L_YNf', 'Information Technology ID matches 1dWHJgY0xXJvFcpyJivr7KRXtTe8L_YNf')

    // Check 7: Category (Hardware / Software) Discovery
    console.log('\n--- 7. Testing Category Discovery ---')
    const hwFolder = await googleDriveService.getCategoryFolder(mechDept.id, 'Hardware')
    console.log('  Hardware Folder ID:', hwFolder.id)
    assert(hwFolder.id === '1MV_JxHWntw72pd-0YmQU-FjZ2EAagUWT', 'Hardware folder resolved under Mechanical Engineering')

    const swFolder = await googleDriveService.getCategoryFolder(mechDept.id, 'Software')
    console.log('  Software Folder ID:', swFolder.id)
    assert(swFolder.id === '1gwlYinDUHdtwth1L4Y1ktDINzRnlo3Vt', 'Software folder resolved under Mechanical Engineering')

    // Check 8: Patent Type Discovery
    console.log('\n--- 8. Testing Patent Type Discovery ---')
    const designPatent = await googleDriveService.getPatentTypeFolder(hwFolder.id, 'Design Patent')
    console.log('  Design Patent Folder ID:', designPatent.id)
    assert(designPatent.id === '15mqaP_qdYK6nyciDYea_J9JeYHIcEtlp', 'Design Patent folder resolved under Hardware')

    const utilityPatent = await googleDriveService.getPatentTypeFolder(hwFolder.id, 'Utility Patent')
    console.log('  Utility Patent Folder ID:', utilityPatent.id)
    assert(utilityPatent.id === '19KFs1vRiMtZO2MN9maBr_7GH9sK65Mn5', 'Utility Patent folder resolved under Hardware')

    // Check 9: Team Folder Search / Resolution
    console.log('\n--- 9. Testing Team Folder Resolution Logic ---')
    const testTeamLookup = await googleDriveService.findFolderByName(designPatent.id, 'NON_EXISTENT_TEAM_TEST_XYZ')
    assert(testTeamLookup === null, 'Non-existent team folder returns null without throwing or creating duplicate')

    console.log('\n====================================================')
    console.log(`🎉 ALL ${passedChecks}/${totalChecks} TESTS PASSED SUCCESSFULLY!`)
    console.log('====================================================')
  } catch (err) {
    console.error('\n❌ Test execution stopped on failure:', err.message)
    process.exit(1)
  }
}

runTests()
