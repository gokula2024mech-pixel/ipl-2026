const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const registrationRoutes = require('./routes/registrationRoutes')

dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()

// Dynamic CORS configuration (development defaults + production/preview FRONTEND_URL)
const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.PREVIEW_FRONTEND_URL,
]
  .filter(Boolean)
  .flatMap(u => u.split(',').map(s => s.trim().replace(/\/+$/, '')))

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...configuredOrigins,
].filter(Boolean)

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like curl, postman, server-to-server)
      if (!origin) {
        return callback(null, true)
      }
      const normalizedOrigin = origin.trim().replace(/\/+$/, '')
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true)
      }
      return callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Mount API routes
app.use('/api', registrationRoutes)
app.use('/api', require('./routes/phase1Routes'))
app.use('/api/patents', require('./routes/patentRoutes'))
app.use('/api/voting', require('./routes/votingRoutes'))
app.use('/api/phase2', require('./routes/phase2Routes'))
app.use('/api/ideas', require('./routes/ideaRoutes'))
app.use('/api/analytics', require('./routes/analyticsRoutes'))
app.use('/api/admin/analytics', require('./routes/analyticsRoutes'))

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  })
})

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'IPL-2026 Supabase Backend Server Operational',
  })
})

// Centralized error handling middleware
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error_code: 'CORS_REJECTED',
      message: 'Origin not allowed by CORS policy'
    })
  }
  console.error('Unhandled Server Error:', err.message)
  res.status(500).json({
    success: false,
    message: 'An internal server error occurred',
  })
})

// Start Server on PORT (supports cloud hosting process.env.PORT)
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 IPL-2026 Backend running on port ${PORT}`)
})