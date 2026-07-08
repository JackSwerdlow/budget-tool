package com.budgettool.desktop

import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // targetSdk 35+ enforces edge-to-edge, and the WebView reports no safe-area insets to
    // CSS, so the status/gesture bars would draw over the page. Pad the content view by the
    // system-bar insets instead, and paint the uncovered strip the app's paper colour
    // (--color-paper in apps/web/src/index.css) so the bars sit on-brand.
    val content = findViewById<ViewGroup>(android.R.id.content)
    content.setBackgroundColor(Color.parseColor("#efe6d2"))
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
