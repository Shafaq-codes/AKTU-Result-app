document.addEventListener('DOMContentLoaded', () => {
  const rollInput = document.getElementById('rollNumberInput');
  const searchBtn = document.getElementById('searchBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingSubtext = document.getElementById('loadingSubtext');

  // Modal elements
  const dobModal = document.getElementById('dobModalBackdrop');
  const manualDobInput = document.getElementById('manualDobInput');
  const dobErrorMsg = document.getElementById('dobErrorMsg');
  const submitManualDobBtn = document.getElementById('submitManualDobBtn');
  const newSearchBtn = document.getElementById('newSearchBtn');

  let activeRollNo = '';

  // Hide overlays on back button navigation
  window.addEventListener('pageshow', () => {
    loadingOverlay.style.display = 'none';
    if (dobModal) dobModal.style.display = 'none';
  });

  // Numbers-only restriction for Roll Number (NO live lookup/preview shown!)
  rollInput.addEventListener('input', () => {
    rollInput.value = rollInput.value.replace(/[^0-9]/g, '');
  });

  // Auto-format DOB input (DD/MM/YYYY)
  manualDobInput.addEventListener('input', (e) => {
    let v = manualDobInput.value.replace(/[^0-9]/g, '');
    if (v.length > 8) v = v.substring(0, 8);
    let formatted = '';
    if (v.length > 4) {
      formatted = `${v.substring(0, 2)}/${v.substring(2, 4)}/${v.substring(4)}`;
    } else if (v.length > 2) {
      formatted = `${v.substring(0, 2)}/${v.substring(2)}`;
    } else {
      formatted = v;
    }
    manualDobInput.value = formatted;
    if (dobErrorMsg) dobErrorMsg.style.display = 'none';
  });

  // Enter key in roll number input initiates search
  rollInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  // Enter key in manual DOB input submits DOB
  manualDobInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleManualDobSubmit();
    }
  });

  searchBtn.addEventListener('click', performSearch);
  submitManualDobBtn.addEventListener('click', handleManualDobSubmit);

  // New Search button in Modal
  newSearchBtn.addEventListener('click', () => {
    dobModal.style.display = 'none';
    manualDobInput.value = '';
    if (dobErrorMsg) dobErrorMsg.style.display = 'none';
    rollInput.value = '';
    rollInput.focus();
  });

  // Primary Search Function
  async function performSearch() {
    const rollNo = rollInput.value.trim();

    if (!rollNo || rollNo.length < 10) {
      alert('Please enter a valid AKTU Roll Number (10 to 14 digits).');
      rollInput.focus();
      return;
    }

    activeRollNo = rollNo;

    // Show Loading Overlay
    loadingOverlay.style.display = 'flex';
    loadingTitle.textContent = 'Searching Records...';
    loadingSubtext.textContent = 'Checking university marksheets database';

    try {
      const response = await fetch('/api/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo })
      });

      const resData = await response.json();

      // Check if result actually contains declared subject records
      let hasDeclaredSubjects = false;
      if (resData.data && Array.isArray(resData.data.sessions)) {
        resData.data.sessions.forEach(sess => {
          if (sess.oddSemester && sess.oddSemester.subjects?.length > 0) hasDeclaredSubjects = true;
          if (sess.evenSemester && sess.evenSemester.subjects?.length > 0) hasDeclaredSubjects = true;
          if (sess.semesterList) {
            sess.semesterList.forEach(sem => {
              if (sem && sem.subjects?.length > 0) hasDeclaredSubjects = true;
            });
          }
        });
      }

      // If full authentic marksheet is already verified and has subjects, display immediately
      if (response.ok && resData.success && hasDeclaredSubjects) {
        localStorage.setItem('aktu_result_cache', JSON.stringify(resData.data));
        localStorage.setItem('last_searched_roll', rollNo);

        loadingTitle.textContent = 'Success!';
        loadingSubtext.textContent = 'Opening Marksheet...';

        setTimeout(() => {
          window.location.href = `/result.html?rollNo=${encodeURIComponent(rollNo)}`;
        }, 300);
        return;
      }

      // If marksheet not yet declared or not in DB, check if DOB is registered in database
      let dob = (resData && resData.dob) ? resData.dob : '';
      if (!dob) {
        try {
          const dobResp = await fetch(`/api/dob/${rollNo}`);
          const dobJson = await dobResp.json();
          if (dobJson.success && dobJson.dob) {
            dob = dobJson.dob;
          }
        } catch (e) {}
      }

      // IF DOB NOT FOUND IN DATABASE:
      if (!dob) {
        loadingOverlay.style.display = 'none';
        showDobNotFoundModal();
        return;
      }

      // IF DOB FOUND: Start verification directly
      startVerificationWithDob(rollNo, dob, false);

    } catch (err) {
      loadingOverlay.style.display = 'none';
      console.error('Fetch error:', err);
      alert('Connection error. Please ensure the server is reachable and try again.');
    }
  }

  // Show "Date of Birth Not Found" Modal
  function showDobNotFoundModal() {
    manualDobInput.value = '';
    if (dobErrorMsg) dobErrorMsg.style.display = 'none';
    dobModal.style.display = 'flex';
    setTimeout(() => {
      manualDobInput.focus();
    }, 200);
  }

  // Handle Manual DOB Submit
  function handleManualDobSubmit() {
    const rawDob = manualDobInput.value.trim();
    const cleanDob = rawDob.replace(/[-]/g, '/');

    // Validation: format DD/MM/YYYY
    const dobRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = cleanDob.match(dobRegex);

    if (!match) {
      showDobError('कृपया मान्य जन्म तारीख (DD/MM/YYYY) दर्ज करें (उदा. 15/08/2003)');
      return;
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1980 || year > 2015) {
      showDobError('कृपया सही जन्म तारीख दर्ज करें (DD: 1-31, MM: 1-12, YYYY: 1980-2015)');
      return;
    }

    if (dobErrorMsg) dobErrorMsg.style.display = 'none';
    dobModal.style.display = 'none';

    // Start verification with manual DOB flag
    startVerificationWithDob(activeRollNo, cleanDob, true);
  }

  function showDobError(msg) {
    if (dobErrorMsg) {
      dobErrorMsg.textContent = msg;
      dobErrorMsg.style.display = 'block';
    } else {
      alert(msg);
    }
  }

  // Launch verification in Android Bridge or Web
  function startVerificationWithDob(rollNo, dob, isManual) {
    if (window.AndroidBridge && typeof window.AndroidBridge.startOneViewVerification === 'function') {
      loadingOverlay.style.display = 'none';
      window.AndroidBridge.startOneViewVerification(rollNo, dob, isManual);
      return;
    }

    // Web fallback if outside Android app
    loadingOverlay.style.display = 'none';
    alert('Please open this search in the Android App to solve the AKTU Captcha and load the official marksheet.');
  }

  // Callback from Android Bridge when marksheet is scraped & saved
  window.onOneViewResultReceived = function(rollNo) {
    if (dobModal) dobModal.style.display = 'none';
    loadingOverlay.style.display = 'flex';
    loadingTitle.textContent = 'Official Marksheet Verified!';
    loadingSubtext.textContent = 'Loading your result...';
    setTimeout(() => {
      window.location.href = `/result.html?rollNo=${encodeURIComponent(rollNo)}`;
    }, 400);
  };

  // Callback from Android Bridge when DOB is WRONG
  window.onOneViewWrongDob = function(rollNo, attemptedDob, errorMsg) {
    loadingOverlay.style.display = 'none';
    activeRollNo = rollNo;
    showDobNotFoundModal();
    showDobError(errorMsg || '❌ गलत जन्म तारीख (Incorrect Date of Birth). कृपया सही DOB दर्ज करें।');
  };
});
