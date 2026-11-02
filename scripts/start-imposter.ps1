<#
  =========================================================
  start-imposter.ps1 - Starts IMPOSTER: Christmas Edition.

  Start it by double-clicking "Start IMPOSTER.bat" in the main
  project folder. It:
    - installs and builds the game the first time (or after changes)
    - asks for administrator permission ONCE so phones can connect
    - starts the game server and opens the game in your browser
    - prints the address for phones on the SAME Wi-Fi
    - creates a free ONLINE link (Cloudflare quick tunnel) so players
      on any Wi-Fi or mobile data can join. It's a new link every
      time. The lobby's QR code / invite link uses it automatically.

  Close this window (or press Ctrl+C) to stop the game.
  =========================================================
#>
param(
  [int]$Port = 3001,
  [switch]$NoOnline,   # don't create the online link (same Wi-Fi only)
  [switch]$NoBrowser,  # don't open the game automatically
  [switch]$NoSetup     # skip the one-time firewall setup (no admin prompt)
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuleName = "IMPOSTER Christmas"
$TunnelExe = Join-Path $PSScriptRoot "cloudflared.exe"
$TunnelLog = Join-Path $env:TEMP "imposter-tunnel.log"
$UrlFile = Join-Path $env:TEMP "imposter-online-url.txt"

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

Say ""
Say "  ==========================================" Red
Say "     IMPOSTER  -  Christmas Edition" Green
Say "  ==========================================" Red
Say ""

# ---------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------
$nodeDir = Join-Path $env:ProgramFiles "nodejs"
if (Test-Path (Join-Path $nodeDir "node.exe")) { $env:Path = "$nodeDir;$env:Path" }
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Say "Node.js is not installed." Red
  Say "Install the LTS version from https://nodejs.org, then double-click Start IMPOSTER.bat again." Yellow
  exit 1
}

# ---------------------------------------------------------
# 2. One-time setup: allow phones through the firewall (needs admin once)
# ---------------------------------------------------------
$rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if (-not $rule -and -not $NoSetup) {
  Say "First-time setup: Windows will ask for administrator permission" Cyan
  Say "so phones on your Wi-Fi can connect. Click Yes." Cyan
  try {
    $setup = Join-Path $PSScriptRoot "setup-imposter.ps1"
    Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$setup`" -Port $Port"
  } catch {
    Say "Setup was skipped. Phones on the same Wi-Fi may not connect, but the online link still works." Yellow
  }
}

# ---------------------------------------------------------
# 3. Install + build (first time, or when the game's files changed)
# ---------------------------------------------------------
Push-Location $Root
try {
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Say "Installing the game (first time only, takes a minute)..." Cyan
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }
  $distIndex = Join-Path $Root "client\dist\index.html"
  $needBuild = -not (Test-Path $distIndex)
  if (-not $needBuild) {
    $builtAt = (Get-Item $distIndex).LastWriteTime
    $changed = Get-ChildItem (Join-Path $Root "client\src"), (Join-Path $Root "shared\src") -Recurse -File |
      Where-Object { $_.LastWriteTime -gt $builtAt } | Select-Object -First 1
    $needBuild = [bool]$changed
  }
  if ($needBuild) {
    Say "Building the game..." Cyan
    npm run build --silent
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
  }
} finally {
  Pop-Location
}

# ---------------------------------------------------------
# 4. Stop any copy that is still running from last time
# ---------------------------------------------------------
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $TunnelExe } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $UrlFile, $TunnelLog -ErrorAction SilentlyContinue

# ---------------------------------------------------------
# 5. Online link (free Cloudflare quick tunnel)
# ---------------------------------------------------------
$tunnel = $null
$onlineStatus = "off"
if (-not $NoOnline) {
  if (-not (Test-Path -LiteralPath $TunnelExe)) {
    Say "Downloading the online-link helper (cloudflared, about 50 MB - first time only)..." Cyan
    try {
      $arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
      $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -UseBasicParsing -OutFile "$TunnelExe.part" `
        -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe"
      Move-Item -LiteralPath "$TunnelExe.part" -Destination $TunnelExe -Force
    } catch {
      Remove-Item -LiteralPath "$TunnelExe.part" -ErrorAction SilentlyContinue
      Say "Couldn't download it. The online link is off; same Wi-Fi still works." Yellow
    }
  }
  if (Test-Path -LiteralPath $TunnelExe) {
    $tunnel = Start-Process -FilePath $TunnelExe -PassThru -WindowStyle Hidden `
      -ArgumentList "tunnel --no-autoupdate --url http://localhost:$Port" `
      -RedirectStandardError $TunnelLog
    $tunnelStartedAt = Get-Date
    $onlineStatus = "starting"
  }
}

# ---------------------------------------------------------
# 6. Start the game server
# ---------------------------------------------------------
$env:PORT = "$Port"
$env:TRUST_PROXY = "1"
$env:ALLOW_TUNNEL_ORIGINS = "1"
if ($onlineStatus -eq "starting") { $env:ONLINE_URL_FILE = $UrlFile } else { Remove-Item Env:ONLINE_URL_FILE -ErrorAction SilentlyContinue }

$server = Start-Process -FilePath $node.Source -ArgumentList "--import tsx src/index.ts" `
  -WorkingDirectory (Join-Path $Root "server") -NoNewWindow -PassThru

$ready = $false
for ($i = 0; $i -lt 60 -and -not $server.HasExited; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/health" -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) {
  Say "The game server didn't start. See the messages above." Red
  if ($tunnel -and -not $tunnel.HasExited) { $tunnel.Kill() }
  exit 1
}

Say ""
Say "  The game is running!" Green
Say "  On this computer:       http://localhost:$Port" White
Say "  Create a room, then show everyone the QR code in the lobby." White
if ($onlineStatus -eq "starting") { Say "  Online link: starting up (takes a few seconds)..." Cyan }
Say ""
Say "  Keep this window open while you play. Close it to stop." Yellow
Say ""

if (-not $NoBrowser) { Start-Process "http://localhost:$Port" }

# ---------------------------------------------------------
# 7. Wait: watch for the online link, stop everything on exit
# ---------------------------------------------------------
try {
  while (-not $server.HasExited) {
    if ($onlineStatus -eq "starting") {
      if ($tunnel.HasExited) {
        Say "  The online link stopped. Same Wi-Fi still works." Yellow
        $onlineStatus = "failed"
      } else {
        $text = ""
        try {
          $stream = [System.IO.File]::Open($TunnelLog, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
          $reader = New-Object System.IO.StreamReader($stream)
          $text = $reader.ReadToEnd()
          $reader.Close()
        } catch { }
        if ($text -match "https://[a-z0-9-]+\.trycloudflare\.com") {
          $onlineUrl = $Matches[0]
          Set-Content -LiteralPath $UrlFile -Value $onlineUrl -Encoding ASCII
          $onlineStatus = "on"
          Say "  ONLINE link (any Wi-Fi or mobile data): $onlineUrl" Green
          Say "  The lobby QR code now uses this link." Green
          Say ""
        } elseif (((Get-Date) - $tunnelStartedAt).TotalSeconds -gt 60) {
          Say "  The online link didn't start (is this computer online?). Same Wi-Fi still works." Yellow
          $onlineStatus = "failed"
        }
      }
    }
    Start-Sleep -Seconds 1
  }
} finally {
  if ($tunnel -and -not $tunnel.HasExited) { try { $tunnel.Kill() } catch { } }
  if ($server -and -not $server.HasExited) { try { $server.Kill() } catch { } }
  Remove-Item -LiteralPath $UrlFile -ErrorAction SilentlyContinue
}
