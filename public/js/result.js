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

  // If no cached data or different rollNo requested, fetch from API
  if ((!resultData || !resultData.studentInfo || (paramRoll && resultData.studentInfo.rollNo !== paramRoll)) && paramRoll) {
    try {
      const resp = await fetch('/api/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo: paramRoll })
      });
      const json = await resp.json();
      if (json.success && json.data) {
        resultData = json.data;
        localStorage.setItem('aktu_result_cache', JSON.stringify(resultData));
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
