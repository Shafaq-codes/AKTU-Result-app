require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');
const storageService = require('./services/storageService');
const { fetchStudentResult } = require('./services/oneviewFetcher');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'arshan45';

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Database (MongoDB or local cache fallback)
connectDB();

// --- ROUTES ---

// 1. Result Search API
app.post('/api/check-result', async (req, res) => {
  try {
    const rollNo = req.body && req.body.rollNo ? String(req.body.rollNo).trim() : '';
    if (!rollNo || rollNo.length < 5) {
      return res.status(400).json({ success: false, error: 'Valid Roll Number is required' });
    }

    const result = await fetchStudentResult(rollNo);
    if (result.success) {
      return res.json({
        success: true,
        source: result.source,
        dob: result.dob || null,
        data: result.data
      });
    } else {
      return res.status(404).json({
        success: false,
        error: result.error || 'Result not found'
      });
    }
  } catch (err) {
    console.error('Error in /api/check-result:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error while retrieving result' });
  }
});

// 2. Lookup Date of Birth for a Roll Number
app.get('/api/dob/:rollNo', (req, res) => {
  const rollNo = req.params.rollNo;
  const match = storageService.findDob(rollNo);
  if (match) {
    res.json({ success: true, ...match });
  } else {
    res.json({ success: false, message: 'DOB not found in local registry' });
  }
});

// 3. Save / Upsert Student Result explicitly to MongoDB
app.post('/api/save-result', async (req, res) => {
  try {
    let marksheetData = req.body;
    if (!marksheetData || !marksheetData.studentInfo || !marksheetData.studentInfo.rollNo) {
      return res.status(400).json({ success: false, error: 'Invalid marksheet payload' });
    }

    // If payload has semesters array, map to our sessions schema
    if (marksheetData.semesters && Array.isArray(marksheetData.semesters)) {
      const { mapTargetSchemaToOurSchema } = require('./services/oneviewFetcher');
      marksheetData = mapTargetSchemaToOurSchema(marksheetData);
    }

    const saved = await storageService.saveStudentResult(marksheetData);

    // If DOB was provided with the payload (e.g. valid manual DOB), save it for future lookups
    const roll = marksheetData.studentInfo.rollNo;
    const dob = req.body.dob || marksheetData.dob;
    if (dob) {
      storageService.saveStudentDob(roll, dob, marksheetData.studentInfo.name);
    }

    // Record in Search Log as live OneView scraped
    await storageService.logSearch({
      rollNo: roll,
      status: 'Success (Live OneView Scraped)',
      studentName: marksheetData.studentInfo.name || '',
      college: marksheetData.studentInfo.institute || ''
    });

    res.json({ success: true, data: saved });
  } catch (err) {
    console.error('Error saving result:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3.1 Save Verified DOB
app.post('/api/save-dob', (req, res) => {
  const { rollNo, dob, name } = req.body || {};
  if (!rollNo || !dob) {
    return res.status(400).json({ success: false, error: 'rollNo and dob are required' });
  }
  const saved = storageService.saveStudentDob(rollNo, dob, name);
  res.json({ success: saved });
});

// 3.2 Log Wrong DOB Attempt
app.post('/api/log-wrong-dob', async (req, res) => {
  try {
    const { rollNo, attemptedDob } = req.body || {};
    if (!rollNo || !attemptedDob) {
      return res.status(400).json({ success: false, error: 'rollNo and attemptedDob are required' });
    }
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    await storageService.logWrongDobAttempt({
      rollNumber: rollNo,
      attemptedDob,
      ip,
      source: 'App User'
    });
    res.json({ success: true, message: 'Wrong DOB attempt logged' });
  } catch (err) {
    console.error('Error logging wrong DOB:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Auth Middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  const validToken = 'admin_token_' + Buffer.from(ADMIN_PASSWORD).toString('base64');
  
  if (token === validToken || req.query.secret === ADMIN_PASSWORD) {
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Admin access required.' });
}

// 3.3 Admin List of Wrong DOB Attempts
app.get('/api/admin/wrong-dob', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const attempts = await storageService.getWrongDobAttempts(limit);
    res.json({ success: true, attempts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Admin Authentication (Password: arshan45)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password.trim() === ADMIN_PASSWORD) {
    // Return an admin token
    return res.json({
      success: true,
      token: 'admin_token_' + Buffer.from(ADMIN_PASSWORD).toString('base64'),
      message: 'Admin authenticated successfully'
    });
  }
  return res.status(401).json({ success: false, error: 'Incorrect Admin Password' });
});

// 5. Admin Metrics
app.get('/api/admin/metrics', requireAdmin, async (req, res) => {
  try {
    const metrics = await storageService.getMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Admin Query Server Logs (Without User tags)
app.get('/api/admin/logs', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await storageService.getSearchLogs(limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Admin Clear Logs
app.post('/api/admin/clear-logs', requireAdmin, async (req, res) => {
  try {
    await storageService.clearLogs();
    res.json({ success: true, message: 'Search logs cleared successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Hidden Admin Panel Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// 8.1 Direct APK File Download Handler (Force attachment and correct MIME type)
app.get(['/downloads/:filename', '/download/apk'], (req, res) => {
  const fs = require('fs');
  const filename = req.params.filename || 'aktu-result-app-v1.2.apk';
  let filePath = path.join(__dirname, 'public', 'downloads', filename);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'downloads', 'aktu-result-app-v1.2.apk');
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="aktu-result-app-v1.2.apk"');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

// 9. APK Download Landing Route
app.get('/download', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'download.html'));
});

// 10. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    time: new Date().toISOString(),
    name: 'AKTU Result App Server'
  });
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` AKTU Result App running on http://localhost:${PORT}`);
  console.log(` Admin Panel: http://localhost:${PORT}/admin (Password: ${ADMIN_PASSWORD})`);
  console.log(` Download Landing: http://localhost:${PORT}/download`);
  console.log(`=========================================`);

  // Keep-Alive Self Ping for Render (every 10 minutes)
  const https = require('https');
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://aktu-result-app.onrender.com';
  setInterval(() => {
    try {
      https.get(`${RENDER_EXTERNAL_URL}/api/health`, (res) => {
        // Keeps the instance warm
      }).on('error', () => {});
    } catch (e) {}
  }, 10 * 60 * 1000);
});
