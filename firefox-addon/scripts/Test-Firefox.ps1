[CmdletBinding()]
param(
    [string]$FirefoxPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ExtensionDir = Join-Path $ProjectDir "extension"

Push-Location $ProjectDir
try {
    $TestFiles = @(Get-ChildItem (Join-Path $ProjectDir "tests") -Filter "*.test.cjs" | ForEach-Object { $_.FullName })
    if ($TestFiles.Count -eq 0) { throw "Aucun fichier de test trouvé." }
    & node --test @TestFiles
    if ($LASTEXITCODE -ne 0) { throw "Les tests ont échoué." }
    & node scripts/validate.mjs
    if ($LASTEXITCODE -ne 0) { throw "La validation a échoué." }
    & npx --yes web-ext@10 lint --source-dir $ExtensionDir
    if ($LASTEXITCODE -ne 0) { throw "web-ext lint a signalé une erreur." }

    $Arguments = @("--yes", "web-ext@10", "run", "--source-dir", $ExtensionDir)
    if ($FirefoxPath) { $Arguments += @("--firefox", $FirefoxPath) }
    & npx @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Firefox ou web-ext s’est arrêté avec une erreur." }
}
finally {
    Pop-Location
}
