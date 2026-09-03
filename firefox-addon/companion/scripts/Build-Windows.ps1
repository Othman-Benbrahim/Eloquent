[CmdletBinding()]
param(
    [switch]$PrepareResources,
    [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (-not [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows
)) {
    throw "Ce script doit être exécuté sous Windows."
}
$CompanionDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($PrepareResources) {
    & (Join-Path $PSScriptRoot "Prepare-Resources.ps1") -TargetOS windows
}
if (-not $SkipTests) {
    & (Join-Path $PSScriptRoot "Test-Companion.ps1")
}

Push-Location $CompanionDir
try {
    & npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install a échoué." }
    & npm run build -- --bundles nsis,msi
    if ($LASTEXITCODE -ne 0) { throw "La construction Windows a échoué." }
}
finally {
    Pop-Location
}
