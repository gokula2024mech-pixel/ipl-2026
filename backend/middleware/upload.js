const multer = require('multer')
const path = require('path')

// Use in-memory storage so uploaded files are directly sent to Supabase Storage without saving on disk
const storage = multer.memoryStorage()

// Allowed extension list
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.ppt', '.pptx']

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

// Strict File filter function validating both extension and MIME type
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase()
  const mimeType = (file.mimetype || '').toLowerCase()

  const extMatch = ALLOWED_EXTENSIONS.includes(ext)
  const mimeMatch = ALLOWED_MIME_TYPES.includes(mimeType)

  if (extMatch && mimeMatch) {
    cb(null, true)
  } else {
    cb(
      new Error(
        'Invalid file type. Allowed formats: PDF, PNG, JPG, JPEG, PPT, PPTX'
      ),
      false
    )
  }
}

// Multer upload instance with 10 MB limit and memoryStorage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum file size
  },
  fileFilter: fileFilter,
})

module.exports = upload
