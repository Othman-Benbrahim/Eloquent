[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CompanionConfig = Get-Content (Join-Path $ProjectDir "companion\src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$Version = [string]$CompanionConfig.version
$DistDir = Join-Path $ProjectDir "dist"
$Destination = Join-Path $DistDir "eloquent-local-suite-$Version-source.zip"
$TemporaryRoot = [System.IO.Path]::GetTempPath()
$StageDir = Join-Path $TemporaryRoot ("eloquent-suite-source-" + [guid]::NewGuid().ToString("N"))

try {
    & node (Join-Path $ProjectDir "scripts\validate.mjs")
    if ($LASTEXITCODE -ne 0) { throw "La validation Firefox a échoué." }
    & node (Join-Path $ProjectDir "companion\scripts\validate.mjs")
    if ($LASTEXITCODE -ne 0) { throw "La validation du compagnon a échoué." }

    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    foreach ($DirectoryName in @("extension", "scripts", "tests", "docs", "companion", ".github")) {
        Copy-Item (Join-Path $ProjectDir $DirectoryName) (Join-Path $StageDir $DirectoryName) -Recurse -Force
    }
    foreach ($FileName in @(
        "package.json", "README.md", "PRIVACY.md", "CHANGELOG.md", "AMO-SUBMISSION.md",
        "RELEASE_NOTES.md", "LICENSE", "amo-metadata.json", ".gitignore", ".gitattributes"
    )) {
        Copy-Item (Join-Path $ProjectDir $FileName) (Join-Path $StageDir $FileName) -Force
    }

    Get-ChildItem $StageDir -Directory -Recurse -Force |
        Where-Object { $_.Name -in @("target", "node_modules", "dist") } |
        Sort-Object FullName -Descending |
        Remove-Item -Recurse -Force
    Get-ChildItem (Join-Path $StageDir "companion\src-tauri\resources") -File -Recurse |
        Where-Object { $_.Name -ne "README.txt" } |
        Remove-Item -Force

    if (Test-Path $Destination) { Remove-Item $Destination -Force }
    Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $Destination -CompressionLevel Optimal
    Write-Host "Sources complètes : $Destination"
}
finally {
    if ((Test-Path $StageDir) -and $StageDir.StartsWith($TemporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item $StageDir -Recurse -Force
    }
}

