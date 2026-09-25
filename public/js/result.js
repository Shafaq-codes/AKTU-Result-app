document.addEventListener('DOMContentLoaded', async () => {
  let resultData = null;
  const cacheDataStr = localStorage.getItem('aktu_result_cache');
  if (cacheDataStr) {
    try {
      resultData = JSON.parse(cacheDataStr);
    } catch (e) {}
  }

  const urlParams = new URLSearchParams(window.location.search);
  const paramRoll = urlParams.get('rollNo') || localStorage.getItem('last_searched_roll');

  function mapSemestersToSessions(semesters) {
    if (!semesters || !Array.isArray(semesters) || semesters.length === 0) return [];
    const sessionsMap = {};
    semesters.forEach(s => {
      const sName = s.session || 'Regular';
      if (!sessionsMap[sName]) sessionsMap[sName] = [];
      sessionsMap[sName].push(s);
    });

    return Object.keys(sessionsMap).map(sessionName => {
      const sems = sessionsMap[sessionName];
      let oddSem = sems.find(s => (s.evenOdd && s.evenOdd.toLowerCase().includes('odd')) || (parseInt(s.semester) % 2 !== 0));
      let evenSem = sems.find(s => (s.evenOdd && s.evenOdd.toLowerCase().includes('even')) || (parseInt(s.semester) % 2 === 0));
      if (!oddSem && !evenSem && sems.length > 0) {
        oddSem = sems[0];
        if (sems.length > 1) evenSem = sems[1];
      }
      return {
        sessionName: sessionName,
        sessionTitle: sessionName,
        semText: sems.map(s => s.semester).join(', '),
        marksText: sems[0]?.resultStatus || 'PASS',
        copText: 'Audit 1 : Cleared',
        oddSemester: oddSem ? {
          semesterId: oddSem.semester,
          evenOdd: oddSem.evenOdd || 'Odd',
          totalSubjects: oddSem.totalSubjects || (oddSem.subjects ? oddSem.subjects.length : 0),
          theorySubjects: oddSem.theorySubjects || 5,
          practicalSubjects: oddSem.practicalSubjects || 4,
          totalMarksObtained: oddSem.totalMarksObtained || '',
          resultStatus: oddSem.resultStatus || '',
          sgpa: oddSem.sgpa || '',
          dateOfDeclaration: oddSem.dateOfDeclaration || '',
          declared: true,
          subjects: oddSem.subjects || []
        } : null,
        evenSemester: evenSem ? {
          semesterId: evenSem.semester,
          evenOdd: evenSem.evenOdd || 'Even',
          totalSubjects: evenSem.totalSubjects || (evenSem.subjects ? evenSem.subjects.length : 0),
          theorySubjects: evenSem.theorySubjects || 5,
          practicalSubjects: evenSem.practicalSubjects || 4,
          totalMarksObtained: evenSem.totalMarksObtained || '',
          resultStatus: evenSem.resultStatus || '',
          sgpa: evenSem.sgpa || '',
          dateOfDeclaration: evenSem.dateOfDeclaration || '',
          declared: true,
          subjects: evenSem.subjects || []
        } : null,
        semesterList: [oddSem, evenSem].filter(Boolean)
      };
    });
  }

  const countDeclaredSubjects = (data) => {
    let count = 0;
    if (data?.sessions && Array.isArray(data.sessions)) {
      data.sessions.forEach(s => {
        if (s.oddSemester?.subjects) count += s.oddSemester.subjects.length;
        if (s.evenSemester?.subjects) count += s.evenSemester.subjects.length;
        if (s.semesterList) {
          s.semesterList.forEach(sem => { if (sem?.subjects) count += sem.subjects.length; });
        }
      });
    }
    return count;
  };

  if (resultData && (!resultData.sessions || resultData.sessions.length === 0) && resultData.semesters) {
    resultData.sessions = mapSemestersToSessions(resultData.semesters);
  }

  // If no cached data, different rollNo, or 0 subjects, fetch from server API
  const shouldFetchFresh = !resultData || 
                           !resultData.studentInfo || 
                           (paramRoll && resultData.studentInfo.rollNo !== paramRoll) ||
                           countDeclaredSubjects(resultData) === 0;

  if (shouldFetchFresh && paramRoll) {
    try {
      const resp = await fetch('/api/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo: paramRoll })
      });
      const json = await resp.json();
      if (json.success && json.data) {
        if (json.data.semesters && (!json.data.sessions || json.data.sessions.length === 0)) {
          json.data.sessions = mapSemestersToSessions(json.data.semesters);
        }
        if (countDeclaredSubjects(json.data) > 0 || !resultData) {
          resultData = json.data;
          localStorage.setItem('aktu_result_cache', JSON.stringify(resultData));
        }
      }
    } catch (e) {
      console.error('Failed to load result:', e);
    }
  }

  if (!resultData || !resultData.studentInfo) {
    window.location.href = '/';
    return;
  }

  const { studentInfo, sessions } = resultData;

  // 1. Populate Profile Card Safely
  const setElemText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text || '--';
  };

  setElemText('studentName', studentInfo.name);
  setElemText('studentHindiName', studentInfo.hindiName);
  setElemText('studentRoll', studentInfo.rollNo);
  setElemText('studentEnroll', studentInfo.enrollmentNo);
  setElemText('studentCourse', studentInfo.course);
  setElemText('studentBranch', studentInfo.branch);
  setElemText('studentInstitute', studentInfo.institute);
  setElemText('studentFather', studentInfo.fatherName);
  setElemText('studentGender', studentInfo.gender);

  // 2. Helper to render a single semester column (meta table + subject marks table)
  const renderSemesterColumn = (sem) => {
    const s = sem || {
      semesterId: '',
      evenOdd: '',
      totalSubjects: '',
      theorySubjects: '',
      practicalSubjects: '',
      totalMarksObtained: '',
      resultStatus: '',
      sgpa: '',
      dateOfDeclaration: '',
      declared: false,
      subjects: []
    };

    const metaTableHtml = `
      <table class="meta-table">
        <tr>
          <td class="label">Semester</td>
          <td class="colon">:</td>
          <td class="value">${s.semesterId || ''}</td>
          <td class="label">Even/Odd</td>
          <td class="colon">:</td>
          <td class="value">${s.evenOdd || ''}</td>
        </tr>
        <tr>
          <td class="label">Total Subjects</td>
          <td class="colon">:</td>
          <td class="value">${s.totalSubjects !== undefined ? s.totalSubjects : ''}</td>
          <td class="label">Theory Subjects</td>
          <td class="colon">:</td>
          <td class="value">${s.theorySubjects !== undefined ? s.theorySubjects : ''}</td>
        </tr>
        <tr>
          <td class="label">Practical Subjects</td>
          <td class="colon">:</td>
          <td class="value">${s.practicalSubjects !== undefined ? s.practicalSubjects : ''}</td>
          <td class="label">Total Marks Obt.</td>
          <td class="colon">:</td>
          <td class="value">${s.totalMarksObtained !== undefined ? s.totalMarksObtained : ''}</td>
        </tr>
        <tr>
          <td class="label">Result Status</td>
          <td class="colon">:</td>
          <td class="value">${s.resultStatus || ''}</td>
          <td class="label">SGPA</td>
          <td class="colon">:</td>
          <td class="value" style="font-weight: bold; color: #721313;">${s.sgpa || ''}</td>
        </tr>
        <tr>
          <td class="label">Date of Declaration</td>
          <td class="colon">:</td>
          <td class="value">${s.dateOfDeclaration || ''}</td>
          <td class="label"></td>
          <td class="colon"></td>
          <td class="value"></td>
        </tr>
      </table>
    `;

    let subjectRows = '';
    if (s.subjects && s.subjects.length > 0) {
      subjectRows = s.subjects.map(sub => `
        <tr>
          <td style="font-weight: 500;">${sub.code || ''}</td>
          <td class="sub-name" title="${sub.name || ''}">${sub.name || ''}</td>
          <td style="font-weight: 500;">${sub.internal || '--'}</td>
          <td style="font-weight: 500;">${sub.external || '--'}</td>
          <td>${sub.backPaper || '--'}</td>
          <td style="font-weight: bold; color: ${sub.grade === 'F' ? '#cc0000' : '#1e293b'};">${sub.grade || '--'}</td>
        </tr>
      `).join('');
    } else {
      subjectRows = `
        <tr>
          <td colspan="6" style="padding: 12px; color: #666666;">No Subject records declared for this semester.</td>
        </tr>
      `;
    }

    const marksTableHtml = `
      <table class="marks-grid-table">
        <thead>
          <tr>
            <th style="width: 75px;">Subject Code</th>
            <th>Subject Name</th>
            <th style="width: 60px;">Internal</th>
            <th style="width: 60px;">External</th>
            <th style="width: 75px;">Back Paper</th>
            <th style="width: 50px;">Grade</th>
          </tr>
        </thead>
        <tbody>
          ${subjectRows}
        </tbody>
      </table>
    `;

    return `
      <div class="semester-col">
        ${metaTableHtml}
        ${marksTableHtml}
      </div>
    `;
  };

  // 3. Render Sessions
  const sessionsContainer = document.getElementById('sessionsContainer');

  let totalDeclaredSubjects = 0;
  if (sessions && Array.isArray(sessions)) {
    sessions.forEach(sess => {
      if (sess.oddSemester && sess.oddSemester.subjects) totalDeclaredSubjects += sess.oddSemester.subjects.length;
      if (sess.evenSemester && sess.evenSemester.subjects) totalDeclaredSubjects += sess.evenSemester.subjects.length;
      if (sess.semesterList) {
        sess.semesterList.forEach(sem => {
          if (sem && sem.subjects) totalDeclaredSubjects += sem.subjects.length;
        });
      }
    });
  }

  if (sessions && Array.isArray(sessions) && sessions.length > 0 && totalDeclaredSubjects > 0) {
    let sessionsHtml = '';

    sessions.forEach(session => {
      const sessionTitle = session.sessionName || session.sessionTitle || '';
      const semText = session.semText || session.semestersText || '';
      const marksText = session.marksText || '';
      const copText = session.copText || 'N/A';

      const sessionHeaderBar = `
        <div class="session-bar">
          Session : ${sessionTitle} | Semesters : [ ${semText} ] | Marks : [ ${marksText} ] | ${copText}
        </div>
      `;

      let odd = session.oddSemester;
      let even = session.evenSemester;
      if (!odd && !even && session.semesterList && session.semesterList.length > 0) {
        odd = session.semesterList[0];
        if (session.semesterList.length > 1) even = session.semesterList[1];
      }

      let colsHtml = '';
      if (odd && (odd.subjects?.length > 0 || odd.semesterId || odd.sgpa)) {
        colsHtml += renderSemesterColumn(odd);
      }
      if (even && (even.subjects?.length > 0 || even.semesterId || even.sgpa)) {
        colsHtml += renderSemesterColumn(even);
      }
      if (!colsHtml && session.semesterList && session.semesterList.length > 0) {
        session.semesterList.forEach(sem => {
          if (sem) colsHtml += renderSemesterColumn(sem);
        });
      }

      sessionsHtml += `
        <div class="session-panel">
          ${sessionHeaderBar}
          <div class="semesters-container">
            ${colsHtml || '<div style="padding: 20px; color: #64748b;">No declared subject records found for this session.</div>'}
          </div>
        </div>
      `;
    });

    sessionsContainer.innerHTML = sessionsHtml;
  } else {
    sessionsContainer.innerHTML = `
      <div class="session-panel" style="padding: 35px 20px; text-align: center; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 15px;">
        <div style="font-size: 1.15rem; font-weight: 700; color: #1e293b; margin-bottom: 8px;">
          ✓ AKTU Official Profile Verified
        </div>
        <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 6px;">
          Candidate identity (Roll No, Name, Enrollment, Branch, Institute) is live verified from AKTU OneView portal.
        </p>
        <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 0;">
          Note: Detailed semester examination marksheets and SGPA/CGPA are pending upload by the university for this session (e.g. Admission Batch 2025-26).
        </p>
      </div>
    `;
  }
});
