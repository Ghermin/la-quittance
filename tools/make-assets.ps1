Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$icons = Join-Path $root "icons"
New-Item -ItemType Directory -Force $icons | Out-Null

function New-Icon([int]$size, [string]$path, [bool]$maskable) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

    $bg = [System.Drawing.Color]::FromArgb(255, 31, 95, 139)
    $bgBrush = New-Object System.Drawing.SolidBrush $bg
    if ($maskable) {
        $g.FillRectangle($bgBrush, 0, 0, $size, $size)
        $pad = [int]($size * 0.22)
    } else {
        $r = [int]($size * 0.22)
        $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
        $gp.AddArc(0, 0, $r, $r, 180, 90)
        $gp.AddArc($size - $r, 0, $r, $r, 270, 90)
        $gp.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
        $gp.AddArc(0, $size - $r, $r, $r, 90, 90)
        $gp.CloseFigure()
        $g.FillPath($bgBrush, $gp)
        $pad = [int]($size * 0.16)
    }

    $docW = $size - 2 * $pad
    $docH = [int]($docW * 1.18)
    $docX = $pad
    $docY = [int](($size - $docH) / 2)
    $fold = [int]($docW * 0.26)

    $doc = New-Object System.Drawing.Drawing2D.GraphicsPath
    $doc.AddLine($docX, $docY, $docX + $docW - $fold, $docY)
    $doc.AddLine($docX + $docW - $fold, $docY, $docX + $docW, $docY + $fold)
    $doc.AddLine($docX + $docW, $docY + $fold, $docX + $docW, $docY + $docH)
    $doc.AddLine($docX + $docW, $docY + $docH, $docX, $docY + $docH)
    $doc.CloseFigure()
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillPath($white, $doc)

    $foldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 203, 216, 228))
    $foldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $foldPath.AddLine($docX + $docW - $fold, $docY, $docX + $docW - $fold, $docY + $fold)
    $foldPath.AddLine($docX + $docW - $fold, $docY + $fold, $docX + $docW, $docY + $fold)
    $foldPath.CloseFigure()
    $g.FillPath($foldBrush, $foldPath)

    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 203, 216, 228)), ([Math]::Max(2, $size * 0.03))
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $lx = $docX + [int]($docW * 0.16)
    $ly = $docY + [int]($docH * 0.22)
    $g.DrawLine($linePen, $lx, $ly, $docX + $docW - $fold - [int]($docW * 0.1), $ly)
    $g.DrawLine($linePen, $lx, $ly + [int]($docH * 0.13), $docX + $docW - [int]($docW * 0.16), $ly + [int]($docH * 0.13))

    $fontSize = [float]($docH * 0.42)
    $font = New-Object System.Drawing.Font "Arial", $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF ([float]$docX), ([float]($docY + $docH * 0.36)), ([float]$docW), ([float]($docH * 0.6))
    $g.DrawString([string][char]0x20AC, $font, $bgBrush, $textRect, $sf)

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "wrote $path"
}

New-Icon 192 (Join-Path $icons "icon-192.png") $false
New-Icon 512 (Join-Path $icons "icon-512.png") $false
New-Icon 512 (Join-Path $icons "icon-maskable-512.png") $true
New-Icon 180 (Join-Path $icons "apple-touch-icon.png") $false

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
