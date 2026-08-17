const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const registrationRoutes = require('./routes/registrationRoutes')

dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()

// Dynamic CORS configuration (development defaults + production FRONTEND_URL)
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean)

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like curl, postman, server-to-server) or listed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        // Log & allow or restrict
        callback(null, true)
      }
    },
    credentials: true,
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Mount API routes
app.use('/api', registrationRoutes)

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'IPL-2026 Supabase Backend Server Operational',
  })
})

// Centralized error handling middleware
app.use((err, req, res, next) => {
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