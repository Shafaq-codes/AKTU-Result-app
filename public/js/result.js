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

      // Calculate COP codes
      const cops = [];
      sems.forEach(s => {
        (s.subjects || []).forEach(sub => {
          if (sub.grade === 'F' && sub.code && !cops.includes(sub.code)) {
            cops.push(sub.code);
          }
        });
      });
      const copText = cops.length > 0 ? `COP : ${cops.join(',')}` : '';

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
        semText: sems.map(s => s.semester).join(','),
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

  // Fetch fresh if no cache, different roll, or empty subjects
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

  // 1. Fill 4-Column Student Information Table
  const setElem = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val ? String(val).trim() : '--';
  };

  setElem('studentInstitute', studentInfo.institute);
  setElem('studentBranch', studentInfo.branch);
  setElem('studentCourse', studentInfo.course);
  setElem('studentEnroll', studentInfo.enrollmentNo);
  setElem('studentRoll', studentInfo.rollNo);
  setElem('studentHindiName', studentInfo.hindiName);
  setElem('studentName', studentInfo.name);
  setElem('studentGender', studentInfo.gender);
  setElem('studentFather', studentInfo.fatherName);

  // 2. Render Authentic AKTU OneView Sessions
  const sessionsContainer = document.getElementById('sessionsContainer');
  if (!sessionsContainer) return;

  if (!sessions || sessions.length === 0) {
    sessionsContainer.innerHTML = `
      <div style="border: 1px solid #c8ced3; background: #ffffff; padding: 30px 15px; text-align: center; margin-bottom: 20px;">
        <div style="font-weight: bold; font-size: 14px; color: #721313; margin-bottom: 8px;">
          ⚠️ No Examination Sessions Found
        </div>
        <p style="color: #666; font-size: 11px;">
          Detailed semester marksheet records have not been uploaded by the university for this roll number yet.
        </p>
      </div>
    `;
    return;
  }

  let htmlBuffer = '';

  sessions.forEach((sess, sessIdx) => {
    const sessName = sess.sessionName || sess.sessionTitle || 'REGULAR';
    
    // Extract semesters belonging to this session
    const semList = [];
    if (sess.oddSemester && (sess.oddSemester.subjects?.length > 0 || sess.oddSemester.semesterId)) {
      semList.push(sess.oddSemester);
    }
    if (sess.evenSemester && (sess.evenSemester.subjects?.length > 0 || sess.evenSemester.semesterId)) {
      semList.push(sess.evenSemester);
    }
    if (sess.semesterList) {
      sess.semesterList.forEach(s => {
        if (s && !semList.some(item => String(item.semesterId) === String(s.semesterId))) {
          semList.push(s);
        }
      });
    }

    // Sort by semester number ascending (1, 2, 3...)
    semList.sort((a, b) => parseSemNumber(a.semesterId) - parseSemNumber(b.semesterId));

    // Semester numbers text (e.g. 1,2)
    const semNumbersText = sess.semText || semList.map(s => s.semesterId).join(',');

    // Calculate or retrieve COP codes
    let copList = [];
    if (sess.copText && sess.copText.includes(':')) {
      const parts = sess.copText.split(':');
      if (parts[1] && parts[1].trim() && parts[1].trim() !== 'N/A' && !parts[1].includes('Cleared')) {
        copList = parts[1].split(',').map(c => c.trim()).filter(Boolean);
      }
    }
    
    // Check if any subject in this session has grade 'F'
    semList.forEach(sem => {
      (sem.subjects || []).forEach(sub => {
        if (sub.grade === 'F' && sub.code && !copList.includes(sub.code)) {
          copList.push(sub.code);
        }
      });
    });

    // Marks text calculation
    let marksDisplay = sess.marksText || '';
    if (!marksDisplay || marksDisplay === 'PASS' || marksDisplay === 'PCP') {
      let obt = 0;
      let maxM = 0;
      semList.forEach(sem => {
        const o = parseInt(sem.totalMarksObtained || 0, 10);
        if (!isNaN(o) && o > 0) obt += o;
        maxM += (sem.subjects ? sem.subjects.length * 100 : 900);
      });
      if (obt > 0) {
        marksDisplay = `${obt}/${maxM}`;
      } else {
        marksDisplay = semList[0]?.resultStatus || 'PASS';
      }
    }

    const copLineHtml = copList.length > 0 
      ? `<div class="session-cop-line">COP : ${copList.join(',')}</div>` 
      : (sess.copText && !sess.copText.includes('Audit') && sess.copText !== 'N/A' && !sess.copText.includes('N/A') ? `<div class="session-cop-line">${sess.copText}</div>` : '');

    // By default, expand all sessions (as shown in official AKTU OneView mobile view)
    const isExpanded = true;

    // Build Semesters HTML inside this session
    let semsHtml = '';
    semList.forEach(sem => {
      const semNum = sem.semesterId || '1';
      const isOdd = (sem.evenOdd && sem.evenOdd.toLowerCase().includes('odd')) || (parseSemNumber(semNum) % 2 !== 0);
      const evenOddText = sem.evenOdd || (isOdd ? 'Odd' : 'Even');
      const totalSubs = sem.totalSubjects || (sem.subjects ? sem.subjects.length : 0);
      const theorySubs = sem.theorySubjects || (sem.subjects ? sem.subjects.filter(s => (s.type || 'Theory').toLowerCase() === 'theory').length : 5);
      const practSubs = sem.practicalSubjects || (sem.subjects ? sem.subjects.filter(s => (s.type || '').toLowerCase() === 'practical').length : 4);
      const marksObt = sem.totalMarksObtained || '--';
      const status = sem.resultStatus || 'PASS';
      const sgpa = sem.sgpa || '--';
      const decDate = sem.dateOfDeclaration || '--';

      // Build 7-column Subject Rows
      let rowsHtml = '';
      if (sem.subjects && sem.subjects.length > 0) {
        sem.subjects.forEach(sub => {
          const code = sub.code || '';
          const name = sub.name || '';
          const type = sub.type || 'Theory';
          const internal = (sub.internal !== undefined && sub.internal !== null && String(sub.internal).trim() !== '') ? sub.internal : '--';
          const external = (sub.external !== undefined && sub.external !== null && String(sub.external).trim() !== '') ? sub.external : '--';
          const backPaper = (sub.backPaper && String(sub.backPaper).trim() !== '') ? sub.backPaper : '--';
          const grade = (sub.grade && String(sub.grade).trim() !== '') ? sub.grade : '--';

          // Styling logic:
          // 1. Red row if grade is F (Back Paper Failed)
          // 2. Light blue row if type is CA / Audit (Sports and Yoga, NSS, etc.)
          // 3. Normal white row for regular or cleared back papers
          let rowClass = '';
          const isCA = type.toLowerCase() === 'ca' || 
                       code.toUpperCase().startsWith('BVA') || 
                       name.toLowerCase().includes('sports') || 
                       name.toLowerCase().includes('yoga') || 
                       name.toLowerCase().includes('nss');

          const isFailed = grade === 'F' || grade === 'CP' || (String(external) !== '--' && parseInt(external) < 15 && type.toLowerCase() === 'theory');

          if (isFailed) {
            rowClass = 'row-back-failed';
          } else if (isCA) {
            rowClass = 'row-audit-ca';
          }

          rowsHtml += `
            <tr class="${rowClass}">
              <td>${code}</td>
              <td class="text-left-name">${name}</td>
              <td>${type}</td>
              <td>${internal}</td>
              <td>${isCA ? '' : external}</td>
              <td>${backPaper}</td>
              <td>${isCA ? '' : grade}</td>
            </tr>
          `;
        });
      } else {
        rowsHtml = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 15px; color: #888;">
              No subject records declared for this semester.
            </td>
          </tr>
        `;
      }

      semsHtml += `
        <div class="semester-single-block">
          <!-- 2-Column Semester Metadata Table -->
          <table class="sem-meta-table">
            <tbody>
              <tr>
                <td class="m-col-key">Semester</td>
                <td class="m-col-val">: ${semNum}</td>
                <td class="m-col-key">Even/Odd</td>
                <td class="m-col-val">: ${evenOddText}</td>
              </tr>
              <tr>
                <td class="m-col-key">Total Subjects</td>
                <td class="m-col-val">: ${totalSubs}</td>
                <td class="m-col-key">Theory Subjects</td>
                <td class="m-col-val">: ${theorySubs}</td>
              </tr>
              <tr>
                <td class="m-col-key">Practical Subjects</td>
                <td class="m-col-val">: ${practSubs}</td>
                <td class="m-col-key">Total Marks Obt.</td>
                <td class="m-col-val">: ${marksObt}</td>
              </tr>
              <tr>
                <td class="m-col-key">Result Status</td>
                <td class="m-col-val">: ${status}</td>
                <td class="m-col-key">SGPA</td>
                <td class="m-col-val">: ${sgpa}</td>
              </tr>
              <tr>
                <td class="m-col-key">Date of Declaration</td>
                <td class="m-col-val">: ${decDate}</td>
                <td class="m-col-key"></td>
                <td class="m-col-val"></td>
              </tr>
            </tbody>
          </table>

          <!-- 7-Column Subject Marksheet Table -->
          <div class="marks-table-responsive-wrapper">
            <table class="aktu-official-marks-table">
              <thead>
                <tr>
                  <th style="width: 14%;">Code</th>
                  <th style="width: 38%;">Name</th>
                  <th style="width: 10%;">Type</th>
                  <th style="width: 9%;">Internal</th>
                  <th style="width: 9%;">External</th>
                  <th style="width: 10%;">Back Paper</th>
                  <th style="width: 10%;">Grade</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    htmlBuffer += `
      <div class="session-wrapper-card">
        <!-- Collapsible Pink / Peach Session Strip -->
        <div class="session-pink-bar" onclick="toggleSession('sess-${sessIdx}')">
          <div class="session-bar-top-row">
            <span>Session : ${sessName}</span>
            <span>Semesters : ${semNumbersText}</span>
            <span>Marks : ${marksDisplay}</span>
            <span class="session-arrow-icon" id="arrow-sess-${sessIdx}">▲</span>
          </div>
          ${copLineHtml}
        </div>

        <!-- Session Content Container -->
        <div class="session-body-container" id="sess-${sessIdx}" style="display: block;">
          ${semsHtml}
        </div>
      </div>
    `;
  });

  sessionsContainer.innerHTML = htmlBuffer;

  // Collapsible toggle for Sessions
  window.toggleSession = function(sessId) {
    const el = document.getElementById(sessId);
    const arrow = document.getElementById('arrow-' + sessId);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    if (arrow) arrow.innerText = isHidden ? '▲' : '▼';
  };

  // Static Collapsible Toggles (Minor/Major & MOOCs)
  const setupToggle = (btnId, contentId, arrowId) => {
    const btn = document.getElementById(btnId);
    const content = document.getElementById(contentId);
    const arrow = document.getElementById(arrowId);
    if (btn && content) {
      btn.addEventListener('click', () => {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.innerText = isHidden ? '▲' : '▼';
      });
    }
  };

  setupToggle('minorMajorToggle', 'minorMajorContent', 'minorMajorArrow');
  setupToggle('moocsToggle', 'moocsContent', 'moocsArrow');
});
