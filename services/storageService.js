const fs = require('fs');
const path = require('path');
const StudentResult = require('../models/StudentResult');
const SearchLog = require('../models/SearchLog');
const { getStatus } = require('../config/db');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const RESULTS_FILE = path.join(DATA_DIR, 'results_cache.json');
const LOGS_FILE = path.join(DATA_DIR, 'query_logs.json');
const DOB_FILE = path.join(DATA_DIR, 'students_dob.json');

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

// Get DOB for a roll number
const getStudentDob = (rollNumber) => {
  const cleanRoll = (rollNumber || '').trim();
  return dobMap[cleanRoll] || null;
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
  return localResults[cleanRoll] || null;
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
  saveStudentResult,
  getStudentResult,
  findStudentResult: getStudentResult,
  logSearch,
  getSearchLogs,
  getMetrics,
  clearLogs
};
