document.addEventListener('DOMContentLoaded', () => {
  const rollInput = document.getElementById('rollNumberInput');
  const searchBtn = document.getElementById('searchBtn');
  const dobBadge = document.getElementById('dobBadge');
  const dobBadgeText = document.getElementById('dobBadgeText');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingTitle = document.getElementById('loadingTitle');
  const loadingSubtext = document.getElementById('loadingSubtext');

  // Hide loading overlay on back button navigation
  window.addEventListener('pageshow', () => {
    loadingOverlay.style.display = 'none';
  });

  // Numbers-only restriction
  rollInput.addEventListener('input', () => {
    rollInput.value = rollInput.value.replace(/[^0-9]/g, '');
    checkDobMatch(rollInput.value.trim());
  });

  // Enter key initiates search
  rollInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  searchBtn.addEventListener('click', performSearch);

  // Debounced DOB Match Checker
  let dobTimer = null;
  function checkDobMatch(rollNo) {
    clearTimeout(dobTimer);
    if (!rollNo || rollNo.length < 10) {
      dobBadge.style.display = 'none';
      return;
    }

    dobTimer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/dob/${rollNo}`);
        const data = await resp.json();
        if (data.success && data.dob) {
          dobBadgeText.textContent = `${data.name || 'Student'} • DOB: ${data.dob}`;
          dobBadge.style.display = 'block';
        } else {
          dobBadge.style.display = 'none';
        }
      } catch (e) {
        dobBadge.style.display = 'none';
      }
    }, 300);
  }

  // Primary Search Function
  async function performSearch() {
    const rollNo = rollInput.value.trim();

    if (!rollNo || rollNo.length < 10) {
      alert('Please enter a valid AKTU Roll Number (10 to 14 digits).');
      rollInput.focus();
      return;
    }

    // Show Loading Overlay
    loadingOverlay.style.display = 'flex';
    loadingTitle.textContent = 'Checking Database Records...';
    loadingSubtext.textContent = 'Looking up student record and semester data';

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

      // If not in cache or semester records need live fetching:
      // 1. Get student DOB
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

      if (!dob) {
        loadingOverlay.style.display = 'none';
        dob = prompt('Student DOB not found in registry. Please enter Date of Birth (DD/MM/YYYY):');
        if (!dob || dob.trim().length < 6) {
          alert('Valid Date of Birth is required to access official AKTU OneView.');
          return;
        }
        dob = dob.trim();
        loadingOverlay.style.display = 'flex';
      }

      // 2. Check if Android Native Bridge is available
      if (window.AndroidBridge && typeof window.AndroidBridge.startOneViewVerification === 'function') {
        loadingOverlay.style.display = 'none';
        window.AndroidBridge.startOneViewVerification(rollNo, dob);
        return;
      }

      // 3. Fallback for Web Browser: If cached basic record is present
      if (response.ok && resData.success && resData.data) {
        localStorage.setItem('aktu_result_cache', JSON.stringify(resData.data));
        localStorage.setItem('last_searched_roll', rollNo);
        window.location.href = `/result.html?rollNo=${encodeURIComponent(rollNo)}`;
      } else {
        loadingOverlay.style.display = 'none';
        alert('Please open this search in the Android App to solve the AKTU Captcha and load the official marksheet.');
      }
    } catch (err) {
      loadingOverlay.style.display = 'none';
      console.error('Fetch error:', err);
      alert('Connection error. Please ensure the server is active and try again.');
    }
  }

  // Callback when OneView result is scraped and saved
  window.onOneViewResultReceived = function(rollNo) {
    loadingOverlay.style.display = 'flex';
    loadingTitle.textContent = 'Official Marksheet Scraped!';
    loadingSubtext.textContent = 'Loading your result...';
    setTimeout(() => {
      window.location.href = `/result.html?rollNo=${encodeURIComponent(rollNo)}`;
    }, 400);
  };
});
