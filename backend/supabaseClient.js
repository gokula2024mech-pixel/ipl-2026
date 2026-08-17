const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '.env') })

const supabaseUrl = (process.env.SUPABASE_URL || '').trim()
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from backend/.env')
} else if (supabaseServiceKey.startsWith('sb_publ')) {
  console.warn('⚠️ WARNING: SUPABASE_SERVICE_ROLE_KEY in backend/.env starts with "sb_publ" (Publishable Key).')
  console.warn('⚠️ Storage operations require the secret "service_role" key from Supabase Dashboard -> Settings -> API.')
}

// Server-side Supabase client using Service Role Key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

// Storage bucket name
const BUCKET_NAME = 'registration-documents'

/**
 * Optional helper to verify bucket existence without attempting creation.
 */
async function verifyBucketExists() {
  try {
    const { data: bucket, error } = await supabase.storage.getBucket(BUCKET_NAME)
    if (error) {
      console.warn(`[Supabase Storage] Bucket '${BUCKET_NAME}' check warning:`, error.message)
      return false
    }
    console.log(`[Supabase Storage] Verified bucket '${BUCKET_NAME}' exists.`)
    return true
  } catch (err) {
    console.warn(`[Supabase Storage] Bucket verification error:`, err.message)
    return false
  }
}

module.exports = {
  supabase,
  BUCKET_NAME,
  verifyBucketExists,
}
