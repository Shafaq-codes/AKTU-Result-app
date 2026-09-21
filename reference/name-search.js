document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('rollNumberInput');
  const searchBtn = document.getElementById('searchBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingStateText = document.getElementById('loadingStateText');
  const loadingSubtext = document.getElementById('loadingSubtext');
  
  const nameSearchContainer = document.getElementById('nameSearchContainer');
  const nameSearchList = document.getElementById('nameSearchList');
  const errorMessageContainer = document.getElementById('errorMessageContainer');

  // Hide loading overlay on pageshow (e.g. browser back button cache)
  window.addEventListener('pageshow', () => {
    loadingOverlay.style.display = 'none';
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

  window.addEventListener('online', syncOfflineLogs);
  syncOfflineLogs();

  // Input validation: Only allow letters and spaces
  nameInput.addEventListener('input', () => {
    nameInput.value = nameInput.value.replace(/[^a-zA-Z ]/g, '');
  });

  const loadingMessages = [
    { title: "Searching Database...", sub: "Verifying cached academic student records..." },
    { title: "Processing Records...", sub: "Retrieving session data from database..." }
  ];

  function renderMultipleMatches(matches) {
    loadingOverlay.style.display = 'none';
    nameSearchList.innerHTML = '';
    nameSearchContainer.style.display = 'block';

    matches.forEach(match => {
      const item = document.createElement('div');
      item.style.padding = '10px 12px';
      item.style.borderBottom = '1px solid #eeeeee';
      item.style.cursor = 'pointer';
      item.style.fontSize = '12px';
      item.style.transition = 'background 0.2s';
      item.style.borderRadius = '4px';
      
      item.onmouseover = () => { item.style.backgroundColor = '#f4f6f9'; };
      item.onmouseout = () => { item.style.backgroundColor = 'transparent'; };

      const info = match.studentData?.studentInfo || match;
      item.innerHTML = `
        <div style="font-weight: bold; color: #333333; margin-bottom: 2px;">${info.name}</div>
        <div style="font-size: 11px; color: #0066cc; font-weight: bold; margin-bottom: 2px;">Roll Number: ${info.rollNo}</div>
        <div style="font-size: 10px; color: #666666; line-height: 1.3;">${info.course} | ${info.branch}</div>
        <div style="font-size: 9px; color: #888888; margin-top: 1px; line-height: 1.2;">${info.institute}</div>
      `;

      item.addEventListener('click', () => {
        nameSearchContainer.style.display = 'none';
        localStorage.setItem('aktu_result_cache', JSON.stringify(match.studentData || match));
        window.location.href = '/result.html';
      });

      nameSearchList.appendChild(item);
    });
  }

  async function performNameSearch() {
    const query = nameInput.value.trim();
    if (!query) {
      nameInput.focus();
      return;
    }

    // Hide old messages & match pickers
    nameSearchContainer.style.display = 'none';
    errorMessageContainer.style.display = 'none';

    let userEmail = 'Google User';
    let userName = 'Google User';
    try {
      const s = JSON.parse(localStorage.getItem('aktu_user_session') || '{}');
      if (s.email) userEmail = s.email;
      if (s.name) userName = s.name;
    } catch (e) {}

    // 1. FAST LOCAL / OFFLINE NAME SEARCH (BBDITM & SRIMT)
    if (window.LOCAL_STUDENTS_DB) {
      const lowerQuery = query.toLowerCase();
      const queryWords = lowerQuery.split(/\s+/).filter(Boolean);

      const localMatches = [];
      for (const [rNo, sData] of Object.entries(window.LOCAL_STUDENTS_DB)) {
        const sName = (sData.studentInfo?.name || '').toLowerCase();
        // Exact match or all query words present in student name
        const isMatch = queryWords.every(w => sName.includes(w));
        if (isMatch) {
          localMatches.push({
            name: sData.studentInfo.name,
            rollNo: rNo,
            course: sData.studentInfo.course,
            branch: sData.studentInfo.branch,
            institute: sData.studentInfo.institute,
            studentData: sData
          });
        }
      }

      if (localMatches.length > 0) {
        // Log name search
        const logItem = {
          type: 'NAME_SEARCH',
          searchedName: query,
          matchesCount: localMatches.length,
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

        // Single Match -> Instant Load!
        if (localMatches.length === 1) {
          localStorage.setItem('aktu_result_cache', JSON.stringify(localMatches[0].studentData));
          window.location.href = '/result.html';
          return;
        }

        // Multiple Matches -> Show picker list
        renderMultipleMatches(localMatches);
        return;
      }
    }

    // If offline and no local matches
    if (!navigator.onLine) {
      loadingOverlay.style.display = 'none';
      errorMessageContainer.style.display = 'block';
      const msgElem = document.getElementById('errorMessageText');
      if (msgElem) msgElem.innerText = `Offline Mode: Student "${query}" not found in local cache.`;
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
    }, 1500);

    try {
      const response = await fetch('/api/check-name-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: query, userEmail, userName })
      });

      clearInterval(intervalId);
      const result = await response.json();

      if (response.status === 404) {
        loadingOverlay.style.display = 'none';
        errorMessageContainer.style.display = 'block';
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to search student name.");
      }

      // Single match found
      if (result.fromMock && result.data) {
        localStorage.setItem('aktu_result_cache', JSON.stringify(result.data));
        window.location.href = '/result.html';
        return;
      }

      // Multiple matches found
      if (result.isMultipleMatches && result.matches) {
        renderMultipleMatches(result.matches);
        return;
      }

    } catch (err) {
      clearInterval(intervalId);
      loadingOverlay.style.display = 'none';
      errorMessageContainer.style.display = 'block';
    }
  }

  searchBtn.addEventListener('click', performNameSearch);
  
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performNameSearch();
    }
  });
});
