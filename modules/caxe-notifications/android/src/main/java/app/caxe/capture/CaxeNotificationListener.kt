package app.caxe.capture

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.app.Notification
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class CaxeNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val prefs = CaptureQueue.prefs(this)
    if (!(prefs.getStringSet("packages", emptySet()) ?: emptySet()).contains(sbn.packageName)) return
    if (sbn.isOngoing || (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
    val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
    val text = "$title\n$body".trim().take(8000)
    if (!text.contains("R$")) return
    val key = "${sbn.packageName}|${sbn.key}|${sbn.postTime}"
    val id = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
    synchronized(CaptureQueue.lock) {
      val queue = JSONArray(prefs.getString("queue", "[]"))
      for (i in 0 until queue.length()) if (queue.getJSONObject(i).getString("id") == id) return
      val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
      format.timeZone = TimeZone.getTimeZone("UTC")
      queue.put(JSONObject().put("id", id).put("text", text).put("source", sbn.packageName).put("receivedAt", format.format(Date(sbn.postTime))))
      prefs.edit().putString("queue", queue.toString()).commit()
    }
  }
}
