const mongoose = require('mongoose');

const SearchLogSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, index: true },
  status: { type: String, default: 'SUCCESSFUL', index: true },
  studentName: { type: String, default: '--' },
  college: { type: String, default: '--' },
  dob: { type: String, default: '--' },
  ip: { type: String, default: '127.0.0.1' },
  timestamp: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true
});

module.exports = mongoose.models.SearchLog || mongoose.model('SearchLog', SearchLogSchema);
