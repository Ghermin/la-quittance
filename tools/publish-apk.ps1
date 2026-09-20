param(
    [switch]$SkipBuild,
    [string]$Notes = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root 'android'
$dist = Join-Path $root 'dist'
$versionFile = Join-Path $dist 'version.json'
$tools = 'C:\Users\detri\android-tools'

if (-not $env:JAVA_HOME -and (Test-Path "$tools\jdk-17")) { $env:JAVA_HOME = "$tools\jdk-17" }
if (-not $env:ANDROID_HOME -and (Test-Path "$tools\sdk")) { $env:ANDROID_HOME = "$tools\sdk" }
if (-not $env:JAVA_HOME) { throw 'JAVA_HOME non defini' }
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$gradle = Get-Content (Join-Path $android 'app\build.gradle.kts') -Raw
$versionCode = [int][regex]::Match($gradle, 'versionCode = [^\n]*\?: (\d+)').Groups[1].Value
$versionName = [regex]::Match($gradle, 'versionName = [^\n]*\?: "([^"]+)"').Groups[1].Value
if (-not $versionCode -or -not $versionName) { throw 'Version introuvable dans build.gradle.kts' }

if (-not $SkipBuild) {
    Push-Location $android
    try {
        & .\gradlew.bat assembleRelease --console=plain --warning-mode=summary
        if ($LASTEXITCODE -ne 0) { throw "Gradle a echoue ($LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

$apk = Join-Path $android 'app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "APK introuvable : $apk" }
New-Item -ItemType Directory -Force $dist | Out-Null
Copy-Item $apk (Join-Path $dist 'la-quittance.apk') -Force
$size = (Get-Item (Join-Path $dist 'la-quittance.apk')).Length

if ($Notes -eq '' -and (Test-Path $versionFile)) {
    try { $Notes = [string](Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json).notes } catch { $Notes = '' }
}

$info = [ordered]@{
    version = $versionName
    code = $versionCode
    apk = 'la-quittance.apk'
    size = $size
    date = (Get-Date).ToString('yyyy-MM-dd')
    notes = $Notes
}
$json = ($info | ConvertTo-Json -Compress).Replace('\' + 'u0027', "'")
[IO.File]::WriteAllText($versionFile, $json + "`n", (New-Object System.Text.UTF8Encoding $false))

Write-Output "APK $versionName (code $versionCode), $size octets -> dist/la-quittance.apk"
Write-Output "dist/version.json mis a jour (notes conservees si -Notes absent)."
Write-Output "Reste a faire : incrementer CACHE dans sw.js si le web a change, puis commit + push."
