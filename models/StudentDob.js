const mongoose = require('mongoose');

const StudentDobSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, index: true },
  dob: { type: String, required: true },
  name: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'manual_input' },
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.models.StudentDob || mongoose.model('StudentDob', StudentDobSchema);
