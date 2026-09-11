# xhs-matrix login script (PowerShell, pure ASCII, no BOM).
# Interactive username/password -> PAT -> %USERPROFILE%\.xhs-matrix\credentials.json
# Rendered by the server: {{BASE_URL}} is replaced with the actual base URL.
# Env: XHS_USERNAME / XHS_PASSWORD (non-interactive), XHS_SCOPE (default write),
#      X_INSECURE=1 (skip TLS validation; self-signed intranet escape hatch only).
$ErrorActionPreference = 'Stop'

$BaseUrl = if ($env:XHS_BASE_URL) { $env:XHS_BASE_URL } else { '{{BASE_URL}}' }
$Scope = if ($env:XHS_SCOPE) { $env:XHS_SCOPE } else { 'write' }
$CredDir = if ($env:XHS_CRED_DIR) { $env:XHS_CRED_DIR } else { Join-Path $HOME '.xhs-matrix' }
$CredFile = Join-Path $CredDir 'credentials.json'
$UA = 'xhs-matrix-login/0.1.0'

$SkipValidation = $false
if ($env:X_INSECURE -eq '1') {
  [Console]::Error.WriteLine('WARNING: X_INSECURE=1 skips TLS validation. Token may be intercepted. Self-signed intranet escape hatch only.')
  $SkipValidation = $true
}

if ($env:XHS_USERNAME -and $env:XHS_PASSWORD) {
  $Username = $env:XHS_USERNAME
  $Password = $env:XHS_PASSWORD
} else {
  $Username = Read-Host 'Username'
  $Secure = Read-Host 'Password' -AsSecureString
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure))
}

$Body = @{ username = $Username; password = $Password; scope = $Scope } | ConvertTo-Json -Compress

$invokeArgs = @{
  Method = 'POST'
  Uri = "$BaseUrl/api/v1/auth/tokens"
  ContentType = 'application/json'
  Body = $Body
  UserAgent = $UA
}
if ($SkipValidation) { $invokeArgs['SkipCertificateCheck'] = $true }
try {
  $Resp = Invoke-RestMethod @invokeArgs
} catch {
  [Console]::Error.WriteLine("Login failed: bad credentials, disabled account, or unreachable server ($BaseUrl). $_")
  exit 1
}
if (-not $Resp.token) {
  [Console]::Error.WriteLine("Login failed: no token in response.")
  exit 1
}

New-Item -ItemType Directory -Force -Path $CredDir | Out-Null
$Payload = @{ baseUrl = $BaseUrl; token = $Resp.token; prefix = $Resp.prefix; scope = $Scope; expiresAt = $Resp.expiresAt } | ConvertTo-Json -Compress
$Tmp = "$CredFile.tmp.$PID"
[System.IO.File]::WriteAllText($Tmp, $Payload)
Move-Item -Force $Tmp $CredFile

[Console]::WriteLine("Login OK: token prefix $($Resp.prefix) (scope=$Scope, expires in 90 days). Credentials written to $CredFile")
