<#
  setup-imposter.ps1 - One-time Windows setup so phones can reach IMPOSTER.

  start-imposter.ps1 runs this automatically (as administrator) the first
  time. It adds a Windows Firewall rule allowing phones on your Wi-Fi to
  connect to the game's port (same idea as PANALO's setup-buzzer.ps1).

  To undo it later, run this in an administrator PowerShell:
    netsh advfirewall firewall delete rule name="IMPOSTER Christmas"
#>
param(
  [int]$Port = 3001
)

Write-Host "Setting up IMPOSTER on port $Port..." -ForegroundColor Cyan

# Let phones on the Wi-Fi through the firewall on this port
netsh advfirewall firewall delete rule name="IMPOSTER Christmas" | Out-Null
netsh advfirewall firewall add rule name="IMPOSTER Christmas" dir=in action=allow protocol=TCP localport=$Port

Write-Host "Done! This window will close." -ForegroundColor Green
Start-Sleep -Seconds 2
