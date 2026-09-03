[CmdletBinding()]
param(
    [ValidateSet("windows", "linux", "mac")]
    [string]$TargetOS,

    [ValidateSet("x64", "aarch64")]
    [string]$Architecture = $(if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") { "aarch64" } else { "x64" }),

    [int]$JavaFeatureVersion = 25
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PreviousProgressPreference = $ProgressPreference
$ProgressPreference = "SilentlyContinue"

if (-not $TargetOS) {
    if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::Windows
    )) {
        $TargetOS = "windows"
    }
    elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::OSX
    )) {
        $TargetOS = "mac"
    }
    else {
        $TargetOS = "linux"
    }
}

$CompanionDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ResourcesDir = Join-Path $CompanionDir "src-tauri/resources"
$RuntimeDir = Join-Path $ResourcesDir "runtime"
$LanguageToolDir = Join-Path $ResourcesDir "languagetool"
$TemporaryDir = Join-Path ([System.IO.Path]::GetTempPath()) ("eloquent-resources-" + [guid]::NewGuid().ToString("N"))

if (-not $RuntimeDir.StartsWith($ResourcesDir, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not $LanguageToolDir.StartsWith($ResourcesDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Les dossiers de ressources n'ont pas pu être validés."
}

try {
    New-Item -ItemType Directory -Path $TemporaryDir -Force | Out-Null

    $JavaArchiveExtension = if ($TargetOS -eq "windows") { "zip" } else { "tar.gz" }
    $JavaArchive = Join-Path $TemporaryDir "temurin-jre.$JavaArchiveExtension"
    $LanguageToolArchive = Join-Path $TemporaryDir "languagetool.zip"
    $JavaUrl = "https://api.adoptium.net/v3/binary/latest/$JavaFeatureVersion/ga/$TargetOS/$Architecture/jre/hotspot/normal/eclipse"
    $LanguageToolUrl = "https://languagetool.org/download/snapshots/LanguageTool-latest-snapshot.zip"

    Write-Host "Téléchargement du runtime Java Temurin…"
    Invoke-WebRequest -UseBasicParsing -Uri $JavaUrl -OutFile $JavaArchive

    Write-Host "Téléchargement de LanguageTool…"
    Invoke-WebRequest -UseBasicParsing -Uri $LanguageToolUrl -OutFile $LanguageToolArchive

    if (Test-Path $RuntimeDir) { Remove-Item $RuntimeDir -Recurse -Force }
    if (Test-Path $LanguageToolDir) { Remove-Item $LanguageToolDir -Recurse -Force }
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    New-Item -ItemType Directory -Path $LanguageToolDir -Force | Out-Null

    if ($TargetOS -eq "windows") {
        Expand-Archive -Path $JavaArchive -DestinationPath $RuntimeDir -Force
    }
    else {
        & tar -xzf $JavaArchive -C $RuntimeDir
        if ($LASTEXITCODE -ne 0) { throw "L'extraction du runtime Java a échoué." }
    }
    Expand-Archive -Path $LanguageToolArchive -DestinationPath $LanguageToolDir -Force

    $JavaName = if ($TargetOS -eq "windows") { "java.exe" } else { "java" }
    $Java = Get-ChildItem $RuntimeDir -Filter $JavaName -File -Recurse | Select-Object -First 1
    $ServerJar = Get-ChildItem $LanguageToolDir -Filter "languagetool-server.jar" -File -Recurse | Select-Object -First 1
    if (-not $Java) { throw "Le runtime Java extrait est incomplet." }
    if (-not $ServerJar) { throw "La distribution LanguageTool extraite est incomplète." }

    Write-Host "Java        : $($Java.FullName)"
    Write-Host "LanguageTool : $($ServerJar.FullName)"
    Write-Host "Les ressources $TargetOS/$Architecture sont prêtes."
}
finally {
    $ProgressPreference = $PreviousProgressPreference
    if ((Test-Path $TemporaryDir) -and $TemporaryDir.StartsWith([System.IO.Path]::GetTempPath(), [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item $TemporaryDir -Recurse -Force
    }
}
