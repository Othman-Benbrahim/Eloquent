[CmdletBinding()]
param(
    [ValidateSet("listed", "unlisted")]
    [string]$Channel = "listed"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ExtensionDir = Join-Path $ProjectDir "extension"
$ArtifactsDir = Join-Path $ProjectDir "dist\signed"
$MetadataPath = Join-Path $ProjectDir "amo-metadata.json"

if (-not $env:AMO_JWT_ISSUER) { throw "Définissez AMO_JWT_ISSUER dans la session PowerShell." }
if (-not $env:AMO_JWT_SECRET) { throw "Définissez AMO_JWT_SECRET dans la session PowerShell." }

& (Join-Path $PSScriptRoot "Build-Firefox.ps1")
New-Item -ItemType Directory -Path $ArtifactsDir -Force | Out-Null

$Arguments = @(
    "--yes", "web-ext@10", "sign",
    "--source-dir", $ExtensionDir,
    "--artifacts-dir", $ArtifactsDir,
    "--channel", $Channel,
    "--api-key", $env:AMO_JWT_ISSUER,
    "--api-secret", $env:AMO_JWT_SECRET
)
if ($Channel -eq "listed") { $Arguments += @("--amo-metadata", $MetadataPath) }

& npx @Arguments
if ($LASTEXITCODE -ne 0) { throw "La soumission ou la signature AMO a échoué." }
Write-Host "Résultat AMO : $ArtifactsDir"
