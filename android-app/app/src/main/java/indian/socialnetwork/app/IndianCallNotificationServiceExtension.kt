package indian.socialnetwork.app

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.annotation.Keep
import androidx.core.app.NotificationCompat
import com.onesignal.notifications.INotificationReceivedEvent
import com.onesignal.notifications.INotificationServiceExtension

@Keep
class IndianCallNotificationServiceExtension : INotificationServiceExtension {
    override fun onNotificationReceived(event: INotificationReceivedEvent) {
        val notification = event.notification
        val data = notification.additionalData ?: return
        if (data.optString("type", "") != "call") return

        val callId = data.optString("callId", "")
        if (!callId.matches(Regex("[A-Za-z0-9_-]{10,40}"))) return

        val callUrl = Uri.parse(
            "https://indian-social-network-dotcom.github.io/Indian/?indianCallId=${Uri.encode(callId)}"
        )
        val openCallIntent = Intent(event.context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            this.data = callUrl
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val openCallPendingIntent = PendingIntent.getActivity(
            event.context,
            callId.hashCode(),
            openCallIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        notification.setExtender { builder ->
            builder
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setChannelId(IncomingCallNotificationChannel.CHANNEL_ID)
                .setFullScreenIntent(openCallPendingIntent, true)
                .setContentIntent(openCallPendingIntent)
                .setAutoCancel(true)
                .setTimeoutAfter(60_000)
        }
    }
}
