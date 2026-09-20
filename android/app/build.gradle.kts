import java.util.Properties
import javax.inject.Inject

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

abstract class SyncWebAssetsTask : DefaultTask() {
    @get:Inject
    abstract val fs: FileSystemOperations

    @get:Internal
    abstract val webRoot: DirectoryProperty

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sources: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outDir: DirectoryProperty

    @TaskAction
    fun sync() {
        val root = webRoot.get().asFile
        fs.sync {
            from(root) {
                include("index.html", "manifest.webmanifest", "css/**", "js/**", "icons/**")
            }
            into(outDir)
        }
    }
}

val webRootDir: File = rootProject.projectDir.parentFile

val syncWebAssets = tasks.register<SyncWebAssetsTask>("syncWebAssets") {
    webRoot.set(webRootDir)
    sources.from(fileTree(webRootDir) {
        include("index.html", "manifest.webmanifest", "css/**", "js/**", "icons/**")
    })
    outDir.set(layout.buildDirectory.dir("webassets"))
}

val signingProps = Properties().apply {
    val file = rootProject.file("signing.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun signingValue(key: String): String? = System.getenv(key) ?: signingProps.getProperty(key)

val hasReleaseKeystore = signingValue("QUITTANCE_KEYSTORE") != null

android {
    namespace = "fr.ghermin.quittance"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.ghermin.quittance"
        minSdk = 29
        targetSdk = 35
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 3
        versionName = (project.findProperty("versionName") as String?) ?: "1.2.1"
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(signingValue("QUITTANCE_KEYSTORE")!!)
                storePassword = signingValue("QUITTANCE_KEYSTORE_PASSWORD")
                keyAlias = signingValue("QUITTANCE_KEY_ALIAS")
                keyPassword = signingValue("QUITTANCE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasReleaseKeystore) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(syncWebAssets, SyncWebAssetsTask::outDir)
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
