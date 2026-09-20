package fr.ghermin.quittance

import android.content.ClipData
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

class Bridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun version(): String =
        try {
            activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "?"
        } catch (e: Exception) {
            "?"
        }

    @JavascriptInterface
    fun sendEmail(to: String, subject: String, body: String, fileName: String, base64: String): String {
        val uri = cacheUri(fileName, base64) ?: return "error"
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            if (to.isNotBlank()) putExtra(Intent.EXTRA_EMAIL, arrayOf(to))
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, body)
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri(fileName, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val hasGmail = activity.packageManager.getLaunchIntentForPackage(GMAIL) != null
        if (hasGmail) {
            try {
                activity.startActivity(Intent(intent).setPackage(GMAIL))
                return "gmail"
            } catch (e: Exception) {
                // Gmail absent ou désactivé : on retombe sur le sélecteur
            }
        }
        return try {
            activity.startActivity(Intent.createChooser(intent, subject))
            "chooser"
        } catch (e: Exception) {
            "no-app"
        }
    }

    @JavascriptInterface
    fun openFile(fileName: String, mime: String, base64: String): String {
        val uri = cacheUri(fileName, base64) ?: return "error"
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return try {
            activity.startActivity(intent)
            "ok"
        } catch (e: Exception) {
            "no-app"
        }
    }

    @JavascriptInterface
    fun saveFile(fileName: String, mime: String, base64: String): String {
        val bytes = decode(base64) ?: return "error"
        val resolver = activity.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, safeName(fileName))
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val item = resolver.insert(collection, values) ?: return "error"
        return try {
            val out = resolver.openOutputStream(item) ?: throw IllegalStateException("no stream")
            out.use { it.write(bytes) }
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(item, values, null, null)
            "ok"
        } catch (e: Exception) {
            resolver.delete(item, null, null)
            "error"
        }
    }

    @JavascriptInterface
    fun writeBackup(json: String, monthDone: String): String {
        Reminder.setMonthDone(activity, monthDone)
        val resolver = activity.contentResolver
        val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        return try {
            val uri = findBackup() ?: run {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, BACKUP_NAME)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, BACKUP_DIR)
                }
                resolver.insert(collection, values)
            } ?: return "error"
            val out = resolver.openOutputStream(uri, "wt") ?: return "error"
            out.use { it.write(json.toByteArray(Charsets.UTF_8)) }
            "ok"
        } catch (e: Exception) {
            "error"
        }
    }

    private fun findBackup(): Uri? {
        val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val selection = "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?"
        activity.contentResolver.query(collection, arrayOf(MediaStore.MediaColumns._ID), selection, arrayOf(BACKUP_DIR, BACKUP_NAME), null)?.use { c ->
            if (c.moveToFirst()) return ContentUris.withAppendedId(collection, c.getLong(0))
        }
        return null
    }

    @JavascriptInterface
    fun setReminder(enabled: Boolean, day: Int, hour: Int): String {
        Reminder.save(activity, enabled, day, hour)
        if (!enabled) {
            Reminder.cancel(activity)
            return "disabled"
        }
        if (!Reminder.hasPermission(activity)) {
            activity.runOnUiThread { activity.requestNotificationPermission() }
            return "permission"
        }
        Reminder.schedule(activity)
        return "scheduled"
    }

    @JavascriptInterface
    fun reminderStatus(): String =
        JSONObject()
            .put("enabled", Reminder.isEnabled(activity))
            .put("day", Reminder.day(activity))
            .put("hour", Reminder.hour(activity))
            .put("next", Reminder.next(activity))
            .put("permission", Reminder.hasPermission(activity))
            .toString()

    @JavascriptInterface
    fun openNotificationSettings() {
        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            activity.startActivity(intent)
        } catch (e: Exception) {
            // réglages indisponibles sur cet appareil
        }
    }

    private fun decode(base64: String): ByteArray? =
        try {
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            null
        }

    private fun safeName(fileName: String): String =
        fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "fichier" }

    private fun cacheUri(fileName: String, base64: String): Uri? {
        val bytes = decode(base64) ?: return null
        val dir = File(activity.cacheDir, "share").apply { mkdirs() }
        val file = File(dir, safeName(fileName))
        return try {
            file.writeBytes(bytes)
            FileProvider.getUriForFile(activity, activity.packageName + ".files", file)
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        const val GMAIL = "com.google.android.gm"
        const val BACKUP_NAME = "quittances-sauvegarde.json"
        val BACKUP_DIR: String = Environment.DIRECTORY_DOCUMENTS + "/Quittances/"
    }
}
