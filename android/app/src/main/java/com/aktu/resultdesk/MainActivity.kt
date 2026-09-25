package com.aktu.resultdesk

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.RelativeLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    // Verification Overlay Elements
    private lateinit var verificationContainer: RelativeLayout
    private lateinit var verificationHeader: RelativeLayout
    private lateinit var tvVerificationTitle: TextView
    private lateinit var tvVerificationSubtitle: TextView
    private lateinit var btnCancelVerification: TextView
    private lateinit var verificationProgressBar: ProgressBar
    private lateinit var verificationWebView: WebView
    private lateinit var verificationLoadingView: LinearLayout
    private lateinit var tvLoadingStatus: TextView
    private lateinit var tvLoadingSubStatus: TextView

    // State
    private var currentRollNo: String = ""
    private var currentDob: String = ""
    private var isManualDob: Boolean = false
    private var isCaptchaSubmitted: Boolean = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var captchaWatchdogRunnable: Runnable? = null

    // Backend URL
    private val APP_URL = "https://aktu-result-app.onrender.com"
    private val ONEVIEW_URL = "https://erp.aktu.ac.in/webpages/oneview/oneview.aspx"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize Main App Views
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)

        // Initialize Verification Views
        verificationContainer = findViewById(R.id.verificationContainer)
        verificationHeader = findViewById(R.id.verificationHeader)
        tvVerificationTitle = findViewById(R.id.tvVerificationTitle)
        tvVerificationSubtitle = findViewById(R.id.tvVerificationSubtitle)
        btnCancelVerification = findViewById(R.id.btnCancelVerification)
        verificationProgressBar = findViewById(R.id.verificationProgressBar)
        verificationWebView = findViewById(R.id.verificationWebView)
        verificationLoadingView = findViewById(R.id.verificationLoadingView)
        tvLoadingStatus = findViewById(R.id.tvLoadingStatus)
        tvLoadingSubStatus = findViewById(R.id.tvLoadingSubStatus)

        btnCancelVerification.setOnClickListener {
            cancelVerification()
        }

        setupMainWebView()
        setupVerificationWebView()

        webView.loadUrl(APP_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupMainWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webView.clearCache(true)
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

        // Attach Android Bridge to Main App WebView
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupVerificationWebView() {
        // Enable Cookie Manager to preserve ASP.NET session state across postbacks
        val cookieManager = android.webkit.CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(verificationWebView, true)

        val settings = verificationWebView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.userAgentString = "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

        // Attach Bridges
        val bridge = AndroidBridge()
        verificationWebView.addJavascriptInterface(bridge, "AndroidBridge")
        verificationWebView.addJavascriptInterface(bridge, "HTMLOUT")

        verificationWebView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                verificationProgressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                verificationProgressBar.visibility = View.GONE
                handleOneViewPageFinished(url ?: "")
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }
        }

        verificationWebView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    verificationProgressBar.visibility = View.VISIBLE
                    verificationProgressBar.progress = newProgress
                } else {
                    verificationProgressBar.visibility = View.GONE
                }
            }
        }
    }

    /**
     * Handles AKTU OneView 2-step process:
     * Step 1: Roll number input + "आगे बढ़े" (btnProceed).
     * Step 2: DOB input + reCAPTCHA widget (btnSearch).
     * Step 3: Result marksheet rendered.
     */
    private fun handleOneViewPageFinished(url: String) {
        val lowerUrl = url.lowercase()
        if (lowerUrl.contains("ovengine.aspx")) {
            captchaWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }
            tvVerificationTitle.text = "Official Marksheet Loaded"
            tvVerificationSubtitle.text = "Extracting records, please wait..."
            injectResultScraper()
            return
        }

        // If captcha was submitted, check if it failed or reloaded with error
        if (isCaptchaSubmitted) {
            val checkErrorScript = """
                (function() {
                    var alertBox = document.getElementById('alert_container') || document.querySelector('.messagealert');
                    var alertText = alertBox ? (alertBox.innerText || alertBox.textContent || '').trim() : '';

                    var errorSpans = document.querySelectorAll('span[style*="Red" i], .text-danger, .alert-danger');
                    var errSpanText = '';
                    for (var i = 0; i < errorSpans.length; i++) {
                        var st = (errorSpans[i].innerText || errorSpans[i].textContent || '').trim();
                        if (st && st !== '*') { errSpanText += ' ' + st; }
                    }

                    var bodyText = document.body ? (document.body.innerText || '') : '';
                    var hasWrong = alertText.length > 0 || 
                                   errSpanText.length > 0 || 
                                   bodyText.indexOf('Record not found') !== -1 || 
                                   bodyText.indexOf('Invalid Date of Birth') !== -1 ||
                                   bodyText.indexOf('Please enter valid Date of Birth') !== -1;

                    return JSON.stringify({
                        hasError: hasWrong,
                        message: alertText || errSpanText || 'Invalid Date of Birth or Record Not Found'
                    });
                })();
            """.trimIndent()

            verificationWebView.evaluateJavascript(checkErrorScript) { jsonRes ->
                try {
                    val cleanRes = jsonRes?.replace("^\"|\"$".toRegex(), "")?.replace("\\\"", "\"")?.replace("\\\\", "\\") ?: "{}"
                    val obj = JSONObject(cleanRes)
                    if (obj.optBoolean("hasError", false)) {
                        captchaWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }
                        handleVerificationFailed(obj.optString("message", "Incorrect Date of Birth"))
                        return@evaluateJavascript
                    }
                } catch (e: Exception) {}
            }
        }

        val detectScript = """
            (function() {
                var hasFinal = document.getElementById('pnlFinalPanel') || document.getElementById('txtDOB') || document.getElementById('pnlCaptcha');
                if (hasFinal) return 'PAGE_STEP2_CAPTCHA';

                var hasRoll = document.getElementById('txtRollNo') || document.getElementById('btnProceed');
                if (hasRoll) return 'PAGE_STEP1_ROLL';

                var hasTables = document.querySelector('table[id*="grdViewSubjectMarksheet" i]');
                if (hasTables) return 'PAGE_RESULT';

                return 'PAGE_UNKNOWN';
            })();
        """.trimIndent()

        verificationWebView.evaluateJavascript(detectScript) { pageType ->
            val cleanType = pageType?.replace("\"", "")?.trim() ?: ""
            when (cleanType) {
                "PAGE_STEP1_ROLL" -> handleStep1Roll()
                "PAGE_STEP2_CAPTCHA" -> handleStep2Captcha()
                "PAGE_RESULT" -> injectResultScraper()
            }
        }
    }

    /**
     * Step 1: Enters Roll Number and clicks "आगे बढ़े" (btnProceed) completely in the background.
     */
    private fun handleStep1Roll() {
        tvVerificationTitle.text = "Security Verification"
        tvVerificationSubtitle.text = "Connecting to AKTU server..."
        verificationLoadingView.visibility = View.VISIBLE
        verificationWebView.visibility = View.GONE
        tvLoadingStatus.text = "Checking Records..."
        tvLoadingSubStatus.text = "Connecting to university portal, please wait..."
        verificationProgressBar.visibility = View.VISIBLE

        val script = """
            (function() {
                var rollInput = document.getElementById('txtRollNo');
                if (!rollInput) {
                    var inputs = document.querySelectorAll('input[type=text]');
                    for (var i=0; i<inputs.length; i++){
                        var idn = (inputs[i].id + ' ' + inputs[i].name).toLowerCase();
                        if (idn.indexOf('roll') !== -1) { rollInput = inputs[i]; break; }
                    }
                }
                if (rollInput) {
                    rollInput.focus();
                    rollInput.value = '$currentRollNo';
                    rollInput.dispatchEvent(new Event('input', {bubbles:true}));
                    rollInput.dispatchEvent(new Event('change', {bubbles:true}));
                    rollInput.dispatchEvent(new Event('blur', {bubbles:true}));
                }

                if (typeof Page_ValidationActive !== 'undefined') {
                    Page_ValidationActive = false;
                }

                var btnProceed = document.getElementById('btnProceed');
                if (btnProceed) {
                    setTimeout(function() {
                        if (typeof Page_ValidationActive !== 'undefined') Page_ValidationActive = false;
                        btnProceed.click();
                    }, 400);
                } else if (typeof __doPostBack === 'function') {
                    __doPostBack('btnProceed', '');
                }
            })();
        """.trimIndent()

        verificationWebView.evaluateJavascript(script, null)
    }

    /**
     * Step 2: Enters Date of Birth silently, isolates the Google reCAPTCHA widget via CSS,
     * reveals ONLY the Captcha box to the user, and triggers search upon captcha completion.
     */
    private fun handleStep2Captcha() {
        tvVerificationTitle.text = "Security Verification"
        tvVerificationSubtitle.text = "Please solve the captcha below to view result"
        verificationProgressBar.visibility = View.GONE

        val cleanDob = currentDob.replace("-", "/").trim()

        val script = """
            (function() {
                // 1. Fill DOB invisibly (format DD/MM/YYYY)
                var dobInput = document.getElementById('txtDOB');
                if (dobInput) {
                    dobInput.focus();
                    dobInput.value = '$cleanDob';
                    dobInput.dispatchEvent(new Event('input', {bubbles:true}));
                    dobInput.dispatchEvent(new Event('change', {bubbles:true}));
                    dobInput.dispatchEvent(new Event('blur', {bubbles:true}));
                }

                // 2. Hide surrounding clutter directly via DOM
                var rollWrap = document.getElementById('txtRollNo');
                if (rollWrap && rollWrap.closest('.wrap-input100')) {
                    rollWrap.closest('.wrap-input100').style.display = 'none';
                }
                var pnlDob = document.getElementById('pnlDOB');
                if (pnlDob) pnlDob.style.display = 'none';
                var btnSearch = document.getElementById('btnSearch');
                if (btnSearch) btnSearch.style.display = 'none';
                var topImg = document.querySelector('.newlogin-image');
                if (topImg) topImg.style.display = 'none';
                var topTitle = document.querySelector('.login100-form-title');
                if (topTitle) topTitle.style.display = 'none';

                // 3. Ensure captcha panel is centered and visible
                var pnlCaptcha = document.getElementById('pnlCaptcha');
                if (pnlCaptcha) {
                    pnlCaptcha.style.display = 'flex';
                    pnlCaptcha.style.justifyContent = 'center';
                    pnlCaptcha.style.alignItems = 'center';
                    pnlCaptcha.style.margin = '30px auto';
                    pnlCaptcha.style.visibility = 'visible';
                }

                // 4. Set light theme attribute on Google reCAPTCHA
                var gRecaptcha = document.querySelector('.g-recaptcha');
                if (gRecaptcha) {
                    gRecaptcha.setAttribute('data-theme', 'light');
                }

                // 5. Viewport meta tag
                var metaViewport = document.querySelector('meta[name="viewport"]');
                if (!metaViewport) {
                    metaViewport = document.createElement('meta');
                    metaViewport.name = 'viewport';
                    document.head.appendChild(metaViewport);
                }
                metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no';

                // 6. Inject CSS to isolate captcha box cleanly without any site text or fields
                var styleId = 'customCaptchaStyle';
                var styleEl = document.getElementById(styleId);
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = styleId;
                    document.head.appendChild(styleEl);
                }
                styleEl.innerHTML = `
                    .newlogin-image, .login100-form-title, #btnSearch, .messagealert, #alert_container, #pnlConfliction, #printArea, header, footer, nav, img, h1, h2, h3, h4, h5, h6, span[id*="rfv"], span[id*="lbl"], label, p, a, hr, caption {
                        display: none !important;
                    }
                    .wrap-input100:has(#txtRollNo), #txtRollNo, #pnlDOB, .wrap-input100:has(#txtDOB), .container-login100-form-btn {
                        display: none !important;
                    }
                    .login100-form > div:not(#pnlMain):not(#pnlFinalPanel) {
                        display: none !important;
                    }
                    .container-login100::before, .wrap-login100::before, .limiter::before, .login100-form::before {
                        display: none !important;
                        background: none !important;
                    }
                    html, body {
                        touch-action: pan-x pan-y !important;
                        -webkit-text-size-adjust: 100% !important;
                        background: #F8FAFC !important;
                    }
                    html, body, form, .limiter, .container-login100, .wrap-login100, .login100-form, #pnlMain, #pnlFinalPanel, #pnlCaptcha {
                        background: #F8FAFC !important;
                        background-color: #F8FAFC !important;
                        background-image: none !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 100% !important;
                        border: none !important;
                        overflow: auto !important;
                        color: #0F172A !important;
                    }
                    #pnlCaptcha {
                        display: flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                        margin: 40px auto !important;
                        padding: 20px 0 !important;
                        min-height: 100px !important;
                    }
                    .g-recaptcha {
                        display: inline-block !important;
                        margin: 0 auto !important;
                    }
                `;

                // 7. Poller to detect CAPTCHA completion & trigger search
                if (window.captchaPollerInterval) {
                    clearInterval(window.captchaPollerInterval);
                }
                window.captchaPollerInterval = setInterval(function() {
                    var resp = document.getElementById('g-recaptcha-response');
                    if (resp && resp.value && resp.value.trim().length > 0) {
                        clearInterval(window.captchaPollerInterval);
                        if (window.AndroidBridge && typeof window.AndroidBridge.onCaptchaSolved === 'function') {
                            window.AndroidBridge.onCaptchaSolved();
                        }
                        if (typeof Page_ValidationActive !== 'undefined') {
                            Page_ValidationActive = false;
                        }
                        var btn = document.getElementById('btnSearch');
                        if (btn) {
                            btn.click();
                        } else if (typeof __doPostBack === 'function') {
                            __doPostBack('btnSearch', '');
                        }
                    }
                }, 300);
            })();
        """.trimIndent()

        verificationWebView.evaluateJavascript(script) {
            // Once script executes, reveal only the clean captcha widget
            verificationWebView.postDelayed({
                if (!isCaptchaSubmitted) {
                    verificationLoadingView.visibility = View.GONE
                    verificationWebView.visibility = View.VISIBLE
                }
            }, 300)
        }
    }

    /**
     * Scrapes live mark sheet data directly from AKTU OneView DOM.
     */
    private fun injectResultScraper() {
        val script = """
            (function() {
                function getText(id) {
                    var el = document.getElementById(id) || document.querySelector('[id*="' + id + '" i]');
                    return el ? (el.innerText || el.textContent || '').trim() : '';
                }

                function getFieldByLabel(labelName) {
                    var cells = document.querySelectorAll('td, span, label, b, strong');
                    for (var i = 0; i < cells.length; i++) {
                        var txt = (cells[i].innerText || cells[i].textContent || '').trim();
                        if (txt.toLowerCase().indexOf(labelName.toLowerCase()) === 0) {
                            var next = cells[i].nextElementSibling;
                            while (next) {
                                var val = (next.innerText || next.textContent || '').replace(/^[:\s]+/, '').trim();
                                if (val && val !== ':') return val;
                                next = next.nextElementSibling;
                            }
                        }
                    }
                    return '';
                }

                var roll = getText('lblRollNo') || getFieldByLabel('RollNo') || '$currentRollNo';
                var name = getText('lblFullName') || getText('lblStudentName') || getFieldByLabel('Name');
                var fatherName = getText('lblFatherName') || getFieldByLabel("Father's Name");
                var gender = getText('lblGender') || getFieldByLabel('Gender');
                var branch = getText('lblBranch') || getFieldByLabel('Branch');
                var institute = getText('lblInstitute') || getFieldByLabel('Institute');
                var course = getText('lblCourse') || getFieldByLabel('Course') || 'B.Tech';
                var enrollmentNo = getText('lblEnrollmentNo') || getFieldByLabel('EnrollmentNo');
                var hindiName = getText('lblHindiName') || getFieldByLabel('Hindi Name');

                var studentInfo = {
                    name: name,
                    hindiName: hindiName,
                    rollNo: roll,
                    enrollmentNo: enrollmentNo,
                    course: course,
                    branch: branch,
                    institute: institute,
                    fatherName: fatherName,
                    gender: gender
                };

                // Find all Session header texts on the page (e.g. Session 1, Session 2...)
                var allSessionBars = [];
                var allEls = document.querySelectorAll('div, span, td, p');
                for (var d = 0; d < allEls.length; d++) {
                    var t = (allEls[d].innerText || allEls[d].textContent || '').trim();
                    if ((t.indexOf('Session :') === 0 || t.indexOf('Session:') === 0) && t.indexOf('Semesters') !== -1) {
                        if (!allSessionBars.some(function(b) { return b.raw === t; })) {
                            var mS = t.match(/Session\s*:\s*([^\s|]+(?:\([^\)]+\))?)/i);
                            var mR = t.match(/Result\s*:\s*([^|]+)/i);
                            var sTitle = mS ? mS[1] : '';
                            var rStatus = mR ? mR[1].trim() : '';
                            allSessionBars.push({ raw: t, sessionName: sTitle, resultStatus: rStatus });
                        }
                    }
                }

                var tables = document.querySelectorAll('table[id*="grdViewSubjectMarksheet" i], table[id*="SubjectMarksheet" i], table[id*="grdView" i]');
                var allSgpa = document.querySelectorAll('[id*="lblSGPA" i]');
                var allSemIds = document.querySelectorAll('[id*="lblSemesterId" i]');
                var allSessions = document.querySelectorAll('[id*="lblSession" i]');
                var allStatuses = document.querySelectorAll('[id*="lblResultStatus" i]');
                var semesters = [];

                function findMetaVal(containerEl, key) {
                    if (!containerEl) return '';
                    var tds = containerEl.querySelectorAll('td');
                    for (var i = 0; i < tds.length; i++) {
                        var txt = (tds[i].innerText || tds[i].textContent || '').trim();
                        if (txt.toLowerCase().indexOf(key.toLowerCase()) === 0) {
                            var valTd = tds[i].nextElementSibling;
                            while (valTd) {
                                var v = (valTd.innerText || valTd.textContent || '').replace(/^[:\s]+/, '').trim();
                                if (v && v !== ':') return v;
                                valTd = valTd.nextElementSibling;
                            }
                        }
                    }
                    return '';
                }

                tables.forEach(function(tbl, idx) {
                    var semText = '';
                    var sgpa = '';
                    var status = '';
                    var evenOdd = '';
                    var totalMarks = '';
                    var totalSubjects = '';
                    var decDate = '';

                    // Assign corresponding session from session bars (2 tables per session)
                    var sessionIdx = Math.floor(idx / 2);
                    var sessionObj = allSessionBars[sessionIdx] || allSessionBars[allSessionBars.length - 1] || null;
                    var sessionName = sessionObj ? sessionObj.sessionName : (allSessionBars[0] ? allSessionBars[0].sessionName : 'Regular');
                    status = sessionObj ? sessionObj.resultStatus : (allSessionBars[0] ? allSessionBars[0].resultStatus : 'PASS');

                    // Walk up parent tree to find closest container with semester metadata
                    var container = tbl.parentElement;
                    while (container && container !== document.body) {
                        var sLabel = container.querySelector('[id*="lblSemesterId" i]');
                        var sessLabel = container.querySelector('[id*="lblSession" i]');
                        var sgpaLabel = container.querySelector('[id*="lblSGPA" i]');
                        var statusLabel = container.querySelector('[id*="lblResultStatus" i]');

                        if (sLabel && !semText) semText = (sLabel.innerText || sLabel.textContent || '').trim();
                        if (sessLabel && sessLabel.innerText.trim()) sessionName = sessLabel.innerText.trim();
                        if (sgpaLabel && !sgpa) sgpa = (sgpaLabel.innerText || sgpaLabel.textContent || '').trim();
                        if (statusLabel && statusLabel.innerText.trim()) status = statusLabel.innerText.trim();

                        // Try finding meta table values in this container
                        if (!sgpa) sgpa = findMetaVal(container, 'SGPA');
                        if (!semText) semText = findMetaVal(container, 'Semester');
                        if (!evenOdd) evenOdd = findMetaVal(container, 'Even/Odd');
                        if (!totalMarks) totalMarks = findMetaVal(container, 'Total Marks');
                        if (!totalSubjects) totalSubjects = findMetaVal(container, 'Total Subjects');
                        if (!decDate) decDate = findMetaVal(container, 'Date of Declaration');

                        if (semText || sgpa) break;
                        container = container.parentElement;
                    }

                    // Index fallback if container walk didn't find all labels
                    if (!sgpa && allSgpa[idx]) sgpa = (allSgpa[idx].innerText || allSgpa[idx].textContent || '').trim();
                    if (!semText && allSemIds[idx]) semText = (allSemIds[idx].innerText || allSemIds[idx].textContent || '').trim();
                    if (allSessions[idx] && allSessions[idx].innerText.trim()) sessionName = allSessions[idx].innerText.trim();
                    if (allStatuses[idx] && allStatuses[idx].innerText.trim()) status = allStatuses[idx].innerText.trim();

                    // Extract numbers from SGPA if label contained text like "SGPA: 8.25"
                    if (sgpa && sgpa.toLowerCase().indexOf('sgpa') !== -1) {
                        var m = sgpa.match(/([0-9]+(?:\.[0-9]+)?)/);
                        if (m) sgpa = m[1];
                    }

                    // Ensure clean integer semester number
                    var semNumMatch = semText.match(/([0-9]+)/);
                    var finalSemNumber = semNumMatch ? semNumMatch[1] : String(idx + 1);
                    var calcEvenOdd = (parseInt(finalSemNumber) % 2 === 0) ? 'Even' : 'Odd';

                    var subjects = [];
                    var rows = tbl.querySelectorAll('tr');
                    for (var r = 1; r < rows.length; r++) {
                        var cells = rows[r].querySelectorAll('td');
                        if (cells.length >= 6) {
                            var code = (cells[0].innerText || cells[0].textContent || '').trim();
                            var sName = (cells[1].innerText || cells[1].textContent || '').trim();
                            // Skip header row repeats
                            if (code.toLowerCase() === 'code' || code.toLowerCase() === 'subject code') continue;
                            subjects.push({
                                code: code,
                                name: sName,
                                type: (cells[2].innerText || cells[2].textContent || '').trim(),
                                internal: (cells[3].innerText || cells[3].textContent || '').trim(),
                                external: (cells[4].innerText || cells[4].textContent || '').trim(),
                                backPaper: (cells[5].innerText || cells[5].textContent || '').trim(),
                                grade: cells.length > 6 ? (cells[6].innerText || cells[6].textContent || '').trim() : '--'
                            });
                        }
                    }

                    if (subjects.length > 0) {
                        semesters.push({
                            semester: finalSemNumber,
                            session: sessionName || 'Regular',
                            evenOdd: evenOdd || calcEvenOdd,
                            totalMarksObtained: totalMarks,
                            totalSubjects: totalSubjects || subjects.length,
                            dateOfDeclaration: decDate,
                            sgpa: sgpa,
                            resultStatus: status,
                            subjects: subjects
                        });
                    }
                });

                var payload = {
                    studentInfo: studentInfo,
                    semesters: semesters
                };

                if (window.AndroidBridge && typeof window.AndroidBridge.onResultScraped === 'function') {
                    window.AndroidBridge.onResultScraped(JSON.stringify(payload));
                }
            })();
        """.trimIndent()

        verificationWebView.evaluateJavascript(script, null)
    }

    /**
     * Starts live verification flow
     */
    fun startOneView(rollNo: String, dob: String, isManual: Boolean = false) {
        currentRollNo = rollNo
        currentDob = dob
        isManualDob = isManual
        isCaptchaSubmitted = false
        captchaWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }

        tvVerificationTitle.text = "Security Verification"
        tvVerificationSubtitle.text = "Please solve the captcha to continue"

        verificationContainer.visibility = View.VISIBLE
        verificationLoadingView.visibility = View.VISIBLE
        verificationWebView.visibility = View.GONE
        tvLoadingStatus.text = "Connecting to AKTU Portal..."
        tvLoadingSubStatus.text = "Preparing verification check, please wait..."
        verificationProgressBar.visibility = View.VISIBLE

        verificationWebView.loadUrl(ONEVIEW_URL)
    }

    private fun cancelVerification() {
        captchaWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }
        isCaptchaSubmitted = false
        verificationContainer.visibility = View.GONE
        verificationLoadingView.visibility = View.GONE
        verificationWebView.visibility = View.GONE
        verificationWebView.stopLoading()
        verificationWebView.loadUrl("about:blank")
    }

    /**
     * Called when AKTU OneView rejects the DOB or verification fails
     */
    private fun handleVerificationFailed(errorMsg: String) {
        runOnUiThread {
            cancelVerification()

            // Asynchronously log wrong DOB attempt to server
            val attemptedRoll = currentRollNo
            val attemptedDob = currentDob
            Thread {
                try {
                    val url = URL("$APP_URL/api/log-wrong-dob")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "POST"
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                    conn.doOutput = true
                    val payload = JSONObject().apply {
                        put("rollNo", attemptedRoll)
                        put("attemptedDob", attemptedDob)
                    }
                    val writer = OutputStreamWriter(conn.outputStream, "UTF-8")
                    writer.write(payload.toString())
                    writer.flush()
                    writer.close()
                    conn.responseCode
                    conn.disconnect()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }.start()

            // Notify webView to show DOB not found / wrong DOB modal
            val safeRoll = attemptedRoll.replace("'", "\\'")
            val safeDob = attemptedDob.replace("'", "\\'")
            val safeErr = errorMsg.replace("'", "\\'")
            val js = "window.onOneViewWrongDob && window.onOneViewWrongDob('$safeRoll', '$safeDob', '$safeErr');"
            webView.evaluateJavascript(js, null)

            Toast.makeText(this, "Incorrect Date of Birth! Please enter correct DOB.", Toast.LENGTH_LONG).show()
        }
    }

    /**
     * Saves the scraped marksheet directly to MongoDB and renders result
     */
    private fun saveScrapedResultAndShow(jsonPayload: String) {
        captchaWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }
        Thread {
            var payloadToInject = jsonPayload
            try {
                // Ensure dob is sent with result payload so valid manual DOB gets saved
                val payloadObj = JSONObject(jsonPayload)
                payloadObj.put("dob", currentDob)
                val payloadStr = payloadObj.toString()

                val url = URL("$APP_URL/api/save-result")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                conn.doOutput = true
                conn.connectTimeout = 15000
                conn.readTimeout = 15000

                val writer = OutputStreamWriter(conn.outputStream, "UTF-8")
                writer.write(payloadStr)
                writer.flush()
                writer.close()

                if (conn.responseCode == 200) {
                    val respText = conn.inputStream.bufferedReader().use { it.readText() }
                    val respObj = JSONObject(respText)
                    if (respObj.optBoolean("success") && respObj.has("data")) {
                        payloadToInject = respObj.getJSONObject("data").toString()
                    }
                }
                conn.disconnect()
            } catch (e: Exception) {
                e.printStackTrace()
            }

            runOnUiThread {
                verificationContainer.visibility = View.GONE
                verificationWebView.loadUrl("about:blank")
                Toast.makeText(this, "Marksheet Verified!", Toast.LENGTH_SHORT).show()

                // Inject directly into localStorage so result.html can render full marksheet immediately
                val safeJson = payloadToInject
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\n", " ")
                    .replace("\r", " ")

                val script = """
                    try {
                        localStorage.setItem('aktu_result_cache', '$safeJson');
                        localStorage.setItem('last_searched_roll', '$currentRollNo');
                    } catch(e) {}
                    if (window.onOneViewResultReceived) {
                        window.onOneViewResultReceived('$currentRollNo');
                    } else {
                        window.location.href = '/result.html?rollNo=$currentRollNo';
                    }
                """.trimIndent()
                webView.evaluateJavascript(script, null)
            }
        }.start()
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun startOneViewVerification(rollNo: String, dob: String) {
            runOnUiThread {
                startOneView(rollNo, dob, false)
            }
        }

        @JavascriptInterface
        fun startOneViewVerification(rollNo: String, dob: String, isManual: Boolean) {
            runOnUiThread {
                startOneView(rollNo, dob, isManual)
            }
        }

        @JavascriptInterface
        fun onCaptchaSolved() {
            runOnUiThread {
                isCaptchaSubmitted = true
                verificationWebView.visibility = View.GONE
                verificationLoadingView.visibility = View.VISIBLE
                tvLoadingStatus.text = "Captcha Verified!"
                tvLoadingSubStatus.text = "Loading official marksheet, please wait..."
                tvVerificationSubtitle.text = "Loading official marksheet..."

                // 20-second timeout watchdog in case DOB is wrong or portal hangs
                captchaWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }
                captchaWatchdogRunnable = Runnable {
                    if (isCaptchaSubmitted && verificationContainer.visibility == View.VISIBLE) {
                        handleVerificationFailed("Incorrect Date of Birth or verification timed out.")
                    }
                }
                mainHandler.postDelayed(captchaWatchdogRunnable!!, 20000)
            }
        }

        @JavascriptInterface
        fun onCaptchaState(isSolved: Boolean) {
            if (isSolved && !isCaptchaSubmitted) {
                onCaptchaSolved()
            }
        }

        @JavascriptInterface
        fun onResultScraped(jsonPayload: String) {
            runOnUiThread {
                tvVerificationSubtitle.text = "Official Marksheet Scraped! Storing to Database..."
                saveScrapedResultAndShow(jsonPayload)
            }
        }

        @JavascriptInterface
        fun onOneViewError(errorMessage: String) {
            runOnUiThread {
                handleVerificationFailed(errorMessage)
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (verificationContainer.visibility == View.VISIBLE) {
                cancelVerification()
                return true
            }
            if (webView.canGoBack()) {
                webView.goBack()
                return true
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
