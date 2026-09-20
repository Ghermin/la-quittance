$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $root 'android\app\src\main\res'
$src = [System.Drawing.Image]::FromFile((Join-Path $root 'icons\icon-maskable-512.png'))
$probe = New-Object System.Drawing.Bitmap $src
$bg = $probe.GetPixel(4, 4)
$hex = '#{0:X2}{1:X2}{2:X2}' -f $bg.R, $bg.G, $bg.B

$sizes = [ordered]@{ 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
foreach ($k in $sizes.Keys) {
    $n = $sizes[$k]
    $dir = Join-Path $res "mipmap-$k"
    New-Item -ItemType Directory -Force $dir | Out-Null
    $out = New-Object System.Drawing.Bitmap $n, $n
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($bg)
    $inner = [int][Math]::Round($n * 0.76)
    $off = [int][Math]::Floor(($n - $inner) / 2)
    $g.DrawImage($src, $off, $off, $inner, $inner)
    $g.Dispose()
    $out.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $out.Dispose()
}
$probe.Dispose()
$src.Dispose()

$utf8 = New-Object System.Text.UTF8Encoding $false
New-Item -ItemType Directory -Force (Join-Path $res 'values'), (Join-Path $res 'mipmap-anydpi-v26') | Out-Null
[IO.File]::WriteAllText((Join-Path $res 'values\ic_launcher_background.xml'), @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$hex</color>
</resources>
"@, $utf8)
[IO.File]::WriteAllText((Join-Path $res 'mipmap-anydpi-v26\ic_launcher.xml'), @"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"@, $utf8)
Write-Output "icons OK (background $hex)"
