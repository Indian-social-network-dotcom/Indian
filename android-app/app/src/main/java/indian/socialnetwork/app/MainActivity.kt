package indian.socialnetwork.app

import android.Manifest
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.Intent
import android.app.Activity
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import com.onesignal.OneSignal
import org.json.JSONTokener

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var pendingAndroidPermissions: Array<String> = emptyArray()
    private val authSyncHandler = Handler(Looper.getMainLooper())
    private var lastOneSignalUid: String? = null

    private val oneSignalIdentitySync = object : Runnable {
        override fun run() {
            if (!::webView.isInitialized || isFinishing || isDestroyed) return

            webView.evaluateJavascript(
                "(typeof window.firebaseCurrentUid === 'string' ? window.firebaseCurrentUid : null)"
            ) { result ->
                val uid = try {
                    JSONTokener(result ?: "null").nextValue() as? String
                } catch (_: Exception) {
                    null
                }

                // null means the website auth module has not initialized yet.
                // An empty string means the website has confirmed the user is signed out.
                if (uid != null && uid != lastOneSignalUid) {
                    if (uid.isNotEmpty()) {
                        OneSignal.login("indian_firebase_$uid")
                        lastOneSignalUid = uid
                    } else {
                        if (lastOneSignalUid != null) OneSignal.logout()
                        lastOneSignalUid = null
                    }
                }

                if (!isFinishing && !isDestroyed) {
                    authSyncHandler.postDelayed(this, 1500)
                }
            }
        }
    }

    companion object {
        private const val REQUEST_WEB_MEDIA_PERMISSIONS = 4101
        private const val REQUEST_NOTIFICATION_PERMISSION = 4102
        private const val REQUEST_STARTUP_MEDIA_PERMISSIONS = 4103
        private const val INDIAN_HOST = "indian-social-network-dotcom.github.io"
        private const val INDIAN_HOME_URL = "https://indian-social-network-dotcom.github.io/Indian/"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val origin: Uri = request.origin
                    if (origin.scheme != "https" || origin.host != INDIAN_HOST) {
                        request.deny()
                        return@runOnUiThread
                    }

                    val androidPermissions = mutableListOf<String>()
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources &&
                        checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
                    ) {
                        androidPermissions.add(Manifest.permission.CAMERA)
                    }
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources &&
                        checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                    ) {
                        androidPermissions.add(Manifest.permission.RECORD_AUDIO)
                    }

                    if (androidPermissions.isEmpty()) {
                        val allowedResources = allowedWebResources(request)
                        if (allowedResources.isNotEmpty()) {
                            request.grant(allowedResources)
                        } else {
                            request.deny()
                        }
                    } else {
                        pendingWebPermissionRequest?.deny()
                        pendingWebPermissionRequest = request
                        pendingAndroidPermissions = androidPermissions.toTypedArray()
                        requestPermissions(
                            pendingAndroidPermissions,
                            REQUEST_WEB_MEDIA_PERMISSIONS
                        )
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingWebPermissionRequest == request) {
                    pendingWebPermissionRequest = null
                    pendingAndroidPermissions = emptyArray()
                }
            }
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = true
        }

        setContentView(webView)

        val incomingCallUrl = incomingCallUrlFrom(intent)
        if (savedInstanceState != null && incomingCallUrl == null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(incomingCallUrl ?: INDIAN_HOME_URL)
        }

        requestStartupMediaPermissionsIfNeeded()
        authSyncHandler.post(oneSignalIdentitySync)
    }

    private fun incomingCallUrlFrom(sourceIntent: Intent?): String? {
        val uri = sourceIntent?.data ?: return null
        if (uri.scheme != "https" || uri.host != INDIAN_HOST ||
            uri.path != "/Indian/" && uri.path != "/Indian"
        ) return null

        val callId = uri.getQueryParameter("indianCallId") ?: return null
        if (!callId.matches(Regex("[A-Za-z0-9_-]{10,40}"))) return null
        return "$INDIAN_HOME_URL?indianCallId=${Uri.encode(callId)}"
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val incomingCallUrl = incomingCallUrlFrom(intent) ?: return
        if (::webView.isInitialized) webView.loadUrl(incomingCallUrl)
    }

    private fun requestStartupMediaPermissionsIfNeeded() {
        val missingPermissions = arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        ).filter { permission ->
            checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED
        }.toTypedArray()

        if (missingPermissions.isNotEmpty()) {
            requestPermissions(
                missingPermissions,
                REQUEST_STARTUP_MEDIA_PERMISSIONS
            )
        } else {
            requestNotificationPermissionIfNeeded()
        }
    }

    private fun allowedWebResources(request: PermissionRequest): Array<String> {
        return request.resources.filter { resource ->
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
                    checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                    checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                else -> false
            }
        }.toTypedArray()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_NOTIFICATION_PERMISSION
            )
        } else {
            requestFullScreenCallPermissionIfNeeded()
        }
    }

    private fun requestFullScreenCallPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < 34) return
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.canUseFullScreenIntent()) return

        AlertDialog.Builder(this)
            .setTitle("Allow full-screen incoming calls")
            .setMessage("Indian needs permission to show incoming voice and video calls on the full screen. On the next screen, allow full-screen notifications for Indian.")
            .setPositiveButton("Open settings") { _, _ ->
                try {
                    startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                            Uri.parse("package:$packageName")
                        )
                    )
                } catch (_: Exception) {
                    // The normal notification remains available if this settings page is unsupported.
                }
            }
            .setNegativeButton("Not now", null)
            .show()
    }

    @Deprecated("Deprecated in Android 6.0; kept for compatibility with the app's Activity base class")
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == REQUEST_STARTUP_MEDIA_PERMISSIONS) {
            requestNotificationPermissionIfNeeded()
            return
        }

        if (requestCode == REQUEST_NOTIFICATION_PERMISSION) {
            requestFullScreenCallPermissionIfNeeded()
            return
        }

        if (requestCode == REQUEST_WEB_MEDIA_PERMISSIONS) {
            val request = pendingWebPermissionRequest
            val requestedAndroidPermissions = pendingAndroidPermissions
            pendingWebPermissionRequest = null
            pendingAndroidPermissions = emptyArray()

            if (request == null) return

            val allGranted = requestedAndroidPermissions.isNotEmpty() &&
                requestedAndroidPermissions.all {
                    checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
                }

            if (!allGranted) {
                request.deny()
                return
            }

            val allowedResources = allowedWebResources(request)

            if (allowedResources.isNotEmpty()) {
                request.grant(allowedResources)
            } else {
                request.deny()
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        authSyncHandler.removeCallbacks(oneSignalIdentitySync)
        pendingWebPermissionRequest?.deny()
        pendingWebPermissionRequest = null
        if (::webView.isInitialized) {
            webView.destroy()
        }
        super.onDestroy()
    }
}
