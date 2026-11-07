package app.caxe.capture

import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

object CaptureQueue {
  val lock = Any()
  fun prefs(context: Context) = context.getSharedPreferences("caxe_capture", Context.MODE_PRIVATE)
}

class CaxeNotificationsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CaxeNotifications")
    Function("openSettings") {
      val context = appContext.reactContext ?: return@Function null
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      null
    }
    Function("isEnabled") {
      val context = appContext.reactContext ?: return@Function false
      val component = android.content.ComponentName(context, CaxeNotificationListener::class.java)
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      enabled.split(":").contains(component.flattenToString())
    }
    Function("setPackages") { packages: List<String> ->
      val context = appContext.reactContext ?: return@Function null
      CaptureQueue.prefs(context).edit().putStringSet("packages", packages.toSet()).commit()
      null
    }
    Function("sources") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, String>>()
      val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      context.packageManager.queryIntentActivities(intent, 0)
        .distinctBy { it.activityInfo.packageName }
        .filter { it.activityInfo.packageName != context.packageName }
        .map { mapOf("id" to it.activityInfo.packageName, "name" to it.loadLabel(context.packageManager).toString()) }
        .sortedBy { it["name"] }
    }
    Function("peek") {
      val context = appContext.reactContext ?: return@Function "[]"
      synchronized(CaptureQueue.lock) { CaptureQueue.prefs(context).getString("queue", "[]") ?: "[]" }
    }
    Function("acknowledge") { ids: List<String> ->
      val context = appContext.reactContext ?: return@Function null
      synchronized(CaptureQueue.lock) {
        val prefs = CaptureQueue.prefs(context)
        val queue = JSONArray(prefs.getString("queue", "[]"))
        val remaining = JSONArray()
        for (i in 0 until queue.length()) { val row = queue.getJSONObject(i); if (!ids.contains(row.getString("id"))) remaining.put(row) }
        prefs.edit().putString("queue", remaining.toString()).commit()
      }
      null
    }
  }
}
