const axios = require('axios');
const storageService = require('./storageService');

/**
 * Maps target schema from akturesultdesk.vercel.app to our internal OneView marksheet schema
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
    const oddSem = sems.find(s => s.evenOdd && (s.evenOdd.toLowerCase() === 'odd' || parseInt(s.semester) % 2 !== 0));
    const evenSem = sems.find(s => s.evenOdd && (s.evenOdd.toLowerCase() === 'even' || parseInt(s.semester) % 2 === 0));

    const oddSemesterObj = oddSem ? {
      semesterId: oddSem.semester,
      evenOdd: oddSem.evenOdd || 'Odd',
      totalSubjects: (oddSem.subjects || []).length,
      theorySubjects: (oddSem.subjects || []).filter(sub => sub.type === 'Theory').length,
      practicalSubjects: (oddSem.subjects || []).filter(sub => sub.type === 'Practical').length,
      totalMarksObtained: oddSem.totalMarksObt || '',
      resultStatus: oddSem.resultStatus || '',
      sgpa: oddSem.sgpa || '',
      dateOfDeclaration: oddSem.declarationDate || '',
      declared: true,
      subjects: (oddSem.subjects || []).map(sub => ({
        code: sub.code || '',
        name: sub.name || '',
        internal: sub.internal !== undefined ? String(sub.internal) : '',
        external: sub.external !== undefined ? String(sub.external) : '',
        backPaper: sub.backPaper || '--',
        grade: sub.grade || '--'
      }))
    } : null;

    const evenSemesterObj = evenSem ? {
      semesterId: evenSem.semester,
      evenOdd: evenSem.evenOdd || 'Even',
      totalSubjects: (evenSem.subjects || []).length,
      theorySubjects: (evenSem.subjects || []).filter(sub => sub.type === 'Theory').length,
      practicalSubjects: (evenSem.subjects || []).filter(sub => sub.type === 'Practical').length,
      totalMarksObtained: evenSem.totalMarksObt || '',
      resultStatus: evenSem.resultStatus || '',
      sgpa: evenSem.sgpa || '',
      dateOfDeclaration: evenSem.declarationDate || '',
      declared: true,
      subjects: (evenSem.subjects || []).map(sub => ({
        code: sub.code || '',
        name: sub.name || '',
        internal: sub.internal !== undefined ? String(sub.internal) : '',
        external: sub.external !== undefined ? String(sub.external) : '',
        backPaper: sub.backPaper || '--',
        grade: sub.grade || '--'
      }))
    } : null;

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
      semText,
      marksText,
      copText,
      oddSemester: oddSemesterObj,
      evenSemester: evenSemesterObj
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
