package indian.socialnetwork.app

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val title = TextView(this).apply {
            text = "Indian"
            textSize = 30f
            gravity = Gravity.CENTER
        }
        val status = TextView(this).apply {
            text = "Native Android app project started.\n\nFirebase sign-in and incoming-call setup are the next steps."
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(28, 20, 28, 20)
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(24, 24, 24, 24)
            addView(title)
            addView(status)
        }
        setContentView(layout)
    }
}
