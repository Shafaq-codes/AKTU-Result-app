document.addEventListener('DOMContentLoaded', () => {
  let resultData = null;
  const cacheDataStr = localStorage.getItem('aktu_result_cache');
  if (cacheDataStr) {
    try {
      resultData = JSON.parse(cacheDataStr);
    } catch (e) {}
  }

  if (!resultData || !resultData.studentInfo) {
    const urlParams = new URLSearchParams(window.location.search);
    const paramRoll = urlParams.get('rollNo') || localStorage.getItem('last_searched_roll');
    if (paramRoll && window.LOCAL_STUDENTS_DB && window.LOCAL_STUDENTS_DB[paramRoll]) {
      resultData = window.LOCAL_STUDENTS_DB[paramRoll];
    }
  }

  if (!resultData || !resultData.studentInfo) {
    window.location.href = '/index.html';
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

  // Helper to render a single semester column (summary meta table + subject marks table)
  const renderSemesterColumn = (sem) => {
    // If sem is null/undefined, create an empty semester object to display empty labels
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

    // Build metadata table HTML (side-by-side 4-column layout with no borders)
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
          <td class="value" style="font-weight: bold;">${s.sgpa || ''}</td>
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
        // Determine if student passed or failed in this subject
        const grade = (sub.grade || '').trim().toUpperCase();
        const extStr = (sub.external || '').trim().toUpperCase();
        const extNum = parseInt(extStr, 10);
        const typeStr = (sub.type || '').trim().toLowerCase();
        const backPaperVal = (sub.backPaper || '').trim();

        // Standard AKTU passing grades: A+, A, B+, B, C, D, E, P, S, etc.
        const passingGrades = ['A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'P', 'S', 'PASS', 'CLEARED'];
        const isPassingGrade = passingGrades.includes(grade);

        let isFailed = false;
        if (isPassingGrade) {
          // If the student has an E or better grade (including after clearing back paper e.g. with 21*), it is PASSED!
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

        const isAudit = (sub.type === 'CA' || (sub.code && sub.code.toUpperCase().startsWith('BVA')));

        let rowClass = '';
        if (isFailed) {
          rowClass = 'class="fail-row"';
        } else if (isAudit) {
          rowClass = 'class="audit-row"';
        }

        // Infer Type if not present
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

        // Back paper column display: shows marks like '21*' or '--'
        const displayBackPaper = backPaperVal ? backPaperVal : '--';

        tableRowsHtml += `
          <tr ${rowClass}>
            <td>${sub.code || ''}</td>
            <td>${sub.name || ''}</td>
            <td>${displayType}</td>
            <td style="text-align: center;">${sub.internal || ''}</td>
            <td style="text-align: center;">${sub.external || ''}</td>
            <td style="text-align: center;">${displayBackPaper}</td>
            <td style="text-align: center; font-weight: bold;">${sub.grade || ''}</td>
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
              <th>Code</th>
              <th>Name</th>
              <th>Type</th>
              <th style="text-align: center;">Internal</th>
              <th style="text-align: center;">External</th>
              <th style="text-align: center;">Back Paper</th>
              <th style="text-align: center;">Grade</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
    `;
  };

  // 2. Render sessions side-by-side
  const sessionsContainer = document.getElementById('sessionsContainer');
  sessionsContainer.innerHTML = '';

  if (sessions && sessions.length > 0) {
    sessions.forEach((session, idx) => {
      const sessionPanel = document.createElement('div');
      // By default, keep all session panels collapsed
      sessionPanel.className = 'session-panel';

      // Clean & ensure nice prefixes for session bar info to match official view exactly
      let semTextStr = session.semText;
      if (semTextStr && !semTextStr.includes('Semester') && !semTextStr.includes('semesters')) {
        semTextStr = `Semesters : ${semTextStr}`;
      }
      let marksTextStr = session.marksText;
      if (marksTextStr && !marksTextStr.includes('Marks') && !marksTextStr.includes('Result')) {
        marksTextStr = `Marks : ${marksTextStr}`;
      }
      let copTextStr = session.copText;
      if (copTextStr && !copTextStr.includes('COP')) {
        copTextStr = `COP : ${copTextStr}`;
      }

      sessionPanel.innerHTML = `
        <div class="session-bar">
          <span>Session : ${session.sessionName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${semTextStr} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${marksTextStr} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${copTextStr}</span>
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

  // 4. Print & Search Action handlers
  const printLink = document.getElementById('printLink');
  if (printLink) {
    printLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Temporarily expand all sessions for print
      const panels = document.querySelectorAll('.session-panel');
      const originalStates = Array.from(panels).map(p => p.classList.contains('active'));
      
      panels.forEach(p => p.classList.add('active'));
      
      window.print();
      
      // Restore states
      setTimeout(() => {
        panels.forEach((p, i) => {
          if (!originalStates[i]) {
            p.classList.remove('active');
          }
        });
      }, 1000);
    });
  }

  const newSearchBtn = document.getElementById('newSearchBtn');
  if (newSearchBtn) {
    newSearchBtn.addEventListener('click', () => {
      localStorage.removeItem('aktu_result_cache');
      window.location.href = '/index.html';
    });
  }
});
