import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

const PS_PRINT_SCRIPT = `
param(
  [string]$JsonPath,
  [string]$PreviewImagePath = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing

$rawJson = [System.IO.File]::ReadAllText($JsonPath, [System.Text.Encoding]::UTF8)
$data = ConvertFrom-Json $rawJson

# Hedef yazıcıyı belirle: Önce "1", yoksa "POS80*", "XP-80*", "POS*", yoksa varsayılan yazıcı
$requestedPrinter = if ($data.printerName) { [string]$data.printerName } else { "1" }
$selectedPrinter = $null

$installed = [System.Drawing.Printing.PrinterSettings]::InstalledPrinters
foreach ($p in $installed) {
  if ($p -eq $requestedPrinter) {
    $selectedPrinter = $p
    break
  }
}

if (-not $selectedPrinter) {
  $testPs = New-Object System.Drawing.Printing.PrinterSettings
  $testPs.PrinterName = $requestedPrinter
  if ($testPs.IsValid) {
    $selectedPrinter = $requestedPrinter
  }
}

if (-not $selectedPrinter) {
  foreach ($candidate in @("1", "POS80 Printer", "XP-80C", "POS Printer 203DPI  Series")) {
    $testPs = New-Object System.Drawing.Printing.PrinterSettings
    $testPs.PrinterName = $candidate
    if ($testPs.IsValid) {
      $selectedPrinter = $candidate
      break
    }
  }
}

if (-not $selectedPrinter -and $installed.Count -gt 0) {
  $selectedPrinter = $installed[0]
}

$doc = New-Object System.Drawing.Printing.PrintDocument
if ($selectedPrinter) {
  $doc.PrinterSettings.PrinterName = $selectedPrinter
}

if (-not $doc.PrinterSettings.IsValid) {
  throw "Yazıcı bulunamadı veya erişilemiyor: $requestedPrinter"
}

$doc.DocumentName = if ($data.documentTitle) { "ERP12 - $($data.documentTitle)" } else { "ERP12 Termal Fis" }
$doc.OriginAtMargins = $false
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

# 72mm (283 Display unit) termal kağıt için optimize edilmiş tam siyah kalın fontlar
$fontFamily = "Arial"
$fCompanyTitle = New-Object System.Drawing.Font($fontFamily, 9.5, [System.Drawing.FontStyle]::Bold)
$fCompanySub   = New-Object System.Drawing.Font($fontFamily, 8.2, [System.Drawing.FontStyle]::Bold)
$fCompanyMeta  = New-Object System.Drawing.Font($fontFamily, 7.2, [System.Drawing.FontStyle]::Bold)
$fDocTitle     = New-Object System.Drawing.Font($fontFamily, 8.8, [System.Drawing.FontStyle]::Bold)
$fMetaLabel    = New-Object System.Drawing.Font($fontFamily, 7.6, [System.Drawing.FontStyle]::Bold)
$fMetaVal      = New-Object System.Drawing.Font($fontFamily, 7.8, [System.Drawing.FontStyle]::Bold)
$fTableHead    = New-Object System.Drawing.Font($fontFamily, 7.2, [System.Drawing.FontStyle]::Bold)
$fTableCell    = New-Object System.Drawing.Font($fontFamily, 7.2, [System.Drawing.FontStyle]::Bold)
$fTableSub     = New-Object System.Drawing.Font($fontFamily, 6.8, [System.Drawing.FontStyle]::Bold)
$fTotalRow     = New-Object System.Drawing.Font($fontFamily, 7.8, [System.Drawing.FontStyle]::Bold)
$fGrandTotal   = New-Object System.Drawing.Font($fontFamily, 9.5, [System.Drawing.FontStyle]::Bold)
$fSignTitle    = New-Object System.Drawing.Font($fontFamily, 7.5, [System.Drawing.FontStyle]::Bold)
$fSignSub      = New-Object System.Drawing.Font($fontFamily, 6.8, [System.Drawing.FontStyle]::Bold)
$fFooterBold   = New-Object System.Drawing.Font($fontFamily, 7.8, [System.Drawing.FontStyle]::Bold)
$fFooterNote   = New-Object System.Drawing.Font($fontFamily, 6.8, [System.Drawing.FontStyle]::Bold)
$fFooterSoft   = New-Object System.Drawing.Font($fontFamily, 6.3, [System.Drawing.FontStyle]::Bold)

$brushBlack = [System.Drawing.Brushes]::Black
$penSolid   = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1.4)
$penThick   = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 2.0)
$penDash    = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1.2)
$penDash.DashPattern = [float[]]@(4.0, 2.5)
$penDot     = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1.0)
$penDot.DashPattern = [float[]]@(1.5, 2.0)

$sfCenter = New-Object System.Drawing.StringFormat
$sfCenter.Alignment = [System.Drawing.StringAlignment]::Center
$sfCenter.LineAlignment = [System.Drawing.StringAlignment]::Near

$sfLeft = New-Object System.Drawing.StringFormat
$sfLeft.Alignment = [System.Drawing.StringAlignment]::Near
$sfLeft.LineAlignment = [System.Drawing.StringAlignment]::Near

$sfRight = New-Object System.Drawing.StringFormat
$sfRight.Alignment = [System.Drawing.StringAlignment]::Far
$sfRight.LineAlignment = [System.Drawing.StringAlignment]::Near

$sfRightNoWrap = New-Object System.Drawing.StringFormat([System.Drawing.StringFormatFlags]::NoWrap)
$sfRightNoWrap.Alignment = [System.Drawing.StringAlignment]::Far
$sfRightNoWrap.LineAlignment = [System.Drawing.StringAlignment]::Near

$sfCenterNoWrap = New-Object System.Drawing.StringFormat([System.Drawing.StringFormatFlags]::NoWrap)
$sfCenterNoWrap.Alignment = [System.Drawing.StringAlignment]::Center
$sfCenterNoWrap.LineAlignment = [System.Drawing.StringAlignment]::Near

function Invoke-ReceiptLayout {
  param(
    [System.Drawing.Graphics]$g,
    [float]$pageWidth,
    [bool]$draw
  )

  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None

  $left = 4.0
  $width = $pageWidth - 8.0
  $right = $left + $width
  $centerX = $left + ($width / 2.0)
  $y = 6.0

  # 1. Bina İkonu (Üst Merkez)
  $iconW = 22.0
  $iconH = 18.0
  $iconX = $centerX - ($iconW / 2.0)
  if ($draw) {
    $g.DrawRectangle($penThick, [float]($iconX + 3.0), [float]$y, [float]11.0, [float]$iconH)
    $g.DrawRectangle($penThick, [float]($iconX + 14.0), [float]($y + 5.0), [float]6.0, [float]($iconH - 5.0))
    $g.FillRectangle($brushBlack, [float]($iconX + 6.0), [float]($y + 3.5), [float]2.2, [float]2.2)
    $g.FillRectangle($brushBlack, [float]($iconX + 9.8), [float]($y + 3.5), [float]2.2, [float]2.2)
    $g.FillRectangle($brushBlack, [float]($iconX + 6.0), [float]($y + 8.0), [float]2.2, [float]2.2)
    $g.FillRectangle($brushBlack, [float]($iconX + 9.8), [float]($y + 8.0), [float]2.2, [float]2.2)
    $g.FillRectangle($brushBlack, [float]($iconX + 7.0), [float]($y + 12.5), [float]3.2, [float]5.5)
  }
  $y += $iconH + 4.0

  # 2. Firma Başlığı
  if ($data.issuer) {
    if ($data.issuer.mainTitle) {
      $txt = [string]$data.issuer.mainTitle
      $sz = $g.MeasureString($txt, $fCompanyTitle, [int]$width, $sfCenter)
      if ($draw) {
        $rect = New-Object System.Drawing.RectangleF($left, $y, $width, ($sz.Height + 4.0))
        $g.DrawString($txt, $fCompanyTitle, $brushBlack, $rect, $sfCenter)
      }
      $y += $sz.Height + 1.5
    }
    if ($data.issuer.subTitle) {
      $txt = [string]$data.issuer.subTitle
      $sz = $g.MeasureString($txt, $fCompanySub, [int]$width, $sfCenter)
      if ($draw) {
        $rect = New-Object System.Drawing.RectangleF($left, $y, $width, ($sz.Height + 4.0))
        $g.DrawString($txt, $fCompanySub, $brushBlack, $rect, $sfCenter)
      }
      $y += $sz.Height + 1.5
    }
    foreach ($metaLine in @($data.issuer.addressLine, $data.issuer.phoneLine, $data.issuer.taxLine)) {
      if ($metaLine) {
        $txt = [string]$metaLine
        $sz = $g.MeasureString($txt, $fCompanyMeta, [int]$width, $sfCenter)
        if ($draw) {
          $rect = New-Object System.Drawing.RectangleF($left, $y, $width, ($sz.Height + 4.0))
          $g.DrawString($txt, $fCompanyMeta, $brushBlack, $rect, $sfCenter)
        }
        $y += $sz.Height + 1.0
      }
    }
  }

  $y += 3.0
  if ($draw) { $g.DrawLine($penDash, $left, $y, $right, $y) }
  $y += 6.0

  # 3. Belge Türü Başlığı (Çerçeveli Kutu)
  if ($data.documentTitle) {
    $docTitle = [string]$data.documentTitle
    $sz = $g.MeasureString($docTitle, $fDocTitle, [int]($width - 12), $sfCenter)
    $boxW = [Math]::Min($width, ($sz.Width + 20.0))
    $boxH = $sz.Height + 7.0
    $boxX = $centerX - ($boxW / 2.0)
    if ($draw) {
      $g.DrawRectangle($penThick, [float]$boxX, [float]$y, [float]$boxW, [float]$boxH)
      $rect = New-Object System.Drawing.RectangleF($boxX, ($y + 3.5), $boxW, ($sz.Height + 4.0))
      $g.DrawString($docTitle, $fDocTitle, $brushBlack, $rect, $sfCenter)
    }
    $y += $boxH + 6.0
  }

  if ($draw) { $g.DrawLine($penDash, $left, $y, $right, $y) }
  $y += 5.0

  # 4. Belge & Müşteri Meta Satırları
  if ($data.metaRows) {
    foreach ($row in $data.metaRows) {
      $lbl = [string]$row.label
      $val = [string]$row.value
      $lblSz = $g.MeasureString($lbl, $fMetaLabel)
      $valMaxW = [Math]::Max(130.0, ($width - $lblSz.Width - 4.0))
      $valSz = $g.MeasureString($val, $fMetaVal, [int]$valMaxW, $sfRight)
      $rowH = [Math]::Max($lblSz.Height, $valSz.Height)

      if ($row.boxed) {
        $boxH = $rowH + 5.0
        if ($draw) {
          $g.DrawRectangle($penSolid, [float]$left, [float]$y, [float]$width, [float]$boxH)
          $g.DrawString($lbl, $fMetaLabel, $brushBlack, [float]($left + 3.0), [float]($y + 2.5))
          $vRect = New-Object System.Drawing.RectangleF(($right - $valMaxW - 3.0), ($y + 2.5), $valMaxW, ($valSz.Height + 4.0))
          $g.DrawString($val, $fMetaVal, $brushBlack, $vRect, $sfRight)
        }
        $y += $boxH + 3.0
      } else {
        if ($draw) {
          $g.DrawString($lbl, $fMetaLabel, $brushBlack, [float]$left, [float]$y)
          $vRect = New-Object System.Drawing.RectangleF(($right - $valMaxW), $y, $valMaxW, ($valSz.Height + 4.0))
          $g.DrawString($val, $fMetaVal, $brushBlack, $vRect, $sfRight)
        }
        $y += $rowH + 2.2
      }
    }
  }

  $y += 2.5
  if ($draw) { $g.DrawLine($penDash, $left, $y, $right, $y) }
  $y += 4.5

  # 5. Kalemler Tablosu (Varsa)
  if ($data.table -and $data.table.columns -and $data.table.rows) {
    $cols = $data.table.columns
    $colX = @()
    $colW = @()
    $curX = $left
    for ($i = 0; $i -lt $cols.Count; $i++) {
      $ratio = [double]$cols[$i].widthRatio
      $w = [float]($width * $ratio)
      $colX += $curX
      $colW += $w
      $curX += $w
    }

    # Tablo Başlığı
    $headH = 0.0
    for ($i = 0; $i -lt $cols.Count; $i++) {
      $hTxt = [string]$cols[$i].header
      $align = if ($cols[$i].align -eq "right") { $sfRightNoWrap } elseif ($cols[$i].align -eq "center") { $sfCenterNoWrap } else { $sfLeft }
      $sz = $g.MeasureString($hTxt, $fTableHead)
      if ($sz.Height -gt $headH) { $headH = $sz.Height }
      if ($draw) {
        $padX = if ($cols[$i].align -eq "center") { 8.0 } else { 0.0 }
        $cRect = New-Object System.Drawing.RectangleF(($colX[$i] - $padX), $y, ($colW[$i] + ($padX * 2.0)), ($sz.Height + 4.0))
        $g.DrawString($hTxt, $fTableHead, $brushBlack, $cRect, $align)
      }
    }
    $y += $headH + 2.5
    if ($draw) { $g.DrawLine($penSolid, $left, $y, $right, $y) }
    $y += 3.5

    # Tablo Satırları
    $rowCount = $data.table.rows.Count
    for ($rIdx = 0; $rIdx -lt $rowCount; $rIdx++) {
      $rObj = $data.table.rows[$rIdx]
      $cells = $rObj.cells
      $maxCellH = 0.0

      for ($i = 0; $i -lt $cols.Count; $i++) {
        $cTxt = if ($i -lt $cells.Count) { [string]$cells[$i] } else { "" }
        if ($i -eq 0) {
          # İlk sütun (Ürün Adı) uzun ise alt satıra sarabilir
          $sz = $g.MeasureString($cTxt, $fTableCell, [int]($colW[$i] - 2.0), $sfLeft)
          if ($sz.Height -gt $maxCellH) { $maxCellH = $sz.Height }
          if ($draw) {
            $cRect = New-Object System.Drawing.RectangleF($colX[$i], $y, ($colW[$i] - 2.0), ($sz.Height + 4.0))
            $g.DrawString($cTxt, $fTableCell, $brushBlack, $cRect, $sfLeft)
          }
        } else {
          # Sayısal sütunlar (Miktar, Fiyat, Tutar) tek satırda kırpılmadan hizalanır
          $align = if ($cols[$i].align -eq "right") { $sfRightNoWrap } else { $sfCenterNoWrap }
          $sz = $g.MeasureString($cTxt, $fTableCell)
          if ($sz.Height -gt $maxCellH) { $maxCellH = $sz.Height }
          if ($draw) {
            $cRect = New-Object System.Drawing.RectangleF(($colX[$i] - 4.0), $y, ($colW[$i] + 4.0), ($sz.Height + 4.0))
            $g.DrawString($cTxt, $fTableCell, $brushBlack, $cRect, $align)
          }
        }
      }
      $y += $maxCellH + 1.5

      if ($rObj.subText) {
        $subTxt = [string]$rObj.subText
        $subSz = $g.MeasureString($subTxt, $fTableSub, [int]$width, $sfLeft)
        if ($draw) {
          $sRect = New-Object System.Drawing.RectangleF($left, $y, $width, ($subSz.Height + 4.0))
          $g.DrawString($subTxt, $fTableSub, $brushBlack, $sRect, $sfLeft)
        }
        $y += $subSz.Height + 1.5
      }

      if ($rIdx -lt ($rowCount - 1)) {
        $y += 1.5
        if ($draw) { $g.DrawLine($penDot, $left, $y, $right, $y) }
        $y += 2.5
      }
    }

    $y += 3.5
    if ($draw) { $g.DrawLine($penDash, $left, $y, $right, $y) }
    $y += 4.5
  }

  # 6. Ek Bölümler (Gün Sonu Z Raporu vb. için)
  if ($data.sections) {
    foreach ($sec in $data.sections) {
      if ($sec.title) {
        $sTitle = [string]$sec.title
        $sz = $g.MeasureString($sTitle, $fTableHead, [int]$width, $sfLeft)
        if ($draw) {
          $g.DrawString($sTitle, $fTableHead, $brushBlack, [float]$left, [float]$y)
        }
        $y += $sz.Height + 1.5
        if ($draw) { $g.DrawLine($penSolid, $left, $y, $right, $y) }
        $y += 2.5
      }
      if ($sec.rows) {
        foreach ($sr in $sec.rows) {
          $lbl = [string]$sr.label
          $val = [string]$sr.value
          $lblSz = $g.MeasureString($lbl, $fTableCell)
          $valMaxW = [Math]::Max(110.0, ($width - $lblSz.Width - 4.0))
          $valSz = $g.MeasureString($val, $fTableCell, [int]$valMaxW, $sfRight)
          $rowH = [Math]::Max($lblSz.Height, $valSz.Height)
          if ($draw) {
            $g.DrawString($lbl, $fTableCell, $brushBlack, [float]$left, [float]$y)
            $vRect = New-Object System.Drawing.RectangleF(($right - $valMaxW), $y, $valMaxW, ($valSz.Height + 4.0))
            $g.DrawString($val, $fTableCell, $brushBlack, $vRect, $sfRight)
          }
          $y += $rowH + 2.0
        }
      }
      $y += 2.5
    }
    if ($draw) { $g.DrawLine($penDash, $left, $y, $right, $y) }
    $y += 4.5
  }

  # 7. Alt Toplamlar & İskonto & Genel Toplam
  if ($data.totals) {
    foreach ($tRow in $data.totals) {
      $lbl = [string]$tRow.label
      $val = [string]$tRow.value

      if ($tRow.isBoxedNote) {
        $noteTxt = if ($lbl) { "$lbl $val" } else { $val }
        $sz = $g.MeasureString($noteTxt, $fTableSub, [int]($width - 10), $sfCenter)
        $boxH = $sz.Height + 7.0
        if ($draw) {
          $g.DrawRectangle($penSolid, [float]$left, [float]$y, [float]$width, [float]$boxH)
          $nRect = New-Object System.Drawing.RectangleF(($left + 5.0), ($y + 3.5), ($width - 10.0), ($sz.Height + 4.0))
          $g.DrawString($noteTxt, $fTableSub, $brushBlack, $nRect, $sfCenter)
        }
        $y += $boxH + 3.5
      } elseif ($tRow.isGrandTotal) {
        $y += 1.5
        if ($draw) { $g.DrawLine($penThick, $left, $y, $right, $y) }
        $y += 3.5
        $lblSz = $g.MeasureString($lbl, $fGrandTotal)
        $valSz = $g.MeasureString($val, $fGrandTotal)
        $rowH = [Math]::Max($lblSz.Height, $valSz.Height)
        if ($draw) {
          $g.DrawString($lbl, $fGrandTotal, $brushBlack, [float]$left, [float]$y)
          $vRect = New-Object System.Drawing.RectangleF($left, $y, $width, ($rowH + 4.0))
          $g.DrawString($val, $fGrandTotal, $brushBlack, $vRect, $sfRightNoWrap)
        }
        $y += $rowH + 3.5
      } else {
        $lblSz = $g.MeasureString($lbl, $fTotalRow)
        $valSz = $g.MeasureString($val, $fTotalRow)
        $rowH = [Math]::Max($lblSz.Height, $valSz.Height)
        if ($draw) {
          $g.DrawString($lbl, $fTotalRow, $brushBlack, [float]$left, [float]$y)
          $vRect = New-Object System.Drawing.RectangleF($left, $y, $width, ($rowH + 4.0))
          $g.DrawString($val, $fTotalRow, $brushBlack, $vRect, $sfRightNoWrap)
        }
        $y += $rowH + 2.2
      }
    }
  }

  if ($data.campaigns -and $data.campaigns.Count -gt 0) {
    $y += 2.0
    if ($draw) { $g.DrawLine($penDot, $left, $y, $right, $y) }
    $y += 2.5
    foreach ($cLine in $data.campaigns) {
      $cTxt = [string]$cLine
      $sz = $g.MeasureString($cTxt, $fTableSub, [int]$width, $sfLeft)
      if ($draw) {
        $cRect = New-Object System.Drawing.RectangleF($left, $y, $width, ($sz.Height + 4.0))
        $g.DrawString($cTxt, $fTableSub, $brushBlack, $cRect, $sfLeft)
      }
      $y += $sz.Height + 1.5
    }
  }

  $y += 2.5
  if ($draw) { $g.DrawLine($penDash, $left, $y, $right, $y) }
  $y += 7.0

  # 8. İmza Alanları (Teslim Eden / Teslim Alan)
  if ($data.signatures) {
    $colW = ($width - 14.0) / 2.0
    $leftColX = $left
    $rightColX = $left + $colW + 14.0

    if ($draw) {
      $g.DrawLine($penSolid, $leftColX, $y, ($leftColX + $colW), $y)
      $g.DrawLine($penSolid, $rightColX, $y, ($rightColX + $colW), $y)
    }
    $y += 3.5

    $lTitle = [string]$data.signatures.leftTitle
    $rTitle = [string]$data.signatures.rightTitle
    $lSub   = [string]$data.signatures.leftSubtitle
    $rSub   = [string]$data.signatures.rightSubtitle

    $szT = $g.MeasureString($lTitle, $fSignTitle, [int]$colW, $sfCenter)
    if ($draw) {
      $lRect = New-Object System.Drawing.RectangleF($leftColX, $y, $colW, ($szT.Height + 4.0))
      $rRect = New-Object System.Drawing.RectangleF($rightColX, $y, $colW, ($szT.Height + 4.0))
      $g.DrawString($lTitle, $fSignTitle, $brushBlack, $lRect, $sfCenter)
      $g.DrawString($rTitle, $fSignTitle, $brushBlack, $rRect, $sfCenter)
    }
    $y += $szT.Height + 1.5

    $szS = $g.MeasureString($lSub, $fSignSub, [int]$colW, $sfCenter)
    if ($draw) {
      $lRect2 = New-Object System.Drawing.RectangleF($leftColX, $y, $colW, ($szS.Height + 4.0))
      $rRect2 = New-Object System.Drawing.RectangleF($rightColX, $y, $colW, ($szS.Height + 4.0))
      $g.DrawString($lSub, $fSignSub, $brushBlack, $lRect2, $sfCenter)
      $g.DrawString($rSub, $fSignSub, $brushBlack, $rRect2, $sfCenter)
    }
    $y += $szS.Height + 18.0 # Kaşe / imza boşluğu
  }

  if ($draw) { $g.DrawLine($penDash, $left, $y, $right, $y) }
  $y += 6.0

  # 9. QR Sembolü & Alt Bilgi
  $qrSize = 34.0
  $qrX = $centerX - ($qrSize / 2.0)
  if ($draw) {
    $g.DrawRectangle($penThick, [float]$qrX, [float]$y, [float]11.0, [float]11.0)
    $g.FillRectangle($brushBlack, [float]($qrX + 3.2), [float]($y + 3.2), [float]4.6, [float]4.6)

    $g.DrawRectangle($penThick, [float]($qrX + 23.0), [float]$y, [float]11.0, [float]11.0)
    $g.FillRectangle($brushBlack, [float]($qrX + 26.2), [float]($y + 3.2), [float]4.6, [float]4.6)

    $g.DrawRectangle($penThick, [float]$qrX, [float]($y + 23.0), [float]11.0, [float]11.0)
    $g.FillRectangle($brushBlack, [float]($qrX + 3.2), [float]($y + 26.2), [float]4.6, [float]4.6)

    $g.FillRectangle($brushBlack, [float]($qrX + 15.0), [float]($y + 3.5), [float]4.0, [float]4.0)
    $g.FillRectangle($brushBlack, [float]($qrX + 14.5), [float]($y + 13.5), [float]6.0, [float]6.0)
    $g.FillRectangle($brushBlack, [float]($qrX + 3.5), [float]($y + 15.0), [float]7.5, [float]4.0)
    $g.FillRectangle($brushBlack, [float]($qrX + 24.0), [float]($y + 15.0), [float]4.5, [float]7.5)
    $g.FillRectangle($brushBlack, [float]($qrX + 15.0), [float]($y + 25.0), [float]7.5, [float]4.0)
    $g.FillRectangle($brushBlack, [float]($qrX + 26.5), [float]($y + 26.5), [float]7.5, [float]7.5)
  }
  $y += $qrSize + 5.0

  if ($data.footer) {
    if ($data.footer.primaryText) {
      $txt = [string]$data.footer.primaryText
      $sz = $g.MeasureString($txt, $fFooterBold, [int]$width, $sfCenter)
      if ($draw) {
        $rect = New-Object System.Drawing.RectangleF($left, $y, $width, ($sz.Height + 4.0))
        $g.DrawString($txt, $fFooterBold, $brushBlack, $rect, $sfCenter)
      }
      $y += $sz.Height + 2.0
    }
    if ($data.footer.secondaryText) {
      $txt = [string]$data.footer.secondaryText
      $sz = $g.MeasureString($txt, $fFooterNote, [int]$width, $sfCenter)
      if ($draw) {
        $rect = New-Object System.Drawing.RectangleF($left, $y, $width, ($sz.Height + 4.0))
        $g.DrawString($txt, $fFooterNote, $brushBlack, $rect, $sfCenter)
      }
      $y += $sz.Height + 2.0
    }
    if ($data.footer.softwareText) {
      $txt = [string]$data.footer.softwareText
      $sz = $g.MeasureString($txt, $fFooterSoft, [int]$width, $sfCenter)
      if ($draw) {
        $rect = New-Object System.Drawing.RectangleF($left, $y, $width, ($sz.Height + 4.0))
        $g.DrawString($txt, $fFooterSoft, $brushBlack, $rect, $sfCenter)
      }
      $y += $sz.Height + 3.0
    }
  }

  return [int][Math]::Ceiling($y + 12.0)
}

# İlk geçiş: Toplam fiş yüksekliğini ölç (100 DPI Display birimiyle)
$pageW = if ($data.paperWidth -eq "58mm") { 195.0 } else { 280.0 }
$bmpMeasure = New-Object System.Drawing.Bitmap(300, 2000)
$bmpMeasure.SetResolution(100, 100)
$gMeasure = [System.Drawing.Graphics]::FromImage($bmpMeasure)
$gMeasure.PageUnit = [System.Drawing.GraphicsUnit]::Display
$requiredHeight = Invoke-ReceiptLayout -g $gMeasure -pageWidth $pageW -draw $false
$gMeasure.Dispose()
$bmpMeasure.Dispose()

# Yazıcı kağıt boyutunu fiş uzunluğuna uygun seç (kesilmeyi %100 önler)
$bestPaper = $null
foreach ($ps in $doc.PrinterSettings.PaperSizes) {
  if ($ps.Height -ge $requiredHeight) {
    if (-not $bestPaper -or $ps.Height -lt $bestPaper.Height) {
      $bestPaper = $ps
    }
  }
}
if (-not $bestPaper -and $doc.PrinterSettings.PaperSizes.Count -gt 0) {
  foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    if (-not $bestPaper -or $ps.Height -gt $bestPaper.Height) {
      $bestPaper = $ps
    }
  }
}
if ($bestPaper) {
  $doc.DefaultPageSettings.PaperSize = $bestPaper
} else {
  $customPaper = New-Object System.Drawing.Printing.PaperSize("ERP12Receipt", 283, [Math]::Max(826, $requiredHeight + 30))
  $doc.DefaultPageSettings.PaperSize = $customPaper
}

$doc.add_PrintPage({
  param($sender, $e)
  $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
  [void](Invoke-ReceiptLayout -g $e.Graphics -pageWidth $pageW -draw $true)
  $e.HasMorePages = $false
})

# Eğer yalnızca önizleme PNG oluşturulacaksa: PreviewPrintController ile gerçek yazıcı sürücüsü üzerinden oluştur
if ($PreviewImagePath -and $PreviewImagePath.Length -gt 0) {
  $previewCtrl = New-Object System.Drawing.Printing.PreviewPrintController
  $previewCtrl.UseAntiAlias = $false
  $doc.PrintController = $previewCtrl
  $doc.Print()
  $pages = $previewCtrl.GetPreviewPageInfo()
  if ($pages.Length -gt 0 -and $pages[0].Image) {
    $pages[0].Image.Save($PreviewImagePath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  Write-Output "PREVIEW_OK|$selectedPrinter|$requiredHeight"
  exit 0
}

$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.Print()
Write-Output "PRINT_OK|$selectedPrinter|$requiredHeight"
`;

export const thermalPrintService = {
  async printReceipt(payload, options = {}) {
    if (payload && payload.dryRun) {
      return {
        success: true,
        dryRun: true,
        printerName: payload.printerName || '1',
        height: 0,
        message: 'Dry-run başarılı.',
      };
    }
    const tmpDir = os.tmpdir();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jsonPath = path.join(tmpDir, `erp12_receipt_${id}.json`);
    const psPath = path.join(tmpDir, `erp12_print_${id}.ps1`);
    const previewPath = options.previewImagePath || '';

    try {
      await fs.promises.writeFile(jsonPath, JSON.stringify(payload || {}, null, 2), 'utf8');
      const bomScript = '\uFEFF' + PS_PRINT_SCRIPT;
      await fs.promises.writeFile(psPath, bomScript, 'utf8');

      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        psPath,
        '-JsonPath',
        jsonPath,
      ];
      if (previewPath) {
        args.push('-PreviewImagePath', previewPath);
      }

      const stdout = await new Promise((resolve, reject) => {
        execFile(
          'powershell.exe',
          args,
          { timeout: 20000, windowsHide: true },
          (err, out, errOut) => {
            if (err) {
              return reject(new Error((errOut || err.message || 'Yazdırma hatası').trim()));
            }
            resolve(String(out || '').trim());
          }
        );
      });

      const parts = stdout.split('|');
      return {
        success: true,
        printerName: parts[1] || payload?.printerName || '1',
        height: Number(parts[2] || 0),
        message: `Fiş "${parts[1] || '1'}" numaralı termal yazıcıya doğrudan gönderildi.`,
      };
    } finally {
      fs.promises.unlink(jsonPath).catch(() => {});
      fs.promises.unlink(psPath).catch(() => {});
    }
  },
};
