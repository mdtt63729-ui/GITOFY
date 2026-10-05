package com.gitofy.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * The home-screen widget: a small card showing how many repositories the signed
 * in account has and the result of the most recent workflow run.
 *
 * The web layer owns the data. Whenever the app loads the repository list or
 * finishes a workflow run it calls the `updateWidget` bridge, which stores a
 * short summary here and refreshes every placed widget. The widget itself never
 * talks to the network, so it costs nothing in the background and shows the last
 * thing the app actually knew — which is why the card is honest about being
 * "last seen" rather than pretending to be live.
 *
 * updatePeriodMillis is 0 in the provider info, so nothing wakes the device on
 * a timer.
 */
class GitofyWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context))
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) refresh(context)
    }

    companion object {
        /** Broadcast the app sends when it has a fresher summary. */
        const val ACTION_REFRESH = "com.gitofy.app.WIDGET_REFRESH"

        private const val PREFS = "gitofy_widget"
        private const val KEY_REPOS = "repos"
        private const val KEY_PRIVATE = "private"
        private const val KEY_LAST_RUN = "last_run"

        /** Store a summary pushed up from the web layer, then redraw. */
        fun saveAndRefresh(context: Context, json: String) {
            try {
                val obj = JSONObject(json)
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                if (obj.has("repos")) prefs.putInt(KEY_REPOS, obj.optInt("repos", 0))
                if (obj.has("private")) prefs.putInt(KEY_PRIVATE, obj.optInt("private", 0))
                if (obj.has("lastRun")) prefs.putString(KEY_LAST_RUN, obj.optString("lastRun", ""))
                prefs.apply()
            } catch (_: Exception) {
                // A malformed payload just means the widget keeps its old text.
            }
            refresh(context)
        }

        /** Redraw every placed instance. Safe to call when none exist. */
        fun refresh(context: Context) {
            try {
                val manager = AppWidgetManager.getInstance(context)
                val ids = manager.getAppWidgetIds(ComponentName(context, GitofyWidgetProvider::class.java))
                if (ids == null || ids.isEmpty()) return
                for (id in ids) manager.updateAppWidget(id, buildViews(context))
            } catch (_: Exception) {
                // Nothing to draw is not an error.
            }
        }

        private fun buildViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.gitofy_widget)
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

            val repos = prefs.getInt(KEY_REPOS, -1)
            val privateCount = prefs.getInt(KEY_PRIVATE, 0)
            val lastRun = prefs.getString(KEY_LAST_RUN, "").orEmpty()

            val reposText = when {
                repos < 0 -> context.getString(R.string.gitofy_widget_empty)
                repos == 0 -> "No repositories yet"
                else -> {
                    val pub = (repos - privateCount).coerceAtLeast(0)
                    val tail = if (privateCount > 0) " · $privateCount private" else ""
                    "$repos ${if (repos == 1) "repository" else "repositories"} · $pub public$tail"
                }
            }
            views.setTextViewText(R.id.gitofy_widget_repos, reposText)

            val runText = if (lastRun.isBlank()) {
                context.getString(R.string.gitofy_widget_subtitle)
            } else {
                lastRun
            }
            views.setTextViewText(R.id.gitofy_widget_run, runText)

            // Tapping anywhere opens the app rather than a bare launcher restart.
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launch != null) {
                launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
                val pending = PendingIntent.getActivity(context, 0, launch, flags)
                views.setOnClickPendingIntent(R.id.gitofy_widget_root, pending)
            }
            return views
        }
    }
}
