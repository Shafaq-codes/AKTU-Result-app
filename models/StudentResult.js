const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  code: { type: String, default: '' },
  name: { type: String, default: '' },
  type: { type: String, default: 'Theory' },
  internal: { type: mongoose.Schema.Types.Mixed, default: '--' },
  external: { type: mongoose.Schema.Types.Mixed, default: '--' },
  backPaper: { type: String, default: '--' },
  grade: { type: String, default: '--' }
}, { _id: false });

const SemesterSchema = new mongoose.Schema({
  semesterId: { type: mongoose.Schema.Types.Mixed, default: '' },
  evenOdd: { type: String, default: '' },
  totalSubjects: { type: mongoose.Schema.Types.Mixed, default: '' },
  theorySubjects: { type: mongoose.Schema.Types.Mixed, default: '' },
  practicalSubjects: { type: mongoose.Schema.Types.Mixed, default: '' },
  totalMarksObtained: { type: mongoose.Schema.Types.Mixed, default: '' },
  resultStatus: { type: String, default: '' },
  sgpa: { type: mongoose.Schema.Types.Mixed, default: '' },
  dateOfDeclaration: { type: String, default: '' },
  declared: { type: Boolean, default: true },
  subjects: [SubjectSchema]
}, { _id: false });

const SessionSchema = new mongoose.Schema({
  sessionName: { type: String, default: '' },
  sessionTitle: { type: String, default: '' },
  semText: { type: String, default: '' },
  semestersText: { type: String, default: '' },
  marksText: { type: String, default: '' },
  copText: { type: String, default: '' },
  oddSemester: { type: mongoose.Schema.Types.Mixed, default: null },
  evenSemester: { type: mongoose.Schema.Types.Mixed, default: null },
  semesterList: [SemesterSchema]
}, { _id: false, strict: false });

const StudentResultSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, index: true },
  studentInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
  sessions: [SessionSchema],
  searchCount: { type: Number, default: 1 },
  lastSearchedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  strict: false
});

module.exports = mongoose.models.StudentResult || mongoose.model('StudentResult', StudentResultSchema);
