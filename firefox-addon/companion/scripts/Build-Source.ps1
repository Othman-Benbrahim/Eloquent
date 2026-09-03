[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$CompanionDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectDir = (Resolve-Path (Join-Path $CompanionDir "..")).Path
$Configuration = Get-Content (Join-Path $CompanionDir "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$Version = [string]$Configuration.version
$DistDir = Join-Path $ProjectDir "dist"
$Destination = Join-Path $DistDir "eloquent-local-companion-$Version-source.zip"
$TemporaryRoot = [System.IO.Path]::GetTempPath()
$StageDir = Join-Path $TemporaryRoot ("eloquent-companion-source-" + [guid]::NewGuid().ToString("N"))

try {
    & (Join-Path $PSScriptRoot "Test-Companion.ps1")
    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

    foreach ($DirectoryName in @("core", "src-tauri", "ui", "scripts", "packaging")) {
        Copy-Item (Join-Path $CompanionDir $DirectoryName) (Join-Path $StageDir $DirectoryName) -Recurse -Force
    }
    foreach ($FileName in @("Cargo.toml", "Cargo.lock", "package.json", "README.md", "THIRD_PARTY_NOTICES.md")) {
        Copy-Item (Join-Path $CompanionDir $FileName) (Join-Path $StageDir $FileName) -Force
    }

    Get-ChildItem $StageDir -Directory -Recurse -Force |
        Where-Object { $_.Name -in @("target", "node_modules") } |
        Sort-Object FullName -Descending |
        Remove-Item -Recurse -Force

    if (Test-Path $Destination) { Remove-Item $Destination -Force }
    Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $Destination -CompressionLevel Optimal
    Write-Host "Sources du compagnon : $Destination"
}
finally {
    if ((Test-Path $StageDir) -and $StageDir.StartsWith($TemporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item $StageDir -Recurse -Force
    }
}

