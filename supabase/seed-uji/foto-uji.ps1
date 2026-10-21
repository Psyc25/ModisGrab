# Membuat 100 foto bukti contoh ([QC] data uji) lalu mengunggahnya ke bucket modis-proof (sama seperti tablet crew).
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$base = 'https://lucjgeoaugcsxolgdsfe.supabase.co'
$anon = 'sb_publishable_cDE6vKDTsVo7XCWRKU9_0g_y1vvCYcR'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path (Split-Path -Parent $dir) 'config.json') -Raw | ConvertFrom-Json
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers @{ apikey = $anon } -ContentType 'application/json' -Body (@{ email = $cfg.email; password = $cfg.password } | ConvertTo-Json)
$tok = $login.access_token
$hdr = @{ apikey = $anon; Authorization = "Bearer $tok" }
$rows = Invoke-RestMethod -Uri "$base/rest/v1/modis_conversions?select=id,claim_day,created_at,unit_id,name,poi_location,type&id=like.qc*&order=id&limit=500" -Headers $hdr
$items = @()
foreach ($r in $rows) { if ($r.id -match '^qc_\d{3}$') { $items += [pscustomobject]@{ id = $r.id; day = $r.claim_day; t = ([datetime]$r.created_at).ToUniversalTime().AddHours(7).ToString('HH:mm'); name = $r.name; venue = $r.poi_location; unit = $r.unit_id; type = $r.type } } }
Write-Host ("Conversion uji ditemukan: " + $items.Count)
# hapus foto lama (kalau ada) supaya bisa diganti
$paths = @($items | ForEach-Object { "proof/$($_.day)/$($_.id).jpg" })
try { Invoke-RestMethod -Method Delete -Uri "$base/storage/v1/object/modis-proof" -Headers $hdr -ContentType 'application/json' -Body (@{ prefixes = $paths } | ConvertTo-Json) | Out-Null } catch { Write-Host ('Hapus foto lama: ' + $_.Exception.Message) }
$tmp = Join-Path $dir 'foto'
New-Item -ItemType Directory -Force $tmp | Out-Null
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$enc = New-Object System.Drawing.Imaging.EncoderParameters(1)
$enc.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]72)
$unitName = @{ mobil = 'Mobil Diskon'; kiosk1 = 'Kiosk Diskon 1'; kiosk2 = 'Kiosk Diskon 2' }
$typeName = @{ pahe_new = 'PaHe New'; pahe_lapsed = 'PAHE Churn'; gb_hemat = 'GB Hemat ride' }
$rnd = New-Object System.Random 26
$ok = 0; $fail = 0
foreach ($it in $items) {
  $bmp = New-Object System.Drawing.Bitmap 640, 480
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
  $c1 = [System.Drawing.Color]::FromArgb(0, 82, 59); $c2 = [System.Drawing.Color]::FromArgb(0, 177 - $rnd.Next(0, 40), 79)
  $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 0, 640, 480), $c1, $c2, 45
  $g.FillRectangle($br, 0, 0, 640, 480)
  $white = [System.Drawing.Brushes]::White; $yel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 217, 2))
  $card = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 255, 255, 255))
  $g.FillRectangle($card, 40, 120, 560, 250)
  $f1 = New-Object System.Drawing.Font 'Arial', 30, ([System.Drawing.FontStyle]::Bold)
  $f2 = New-Object System.Drawing.Font 'Arial', 20
  $f3 = New-Object System.Drawing.Font 'Arial', 15
  $g.DrawString('GRAB MODIS', $f1, $yel, 40, 30)
  $g.DrawString('Bukti klaim (FOTO CONTOH - DATA UJI)', $f3, $white, 42, 82)
  $g.DrawString($it.name, $f1, $white, 56, 140)
  $g.DrawString($typeName[$it.type], $f2, $yel, 58, 200)
  $g.DrawString($it.venue, $f2, $white, 58, 245)
  $g.DrawString(($unitName[$it.unit] + '  |  ' + $it.day + '  ' + $it.t), $f3, $white, 58, 300)
  $g.DrawString($it.id, $f3, $white, 58, 335)
  $g.Dispose()
  $file = Join-Path $tmp ($it.id + '.jpg')
  $bmp.Save($file, $codec, $enc); $bmp.Dispose()
  $path = "proof/$($it.day)/$($it.id).jpg"
  try {
    Invoke-RestMethod -Method Post -Uri "$base/storage/v1/object/modis-proof/$path" -Headers @{ apikey = $anon; Authorization = "Bearer $anon" } -ContentType 'image/jpeg' -InFile $file | Out-Null
    $ok++
  } catch {
    if ($_.ErrorDetails.Message -match 'exists|Duplicate') { $ok++ } else { $fail++; Write-Host ("GAGAL " + $path + ": " + $_.Exception.Message) }
  }
}
Write-Host "Foto uji: $ok berhasil, $fail gagal"
