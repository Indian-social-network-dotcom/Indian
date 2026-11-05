package indian.socialnetwork.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

object IncomingCallNotificationChannel {
    const val CHANNEL_ID = "indian_incoming_calls_v1"

    fun create(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return

        val ringtoneResourceId = context.resources.getIdentifier(
            "incoming_ringtone",
            "raw",
            context.packageName
        )
        val soundUri: Uri = if (ringtoneResourceId != 0) {
            Uri.parse("android.resource://${context.packageName}/$ringtoneResourceId")
        } else {
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        }

        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val channel = NotificationChannel(
            CHANNEL_ID,
            "Incoming calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for incoming Indian voice and video calls"
            enableVibration(true)
            setSound(soundUri, audioAttributes)
        }

        manager.createNotificationChannel(channel)
    }
}
