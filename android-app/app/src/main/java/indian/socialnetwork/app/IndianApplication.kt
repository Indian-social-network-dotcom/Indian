package indian.socialnetwork.app

import android.app.Application
import com.onesignal.OneSignal

class IndianApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        OneSignal.initWithContext(this, ONESIGNAL_APP_ID)
        IncomingCallNotificationChannel.create(this)
    }

    companion object {
        private const val ONESIGNAL_APP_ID = "019d756d-8ff5-4c09-bcab-75ace208d8da"
    }
}
