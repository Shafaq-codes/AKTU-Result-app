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

  function parseSemNumber(val) {
    if (!val) return 1;
    const s = String(val).replace(/[^0-9]/g, '');
    const num = parseInt(s, 10);
    return isNaN(num) ? 1 : num;
  }

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
      let oddSem = sems.find(s => (s.evenOdd && s.evenOdd.toLowerCase().includes('odd')) || (parseSemNumber(s.semester) % 2 !== 0));
      let evenSem = sems.find(s => (s.evenOdd && s.evenOdd.toLowerCase().includes('even')) || (parseSemNumber(s.semester) % 2 === 0));
      if (!oddSem && !evenSem && sems.length > 0) {
        oddSem = sems[0];
        if (sems.length > 1) evenSem = sems[1];
      }

      // Calculate COP codes (only where grade is F)
      const cops = [];
      sems.forEach(s => {
        (s.subjects || []).forEach(sub => {
          const g = (sub.grade || '').trim().toUpperCase();
          if ((g === 'F' || g === 'FAIL' || g === 'ABS') && sub.code && !cops.includes(sub.code)) {
            cops.push(sub.code);
          }
        });
      });
      const copText = cops.length > 0 ? `COP: ${cops.join(', ')}` : '';

      // Marks total
      let totalMarksObt = 0;
      let totalMax = 0;
      sems.forEach(s => {
        const m = parseInt(s.totalMarksObtained || s.totalMarksObt || 0, 10);
        if (!isNaN(m) && m > 0) totalMarksObt += m;
        totalMax += (s.subjects ? s.subjects.length * 100 : 900);
      });
      const marksText = totalMarksObt > 0 ? `${totalMarksObt}/${totalMax}` : (sems[0]?.resultStatus || 'PASS');

      return {
        sessionName: sessionName,
        sessionTitle: sessionName,
        semText: sems.map(s => s.semester).join(', '),
        marksText: marksText,
        copText: copText,
        oddSemester: oddSem ? {
          semesterId: oddSem.semester,
          evenOdd: oddSem.evenOdd || 'Odd',
          totalSubjects: oddSem.totalSubjects || (oddSem.subjects ? oddSem.subjects.length : 0),
          theorySubjects: oddSem.theorySubjects || (oddSem.subjects ? oddSem.subjects.filter(x => (x.type || 'Theory').toLowerCase() === 'theory').length : 5),
          practicalSubjects: oddSem.practicalSubjects || (oddSem.subjects ? oddSem.subjects.filter(x => (x.type || '').toLowerCase() === 'practical').length : 4),
          totalMarksObtained: oddSem.totalMarksObtained || oddSem.totalMarksObt || '',
          resultStatus: oddSem.resultStatus || 'PASS',
          sgpa: oddSem.sgpa || '',
          dateOfDeclaration: oddSem.dateOfDeclaration || '',
          declared: true,
          subjects: oddSem.subjects || []
        } : null,
        evenSemester: evenSem ? {
          semesterId: evenSem.semester,
          evenOdd: evenSem.evenOdd || 'Even',
          totalSubjects: evenSem.totalSubjects || (evenSem.subjects ? evenSem.subjects.length : 0),
          theorySubjects: evenSem.theorySubjects || (evenSem.subjects ? evenSem.subjects.filter(x => (x.type || 'Theory').toLowerCase() === 'theory').length : 5),
          practicalSubjects: evenSem.practicalSubjects || (evenSem.subjects ? evenSem.subjects.filter(x => (x.type || '').toLowerCase() === 'practical').length : 4),
          totalMarksObtained: evenSem.totalMarksObtained || evenSem.totalMarksObt || '',
          resultStatus: evenSem.resultStatus || 'PASS',
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

  // 1. Populate Profile Card
  const setElemText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text ? String(text).trim() : '--';
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

  // Helper to render a single semester column (meta table + marks-grid-table)
  const renderSemesterColumn = (sem) => {
    if (!sem) return '';

    const s = {
      semesterId: sem.semesterId || '',
      evenOdd: sem.evenOdd || '',
      totalSubjects: sem.totalSubjects !== undefined ? sem.totalSubjects : (sem.subjects ? sem.subjects.length : ''),
      theorySubjects: sem.theorySubjects !== undefined ? sem.theorySubjects : '',
      practicalSubjects: sem.practicalSubjects !== undefined ? sem.practicalSubjects : '',
      totalMarksObtained: sem.totalMarksObtained || sem.totalMarksObt || '',
      resultStatus: sem.resultStatus || '',
      sgpa: sem.sgpa || '',
      dateOfDeclaration: sem.dateOfDeclaration || '',
      declared: sem.declared !== false,
      subjects: sem.subjects || []
    };

    const metaTableHtml = `
      <table class="meta-table">
        <tr>
          <td class="label">Semester</td>
          <td class="colon">:</td>
          <td class="value">${s.semesterId}</td>
          <td class="label">Even/Odd</td>
          <td class="colon">:</td>
          <td class="value">${s.evenOdd}</td>
        </tr>
        <tr>
          <td class="label">Total Subjects</td>
          <td class="colon">:</td>
          <td class="value">${s.totalSubjects}</td>
          <td class="label">Theory Subjects</td>
          <td class="colon">:</td>
          <td class="value">${s.theorySubjects}</td>
        </tr>
        <tr>
          <td class="label">Practical Subjects</td>
          <td class="colon">:</td>
          <td class="value">${s.practicalSubjects}</td>
          <td class="label">Total Marks Obt.</td>
          <td class="colon">:</td>
          <td class="value">${s.totalMarksObtained}</td>
        </tr>
        <tr>
          <td class="label">Result Status</td>
          <td class="colon">:</td>
          <td class="value">${s.resultStatus}</td>
          <td class="label">SGPA</td>
          <td class="colon">:</td>
          <td class="value" style="font-weight: bold;">${s.sgpa}</td>
        </tr>
        <tr>
          <td class="label">Date of Declaration</td>
          <td class="colon">:</td>
          <td class="value">${s.dateOfDeclaration}</td>
          <td class="label"></td>
          <td class="colon"></td>
          <td class="value"></td>
        </tr>
      </table>
    `;

    if (!s.declared) {
      return `
        <div class="semester-column">
          ${metaTableHtml}
          <table class="marks-grid-table">
            <tr>
              <td style="text-align: center; color: red; font-weight: bold; padding: 15px; font-size: 11px; border: 1px solid #999999;">
                No Result found for the above semester.
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    let tableRowsHtml = '';
    if (s.subjects && s.subjects.length > 0) {
      s.subjects.forEach(sub => {
        const grade = (sub.grade || '').trim().toUpperCase();
        const extStr = (sub.external !== undefined && sub.external !== null) ? String(sub.external).trim().toUpperCase() : '';
        const extNum = parseInt(extStr, 10);
        const typeStr = (sub.type || '').trim().toLowerCase();
        const backPaperVal = (sub.backPaper || '').trim();

        // Standard AKTU passing grades: A+, A, B+, B, C, D, E, P, S, etc.
        const passingGrades = ['A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'P', 'S', 'PASS', 'CLEARED'];
        const isPassingGrade = passingGrades.includes(grade);

        let isFailed = false;
        if (isPassingGrade) {
          isFailed = false;
        } else if (
          grade === 'F' || 
          grade.includes('#') || 
          grade.startsWith('F') || 
          grade === 'ABS' || 
          grade === 'AB' || 
          grade === 'ABSENT' ||
          grade === 'FAIL' ||
          extStr === 'AB' || 
          extStr === 'ABS' || 
          extStr === 'ABSENT'
        ) {
          isFailed = true;
        } else if (!grade && !isNaN(extNum) && (typeStr.includes('theory') || typeStr === '' || !typeStr.includes('practical')) && extNum < 21 && sub.type !== 'CA') {
          isFailed = true;
        }

        const isAudit = (sub.type === 'CA' || (sub.code && sub.code.toUpperCase().startsWith('BVA')) || (sub.name && (sub.name.toLowerCase().includes('sports') || sub.name.toLowerCase().includes('yoga') || sub.name.toLowerCase().includes('nss'))));

        let rowClass = '';
        if (isFailed) {
          rowClass = 'class="fail-row"';
        } else if (isAudit) {
          rowClass = 'class="audit-row"';
        }

        let displayType = sub.type || '';
        if (!displayType) {
          const nameLower = (sub.name || '').toLowerCase();
          const codeUpper = (sub.code || '').toUpperCase();
          if (nameLower.includes('lab') || nameLower.includes('practical') || nameLower.includes('graphics') || nameLower.includes('workshop')) {
            displayType = 'Practical';
          } else if (codeUpper.startsWith('BVA') || nameLower.includes('sports') || nameLower.includes('yoga') || codeUpper.includes('AUDIT')) {
            displayType = 'CA';
          } else {
            displayType = 'Theory';
          }
        }

        const displayBackPaper = backPaperVal ? backPaperVal : '--';

        tableRowsHtml += `
          <tr ${rowClass}>
            <td>${sub.code || ''}</td>
            <td>${sub.name || ''}</td>
            <td>${displayType}</td>
            <td style="text-align: center;">${sub.internal !== undefined ? sub.internal : ''}</td>
            <td style="text-align: center;">${isAudit ? '' : (sub.external !== undefined ? sub.external : '')}</td>
            <td style="text-align: center;">${displayBackPaper}</td>
            <td style="text-align: center; font-weight: bold;">${isAudit ? '' : (sub.grade || '')}</td>
          </tr>
        `;
      });
    } else {
      tableRowsHtml = `
        <tr>
          <td colspan="7" style="text-align: center; color: #666666; padding: 15px;">
            No subject marks available.
          </td>
        </tr>
      `;
    }

    return `
      <div class="semester-column">
        ${metaTableHtml}
        <table class="marks-grid-table">
          <thead>
            <tr>
              <th style="width: 14%;">Code</th>
              <th style="width: 38%;">Name</th>
              <th style="width: 12%;">Type</th>
              <th style="width: 9%; text-align: center;">Internal</th>
              <th style="width: 9%; text-align: center;">External</th>
              <th style="width: 10%; text-align: center;">Back Paper</th>
              <th style="width: 8%; text-align: center;">Grade</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    `;
  };

  // 2. Render sessions
  const sessionsContainer = document.getElementById('sessionsContainer');
  sessionsContainer.innerHTML = '';

  if (sessions && sessions.length > 0) {
    sessions.forEach((session, idx) => {
      const sessionPanel = document.createElement('div');
      
      // Make the first (latest) session expanded by default so user sees result immediately without excessive scroll
      // Older sessions remain collapsed to save vertical screen space!
      sessionPanel.className = idx === 0 ? 'session-panel active' : 'session-panel';

      let semTextStr = session.semText || '';
      if (semTextStr && !semTextStr.includes('Semester') && !semTextStr.includes('semesters') && !semTextStr.includes('Semesters')) {
        semTextStr = `Semesters : ${semTextStr}`;
      }
      let marksTextStr = session.marksText || '';
      if (marksTextStr && !marksTextStr.includes('Marks') && !marksTextStr.includes('Result')) {
        marksTextStr = `Marks : ${marksTextStr}`;
      }

      // Check COP in session
      const cops = [];
      const checkCops = (sem) => {
        if (!sem || !sem.subjects) return;
        sem.subjects.forEach(sub => {
          const g = (sub.grade || '').trim().toUpperCase();
          if ((g === 'F' || g === 'FAIL' || g === 'ABS') && sub.code && !cops.includes(sub.code)) {
            cops.push(sub.code);
          }
        });
      };
      checkCops(session.oddSemester);
      checkCops(session.evenSemester);
      if (session.semesterList) {
        session.semesterList.forEach(checkCops);
      }

      let copTextStr = cops.length > 0 ? `COP : ${cops.join(', ')}` : (session.copText || '');
      if (copTextStr && !copTextStr.includes('COP') && copTextStr !== 'N/A') {
        copTextStr = `COP : ${copTextStr}`;
      }

      sessionPanel.innerHTML = `
        <div class="session-bar">
          <div class="session-bar-text">
            <span>Session : ${session.sessionName || session.sessionTitle}</span>
            <span>${semTextStr}</span>
            <span>${marksTextStr}</span>
            ${copTextStr && copTextStr !== 'N/A' ? `<span>${copTextStr}</span>` : ''}
          </div>
        </div>
        <div class="session-content">
          ${session.remarks ? `<div style="background-color: #ffff00; color: #ff0000; font-weight: bold; font-size: 11px; padding: 6px 12px; border: 1px solid #e6e600; margin: 10px 0; border-radius: 2px;">${session.remarks}</div>` : ''}
          <div class="semester-grid">
            ${renderSemesterColumn(session.oddSemester)}
            ${renderSemesterColumn(session.evenSemester)}
          </div>
        </div>
      `;

      // Set up click handler on the session bar for expanding/collapsing
      sessionPanel.querySelector('.session-bar').addEventListener('click', () => {
        sessionPanel.classList.toggle('active');
      });

      sessionsContainer.appendChild(sessionPanel);
    });
  } else {
    sessionsContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; font-weight: bold; color: #666666; border: 1px solid #dddddd; background: #fafafa;">
        No session results found.
      </div>
    `;
  }

  // 3. Setup static panel handlers (Minor/Major and MOOCs)
  const minorHeader = document.getElementById('minorResHeader');
  if (minorHeader) {
    minorHeader.addEventListener('click', () => {
      minorHeader.parentElement.classList.toggle('active');
    });
  }

  const moocsHeader = document.getElementById('moocsHeader');
  if (moocsHeader) {
    moocsHeader.addEventListener('click', () => {
      moocsHeader.parentElement.classList.toggle('active');
    });
  }
});
