document.addEventListener('DOMContentLoaded', () => {
  const rollInput = document.getElementById('rollNumberInput');
  const searchBtn = document.getElementById('searchBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingStateText = document.getElementById('loadingStateText');
  const loadingSubtext = document.getElementById('loadingSubtext');

  // Hide loading overlay on pageshow (e.g. browser back button cache)
  window.addEventListener('pageshow', () => {
    loadingOverlay.style.display = 'none';
  });

  // Input validation: Only allow numbers
  rollInput.addEventListener('input', () => {
    rollInput.value = rollInput.value.replace(/[^0-9]/g, '');
  });

  // Populate Google User Profile Badge in header
  try {
    const sessionStr = localStorage.getItem('aktu_user_session');
    if (sessionStr) {
      const user = JSON.parse(sessionStr);
      if (user && user.email) {
        const userBadge = document.getElementById('userBadge');
        const userAvatarImg = document.getElementById('userAvatarImg');
        const userDisplayName = document.getElementById('userDisplayName');
        const userDisplayEmail = document.getElementById('userDisplayEmail');
        
        if (userBadge) {
          userBadge.style.display = 'flex';
          if (userAvatarImg && user.picture) userAvatarImg.src = user.picture;
          if (userDisplayName) userDisplayName.innerText = user.name || 'Google User';
          if (userDisplayEmail) userDisplayEmail.innerText = user.email;
        }
      }
    }
  } catch (e) {}

  // Logout Button handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('aktu_user_session');
      document.cookie = "aktu_user_session=; path=/; max-age=0; SameSite=Lax";
      window.location.replace('/login.html');
    });
  }

  // --- Offline Logging & Queue Helper ---
  function queueOfflineLog(logItem) {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_search_queue') || '[]');
      queue.push({
        ...logItem,
        timestamp: logItem.timestamp || new Date().toISOString()
      });
      localStorage.setItem('offline_search_queue', JSON.stringify(queue));
    } catch (e) {}
  }

  async function syncOfflineLogs() {
    if (!navigator.onLine) return;
    try {
      const queueStr = localStorage.getItem('offline_search_queue');
      if (!queueStr) return;
      const queue = JSON.parse(queueStr);
      if (!Array.isArray(queue) || queue.length === 0) return;

      const res = await fetch('/api/sync-offline-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: queue })
      });
      if (res.ok) {
        localStorage.removeItem('offline_search_queue');
      }
    } catch (e) {}
  }

  // Auto-sync offline logs when network is active/restored
  window.addEventListener('online', syncOfflineLogs);
  syncOfflineLogs();

  const loadingMessages = [
    { title: "Connecting...", sub: "Retrieving student academic records..." },
    { title: "Fetching Data...", sub: "Processing marksheet layout..." }
  ];

  async function performSearch() {
    const rollNo = rollInput.value.trim();

    if (!rollNo || rollNo.length < 10) {
      alert("Please enter a valid Roll number (10-13 digits).");
      rollInput.focus();
      return;
    }

    let userEmail = 'Google User';
    let userName = 'Google User';
    try {
      const s = JSON.parse(localStorage.getItem('aktu_user_session') || '{}');
      if (s.email) userEmail = s.email;
      if (s.name) userName = s.name;
    } catch (e) {}

    // 1. FAST LOCAL / OFFLINE LOOKUP (BBDITM & SRIMT)
    if (window.LOCAL_STUDENTS_DB && window.LOCAL_STUDENTS_DB[rollNo]) {
      const localData = window.LOCAL_STUDENTS_DB[rollNo];
      localStorage.setItem('aktu_result_cache', JSON.stringify(localData));

      // Record log (immediate sync if online, or queue if offline)
      const logItem = {
        type: 'ROLL_SEARCH',
        rollNo: rollNo,
        studentName: localData.studentInfo ? localData.studentInfo.name : 'Local Student',
        userEmail: userEmail,
        userName: userName,
        timestamp: new Date().toISOString()
      };

      if (navigator.onLine) {
        fetch('/api/sync-offline-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logs: [logItem] })
        }).catch(() => {});
      } else {
        queueOfflineLog(logItem);
      }

      // Navigate immediately in 0 ms!
      window.location.href = '/result.html';
      return;
    }

    // If offline and not in local database
    if (!navigator.onLine) {
      alert(`Offline Mode: Result for Roll Number ${rollNo} is not stored locally. Please connect to internet to search other college results.`);
      return;
    }

    // 2. BACKEND CLOUD SEARCH (Other colleges)
    loadingOverlay.style.display = 'flex';
    let msgIdx = 0;
    loadingStateText.innerText = loadingMessages[0].title;
    loadingSubtext.innerText = loadingMessages[0].sub;
    
    const intervalId = setInterval(() => {
      msgIdx = (msgIdx + 1) % loadingMessages.length;
      loadingStateText.innerText = loadingMessages[msgIdx].title;
      loadingSubtext.innerText = loadingMessages[msgIdx].sub;
    }, 1200);

    try {
      const fallbackRes = await fetch('/api/fallback-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo, userEmail, userName })
      });

      const fallbackResult = await fallbackRes.json();
      clearInterval(intervalId);

      if (fallbackRes.ok && fallbackResult.success && fallbackResult.data) {
        localStorage.setItem('aktu_result_cache', JSON.stringify(fallbackResult.data));
        window.location.href = '/result.html';
        return;
      }

      throw new Error(fallbackResult.error || `Result not found for Roll Number: ${rollNo}`);

    } catch (err) {
      clearInterval(intervalId);
      loadingOverlay.style.display = 'none';
      alert(err.message || `Result for Roll Number ${rollNo} not found in database.`);
    }
  }

  searchBtn.addEventListener('click', performSearch);
  
  rollInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
});
