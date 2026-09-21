package com.aktu.resultdesk

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.RelativeLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
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

    // State
    private var currentRollNo: String = ""
    private var currentDob: String = ""
    private var isCaptchaSubmitted: Boolean = false

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
        settings.cacheMode = WebSettings.LOAD_DEFAULT
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
        val detectScript = """
            (function() {
                var hasResult = document.querySelector('table[id*="grdViewSubjectMarksheet"]') || 
                                document.getElementById('lblFullName') || 
                                document.getElementById('lblRollNo');
                if (hasResult) return 'PAGE_RESULT';

                var hasFinal = document.getElementById('pnlFinalPanel') || document.getElementById('txtDOB') || document.getElementById('pnlCaptcha');
                if (hasFinal) return 'PAGE_STEP2_CAPTCHA';

                var hasRoll = document.getElementById('txtRollNo') || document.getElementById('btnProceed');
                if (hasRoll) return 'PAGE_STEP1_ROLL';

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
     * Step 1: Enters Roll Number and clicks "आगे बढ़े" (btnProceed).
     */
    private fun handleStep1Roll() {
        tvVerificationSubtitle.text = "Checking Roll No $currentRollNo on AKTU portal..."
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

                var btnProceed = document.getElementById('btnProceed');
                if (btnProceed) {
                    setTimeout(function() {
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
     * Step 2: Enters Date of Birth, isolates the Google reCAPTCHA widget via CSS,
     * and listens for captcha completion to click "खोजें" (btnSearch).
     */
    private fun handleStep2Captcha() {
        tvVerificationSubtitle.text = "DOB: $currentDob • Solve Captcha below to continue"
        verificationProgressBar.visibility = View.GONE

        val script = """
            (function() {
                // 1. Fill DOB
                var dobInput = document.getElementById('txtDOB');
                if (dobInput) {
                    dobInput.focus();
                    dobInput.value = '$currentDob';
                    dobInput.dispatchEvent(new Event('input', {bubbles:true}));
                    dobInput.dispatchEvent(new Event('change', {bubbles:true}));
                    dobInput.dispatchEvent(new Event('blur', {bubbles:true}));
                }

                // 2. Set light theme attribute on Google reCAPTCHA
                var gRecaptcha = document.querySelector('.g-recaptcha');
                if (gRecaptcha) {
                    gRecaptcha.setAttribute('data-theme', 'light');
                }

                // 3. Viewport meta tag
                var metaViewport = document.querySelector('meta[name="viewport"]');
                if (!metaViewport) {
                    metaViewport = document.createElement('meta');
                    metaViewport.name = 'viewport';
                    document.head.appendChild(metaViewport);
                }
                metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no';

                // 4. Inject CSS to isolate captcha box cleanly
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

                // 5. Poller to detect CAPTCHA completion & trigger search
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

        verificationWebView.evaluateJavascript(script, null)
    }

    /**
     * Scrapes live mark sheet data directly from AKTU OneView DOM.
     */
    private fun injectResultScraper() {
        val script = """
            (function() {
                function getText(id) {
                    var el = document.getElementById(id) || document.querySelector('[id*="' + id + '"]');
                    return el ? (el.innerText || el.textContent || '').trim() : '';
                }

                var roll = getText('lblRollNo') || '$currentRollNo';
                var name = getText('lblFullName') || getText('lblStudentName');
                var fatherName = getText('lblFatherName');
                var gender = getText('lblGender');
                var branch = getText('lblBranch');
                var institute = getText('lblInstitute');
                var course = getText('lblCourse') || 'B.Tech';
                var enrollmentNo = getText('lblEnrollmentNo');
                var hindiName = getText('lblHindiName');

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

                var tables = document.querySelectorAll('table[id*="grdViewSubjectMarksheet"]');
                var semesters = [];

                tables.forEach(function(tbl, idx) {
                    var container = tbl.closest('div[id*="pnl"]') || tbl.parentElement;
                    var semText = '';
                    var sessionName = '';
                    var sgpa = '';
                    var status = '';

                    if (container) {
                        var sLabel = container.querySelector('[id*="lblSemesterId"]');
                        var sessLabel = container.querySelector('[id*="lblSession"]');
                        var sgpaLabel = container.querySelector('[id*="lblSGPA"]');
                        var statusLabel = container.querySelector('[id*="lblResultStatus"]');

                        if (sLabel) semText = sLabel.innerText.trim();
                        if (sessLabel) sessionName = sessLabel.innerText.trim();
                        if (sgpaLabel) sgpa = sgpaLabel.innerText.trim();
                        if (statusLabel) status = statusLabel.innerText.trim();
                    }

                    var subjects = [];
                    var rows = tbl.querySelectorAll('tr');
                    for (var r = 1; r < rows.length; r++) {
                        var cells = rows[r].querySelectorAll('td');
                        if (cells.length >= 6) {
                            subjects.push({
                                code: cells[0].innerText.trim(),
                                name: cells[1].innerText.trim(),
                                type: cells[2].innerText.trim(),
                                internal: cells[3].innerText.trim(),
                                external: cells[4].innerText.trim(),
                                backPaper: cells[5].innerText.trim(),
                                grade: cells.length > 6 ? cells[6].innerText.trim() : '--'
                            });
                        }
                    }

                    semesters.push({
                        semester: semText || String(idx + 1),
                        session: sessionName || 'Regular',
                        sgpa: sgpa,
                        resultStatus: status,
                        subjects: subjects
                    });
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
    fun startOneView(rollNo: String, dob: String) {
        currentRollNo = rollNo
        currentDob = dob
        isCaptchaSubmitted = false

        tvVerificationTitle.text = "AKTU OneView: $rollNo"
        tvVerificationSubtitle.text = "DOB: $dob • Solve Captcha below to continue"
        verificationContainer.visibility = View.VISIBLE
        verificationProgressBar.visibility = View.VISIBLE

        verificationWebView.loadUrl(ONEVIEW_URL)
    }

    private fun cancelVerification() {
        verificationContainer.visibility = View.GONE
        verificationWebView.stopLoading()
        verificationWebView.loadUrl("about:blank")
    }

    /**
     * Saves the scraped marksheet directly to MongoDB and renders result
     */
    private fun saveScrapedResultAndShow(jsonPayload: String) {
        Thread {
            try {
                val url = URL("$APP_URL/api/save-result")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                conn.doOutput = true
                conn.connectTimeout = 15000
                conn.readTimeout = 15000

                val writer = OutputStreamWriter(conn.outputStream, "UTF-8")
                writer.write(jsonPayload)
                writer.flush()
                writer.close()

                val responseCode = conn.responseCode
                conn.disconnect()
            } catch (e: Exception) {
                e.printStackTrace()
            }

            runOnUiThread {
                verificationContainer.visibility = View.GONE
                verificationWebView.loadUrl("about:blank")
                Toast.makeText(this, "Live Marksheet Verified & Saved!", Toast.LENGTH_SHORT).show()
                // Notify Main Webview to load result
                webView.evaluateJavascript("if (window.onOneViewResultReceived) { window.onOneViewResultReceived('$currentRollNo'); } else { window.location.href = '/result.html?rollNo=$currentRollNo'; }", null)
            }
        }.start()
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun startOneViewVerification(rollNo: String, dob: String) {
            runOnUiThread {
                startOneView(rollNo, dob)
            }
        }

        @JavascriptInterface
        fun onCaptchaSolved() {
            runOnUiThread {
                isCaptchaSubmitted = true
                verificationProgressBar.visibility = View.VISIBLE
                tvVerificationSubtitle.text = "Captcha Verified! Loading Official Marksheet..."
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
                Toast.makeText(this@MainActivity, errorMessage, Toast.LENGTH_LONG).show()
                verificationProgressBar.visibility = View.GONE
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
