$zipPath = "$env:TEMP\platform-tools.zip"
$dest = "C:\platform-tools"

# Check if zip exists in Git Bash tmp too
if (-not (Test-Path $zipPath)) {
  $bashTmp = "C:\Users\Eudes Johnson\AppData\Local\Temp"
  $zipPath = Join-Path $bashTmp "platform-tools.zip"
}

if (-not (Test-Path $zipPath)) {
  Write-Host "Downloading platform-tools..."
  $url = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
}

if (Test-Path $zipPath) {
  Write-Host "Extracting..."
  Expand-Archive -Path $zipPath -DestinationPath "C:\" -Force
  Write-Host "Done."
} else {
  Write-Host "ZIP not found at $zipPath"
}

# Verify
if (Test-Path "C:\platform-tools\adb.exe") {
  Write-Host "ADB installed OK at C:\platform-tools\adb.exe"
} else {
  Write-Host "ADB not found after extraction"
}
