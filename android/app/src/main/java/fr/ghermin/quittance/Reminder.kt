package fr.ghermin.quittance

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.util.Calendar
import java.util.Locale

object Reminder {
    const val CHANNEL_ID = "rappels"
    const val ACTION_FIRE = "fr.ghermin.quittance.REMINDER"
    private const val PREFS = "quittance"
    private const val REQUEST_CODE = 1001
    private const val NOTIFICATION_ID = 1
    private val MONTHS = arrayOf("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre")

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun save(ctx: Context, enabled: Boolean, day: Int, hour: Int) {
        prefs(ctx).edit()
            .putBoolean("reminder_enabled", enabled)
            .putInt("reminder_day", day.coerceIn(1, 31))
            .putInt("reminder_hour", hour.coerceIn(0, 23))
            .apply()
    }

    fun setMonthDone(ctx: Context, month: String) {
        prefs(ctx).edit().putString("month_done", month).apply()
    }

    fun isEnabled(ctx: Context) = prefs(ctx).getBoolean("reminder_enabled", false)
    fun day(ctx: Context) = prefs(ctx).getInt("reminder_day", 10)
    fun hour(ctx: Context) = prefs(ctx).getInt("reminder_hour", 9)
    fun next(ctx: Context) = prefs(ctx).getLong("reminder_next", 0L)

    fun hasPermission(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun nextTrigger(now: Calendar, day: Int, hour: Int): Long {
        val c = now.clone() as Calendar
        c.set(Calendar.MINUTE, 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        c.set(Calendar.HOUR_OF_DAY, hour.coerceIn(0, 23))
        c.set(Calendar.DAY_OF_MONTH, day.coerceIn(1, c.getActualMaximum(Calendar.DAY_OF_MONTH)))
        if (c.timeInMillis <= now.timeInMillis) {
            c.set(Calendar.DAY_OF_MONTH, 1)
            c.add(Calendar.MONTH, 1)
            c.set(Calendar.DAY_OF_MONTH, day.coerceIn(1, c.getActualMaximum(Calendar.DAY_OF_MONTH)))
        }
        return c.timeInMillis
    }

    fun schedule(ctx: Context) {
        if (!isEnabled(ctx)) return
        val at = nextTrigger(Calendar.getInstance(), day(ctx), hour(ctx))
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pendingIntent(ctx))
        prefs(ctx).edit().putLong("reminder_next", at).apply()
    }

    fun cancel(ctx: Context) {
        (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent(ctx))
        prefs(ctx).edit().remove("reminder_next").apply()
    }

    private fun pendingIntent(ctx: Context): PendingIntent {
        val intent = Intent(ctx, ReminderReceiver::class.java).setAction(ACTION_FIRE)
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun ensureChannel(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(CHANNEL_ID, "Rappel mensuel", NotificationManager.IMPORTANCE_DEFAULT)
            channel.description = "Rappel pour envoyer les quittances de loyer du mois"
            nm.createNotificationChannel(channel)
        }
    }

    fun currentMonthKey(now: Calendar): String =
        String.format(Locale.ROOT, "%04d-%02d", now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1)

    @SuppressLint("MissingPermission")
    fun fire(ctx: Context) {
        val now = Calendar.getInstance()
        val monthDone = prefs(ctx).getString("month_done", "") == currentMonthKey(now)
        if (isEnabled(ctx) && hasPermission(ctx) && !monthDone) {
            ensureChannel(ctx)
            val open = PendingIntent.getActivity(
                ctx, 0,
                Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val month = MONTHS[now.get(Calendar.MONTH)]
            val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Quittances de $month")
                .setContentText("C'est le moment d'envoyer les quittances de loyer du mois.")
                .setContentIntent(open)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build()
            try {
                NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, notification)
            } catch (e: SecurityException) {
                // permission retirée entre-temps : on reprogramme simplement
            }
        }
        schedule(ctx)
    }
}
