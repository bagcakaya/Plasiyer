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

if (Test-Path $img1) { Copy-Item $img1 (Join-Path $iconsDir "kurumsal-gorsel-1.jpg") -Force }
if (Test-Path $img2) { Copy-Item $img2 (Join-Path $iconsDir "kurumsal-gorsel-2.jpg") -Force }
if (Test-Path $img3) { Copy-Item $img3 (Join-Path $iconsDir "kurumsal-gorsel-3.jpg") -Force }

function Save-CroppedIcon {
    param (
        [string]$sourcePath,
        [int]$size,
        [string]$outputPath,
        [double]$cropRatio = 0.095
    )

    $srcImg = [System.Drawing.Image]::FromFile($sourcePath)
    $cropX = [int]($srcImg.Width * $cropRatio)
    $cropY = [int]($srcImg.Height * $cropRatio)
    $cropW = $srcImg.Width - ($cropX * 2)
    $cropH = $srcImg.Height - ($cropY * 2)
    $srcRect = New-Object System.Drawing.Rectangle ($cropX, $cropY, $cropW, $cropH)

    $bmp = New-Object System.Drawing.Bitmap ($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $dstRect = New-Object System.Drawing.Rectangle (0, 0, $size, $size)
    $g.DrawImage($srcImg, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $srcImg.Dispose()
    Write-Output "Saved PNG: $outputPath ($($size)x$($size))"
}

function Save-PngAsIco {
    param (
        [string]$pngPath,
        [string]$icoPath
    )
    $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)
    # ICONDIR Header (6 bytes)
    $bw.Write([uint16]0)   # Reserved
    $bw.Write([uint16]1)   # Type: 1 = ICO
    $bw.Write([uint16]1)   # Count: 1 image
    # ICONDIRENTRY (16 bytes)
    $bw.Write([byte]0)     # Width: 0 = 256px
    $bw.Write([byte]0)     # Height: 0 = 256px
    $bw.Write([byte]0)     # ColorCount
    $bw.Write([byte]0)     # Reserved
    $bw.Write([uint16]1)   # Planes
    $bw.Write([uint16]32)  # BitCount
    $bw.Write([uint32]$pngBytes.Length) # BytesInRes
    $bw.Write([uint32]22)  # ImageOffset (6 + 16)
    $bw.Write($pngBytes)
    $bw.Flush()
    [System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
    $bw.Dispose()
    $ms.Dispose()
    Write-Output "Saved ICO: $icoPath"
}

if (Test-Path $img1) {
    Save-CroppedIcon -sourcePath $img1 -size 192 -outputPath "$publicDir\pwa-192x192.png"
    Save-CroppedIcon -sourcePath $img1 -size 512 -outputPath "$publicDir\pwa-512x512.png"
    Save-CroppedIcon -sourcePath $img1 -size 512 -outputPath "$publicDir\maskable-icon-512x512.png"
    Save-CroppedIcon -sourcePath $img1 -size 180 -outputPath "$publicDir\apple-touch-icon.png"
    Save-CroppedIcon -sourcePath $img1 -size 64  -outputPath "$publicDir\favicon-64x64.png"

    $temp256 = Join-Path $publicDir "temp-256.png"
    Save-CroppedIcon -sourcePath $img1 -size 256 -outputPath $temp256
    Save-PngAsIco -pngPath $temp256 -icoPath "$publicDir\erp12-icon.ico"
    Save-PngAsIco -pngPath $temp256 -icoPath "$publicDir\mobil-plasiyer.ico"
    Remove-Item $temp256 -Force -ErrorAction SilentlyContinue
}
Write-Output "All corporate icons generated cleanly!"
