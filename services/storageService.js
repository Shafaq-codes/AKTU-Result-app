const fs = require('fs');
const path = require('path');
const StudentResult = require('../models/StudentResult');
const SearchLog = require('../models/SearchLog');
const WrongDobAttempt = require('../models/WrongDobAttempt');
const StudentDob = require('../models/StudentDob');
const { getStatus } = require('../config/db');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const RESULTS_FILE = path.join(DATA_DIR, 'results_cache.json');
const STUDENTS_DB_FILE = path.join(DATA_DIR, 'students_db.json');
const LOGS_FILE = path.join(DATA_DIR, 'query_logs.json');
const DOB_FILE = path.join(DATA_DIR, 'students_dob.json');
const WRONG_DOB_FILE = path.join(DATA_DIR, 'wrong_dob_attempts.json');

// Helper to read local json
const readLocal = (filePath, defaultVal = {}) => {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultVal;
};

// Helper to write local json
const writeLocal = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
};

// In-memory / local caches
let localResults = readLocal(RESULTS_FILE, {});
let studentsDb = readLocal(STUDENTS_DB_FILE, {});
let localLogs = readLocal(LOGS_FILE, []);
let dobMap = {};

// Load DOB directory
const loadDobMap = () => {
  const list = readLocal(DOB_FILE, []);
  if (Array.isArray(list)) {
    list.forEach(item => {
      if (item.rollNumber && item.dob) {
        dobMap[item.rollNumber.trim()] = {
          dob: item.dob.trim(),
          name: item.name ? item.name.trim() : ''
        };
      }
    });
  }
  console.log(`📋 Loaded ${Object.keys(dobMap).length} student DOB mappings.`);
};
loadDobMap();

// Get DOB for a roll number (checks memory, studentsDb, and MongoDB)
const getStudentDob = async (rollNumber) => {
  const cleanRoll = (rollNumber || '').trim();
  if (!cleanRoll) return null;

  // 1. Check in-memory map
  if (dobMap[cleanRoll]) return dobMap[cleanRoll];

  // 2. Check students_db.json
  if (studentsDb[cleanRoll] && studentsDb[cleanRoll].dob) {
    dobMap[cleanRoll] = {
      dob: String(studentsDb[cleanRoll].dob).trim(),
      name: studentsDb[cleanRoll].studentInfo?.name || '',
      verified: true
    };
    return dobMap[cleanRoll];
  }

  // 3. Check MongoDB
  if (getStatus()) {
    try {
      const doc = await StudentDob.findOne({ rollNumber: cleanRoll }).lean();
      if (doc && doc.dob) {
        dobMap[cleanRoll] = {
          dob: doc.dob.trim(),
          name: doc.name || '',
          verified: doc.verified || false
        };
        return dobMap[cleanRoll];
      }
    } catch (e) {
      console.error('MongoDB find DOB error:', e.message);
    }
  }

  return null;
};

// Save student result to MongoDB and local JSON
const saveStudentResult = async (resultData) => {
  const rollNumber = resultData.studentInfo?.rollNo || resultData.rollNumber;
  if (!rollNumber) return null;

  // 1. Update local cache
  localResults[rollNumber] = {
    ...resultData,
    updatedAt: new Date().toISOString()
  };
  writeLocal(RESULTS_FILE, localResults);

  // 2. Save to MongoDB if connected
  if (getStatus()) {
    try {
      const existing = await StudentResult.findOne({ rollNumber });
      if (existing) {
        existing.studentInfo = resultData.studentInfo;
        existing.sessions = resultData.sessions;
        existing.searchCount = (existing.searchCount || 0) + 1;
        existing.lastSearchedAt = new Date();
        await existing.save();
        return existing;
      } else {
        const newDoc = new StudentResult({
          rollNumber,
          studentInfo: resultData.studentInfo,
          sessions: resultData.sessions,
          searchCount: 1,
          lastSearchedAt: new Date()
        });
        await newDoc.save();
        return newDoc;
      }
    } catch (mongoErr) {
      console.error('MongoDB Save Error (fallback to local cache):', mongoErr.message);
    }
  }

  return localResults[rollNumber];
};

// Get student result from MongoDB or local cache
const getStudentResult = async (rollNumber) => {
  const cleanRoll = (rollNumber || '').trim();

  // Try MongoDB first if connected
  if (getStatus()) {
    try {
      const doc = await StudentResult.findOne({ rollNumber: cleanRoll }).lean();
      if (doc) return doc;
    } catch (e) {
      console.error('MongoDB find error, checking local cache:', e.message);
    }
  }

  // Fallback to local cache
  if (localResults[cleanRoll]) return localResults[cleanRoll];
  if (studentsDb[cleanRoll]) return studentsDb[cleanRoll];
  return null;
};

// Log a search query
const logSearch = async ({ rollNumber, rollNo, status, studentName, college, dob, ip }) => {
  const actualRoll = (rollNo || rollNumber || '').trim();
  const logItem = {
    rollNo: actualRoll,
    rollNumber: actualRoll,
    status: status || 'SUCCESSFUL',
    studentName: studentName || '',
    college: college || '--',
    dob: dob || '--',
    ip: ip || '127.0.0.1',
    timestamp: new Date()
  };

  // 1. Push to local logs
  localLogs.unshift(logItem);
  if (localLogs.length > 500) localLogs.pop();
  writeLocal(LOGS_FILE, localLogs);

  // 2. Save to MongoDB if connected
  if (getStatus()) {
    try {
      const newLog = new SearchLog(logItem);
      await newLog.save();
    } catch (e) {
      console.error('MongoDB log error:', e.message);
    }
  }
};

// Get logs for Admin Dashboard
const getSearchLogs = async (limit = 100) => {
  if (getStatus()) {
    try {
      const logs = await SearchLog.find().sort({ timestamp: -1 }).limit(limit).lean();
      if (logs && logs.length > 0) return logs;
    } catch (e) {
      console.error('MongoDB fetch logs error, using local logs:', e.message);
    }
  }

  return localLogs.slice(0, limit);
};

// Get Admin dashboard metrics (Total, Today IST, Last 60 Mins)
const getMetrics = async () => {
  let totalSearches = 0;
  let todaySearches = 0;
  let last60MinsSearches = 0;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Today in IST
  const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const startOfDayIST = new Date(nowIST);
  startOfDayIST.setHours(0, 0, 0, 0);

  if (getStatus()) {
    try {
      totalSearches = await SearchLog.countDocuments();
      todaySearches = await SearchLog.countDocuments({ timestamp: { $gte: startOfDayIST } });
      last60MinsSearches = await SearchLog.countDocuments({ timestamp: { $gte: oneHourAgo } });
      return { totalSearches, todaySearches, last60MinsSearches };
    } catch (e) {
      console.error('MongoDB metrics error, calculating from local logs:', e.message);
    }
  }

  totalSearches = localLogs.length;
  localLogs.forEach(log => {
    const t = new Date(log.timestamp);
    if (t >= oneHourAgo) last60MinsSearches++;
    if (t >= startOfDayIST) todaySearches++;
  });

  return { totalSearches, todaySearches, last60MinsSearches };
};

// Local wrong DOB attempts
let localWrongDob = readLocal(WRONG_DOB_FILE, []);

// Save student DOB into local file, memory, and MongoDB
const saveStudentDob = async (rollNumber, dob, name = '', verified = false, source = 'manual_input') => {
  const cleanRoll = (rollNumber || '').trim();
  const cleanDob = (dob || '').trim();
  if (!cleanRoll || !cleanDob) return false;

  dobMap[cleanRoll] = {
    dob: cleanDob,
    name: (name || '').trim(),
    verified
  };

  const list = readLocal(DOB_FILE, []);
  const existingIdx = list.findIndex(item => (item.rollNumber || '').trim() === cleanRoll);
  if (existingIdx !== -1) {
    list[existingIdx].dob = cleanDob;
    if (name) list[existingIdx].name = name.trim();
    list[existingIdx].verified = verified;
  } else {
    list.push({
      rollNumber: cleanRoll,
      dob: cleanDob,
      name: (name || '').trim(),
      verified
    });
  }
  writeLocal(DOB_FILE, list);

  // Save to MongoDB if connected
  if (getStatus()) {
    try {
      await StudentDob.findOneAndUpdate(
        { rollNumber: cleanRoll },
        { 
          rollNumber: cleanRoll, 
          dob: cleanDob, 
          name: (name || '').trim(),
          verified,
          source,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (mongoErr) {
      console.error('MongoDB StudentDob Save Error:', mongoErr.message);
    }
  }

  console.log(`✅ Saved DOB for student: ${cleanRoll} -> ${cleanDob} (verified: ${verified}, source: ${source})`);
  return true;
};

// Log a wrong DOB attempt without saving it as student DOB
const logWrongDobAttempt = async ({ rollNumber, attemptedDob, ip, source = 'App User' }) => {
  const cleanRoll = (rollNumber || '').trim();
  const cleanDob = (attemptedDob || '').trim();
  if (!cleanRoll || !cleanDob) return null;

  const item = {
    rollNumber: cleanRoll,
    attemptedDob: cleanDob,
    ip: ip || '127.0.0.1',
    source: source || 'App User',
    timestamp: new Date()
  };

  localWrongDob.unshift(item);
  if (localWrongDob.length > 500) localWrongDob.pop();
  writeLocal(WRONG_DOB_FILE, localWrongDob);

  // Also log in general search log
  await logSearch({
    rollNo: cleanRoll,
    status: `Failed (Wrong DOB Attempted: ${cleanDob})`,
    dob: cleanDob,
    ip: ip || '127.0.0.1'
  });

  // Save to MongoDB if connected
  if (getStatus()) {
    try {
      const wrongDoc = new WrongDobAttempt(item);
      await wrongDoc.save();
    } catch (e) {
      console.error('MongoDB wrong DOB log error:', e.message);
    }
  }

  console.log(`⚠️ Logged Wrong DOB Attempt: Roll ${cleanRoll} -> DOB ${cleanDob}`);
  return item;
};

// Retrieve all wrong DOB attempts for reporting
const getWrongDobAttempts = async (limit = 100) => {
  if (getStatus()) {
    try {
      const docs = await WrongDobAttempt.find().sort({ timestamp: -1 }).limit(limit).lean();
      if (docs && docs.length > 0) return docs;
    } catch (e) {
      console.error('MongoDB get wrong DOB error, falling back to local file:', e.message);
    }
  }
  return localWrongDob.slice(0, limit);
};

// Clear all query logs
const clearLogs = async () => {
  localLogs = [];
  writeLocal(LOGS_FILE, localLogs);
  if (getStatus()) {
    try {
      await SearchLog.deleteMany({});
    } catch (e) {
      console.error('MongoDB clear logs error:', e.message);
    }
  }
};

module.exports = {
  getStudentDob,
  findDob: getStudentDob,
  saveStudentDob,
  logWrongDobAttempt,
  getWrongDobAttempts,
  saveStudentResult,
  getStudentResult,
  findStudentResult: getStudentResult,
  logSearch,
  getSearchLogs,
  getMetrics,
  clearLogs
};
