Add-Type -AssemblyName System.Drawing

$artifactDir = "C:\Users\Mert\.gemini\antigravity\brain\8b613f1e-f303-4e3f-a97a-9999e233a5e5"
$publicDir = "c:\Users\Mert\Desktop\Plasiyer\client\public"
$iconsDir = Join-Path $publicDir "icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null
}

$img1 = Join-Path $artifactDir "kurumsal_gorsel_1_1794818499072.jpg"
$img2 = Join-Path $artifactDir "kurumsal_gorsel_2_1794818514214.jpg"
$img3 = Join-Path $artifactDir "kurumsal_gorsel_3_1794818532904.jpg"

function New-RoundedRectPath {
    param (
        [float]$x,
        [float]$y,
        [float]$width,
        [float]$height,
        [float]$radius
    )
    $diameter = $radius * 2.0
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function Save-EdgeToEdgeCorporateIcon {
    param (
        [string]$sourcePath,
        [int]$size,
        [string]$outputPath,
        [double]$cropRatio = 0.115,
        [double]$innerRadiusRatio = 0.25,
        [System.Drawing.Color]$bgColor1 = [System.Drawing.Color]::FromArgb(255, 7, 19, 48),
        [System.Drawing.Color]$bgColor2 = [System.Drawing.Color]::FromArgb(255, 16, 42, 99)
    )

    $srcImg = [System.Drawing.Image]::FromFile($sourcePath)
    $cropX = [int]($srcImg.Width * $cropRatio)
    $cropY = [int]($srcImg.Height * $cropRatio)
    $cropW = $srcImg.Width - ($cropX * 2)
    $cropH = $srcImg.Height - ($cropY * 2)
    $srcRect = New-Object System.Drawing.Rectangle ($cropX, $cropY, $cropW, $cropH)

    $scaledBmp = New-Object System.Drawing.Bitmap ($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gScale = [System.Drawing.Graphics]::FromImage($scaledBmp)
    $gScale.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gScale.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gScale.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $dstRect = New-Object System.Drawing.Rectangle (0, 0, $size, $size)
    $gScale.DrawImage($srcImg, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $gScale.Dispose()

    # Create full-bleed dark corporate background so there is NEVER any white corner
    $finalBmp = New-Object System.Drawing.Bitmap ($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gFinal = [System.Drawing.Graphics]::FromImage($finalBmp)
    $gFinal.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gFinal.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gFinal.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($dstRect, $bgColor1, $bgColor2, 45.0)
    $gFinal.FillRectangle($bgBrush, $dstRect)

    $radius = [float]($size * $innerRadiusRatio)
    $roundPath = New-RoundedRectPath -x 0 -y 0 -width $size -height $size -radius $radius
    $texBrush = New-Object System.Drawing.TextureBrush ($scaledBmp)
    $gFinal.FillPath($texBrush, $roundPath)

    $finalBmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $texBrush.Dispose()
    $roundPath.Dispose()
    $bgBrush.Dispose()
    $gFinal.Dispose()
    $finalBmp.Dispose()
    $scaledBmp.Dispose()
    $srcImg.Dispose()
    Write-Output "Saved full-bleed PNG (zero white corners): $outputPath ($($size)x$($size))"
}

function Save-MultiSizeIco {
    param (
        [string]$sourcePath,
        [string]$icoPath
    )
    $sizes = @(256, 64, 48, 32, 16)
    $pngBuffers = @()

    foreach ($sz in $sizes) {
        $tmpPng = Join-Path $env:TEMP "plasiyer_ico_full_$sz.png"
        Save-EdgeToEdgeCorporateIcon -sourcePath $sourcePath -size $sz -outputPath $tmpPng | Out-Null
        $pngBuffers += ,([System.IO.File]::ReadAllBytes($tmpPng))
        Remove-Item $tmpPng -Force -ErrorAction SilentlyContinue
    }

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    $count = $sizes.Count

    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$count)

    $offset = 6 + (16 * $count)
    for ($i = 0; $i -lt $count; $i++) {
        $sz = $sizes[$i]
        $buf = $pngBuffers[$i]
        $wByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
        $bw.Write($wByte)
        $bw.Write($wByte)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$buf.Length)
        $bw.Write([uint32]$offset)
        $offset += $buf.Length
    }

    for ($i = 0; $i -lt $count; $i++) {
        $bw.Write($pngBuffers[$i])
    }

    $bw.Flush()
    [System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
    Write-Output "Saved Multi-Size Full-Bleed ICO: $icoPath"
}

if (Test-Path $img1) {
    Save-EdgeToEdgeCorporateIcon -sourcePath $img1 -size 512 -outputPath (Join-Path $iconsDir "kurumsal-gorsel-1.png")
    Save-EdgeToEdgeCorporateIcon -sourcePath $img1 -size 512 -outputPath (Join-Path $artifactDir "kurumsal_gorsel_1_clean.png")
}
if (Test-Path $img2) {
    $c2a = [System.Drawing.Color]::FromArgb(255, 9, 14, 24)
    $c2b = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
    Save-EdgeToEdgeCorporateIcon -sourcePath $img2 -size 512 -outputPath (Join-Path $iconsDir "kurumsal-gorsel-2.png") -cropRatio 0.16 -innerRadiusRatio 0.24 -bgColor1 $c2a -bgColor2 $c2b
    Save-EdgeToEdgeCorporateIcon -sourcePath $img2 -size 512 -outputPath (Join-Path $artifactDir "kurumsal_gorsel_2_clean.png") -cropRatio 0.16 -innerRadiusRatio 0.24 -bgColor1 $c2a -bgColor2 $c2b
}
if (Test-Path $img3) {
    $c3a = [System.Drawing.Color]::FromArgb(255, 16, 62, 168)
    $c3b = [System.Drawing.Color]::FromArgb(255, 6, 118, 194)
    Save-EdgeToEdgeCorporateIcon -sourcePath $img3 -size 512 -outputPath (Join-Path $iconsDir "kurumsal-gorsel-3.png") -cropRatio 0.105 -innerRadiusRatio 0.25 -bgColor1 $c3a -bgColor2 $c3b
    Save-EdgeToEdgeCorporateIcon -sourcePath $img3 -size 512 -outputPath (Join-Path $artifactDir "kurumsal_gorsel_3_clean.png") -cropRatio 0.105 -innerRadiusRatio 0.25 -bgColor1 $c3a -bgColor2 $c3b
}

if (Test-Path $img1) {
    Save-EdgeToEdgeCorporateIcon -sourcePath $img1 -size 192 -outputPath "$publicDir\pwa-192x192.png"
    Save-EdgeToEdgeCorporateIcon -sourcePath $img1 -size 512 -outputPath "$publicDir\pwa-512x512.png"
    Save-EdgeToEdgeCorporateIcon -sourcePath $img1 -size 512 -outputPath "$publicDir\maskable-icon-512x512.png"
    Save-EdgeToEdgeCorporateIcon -sourcePath $img1 -size 180 -outputPath "$publicDir\apple-touch-icon.png"
    Save-EdgeToEdgeCorporateIcon -sourcePath $img1 -size 64  -outputPath "$publicDir\favicon-64x64.png"

    Save-MultiSizeIco -sourcePath $img1 -icoPath "$publicDir\erp12-icon.ico"
    Save-MultiSizeIco -sourcePath $img1 -icoPath "$publicDir\mobil-plasiyer.ico"
    Save-MultiSizeIco -sourcePath $img1 -icoPath "$publicDir\mobil-plasiyer-v3.ico"
}
Write-Output "All edge-to-edge corporate icons generated cleanly!"
