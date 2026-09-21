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
    loadingTitle.textContent = 'Retrieving OneView Record...';
    loadingSubtext.textContent = 'Fetching complete marksheet and semester details';

    try {
      const response = await fetch('/api/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo })
      });

      const resData = await response.json();

      if (response.ok && resData.success && resData.data) {
        // Cache result in localStorage for result.html
        localStorage.setItem('aktu_result_cache', JSON.stringify(resData.data));
        localStorage.setItem('last_searched_roll', rollNo);

        loadingTitle.textContent = 'Success!';
        loadingSubtext.textContent = 'Opening Marksheet...';

        setTimeout(() => {
          window.location.href = `/result.html?rollNo=${encodeURIComponent(rollNo)}`;
        }, 400);
      } else {
        loadingOverlay.style.display = 'none';
        const errMsg = resData.error || 'Unable to retrieve result for this roll number.';
        alert(errMsg);
      }
    } catch (err) {
      loadingOverlay.style.display = 'none';
      console.error('Fetch error:', err);
      alert('Connection error. Please ensure the server is active and try again.');
    }
  }
});
