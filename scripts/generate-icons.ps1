Add-Type -AssemblyName System.Drawing

function Create-PwaIcon {
    param (
        [int]$size,
        [string]$outputPath,
        [bool]$isMaskable = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap ($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background
    $rect = New-Object System.Drawing.Rectangle (0, 0, $size, $size)
    $color1 = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)    # Slate 900
    $color2 = [System.Drawing.Color]::FromArgb(255, 29, 78, 216)   # Blue 700
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, $color1, $color2, 45.0)
    $graphics.FillRectangle($brush, $rect)

    # Inner circle
    $paddingRatio = if ($isMaskable) { 0.16 } else { 0.08 }
    $centerPadding = [int]($size * $paddingRatio)
    $innerSize = $size - ($centerPadding * 2)
    $innerRect = New-Object System.Drawing.Rectangle ($centerPadding, $centerPadding, $innerSize, $innerSize)
    
    $innerColor1 = [System.Drawing.Color]::FromArgb(255, 30, 58, 138)  # Blue 900
    $innerColor2 = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)  # Blue 600
    $innerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($innerRect, $innerColor1, $innerColor2, 90.0)
    $graphics.FillEllipse($innerBrush, $innerRect)

    # Golden border ring
    $penColor = [System.Drawing.Color]::FromArgb(255, 245, 158, 11)
    $penWidth = [float]([Math]::Max(2, $size * 0.02))
    $goldPen = New-Object System.Drawing.Pen ($penColor, $penWidth)
    $graphics.DrawEllipse($goldPen, $innerRect)

    # Main text "ERP12"
    $fontFamily = New-Object System.Drawing.FontFamily ("Arial")
    $fontSize1 = [float]($size * 0.22)
    $font1 = New-Object System.Drawing.Font ($fontFamily, $fontSize1, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $textRect1 = New-Object System.Drawing.RectangleF (0, [float]($size * 0.28), [float]$size, [float]($size * 0.25))
    $graphics.DrawString("ERP12", $font1, $textBrush1, $textRect1, $sf)

    # Sub text "PLASIYER"
    $fontSize2 = [float]($size * 0.09)
    $font2 = New-Object System.Drawing.Font ($fontFamily, $fontSize2, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 147, 197, 253))
    $textRect2 = New-Object System.Drawing.RectangleF (0, [float]($size * 0.54), [float]$size, [float]($size * 0.16))
    $graphics.DrawString("PLASIYER", $font2, $textBrush2, $textRect2, $sf)

    # Sub-badge "MOBIL SAHA"
    $fontSize3 = [float]($size * 0.055)
    $font3 = New-Object System.Drawing.Font ($fontFamily, $fontSize3, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush3 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 191, 36))
    $textRect3 = New-Object System.Drawing.RectangleF (0, [float]($size * 0.70), [float]$size, [float]($size * 0.12))
    $graphics.DrawString("MOBIL SAHA", $font3, $textBrush3, $textRect3, $sf)

    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Output "Successfully created: $outputPath ($($size)x$($size))"
}

$publicDir = "c:\Users\Mert\Desktop\Plasiyer\client\public"

Create-PwaIcon -size 192 -outputPath "$publicDir\pwa-192x192.png" -isMaskable $false
Create-PwaIcon -size 512 -outputPath "$publicDir\pwa-512x512.png" -isMaskable $false
Create-PwaIcon -size 512 -outputPath "$publicDir\maskable-icon-512x512.png" -isMaskable $true
Create-PwaIcon -size 180 -outputPath "$publicDir\apple-touch-icon.png" -isMaskable $false
Create-PwaIcon -size 64  -outputPath "$publicDir\favicon-64x64.png" -isMaskable $false
Write-Output "All icons generated cleanly!"
