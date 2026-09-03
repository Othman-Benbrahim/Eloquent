[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$CompanionDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

foreach ($CommandName in @("cargo", "node")) {
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$CommandName est requis pour valider le compagnon."
    }
}

Push-Location $CompanionDir
try {
    & cargo fmt --all -- --check
    if ($LASTEXITCODE -ne 0) { throw "cargo fmt a échoué." }

    & cargo test -p eloquent-companion-core --all-targets
    if ($LASTEXITCODE -ne 0) { throw "Les tests Rust ont échoué." }

    & node "scripts\validate.mjs"
    if ($LASTEXITCODE -ne 0) { throw "La validation statique a échoué." }

    Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json | Out-Null
    Get-Content "src-tauri\capabilities\default.json" -Raw | ConvertFrom-Json | Out-Null

    Write-Host "Validation du compagnon réussie."
}
finally {
    Pop-Location
}
