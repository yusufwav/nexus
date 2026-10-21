# LOGIN PREVIEW
# ---------------------------------------------------------------------------
# Renders the login screen's composition to a PNG so the panel treatment can
# be LOOKED at — the blur, the tint, the grain, the edge and the type —
# without a device.
#
# It is a mock, not the real screen: the background is a synthetic
# approximation of the gradient ASCII field rather than the field itself,
# because GDI+ cannot run the WebGL pipeline. Everything else is real — the
# actual JetBrains Mono files, the actual tint alpha, the actual grain tile,
# and the actual spacing numbers from app/login.tsx.
#
#   powershell -File scripts/preview-login.ps1
param(
  [string]$Out = ".expo-preview-login.png",
  [int]$Scale = 2,
  [int]$Width = 390,
  [int]$Height = 844,
  [int]$TopInset = 47,
  [int]$BottomInset = 34,
  [switch]$SignUp
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$mono = Join-Path $root "assets/fonts/JetBrainsMono-Regular.ttf"
$monoMedium = Join-Path $root "assets/fonts/JetBrainsMono-Medium.ttf"
$monoBold = Join-Path $root "assets/fonts/JetBrainsMono-Bold.ttf"
$monoExtra = Join-Path $root "assets/fonts/JetBrainsMono-ExtraBold.ttf"
$grain = Join-Path $root "assets/images/grain-light.png"

$W = $Width * $Scale
$H = $Height * $Scale

# ---- the theme, from the dark palette -------------------------------------
$fg = [System.Drawing.Color]::FromArgb(255, 242, 244, 247)
$fgDim = [System.Drawing.Color]::FromArgb(255, 107, 114, 128)
$acc = [System.Drawing.Color]::FromArgb(255, 139, 0, 0)

# ---- the layout, in points, EXACTLY as app/login.tsx has it ---------------
$P = 24        # GlassPanel padding
$MARK_H = 36  # TYPE.display 30/36
$EYEBROW_H = 14
$SEG_H = 44
$FIELD_H = 50
$LABEL_H = 14
$BTN_H = 52
$PROV_H = 52
$FOOT_LINE = 17
$FOOT_LINES = 2

$contentH = $P +
  $MARK_H +
  6 + $EYEBROW_H + 18 +
  $SEG_H + 18 +
  $(if ($SignUp) { $LABEL_H + 6 + $FIELD_H + 14 }) +
  $LABEL_H + 6 + $FIELD_H + 14 +
  $LABEL_H + 6 + $FIELD_H + 14 +
  4 + $BTN_H +
  20 + 14 + 14 +
  $PROV_H +
  18 + ($FOOT_LINE * $FOOT_LINES) +
  $P

$panelY = $TopInset + 28
$panelH = $contentH
$panelX = 20
$panelW = $Width - 40

Write-Output "panel: ${panelX},${panelY} ${panelW}x${panelH}  content ends at $($panelY + $panelH) of $Height"

$bitmap = New-Object System.Drawing.Bitmap -ArgumentList @($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# ---- the background: a synthetic gradient-ASCII field ----------------------
$rect = New-Object System.Drawing.Rectangle -ArgumentList @(0, 0, $W, $H)
$field = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 8, 4, 6),
  [System.Drawing.Color]::FromArgb(255, 60, 6, 14),
  62.0)
$g.FillRectangle($field, $rect)

$bandY = [int]($H * 0.42); $bandH = [int]($H * 0.30)
$bandRect = New-Object System.Drawing.Rectangle -ArgumentList @(0, $bandY, $W, $bandH)
$band = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $bandRect,
  [System.Drawing.Color]::FromArgb(0, 253, 211, 174),
  [System.Drawing.Color]::FromArgb(190, 253, 211, 174),
  90.0)
$g.FillRectangle($band, $bandRect)

$band2Y = [int]($H * 0.72); $band2H = [int]($H * 0.20)
$band2Rect = New-Object System.Drawing.Rectangle -ArgumentList @(0, $band2Y, $W, $band2H)
$band2 = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $band2Rect,
  [System.Drawing.Color]::FromArgb(0, 139, 0, 0),
  [System.Drawing.Color]::FromArgb(120, 139, 0, 0),
  90.0)
$g.FillRectangle($band2, $band2Rect)

$glyphFont = New-Object System.Drawing.Font -ArgumentList @($mono, (14 * $Scale), ([System.Drawing.GraphicsUnit]::Pixel))
$rand = New-Object System.Random 7
for ($i = 0; $i -lt 620; $i++) {
  $x = $rand.Next(0, $W)
  $y = $rand.Next(0, $H)
  $d = [Math]::Abs($y - $H * 0.55) / ($H * 0.6)
  $a = [Math]::Max(0, [Math]::Min(255, 255 * (1 - $d) * 0.8))
  if ($a -lt 12) { continue }
  $ch = " =+xX0S8#@".ToCharArray()[$rand.Next(0, 10)]
  $b = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb([int]$a, 255, 255, 255))
  $g.DrawString($ch, $glyphFont, $b, $x, $y)
}
$g.Dispose()

# ---- blur the region the panel will sit on ---------------------------------
$px = $bitmap.LockBits((New-Object System.Drawing.Rectangle -ArgumentList @(0, 0, $W, $H)), `
  [System.Drawing.Imaging.ImageLockMode]::ReadWrite, `
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$len = [Math]::Abs($px.Stride) * $H
$data = New-Object byte[] $len
[System.Runtime.InteropServices.Marshal]::Copy($px.Scan0, $data, 0, $len)

$px0 = $panelX * $Scale
$py0 = $panelY * $Scale
$pw = $panelW * $Scale
$ph = $panelH * $Scale
$radius = 9 * $Scale

$copy = New-Object byte[] $len
[Array]::Copy($data, $copy, $len)
for ($y = $py0; $y -lt ($py0 + $ph); $y++) {
  for ($x = $px0; $x -lt ($px0 + $pw); $x++) {
    $r = 0; $gg = 0; $b = 0; $n = 0
    for ($dx = -$radius; $dx -le $radius; $dx += 3) {
      $sx = [Math]::Max(0, [Math]::Min($W - 1, $x + $dx))
      $i = $y * $px.Stride + $sx * 4
      $b += $copy[$i]; $gg += $copy[$i + 1]; $r += $copy[$i + 2]; $n++
    }
    $i = $y * $px.Stride + $x * 4
    $data[$i] = [int]($b / $n); $data[$i + 1] = [int]($gg / $n); $data[$i + 2] = [int]($r / $n)
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($data, 0, $px.Scan0, $len)
$bitmap.UnlockBits($px)

# ---- the panel -------------------------------------------------------------
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# the tint — GlassPanel's "medium" strength, dark palette: 0.58 of #040508
$tint = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(148, 4, 5, 8))
$g.FillRectangle($tint, $px0, $py0, $pw, $ph)

# the grain, tiled, at 0.14
$grainBmp = New-Object System.Drawing.Bitmap -ArgumentList $grain
$gs = $grainBmp.Width
$op = New-Object System.Drawing.Imaging.ColorMatrix
$op.Matrix33 = 0.14
$imgAttr = New-Object System.Drawing.Imaging.ImageAttributes
$imgAttr.SetColorMatrix($op)
for ($y = $py0; $y -lt ($py0 + $ph); $y += $gs) {
  for ($x = $px0; $x -lt ($px0 + $pw); $x += $gs) {
    $dw = [Math]::Min($gs, $px0 + $pw - $x)
    $dh = [Math]::Min($gs, $py0 + $ph - $y)
    $dest = New-Object System.Drawing.Rectangle -ArgumentList @($x, $y, $dw, $dh)
    $src = New-Object System.Drawing.Rectangle -ArgumentList @(0, 0, $dw, $dh)
    $g.DrawImage($grainBmp, $dest, $src.X, $src.Y, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $imgAttr)
  }
}

# the edge and the sheen
$edge = New-Object System.Drawing.Pen -ArgumentList @(([System.Drawing.Color]::FromArgb(56, 139, 0, 0)), 1)
$g.DrawRectangle($edge, $px0, $py0, $pw - 1, $ph - 1)
$sheen = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(31, 242, 244, 247))
$g.FillRectangle($sheen, $px0, $py0, $pw, 1)

# ---- the content -----------------------------------------------------------
$px = $px0 + $P * $Scale
$py = $py0 + $P * $Scale
$innerW = $pw - $P * 2 * $Scale

function New-Font($path, $sizePx) {
  return New-Object System.Drawing.Font -ArgumentList @($path, $sizePx, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel))
}
$extra = New-Font $monoExtra (30 * $Scale)
$bold = New-Font $monoBold (17 * $Scale)
$medium = New-Font $monoMedium (14 * $Scale)
$regular = New-Font $mono (14 * $Scale)
$label = New-Font $monoMedium (10 * $Scale)

$fgBrush = New-Object System.Drawing.SolidBrush -ArgumentList $fg
$dimBrush = New-Object System.Drawing.SolidBrush -ArgumentList $fgDim
$accBrush = New-Object System.Drawing.SolidBrush -ArgumentList $acc
# the ink on the accent fill, chosen the way inkFor() chooses it: the base
# palette's accent is nearly black, so it takes WHITE ink, not the page's.
$onAccent = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))

# the wordmark
$g.DrawString("NEXUS", $extra, $fgBrush, $px, $py)
$w = $g.MeasureString("NEXUS", $extra)
$g.DrawString("_", $extra, $accBrush, $px + $w.Width, $py)
$py += $MARK_H * $Scale

$py += 6 * $Scale
$g.DrawString("COMPUTER SCIENCE - NMU", $label, $dimBrush, $px, $py)
$py += $EYEBROW_H * $Scale + 18 * $Scale

# the segmented control
$segH = $SEG_H * $Scale
$segPen = New-Object System.Drawing.Pen -ArgumentList @(([System.Drawing.Color]::FromArgb(20, 255, 255, 255)), 1)
$g.DrawRectangle($segPen, $px, $py, $innerW - 1, $segH - 1)
$g.FillRectangle($accBrush, $px, $py, [int]($innerW / 2), $segH)
$g.DrawString("SIGN IN", $label, $onAccent, $px + 26 * $Scale, $py + 16 * $Scale)
$g.DrawString("SIGN UP", $label, $dimBrush, $px + [int]($innerW / 2) + 26 * $Scale, $py + 16 * $Scale)
$py += $segH + 18 * $Scale

# the fields
function Draw-Field($labelText, $placeholder, $y, $withEye) {
  $g.DrawString($labelText, $label, $dimBrush, $px, $y)
  $fy = $y + 20 * $Scale
  $fh = 50 * $Scale
  $bg = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(26, 255, 255, 255))
  $g.FillRectangle($bg, $px, $fy, $innerW, $fh)
  $g.DrawRectangle($segPen, $px, $fy, $innerW - 1, $fh - 1)
  $g.DrawString($placeholder, $regular, $dimBrush, $px + 14 * $Scale, $fy + 15 * $Scale)
  if ($withEye) {
    # the eye toggle, right-aligned inside the field
    $ex = $px + $innerW - 14 * $Scale - 11 * $Scale
    $ey = $fy + $fh / 2
    $eyePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 107, 114, 128), [float](1.5 * $Scale))
    $lid = [System.Drawing.Rectangle]::new([int]($ex - 8 * $Scale), [int]($ey - 5 * $Scale), [int](16 * $Scale), [int](10 * $Scale))
    $g.DrawEllipse($eyePen, $lid)
    $pupil = [System.Drawing.Rectangle]::new([int]($ex - 2.5 * $Scale), [int]($ey - 2.5 * $Scale), [int](5 * $Scale), [int](5 * $Scale))
    $pupilBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 107, 114, 128))
    $g.FillEllipse($pupilBrush, $pupil)
  }
  return $fy + $fh + 14 * $Scale
}
if ($SignUp) { $py = Draw-Field "NAME" "what should the notes call you" $py }
$py = Draw-Field "EMAIL" "you@nmu.ac.za" $py
$py = Draw-Field "PASSWORD" "your password" $py $true

# the primary button
$bh = $BTN_H * $Scale
$py += 4 * $Scale
$g.FillRectangle($accBrush, $px, $py, $innerW, $bh)
$g.DrawString("SIGN IN", $medium, $onAccent, $px + 26 * $Scale, $py + 18 * $Scale)
$py += $bh

# the divider
$py += 20 * $Scale
$g.DrawRectangle($segPen, $px, $py + 6 * $Scale, [int]($innerW * 0.32), 1)
$g.DrawRectangle($segPen, $px + [int]($innerW * 0.68), $py + 6 * $Scale, [int]($innerW * 0.32), 1)
$g.DrawString("OR CONTINUE WITH", $label, $dimBrush, $px + [int]($innerW * 0.36), $py)
$py += 14 * $Scale + 14 * $Scale

# the provider buttons
$pw2 = 58 * $Scale; $ph2 = $PROV_H * $Scale; $gap = 12 * $Scale
$total = 3 * $pw2 + 2 * $gap
$px2 = $px + [int](($innerW - $total) / 2)
for ($i = 0; $i -lt 3; $i++) {
  $bx = $px2 + $i * ($pw2 + $gap)
  $bg = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(26, 255, 255, 255))
  $g.FillRectangle($bg, $bx, $py, $pw2, $ph2)
  $g.DrawRectangle($segPen, $bx, $py, $pw2 - 1, $ph2 - 1)
  $mark = @("G", "GH", "M")[$i]
  $g.DrawString($mark, $bold, $fgBrush, $bx + [int]($pw2 / 2) - 8 * $Scale, $py + 15 * $Scale)
}
$py += $ph2

# the footnote
$py += 18 * $Scale
$small = New-Font $mono (12 * $Scale)
$g.DrawString("Your account lives on this device only.", $small, $dimBrush, $px, $py)
$g.DrawString("The password is never stored - only a salt and a hash.", $small, $dimBrush, $px, $py + 17 * $Scale)

$g.Dispose()
$outPath = Join-Path $root $Out
$bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Output "wrote $outPath"
