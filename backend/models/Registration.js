const mongoose = require('mongoose')

const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
  },
  { _id: false }
)

const optionalMemberSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    mobile: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
  },
  { _id: false }
)

const facultyMentorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
  },
  { _id: false }
)

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String, default: '' },
    storedName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    path: { type: String, default: '' },
  },
  { _id: false }
)

const registrationSchema = new mongoose.Schema(
  {
    registrationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    teamLeader: {
      type: memberSchema,
      required: true,
    },
    member2: {
      type: memberSchema,
      required: true,
    },
    member3: {
      type: memberSchema,
      required: true,
    },
    member4: {
      type: optionalMemberSchema,
      default: () => ({ name: '', email: '', mobile: '', department: '' }),
    },
    facultyMentor: {
      type: facultyMentorSchema,
      required: true,
    },
    innovationDomain: {
      type: String,
      required: true,
      trim: true,
    },
    projectTitle: {
      type: String,
      required: true,
      trim: true,
    },
    problemArea: {
      type: String,
      required: true,
      trim: true,
    },
    proposedSolution: {
      type: String,
      required: true,
      trim: true,
    },
    expectedImpact: {
      type: String,
      required: true,
      trim: true,
    },
    file: {
      type: fileSchema,
      default: null,
    },
    declarationAccepted: {
      type: Boolean,
      required: true,
      validate: {
        validator: function (v) {
          return v === true
        },
        message: 'Declaration must be accepted.',
      },
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('Registration', registrationSchema)
