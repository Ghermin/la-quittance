Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# Les icônes viennent du playground (bored-dev-playground/brand), ce script ne fait plus que la signature.
$sigPath = Join-Path $root "tools\sample-signature.png"
$sw = 600; $sh = 220
$sbmp = New-Object System.Drawing.Bitmap $sw, $sh
$sg = [System.Drawing.Graphics]::FromImage($sbmp)
$sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$sg.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 20, 30, 90)), 6
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pts = @(
    (New-Object System.Drawing.Point 40, 160), (New-Object System.Drawing.Point 90, 40),
    (New-Object System.Drawing.Point 140, 180), (New-Object System.Drawing.Point 190, 60),
    (New-Object System.Drawing.Point 230, 150), (New-Object System.Drawing.Point 300, 90),
    (New-Object System.Drawing.Point 360, 160), (New-Object System.Drawing.Point 430, 70),
    (New-Object System.Drawing.Point 480, 140), (New-Object System.Drawing.Point 560, 110)
)
$sg.DrawCurve($pen, $pts, 0.6)
$sg.DrawLine($pen, 60, 185, 540, 175)
$sbmp.Save($sigPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sg.Dispose(); $sbmp.Dispose()
Write-Output "wrote $sigPath"
