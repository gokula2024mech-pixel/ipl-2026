const dotenv = require('dotenv')
const path = require('path')
const { supabase, BUCKET_NAME } = require('./supabaseClient')

dotenv.config({ path: path.join(__dirname, '.env') })

async function testSupabaseConnection() {
  console.log('================================')
  console.log('Supabase Connection Test')
  console.log('================================')

  const url = (process.env.SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

  if (!url) {
    console.error('❌ SUPABASE_URL is missing in backend/.env')
    process.exit(1)
  }
  console.log('Supabase URL: configured')

  if (!key) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing in backend/.env')
    process.exit(1)
  }
  
  if (key.startsWith('sb_publ')) {
    console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY starts with "sb_publ" (Publishable Key).')
    console.warn('⚠️ Service role operations (like uploading to private storage buckets) require the secret "service_role" key from Supabase Dashboard -> Settings -> API -> service_role secret.')
  } else {
    console.log('Service Role Key: configured')
  }

  try {
    // 1. Test database connection
    const { data, error } = await supabase
      .from('registrations')
      .select('id', { head: true, count: 'exact' })

    if (error) {
      if (error.message && error.message.includes('relation "public.registrations" does not exist')) {
        console.error('❌ Database: connected, BUT table public.registrations does NOT exist.')
        console.error('👉 ACTION REQUIRED: Execute supabase_schema.sql in Supabase Dashboard -> SQL Editor.')
        process.exit(1)
      } else {
        console.error('❌ Database connection error:', error.message)
        process.exit(1)
      }
    }
    console.log('Database: connected')
    console.log('Registrations table: accessible')

    // 2. Test Storage Bucket access
    const { data: bucketData, error: bucketError } = await supabase.storage.getBucket(BUCKET_NAME)
    if (bucketError) {
      console.warn(`⚠️ Storage bucket '${BUCKET_NAME}' warning:`, bucketError.message)
    } else {
      console.log(`Storage bucket '${BUCKET_NAME}': verified (private=${!bucketData.public})`)
    }

    console.log('================================')
    console.log('SUCCESS')
    console.log('================================')
    process.exit(0)
  } catch (err) {
    console.error('❌ Unexpected test failure:', err.message)
    process.exit(1)
  }
}

testSupabaseConnection()
