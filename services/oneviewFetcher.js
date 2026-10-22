const axios = require('axios');
const storageService = require('./storageService');

/**
 * Maps target schema from akturesultdesk.vercel.app to our internal OneView marksheet schema
 */
function parseSemesterNumber(val) {
  if (!val) return 1;
  const str = String(val).trim().toUpperCase();
  if (str === 'I' || str === 'SEM 1' || str === '1') return 1;
  if (str === 'II' || str === 'SEM 2' || str === '2') return 2;
  if (str === 'III' || str === 'SEM 3' || str === '3') return 3;
  if (str === 'IV' || str === 'SEM 4' || str === '4') return 4;
  if (str === 'V' || str === 'SEM 5' || str === '5') return 5;
  if (str === 'VI' || str === 'SEM 6' || str === '6') return 6;
  if (str === 'VII' || str === 'SEM 7' || str === '7') return 7;
  if (str === 'VIII' || str === 'SEM 8' || str === '8') return 8;
  const num = parseInt(str.replace(/[^0-9]/g, ''));
  return isNaN(num) ? 1 : num;
}

function buildSemesterObj(sem) {
  if (!sem) return null;
  const semNum = parseSemesterNumber(sem.semester);
  const isOdd = sem.evenOdd ? sem.evenOdd.toLowerCase().includes('odd') : (semNum % 2 !== 0);
  return {
    semesterId: sem.semester || String(semNum),
    evenOdd: sem.evenOdd || (isOdd ? 'Odd' : 'Even'),
    totalSubjects: (sem.subjects || []).length,
    theorySubjects: (sem.subjects || []).filter(sub => (sub.type || 'Theory').toLowerCase() === 'theory').length,
    practicalSubjects: (sem.subjects || []).filter(sub => (sub.type || '').toLowerCase() === 'practical').length,
    totalMarksObtained: sem.totalMarksObtained || sem.totalMarksObt || '',
    resultStatus: sem.resultStatus || '',
    sgpa: sem.sgpa || '',
    dateOfDeclaration: sem.dateOfDeclaration || sem.declarationDate || '',
    declared: true,
    subjects: (sem.subjects || []).map(sub => ({
      code: sub.code || '',
      name: sub.name || '',
      type: sub.type || '',
      internal: sub.internal !== undefined ? String(sub.internal) : '',
      external: sub.external !== undefined ? String(sub.external) : '',
      backPaper: sub.backPaper || '--',
      grade: sub.grade || '--'
    }))
  };
}

/**
 * Maps target schema to our internal OneView marksheet schema
 */
function mapTargetSchemaToOurSchema(targetData) {
  const { studentInfo, semesters } = targetData;
  if (!studentInfo || !semesters) {
    throw new Error('Invalid target response schema.');
  }

  const sessionsMap = {};
  semesters.forEach(sem => {
    const sName = sem.session || 'Regular';
    if (!sessionsMap[sName]) {
      sessionsMap[sName] = [];
    }
    sessionsMap[sName].push(sem);
  });

  const sessions = Object.keys(sessionsMap).map(sessionName => {
    const sems = sessionsMap[sessionName];
    let oddSem = sems.find(s => {
      const num = parseSemesterNumber(s.semester);
      return (s.evenOdd && s.evenOdd.toLowerCase().includes('odd')) || (num % 2 !== 0);
    });
    let evenSem = sems.find(s => {
      const num = parseSemesterNumber(s.semester);
      return (s.evenOdd && s.evenOdd.toLowerCase().includes('even')) || (num % 2 === 0);
    });

    if (!oddSem && !evenSem && sems.length > 0) {
      oddSem = sems[0];
      if (sems.length > 1) evenSem = sems[1];
    } else if (oddSem && !evenSem && sems.length > 1) {
      evenSem = sems.find(s => s !== oddSem);
    } else if (!oddSem && evenSem && sems.length > 1) {
      oddSem = sems.find(s => s !== evenSem);
    }

    const oddSemesterObj = buildSemesterObj(oddSem);
    const evenSemesterObj = buildSemesterObj(evenSem);

    const cops = [];
    sems.forEach(s => {
      (s.subjects || []).forEach(sub => {
        const isBack = sub.backPaper && sub.backPaper.trim() !== '--' && sub.backPaper.trim() !== '';
        if (isBack || sub.grade === 'F') {
          cops.push(sub.code);
        }
      });
    });
    const copText = cops.length > 0 ? `COP: ${cops.join(', ')}` : 'N/A';

    const semIds = sems.map(s => s.semester).sort((a, b) => parseInt(a) - parseInt(b));
    const semText = semIds.join(', ');

    const latestSem = [...sems].sort((a, b) => parseInt(b.semester) - parseInt(a.semester))[0];
    const marksText = latestSem ? (latestSem.resultStatus || 'N/A') : 'N/A';

    return {
      sessionName,
      sessionTitle: sessionName,
      semText,
      semestersText: semText,
      marksText,
      copText,
      oddSemester: oddSemesterObj,
      evenSemester: evenSemesterObj,
      semesterList: [oddSemesterObj, evenSemesterObj].filter(Boolean)
    };
  });

  sessions.sort((a, b) => a.sessionName.localeCompare(b.sessionName));

  return {
    studentInfo: {
      name: studentInfo.name || '',
      hindiName: studentInfo.hindiName || '',
      rollNo: studentInfo.rollNo || '',
      enrollmentNo: studentInfo.enrollmentNo || '',
      course: studentInfo.course || '',
      branch: studentInfo.branch || '',
      institute: studentInfo.institute || '',
      fatherName: studentInfo.fatherName || '',
      gender: studentInfo.gender || ''
    },
    sessions
  };
}

/**
 * Fetch result for rollNo with auto-saved MongoDB integration
 */
async function fetchStudentResult(rollNo, options = {}) {
  const cleanRoll = String(rollNo).trim();
  console.log(`[ResultFetcher] Searching for roll number: ${cleanRoll}`);

  // 1. Check local / MongoDB cache first for high performance
  const cachedResult = await storageService.findStudentResult(cleanRoll);
  if (cachedResult && cachedResult.studentInfo) {
    console.log(`[ResultFetcher] Cache hit for ${cleanRoll}`);
    await storageService.logSearch({
      rollNo: cleanRoll,
      status: 'Success (Cached)',
      studentName: cachedResult.studentInfo.name || '',
      college: cachedResult.studentInfo.institute || ''
    });
    return {
      success: true,
      source: 'cache',
      data: cachedResult
    };
  }

  // 2. Fetch from live API
  try {
    console.log(`[ResultFetcher] Querying upstream API for ${cleanRoll}...`);
    const resp = await axios.post(
      'https://akturesultdesk.vercel.app/api/fetch-result',
      { rollNo: cleanRoll },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      }
    );

    if (resp.status === 200 && resp.data && resp.data.studentInfo && resp.data.semesters) {
      console.log(`[ResultFetcher] Successfully retrieved live result for ${cleanRoll}`);
      const mappedData = mapTargetSchemaToOurSchema(resp.data);

      // Save complete marksheet to MongoDB
      await storageService.saveStudentResult(mappedData);

      // Log success in SearchLog
      await storageService.logSearch({
        rollNo: cleanRoll,
        status: 'Success (Live Scraped)',
        studentName: mappedData.studentInfo.name || '',
        college: mappedData.studentInfo.institute || ''
      });

      return {
        success: true,
        source: 'live',
        data: mappedData
      };
    }
  } catch (apiErr) {
    console.warn(`[ResultFetcher] Upstream live API fetch failed: ${apiErr.message}`);
  }

  // 3. Fallback: check if roll exists in our pre-seeded DOB database to return basic record
  const studentDobInfo = storageService.findDob(cleanRoll);
  if (studentDobInfo) {
    console.log(`[ResultFetcher] Roll found in DOB registry: ${studentDobInfo.name}`);
    const basicRecord = {
      studentInfo: {
        name: studentDobInfo.name || 'Student',
        hindiName: '',
        rollNo: cleanRoll,
        enrollmentNo: '',
        course: 'B.Tech',
        branch: 'Computer Science and Engineering',
        institute: 'Faculty of Engineering & Technology',
        fatherName: '',
        gender: ''
      },
      sessions: []
    };

    await storageService.logSearch({
      rollNo: cleanRoll,
      status: 'Pending Live Update',
      studentName: studentDobInfo.name || '',
      college: 'AKTU Affiliated College'
    });

    return {
      success: true,
      source: 'dob_registry',
      dob: studentDobInfo.dob,
      data: basicRecord
    };
  }

  // If not found anywhere, log failure
  await storageService.logSearch({
    rollNo: cleanRoll,
    status: 'Failed (Not Found)',
    studentName: 'Unknown',
    college: 'N/A'
  });

  return {
    success: false,
    error: `Result not available for Roll Number ${cleanRoll}. Please check roll number or try again later.`
  };
}

module.exports = {
  fetchStudentResult,
  mapTargetSchemaToOurSchema
};
