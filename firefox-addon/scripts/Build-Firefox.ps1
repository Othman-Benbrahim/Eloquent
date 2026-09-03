[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ExtensionDir = Join-Path $ProjectDir "extension"
$DistDir = Join-Path $ProjectDir "dist"
$Manifest = Get-Content (Join-Path $ExtensionDir "manifest.json") -Raw | ConvertFrom-Json
$Version = [string]$Manifest.version
$TemporaryRoot = [System.IO.Path]::GetTempPath()
$StageDir = Join-Path $TemporaryRoot ("eloquent-firefox-" + [guid]::NewGuid().ToString("N"))
$RuntimeStage = Join-Path $StageDir "extension"
$SourceStage = Join-Path $StageDir "source"
$XpiPath = Join-Path $DistDir "eloquent-local-assistant-$Version-unsigned.xpi"
$SourceZipPath = Join-Path $DistDir "eloquent-local-assistant-$Version-source.zip"

function Compress-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    $TemporaryZip = [System.IO.Path]::ChangeExtension($Destination, ".zip")
    if (Test-Path $TemporaryZip) { Remove-Item $TemporaryZip -Force }
    Compress-Archive -Path (Join-Path $Directory "*") -DestinationPath $TemporaryZip -CompressionLevel Optimal
    if ($TemporaryZip -ne $Destination) { Move-Item $TemporaryZip $Destination -Force }
}

try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22 ou plus récent est requis." }
    Push-Location $ProjectDir
    try {
        $TestFiles = @(Get-ChildItem (Join-Path $ProjectDir "tests") -Filter "*.test.cjs" | ForEach-Object { $_.FullName })
        if ($TestFiles.Count -eq 0) { throw "Aucun fichier de test trouvé." }
        & node --test @TestFiles
        if ($LASTEXITCODE -ne 0) { throw "Les tests ont échoué." }
        & node scripts/validate.mjs
        if ($LASTEXITCODE -ne 0) { throw "La validation a échoué." }
    }
    finally {
        Pop-Location
    }

    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    New-Item -ItemType Directory -Path $RuntimeStage -Force | Out-Null
    New-Item -ItemType Directory -Path $SourceStage -Force | Out-Null

    Copy-Item (Join-Path $ExtensionDir "*") $RuntimeStage -Recurse -Force

    $SourceDirectories = @("extension", "scripts", "tests", "docs")
    foreach ($DirectoryName in $SourceDirectories) {
        Copy-Item (Join-Path $ProjectDir $DirectoryName) (Join-Path $SourceStage $DirectoryName) -Recurse -Force
    }
    $SourceFiles = @(
        "package.json", "README.md", "PRIVACY.md", "CHANGELOG.md", "AMO-SUBMISSION.md",
        "RELEASE_NOTES.md", "LICENSE", "amo-metadata.json", ".gitignore", ".gitattributes"
    )
    foreach ($FileName in $SourceFiles) {
        Copy-Item (Join-Path $ProjectDir $FileName) (Join-Path $SourceStage $FileName) -Force
    }

    if (Test-Path $XpiPath) { Remove-Item $XpiPath -Force }
    if (Test-Path $SourceZipPath) { Remove-Item $SourceZipPath -Force }
    Compress-DirectoryContents -Directory $RuntimeStage -Destination $XpiPath
    Compress-DirectoryContents -Directory $SourceStage -Destination $SourceZipPath

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    foreach ($ArchivePath in @($XpiPath, $SourceZipPath)) {
        $Archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)
        try {
            if ($Archive.Entries.Count -eq 0) { throw "Archive vide : $ArchivePath" }
        }
        finally {
            $Archive.Dispose()
        }
    }

    Write-Host "Validation terminée."
    Write-Host "XPI non signé : $XpiPath"
    Write-Host "Sources AMO    : $SourceZipPath"
}
finally {
    if ((Test-Path $StageDir) -and $StageDir.StartsWith($TemporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item $StageDir -Recurse -Force
    }
}
