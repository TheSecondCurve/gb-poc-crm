# xhs-matrix skill installer (PowerShell, pure ASCII, no BOM).
# Update = re-run the same command: irm <baseUrl>/agent/skill/xhs-matrix/install.ps1 | iex
# Login is separated from install: existing credentials skip login by default;
# X_SKIP_LOGIN=1 installs files only; X_FORCE_LOGIN=1 forces re-login.
# Rendered by the server: {{BASE_URL}} is replaced with the actual base URL.
$ErrorActionPreference = 'Stop'

$BaseUrl = if ($env:XHS_BASE_URL) { $env:XHS_BASE_URL } else { '{{BASE_URL}}' }
$UA = 'xhs-matrix-install/0.1.0'
$CredFile = Join-Path $(if ($env:XHS_CRED_DIR) { $env:XHS_CRED_DIR } else { Join-Path $HOME '.xhs-matrix' }) 'credentials.json'

$invokeArgs = @{ UserAgent = $UA }
if ($env:X_INSECURE -eq '1') {
  [Console]::Error.WriteLine('WARNING: X_INSECURE=1 skips TLS validation. Self-signed intranet escape hatch only.')
  $invokeArgs['SkipCertificateCheck'] = $true
}

$Dests = @(
  (Join-Path (Get-Location) '.agents\skills\xhs-matrix'),
  (Join-Path $HOME '.agents\skills\xhs-matrix'),
  (Join-Path $HOME '.codex\skills\xhs-matrix'),
  (Join-Path $HOME '.claude\skills\xhs-matrix')
)
$Files = @(
  @{ Name = 'SKILL.md';    Url = "$BaseUrl/agent/skill/xhs-matrix/SKILL.md" },
  @{ Name = 'xhs-matrix.sh'; Url = "$BaseUrl/agent/skill/xhs-matrix/files/xhs-matrix.sh" },
  @{ Name = 'login.sh';    Url = "$BaseUrl/agent/login.sh" },
  @{ Name = 'login.ps1';   Url = "$BaseUrl/agent/login.ps1" },
  @{ Name = 'install.ps1'; Url = "$BaseUrl/agent/skill/xhs-matrix/install.ps1" }
)

foreach ($dest in $Dests) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  foreach ($f in $Files) {
    Invoke-WebRequest -Uri $f.Url -OutFile (Join-Path $dest $f.Name) @invokeArgs
  }
  [Console]::WriteLine("Installed to $dest")
}

if ($env:X_SKIP_LOGIN -eq '1') {
  [Console]::WriteLine('X_SKIP_LOGIN=1: files installed, login skipped.')
  exit 0
}
if ((Test-Path $CredFile) -and $env:X_FORCE_LOGIN -ne '1') {
  [Console]::WriteLine("Existing credentials at $CredFile; login skipped. Set X_FORCE_LOGIN=1 to re-login.")
  exit 0
}

[Console]::WriteLine('Starting login (credentials are typed in the terminal only, never via chat)...')
$env:XHS_BASE_URL = $BaseUrl
& (Join-Path $HOME '.agents\skills\xhs-matrix\login.ps1')
