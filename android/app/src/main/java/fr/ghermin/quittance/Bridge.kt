package fr.ghermin.quittance

import android.app.Activity
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import java.io.File

class Bridge(private val activity: Activity) {

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
    }
}
