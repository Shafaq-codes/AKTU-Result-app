const mongoose = require('mongoose');

const WrongDobAttemptSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, index: true },
  attemptedDob: { type: String, required: true },
  ip: { type: String, default: '127.0.0.1' },
  source: { type: String, default: 'App User' },
  timestamp: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true
});

module.exports = mongoose.models.WrongDobAttempt || mongoose.model('WrongDobAttempt', WrongDobAttemptSchema);
