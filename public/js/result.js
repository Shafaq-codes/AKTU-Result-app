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

  // 1. Populate Profile Card
  const setElemText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text || '--';
  };

  const nameVal = studentInfo.name || 'Student';
  setElemText('studentName', nameVal);
  setElemText('studentHindiName', studentInfo.hindiName);
  setElemText('studentRoll', studentInfo.rollNo);
  setElemText('studentEnroll', studentInfo.enrollmentNo);
  setElemText('studentCourse', studentInfo.course);
  setElemText('studentBranch', studentInfo.branch);
  setElemText('studentInstitute', studentInfo.institute);
  setElemText('studentFather', studentInfo.fatherName);
  setElemText('studentGender', studentInfo.gender);

  // Avatar Circle Letter
  const avatarLetter = document.getElementById('avatarLetter');
  if (avatarLetter) {
    avatarLetter.innerText = nameVal.trim().charAt(0).toUpperCase() || 'S';
  }

  // Accordion Toggle for Student Details
  const profileToggleRow = document.getElementById('profileToggleRow');
  const profileDetailsExpanded = document.getElementById('profileDetailsExpanded');
  const profileChevron = document.getElementById('profileChevron');
  if (profileToggleRow && profileDetailsExpanded && profileChevron) {
    profileToggleRow.addEventListener('click', (e) => {
      // Don't toggle accordion if user clicked copy roll pill
      if (e.target.closest('#copyRollBtn')) return;
      const isOpen = profileDetailsExpanded.style.display !== 'none';
      profileDetailsExpanded.style.display = isOpen ? 'none' : 'grid';
      profileChevron.classList.toggle('open', !isOpen);
    });
  }

  // Copy Roll Number to Clipboard
  const copyRollBtn = document.getElementById('copyRollBtn');
  const copyToast = document.getElementById('copyToast');
  if (copyRollBtn && copyToast) {
    copyRollBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rNum = studentInfo.rollNo || '';
      if (rNum && navigator.clipboard) {
        navigator.clipboard.writeText(rNum).then(() => {
          copyToast.style.display = 'block';
          setTimeout(() => { copyToast.style.display = 'none'; }, 2200);
        });
      }
    });
  }

  // 2. Extract All Semesters Across All Sessions
  const allSemesters = [];
  if (sessions && Array.isArray(sessions)) {
    sessions.forEach(sess => {
      const sessName = sess.sessionName || sess.sessionTitle || 'Regular';
      if (sess.oddSemester && (sess.oddSemester.subjects?.length > 0 || sess.oddSemester.sgpa)) {
        allSemesters.push({ ...sess.oddSemester, sessionName: sessName });
      }
      if (sess.evenSemester && (sess.evenSemester.subjects?.length > 0 || sess.evenSemester.sgpa)) {
        allSemesters.push({ ...sess.evenSemester, sessionName: sessName });
      }
      if (sess.semesterList) {
        sess.semesterList.forEach(sem => {
          if (sem && !allSemesters.some(s => String(s.semesterId) === String(sem.semesterId))) {
            allSemesters.push({ ...sem, sessionName: sessName });
          }
        });
      }
    });
  }

  // Sort semesters ascending by numeric semester ID (1, 2, 3, 4...)
  allSemesters.sort((a, b) => (parseInt(a.semesterId) || 0) - (parseInt(b.semesterId) || 0));

  const semSelectorContainer = document.getElementById('semSelectorContainer');
  const activeSemesterMarksheetContainer = document.getElementById('activeSemesterMarksheetContainer');
  const semDropdownBtn = document.getElementById('semDropdownBtn');
  const selectedSemLabel = document.getElementById('selectedSemLabel');
  const semDropdownMenu = document.getElementById('semDropdownMenu');
  const semBtnChevron = document.getElementById('semBtnChevron');

  if (allSemesters.length === 0) {
    // If no declared semesters yet
    if (semSelectorContainer) semSelectorContainer.style.display = 'none';
    if (activeSemesterMarksheetContainer) {
      activeSemesterMarksheetContainer.innerHTML = `
        <div class="session-panel" style="padding: 35px 20px; text-align: center; background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0; margin-top: 15px;">
          <div style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
            ✓ AKTU Official Profile Verified
          </div>
          <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 6px;">
            Candidate identity (Roll No, Name, Enrollment, Branch, Institute) is live verified from AKTU OneView portal.
          </p>
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 0;">
            Note: Detailed semester examination marksheets and SGPA/CGPA have not been uploaded by the university for this candidate yet.
          </p>
        </div>
      `;
    }
    return;
  }

  // By default, select the LATEST semester (highest semester number)
  let activeSemester = allSemesters[allSemesters.length - 1];

  // Helper to render the active semester's marksheet card
  function renderActiveSemesterCard(sem) {
    selectedSemLabel.innerText = `Semester ${sem.semesterId}`;

    const isPass = !(sem.resultStatus && sem.resultStatus.toUpperCase().includes('FAIL'));
    const statusText = sem.resultStatus ? sem.resultStatus.trim() : 'PASS';
    const statusBadgeClass = isPass ? 'status-badge-pass' : 'status-badge-fail';
    const checkIcon = isPass ? '✓ ' : '✕ ';

    let subjectRows = '';
    if (sem.subjects && sem.subjects.length > 0) {
      subjectRows = sem.subjects.map(sub => {
        let gradeColor = '#0f172a';
        if (sub.grade === 'A+' || sub.grade === 'A') gradeColor = '#15803d';
        else if (sub.grade === 'F') gradeColor = '#b91c1c';
        else if (sub.grade === 'D' || sub.grade === 'E') gradeColor = '#d97706';

        return `
          <tr>
            <td style="font-weight: 700; color: #475569;">${sub.code || ''}</td>
            <td style="font-weight: 600; color: #0f172a;">${sub.name || ''}</td>
            <td style="font-weight: 600; color: #334155;">${sub.internal || '--'}</td>
            <td style="font-weight: 600; color: #334155;">${sub.external || '--'}</td>
            <td><span class="grade-badge" style="color: ${gradeColor};">${sub.grade || '--'}</span></td>
          </tr>
        `;
      }).join('');
    } else {
      subjectRows = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">
            No subject marks found for this semester.
          </td>
        </tr>
      `;
    }

    const marksheetHtml = `
      <div class="modern-marksheet-card">
        <div class="marksheet-card-top">
          <h3 class="marksheet-card-title">Semester ${sem.semesterId} Marksheet</h3>
          <div class="marksheet-badges-group">
            <span class="${statusBadgeClass}">${checkIcon}${statusText}</span>
            <span class="sgpa-pill-badge">SGPA: ${sem.sgpa || '--'}</span>
          </div>
        </div>

        <div class="semester-meta-chips">
          <div class="meta-chip-item">Total Marks: <strong>${sem.totalMarksObtained || '--'}</strong></div>
          <div class="meta-chip-item">Subjects: <strong>${sem.subjects ? sem.subjects.length : '--'}</strong></div>
          <div class="meta-chip-item">Date of Declaration: <strong>${sem.dateOfDeclaration || '--'}</strong></div>
          <div class="meta-chip-item">Session: <strong>${sem.sessionName || '--'}</strong></div>
        </div>

        <div class="modern-subject-table-wrap">
          <table class="modern-subject-table">
            <thead>
              <tr>
                <th style="width: 20%;">CODE</th>
                <th style="width: 44%;">NAME</th>
                <th style="width: 12%;">INT</th>
                <th style="width: 12%;">EXT</th>
                <th style="width: 12%;">GRADE</th>
              </tr>
            </thead>
            <tbody>
              ${subjectRows}
            </tbody>
          </table>
        </div>
      </div>
    `;

    activeSemesterMarksheetContainer.innerHTML = marksheetHtml;
  }

  // Populate Dropdown Items
  function buildDropdownMenu() {
    semDropdownMenu.innerHTML = allSemesters.map(sem => {
      const isActive = String(sem.semesterId) === String(activeSemester.semesterId);
      return `
        <div class="sem-menu-item ${isActive ? 'active' : ''}" data-sem-id="${sem.semesterId}">
          <span>Semester ${sem.semesterId}</span>
          ${isActive ? `
            <svg class="sem-check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ` : ''}
        </div>
      `;
    }).join('');

    // Attach click listener to each menu item
    semDropdownMenu.querySelectorAll('.sem-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetSemId = item.getAttribute('data-sem-id');
        const chosen = allSemesters.find(s => String(s.semesterId) === String(targetSemId));
        if (chosen) {
          activeSemester = chosen;
          renderActiveSemesterCard(activeSemester);
          buildDropdownMenu();
          closeDropdown();
        }
      });
    });
  }

  function toggleDropdown() {
    const isShowing = semDropdownMenu.classList.contains('show');
    if (isShowing) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function openDropdown() {
    semDropdownMenu.classList.add('show');
    if (semBtnChevron) semBtnChevron.classList.add('open');
  }

  function closeDropdown() {
    semDropdownMenu.classList.remove('show');
    if (semBtnChevron) semBtnChevron.classList.remove('open');
  }

  // Toggle Dropdown Button
  if (semDropdownBtn) {
    semDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#semSelectorContainer')) {
      closeDropdown();
    }
  });

  // Show selector and render default active semester
  if (semSelectorContainer) semSelectorContainer.style.display = 'block';
  buildDropdownMenu();
  renderActiveSemesterCard(activeSemester);
});
