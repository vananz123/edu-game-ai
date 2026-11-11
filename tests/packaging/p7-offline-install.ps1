# p7-offline-install.ps1 - go do P7: may sach cai bo cai THAT, mo app, choi mot tro da
# luu, va TU GHI LAI cac con so. Chay tren Windows PowerShell 5.1 tro len, KHONG can repo,
# KHONG can Node, KHONG can quyen admin.
#
# Vi sao ton tai: cong trong repo (tests/ui/packaged-install-check.js) do quitAndInstall()
# bang installer GIA trong TEMP; nua con lai cua P7 - "may sach cai bo cai that roi choi
# offline" - chi do duoc bang cach ngoi truoc mot may khong co gi. Script nay ngoi do, dem
# va viet so ra tep, de nguoi do khong phai nho va khong phai tin mat minh.
#
# Tep nay CHI dung ASCII (khong dau tieng Viet), ca chu thich lan nhan. Ly do da do:
# PowerShell 5.1 doc .ps1 khong co BOM theo bang ma ANSI cua may, nen chuoi co dau thanh
# chu rac ngay trong log. Ban tieng Viet day du cua cac buoc nam o P7-OFFLINE-INSTALL.md.
#
# Cach dung (buoc 1 - chi do may, khong cai gi):
#   powershell -ExecutionPolicy Bypass -File p7-offline-install.ps1
# Buoc 2 - co bo cai that (wizard hien ra, lam dung nhu giao vien lam):
#   powershell -ExecutionPolicy Bypass -File p7-offline-install.ps1 -Installer "`"$env:USERPROFILE\Downloads\EduGame Studio (Tauri)_0.5.1_x64-setup.exe`""
# Buoc 3 - do luc choi (app tu mo, tu tat sau PlaySeconds):
#   ... -AppExe "`"$env:LOCALAPPDATA\Programs\EduGame Studio (Tauri)\edugame-studio-tauri.exe`"" -PlaySeconds 120
#
# Dau ra: %TEMP%\eg-p7\p7-log.txt (dong co moc gio) va p7-results.md (bang so). Script
# khong tu bam nut nao trong wizard; no chi canh thoi gian va dem.

param(
  [string]$Installer = '',
  [string]$AppExe = '',
  [int]$PlaySeconds = 90,
  [string]$OutDir = (Join-Path $env:TEMP 'eg-p7')
)

$ErrorActionPreference = 'Continue'
$script:startedAt = Get-Date
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
$logPath = Join-Path $OutDir 'p7-log.txt'
$resPath = Join-Path $OutDir 'p7-results.md'
Set-Content -LiteralPath $logPath -Value '' -Encoding ASCII
$script:rows = @()

function Stamp {
  return ('T+{0,7:N0} ms' -f ((Get-Date) - $script:startedAt).TotalMilliseconds)
}

function Log([string]$step, [string]$msg) {
  $line = (Stamp) + ' | ' + $step + ' | ' + $msg
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line -Encoding ASCII
}

function Record([string]$id, [string]$label, [string]$value) {
  Log $id $value
  $script:rows += [pscustomobject]@{ Id = $id; Label = $label; Value = $value }
}

# Dia chi nao la "khong ra ngoai LAN"? 127/::1/169.254/fe80 va ba dai rieng tu RFC1918.
# Bo dem offline cua P7 chi tinh cai VUOT ra khoi danh sach nay, vi phong choi LAN la that.
function Test-IsLocalAddress([string]$ip) {
  if ([string]::IsNullOrWhiteSpace($ip)) { return $true }
  if ($ip -eq '::1' -or $ip -eq '0.0.0.0' -or $ip -eq '255.255.255.255') { return $true }
  if ($ip.StartsWith('127.') -or $ip.StartsWith('169.254.') -or $ip.StartsWith('fe80')) { return $true }
  if ($ip.StartsWith('10.') -or $ip.StartsWith('192.168.')) { return $true }
  if ($ip.StartsWith('172.')) {
    $parts = $ip.Split('.')
    if ($parts.Length -ge 2) {
      $second = 0
      if ([int]::TryParse($parts[1], [ref]$second) -and $second -ge 16 -and $second -le 31) { return $true }
    }
  }
  return $false
}

# MOT hop UAC = MOT process consent.exe. Dem theo PID nen bam Enter ba lan van ra 3.
function Get-ConsentPids {
  try { return @(Get-Process -Name 'consent' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }) }
  catch { return @() }
}

function Get-AppProcesses([string]$exePath) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($exePath)
  try { return @(Get-Process -Name $name -ErrorAction SilentlyContinue) } catch { return @() }
}

# -------------------------------------------------------------------------------- 1. may
Log 'START' ('out=' + $OutDir + ' installer=' + $Installer + ' appexe=' + $AppExe + ' playSeconds=' + $PlaySeconds)

$os = $null
try { $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop }
catch { Log 'M1' ('Win32_OperatingSystem loi: ' + $_.Exception.Message) }
if ($os) {
  $display = ''
  try {
    $key = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $prop = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
    $display = [string]$prop.DisplayVersion + '/' + [string]$prop.ReleaseId
  } catch { }
  Record 'M1' 'May / OS' ($os.Caption.Trim() + ' | build ' + $os.Version + ' (' + $display + ') | cai Windows ngau ' + $os.InstallDate)
  Record 'M2' 'Dia / RAM' ('con trong ' + $env:SystemDrive + ' ' + ('{0:N1}' -f ((Get-PSDrive -Name ($env:SystemDrive.Trim(':'))).Free / 1GB)) +
    ' GB | RAM nhin thay ' + ('{0:N1}' -f ($os.TotalVisibleMemorySize / 1MB)) + ' GB')
} else {
  Record 'M1' 'May / OS' 'khong doc duoc Win32_OperatingSystem'
  Record 'M2' 'Dia / RAM' 'khong doc duoc'
}

$isAdmin = $false
try {
  $current = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $isAdmin = $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { }
Record 'M3' 'Nguoi dung' ($env:USERNAME + ' on ' + $env:COMPUTERNAME + ' | PowerShell ' + $PSVersionTable.PSVersion +
  ' | elevated=' + $isAdmin)

$avName = 'khong doc duoc'
try {
  $av = Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct -ErrorAction Stop
  $avName = (@($av | ForEach-Object { $_.displayName }) -join ', ')
  if ($avName -eq '') { $avName = 'khong cai' }
} catch { Log 'M4' ('SecurityCenter2 co the can quyen admin: ' + $_.Exception.Message) }
$defender = 'khong doc duoc'
try {
  $mp = Get-MpComputerStatus -ErrorAction Stop
  $defender = 'RealTimeProtection=' + $mp.RealTimeProtectionEnabled + ' AMService=' + $mp.AMServiceEnabled
} catch { Log 'M4' ('Get-MpComputerStatus loi (may dung AV khac?): ' + $_.Exception.Message) }
Record 'M4' 'Antivirus' ($avName + ' | ' + $defender)

# -------------------------------------------------------------------------- 2. bo cai
if ($Installer -ne '' -and (Test-Path -LiteralPath $Installer)) {
  $item = Get-Item -LiteralPath $Installer
  $sha = 'khong tinh duoc'
  try { $sha = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash }
  catch { Log 'M5' ('Get-FileHash loi: ' + $_.Exception.Message) }
  $sig = 'khong doc duoc'
  try {
    $s = Get-AuthenticodeSignature -LiteralPath $Installer
    $signer = 'khong'
    if ($s.SignerCertificate) { $signer = $s.SignerCertificate.Subject }
    $sig = $s.Status + ' | signer=' + $signer
  } catch { Log 'M5' ('Get-AuthenticodeSignature loi: ' + $_.Exception.Message) }
  Record 'M5' 'Bo cai' ($item.Name + ' | ' + $item.Length + ' byte | SHA256=' + $sha + ' | ' + $sig)

  $mot = 'khong co Zone.Identifier'
  try { $mot = ((Get-Content -LiteralPath ($Installer + ':Zone.Identifier') -ErrorAction Stop) -join ' ') }
  catch { }
  Record 'M6' 'Mark-of-the-web' ($mot + '   (co Zone.Identifier => SmartScreen co the can)')
} else {
  Record 'M5' 'Bo cai' ('BO QUA: -Installer khong duoc trao hoac khong ton tai (' + $Installer + ')')
  Record 'M6' 'Mark-of-the-web' 'BO QUA'
}

# ---------------------------------------------------------------------- 3. cai (wizard)
if ($Installer -ne '' -and (Test-Path -LiteralPath $Installer)) {
  Log 'M7' 'Mo bo cai - hay lam theo wizard dung nhu giao vien. Script do thoi gian va dem hop UAC.'
  $t0 = Get-Date
  $deadline = $t0.AddSeconds(900)
  $consentPids = @()
  $proc = $null
  try { $proc = Start-Process -FilePath $Installer -PassThru }
  catch { Log 'M7' ('Start-Process that bai: ' + $_.Exception.Message) }
  if ($proc) {
    while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
      foreach ($seen in (Get-ConsentPids)) { if ($consentPids -notcontains $seen) { $consentPids += $seen } }
      Start-Sleep -Milliseconds 300
    }
    foreach ($seen in (Get-ConsentPids)) { if ($consentPids -notcontains $seen) { $consentPids += $seen } }
    $code = 'null'
    try { $code = $proc.ExitCode } catch { }
    Record 'M7' 'Cai dat' (('{0:N1} s tu luc mo den luc wizard dong | exit code={1} | so hop UAC thay duoc={2}' -f `
        ((Get-Date) - $t0).TotalSeconds, $code, $consentPids.Count))
  } else {
    Record 'M7' 'Cai dat' 'KHONG MO DUOC bo cai (xem loi Start-Process o tren)'
  }
} else {
  Record 'M7' 'Cai dat' 'BO QUA (khong co -Installer)'
}

$installDir = Join-Path $env:LOCALAPPDATA 'Programs\EduGame Studio (Tauri)'
if ($AppExe -ne '') { $installDir = Split-Path -Parent $AppExe }
if (Test-Path -LiteralPath $installDir) {
  $files = @(Get-ChildItem -LiteralPath $installDir -Recurse -File -ErrorAction SilentlyContinue)
  $bytes = 0
  foreach ($f in $files) { $bytes += $f.Length }
  $exeGuess = Join-Path $installDir 'edugame-studio-tauri.exe'
  $ver = 'khong tim thay "edugame-studio-tauri.exe"'
  if (Test-Path -LiteralPath $exeGuess) {
    $vi = (Get-Item -LiteralPath $exeGuess).VersionInfo
    $ver = 'ProductVersion=' + $vi.ProductVersion + ' FileVersion=' + $vi.FileVersion
  }
  Record 'M8' 'Thu muc cai' ($installDir + ' | ' + $files.Count + ' tep | ' + ('{0:N1}' -f ($bytes / 1MB)) + ' MB | ' + $ver)
} else {
  Record 'M8' 'Thu muc cai' ('BO QUA: ' + $installDir + ' khong ton tai (chua cai, hoac cai o cho khac)')
}

# ------------------------------------------------------------------- 4. mo app + choi
if ($AppExe -ne '' -and (Test-Path -LiteralPath $AppExe)) {
  Log 'M9' ('Mo app: ' + $AppExe + ' - khi cua so hien ra, hay choi mot tro DA LUU (khong tao moi) trong ' + $PlaySeconds + ' s.')
  # Bay DO DUOC tren may dev: ELECTRON_RUN_AS_NODE=1 (binh dan trong shell cua repo) bien
  # file .exe thanh Node thuan -> app thoat ngay voi ma 0, va phep do im lang vo nghia.
  # Phai xoa truoc khi Start-Process, va bao neu app chet som thay vi cho het 60 s.
  if ($env:ELECTRON_RUN_AS_NODE) {
    Log 'M9' ('ELECTRON_RUN_AS_NODE=[' + $env:ELECTRON_RUN_AS_NODE + '] dang bat trong shell - da xoa cho viec mo app nay')
    $env:ELECTRON_RUN_AS_NODE = $null
  }
  $t1 = Get-Date
  $app = Start-Process -FilePath $AppExe -PassThru
  Start-Sleep -Seconds 3
  $alive = $true
  if ($app.HasExited) {
    $alive = $false
    $earlyCode = 'null'
    try { $earlyCode = $app.ExitCode } catch { }
    Record 'M9' 'Mo app' ('UNG DUNG DA THOAT sau 3 s (PID=' + $app.Id + ' exit=' + $earlyCode + ') - KHONG do duoc gi o M10/M11')
  } else {
    $firstWindowSec = -1
    $deadlineWin = $t1.AddSeconds(60)
    while ((Get-Date) -lt $deadlineWin) {
      foreach ($m in (Get-AppProcesses $AppExe)) {
        if ($m.MainWindowTitle -ne '') { $firstWindowSec = ((Get-Date) - $t1).TotalSeconds; break }
      }
      if ($firstWindowSec -ge 0) { break }
      Start-Sleep -Milliseconds 250
    }
    if ($firstWindowSec -ge 0) {
      Record 'M9' 'Mo app' (('cua so dau tien sau {0:N1} s | PID={1}' -f $firstWindowSec, $app.Id))
    } else {
      Record 'M9' 'Mo app' ('KHONG thay cua so trong 60 s (PID=' + $app.Id + ')')
    }
  }

  if (-not $alive) {
    Record 'M10' 'Choi offline' 'BO QUA (ung dung da thoat som o M9)'
    Record 'M11' 'Dong app' 'BO QUA (ung dung da thoat som o M9)'
  } else {
    $remoteSeen = @{}
    $samples = 0
    $maxRemote = 0
    $playStart = Get-Date
    $playDeadline = $playStart.AddSeconds($PlaySeconds)
    Log 'M10' 'Lay mau ket noi TCP moi giay trong luc choi.'
    while ((Get-Date) -lt $playDeadline) {
      $samples += 1
      $hits = 0
      foreach ($m in (Get-AppProcesses $AppExe)) {
        $conns = @()
        try { $conns = @(Get-NetTCPConnection -OwningProcess $m.Id -ErrorAction SilentlyContinue) } catch { }
        foreach ($c in $conns) {
          if ($c.State -ne 'Established' -and $c.State -ne 'SynSent') { continue }
          if (-not (Test-IsLocalAddress ([string]$c.RemoteAddress))) {
            $hits += 1
            $key = [string]$c.RemoteAddress + ':' + [string]$c.RemotePort
            if (-not $remoteSeen.ContainsKey($key)) { $remoteSeen[$key] = $c.State }
          }
        }
      }
      if ($hits -gt $maxRemote) { $maxRemote = $hits }
      Start-Sleep -Seconds 1
    }
    $endpoints = (@($remoteSeen.Keys) -join ', ')
    if ($endpoints -eq '') { $endpoints = 'khong co' }
    $line10 = '{0} mau trong {1:N1} s | ket noi NGOAI LAN lon nhat dong thoi={2} | dich phan biet={3} | {4}' -f `
      $samples, ((Get-Date) - $playStart).TotalSeconds, $maxRemote, $remoteSeen.Count, $endpoints
    Record 'M10' 'Choi offline' $line10

    Log 'M11' 'Tat app.'
    $t3 = Get-Date
    try { $app.CloseMainWindow() | Out-Null } catch { }
    Start-Sleep -Seconds 3
    if (-not $app.HasExited) { try { $app.Kill() } catch { } }
    try { $app.WaitForExit() } catch { }
    Record 'M11' 'Dong app' (('{0:N1} s; thu CloseMainWindow truoc khi buoc' -f ((Get-Date) - $t3).TotalSeconds))
  }
} else {
  Record 'M9' 'Mo app' 'BO QUA (-AppExe khong hop le)'
  Record 'M10' 'Choi offline' 'BO QUA'
  Record 'M11' 'Dong app' 'BO QUA'
}

Record 'M12' 'Tong thoi gian' (('{0:N1} s | log: {1} | ket qua: {2}' -f ((Get-Date) - $script:startedAt).TotalSeconds, $logPath, $resPath))

# ---------------------------------------------------------------------- 5. viet ket qua
$md = @()
$md += '# P7 measurement - ' + (Get-Date).ToString('yyyy-MM-dd HH:mm')
$md += ''
$md += ('Machine: ' + $env:COMPUTERNAME + ' / ' + $env:USERNAME + ' | script: tests/packaging/p7-offline-install.ps1')
$md += ''
$md += '| # | Do | Gia do duoc |'
$md += '|---|-----|-------------|'
foreach ($r in $script:rows) {
  $md += ('| ' + $r.Id + ' | ' + $r.Label + ' | ' + ($r.Value -replace '\|', '/') + ' |')
}
$md += ''
$md += 'Cac o CHU QUAN (wizard may man hinh, co hop UAC nao script khong thay ma mat thay,'
$md += 'tro nao da choi, minh hoa co ve khong, loi nao xuat hien) dien vao P7-OFFLINE-INSTALL.md.'
Set-Content -LiteralPath $resPath -Value $md -Encoding UTF8
Log 'DONE' ('ket qua: ' + $resPath)
Write-Host ''
Write-Host ('Ket qua: ' + $resPath)
Write-Host ('Log:   ' + $logPath)
