package indian.socialnetwork.app

import android.app.Application

class IndianApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        IncomingCallNotificationChannel.create(this)
    }
}
