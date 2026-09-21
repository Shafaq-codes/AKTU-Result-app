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
  sessionTitle: { type: String, default: '' },
  semestersText: { type: String, default: '' },
  marksText: { type: String, default: '' },
  copText: { type: String, default: '' },
  semesterList: [SemesterSchema]
}, { _id: false });

const StudentResultSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true, index: true },
  studentInfo: {
    name: { type: String, default: '--' },
    hindiName: { type: String, default: '--' },
    fatherName: { type: String, default: '--' },
    gender: { type: String, default: '--' },
    course: { type: String, default: '--' },
    branch: { type: String, default: '--' },
    institute: { type: String, default: '--' },
    enrollmentNo: { type: String, default: '--' },
    rollNo: { type: String, default: '' }
  },
  sessions: [SessionSchema],
  searchCount: { type: Number, default: 1 },
  lastSearchedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.models.StudentResult || mongoose.model('StudentResult', StudentResultSchema);
