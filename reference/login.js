document.addEventListener('DOMContentLoaded', () => {
  const googleBtnContainer = document.getElementById('googleBtnContainer');
  const authLoadingOverlay = document.getElementById('authLoadingOverlay');
  const authErrorMsg = document.getElementById('authErrorMsg');

  const AUTH_VERSION = '20260822_v1';

  // Check if valid persistent session already exists
  try {
    function getCookie(name) {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    }
    let existingSession = localStorage.getItem('aktu_user_session');
    if (!existingSession) {
      existingSession = getCookie('aktu_user_session');
      if (existingSession) localStorage.setItem('aktu_user_session', existingSession);
    }
    if (existingSession) {
      const parsed = JSON.parse(existingSession);
      if (parsed && parsed.email) {
        window.location.replace('/index.html');
        return;
      }
    }
  } catch (e) {}

  // Parse JWT token helper
  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  // Device & location detector
  function getClientDeviceInfo() {
    const ua = navigator.userAgent || '';
    let device = 'Windows PC';
    if (/android/i.test(ua)) device = 'Android Phone';
    else if (/iphone/i.test(ua)) device = 'iPhone';
    else if (/ipad/i.test(ua)) device = 'iPad';
    else if (/windows/i.test(ua)) device = 'Windows PC';
    else if (/macintosh|mac os x/i.test(ua)) device = 'Mac';
    else if (/linux/i.test(ua)) device = 'Linux PC';

    let browser = 'Chrome';
    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    let location = 'India';
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        if (tz.includes('Calcutta') || tz.includes('Kolkata')) location = 'Lucknow / India (IST)';
        else location = tz.replace('_', ' ');
      }
    } catch (e) {}

    return { device, browser, location, userAgent: ua };
  }

  // Handle Google Token response
  async function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      showError('Google authentication failed. Please try again.');
      return;
    }

    const payload = parseJwt(response.credential);
    if (!payload || !payload.email) {
      showError('Could not retrieve Google account details. Please try again.');
      return;
    }

    // Show loading state
    authLoadingOverlay.style.display = 'flex';
    authErrorMsg.style.display = 'none';

    try {
      const clientInfo = getClientDeviceInfo();

      // Send token to backend to log user in MongoDB
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: response.credential,
          profile: {
            email: payload.email,
            name: payload.name || 'Google User',
            picture: payload.picture || '',
            sub: payload.sub || ''
          },
          clientInfo
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Server authentication error');
      }

      // Store in localStorage & Cookie for permanent login on all mobile and laptop browsers
      const userSession = {
        email: payload.email.toLowerCase().trim(),
        name: payload.name || 'Google User',
        picture: payload.picture || '',
        token: response.credential,
        authTime: Date.now()
      };

      const sessionJson = JSON.stringify(userSession);
      localStorage.setItem('aktu_user_session', sessionJson);
      localStorage.setItem('app_user_email', userSession.email);

      // Save cookie with 1 year expiry
      const d = new Date();
      d.setTime(d.getTime() + (365 * 24 * 60 * 60 * 1000));
      document.cookie = `aktu_user_session=${encodeURIComponent(sessionJson)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`;

      // Redirect to main search portal
      window.location.replace('/index.html');

    } catch (err) {
      authLoadingOverlay.style.display = 'none';
      showError('Sign-in failed: ' + (err.message || 'Network error'));
    }
  }

  function showError(msg) {
    authErrorMsg.innerText = msg;
    authErrorMsg.style.display = 'block';
  }

  // Initialize Google Identity Services
  function initGoogleAuth() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
      setTimeout(initGoogleAuth, 200);
      return;
    }

    // Real Google OAuth Client ID
    const GOOGLE_CLIENT_ID = '1049066577375-msm8nn8mkjkmhigk3u6vt19krn102sfn.apps.googleusercontent.com';

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    // Render the official Google Sign-In button
    google.accounts.id.renderButton(
      googleBtnContainer,
      {
        theme: 'filled_blue',
        size: 'large',
        type: 'standard',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
        width: 210
      }
    );
  }

  initGoogleAuth();
});
