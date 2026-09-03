[CmdletBinding()]
param(
    [string]$Repository = "Othman-Benbrahim/Eloquent",
    [string]$Upstream = "sonnyp/Eloquent",
    [string]$ForkDirectory = "",
    [string]$SignedXpiPath = "",
    [switch]$CreateRelease
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$AddonSource = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Manifest = Get-Content (Join-Path $AddonSource "extension\manifest.json") -Raw | ConvertFrom-Json
$Version = [string]$Manifest.version
$Tag = "firefox-v$Version"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) est introuvable." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Git est introuvable." }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI n’est pas connecté." }

function Test-GitHubRepository {
    param([Parameter(Mandatory = $true)][string]$Name)

    $PreviousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 transforme parfois stderr de gh en NativeCommandError.
        $ErrorActionPreference = "Continue"
        & gh api "repos/$Name" *> $null
        return $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $PreviousErrorActionPreference
    }
}

if (-not $ForkDirectory) {
    $ForkDirectory = Join-Path (Split-Path $AddonSource -Parent) "Eloquent-fork"
}
$ForkDirectory = [System.IO.Path]::GetFullPath($ForkDirectory)

& (Join-Path $PSScriptRoot "Build-Firefox.ps1")

if (-not (Test-Path (Join-Path $ForkDirectory ".git"))) {
    if (Test-Path $ForkDirectory) {
        $ExistingItems = @(Get-ChildItem $ForkDirectory -Force)
        if ($ExistingItems.Count -gt 0) { throw "Le dossier cible existe et n’est pas un dépôt Git vide : $ForkDirectory" }
    }

    if (-not (Test-GitHubRepository -Name $Repository)) {
        $ForkName = ($Repository -split "/")[-1]
        & gh api --method POST "repos/$Upstream/forks" -f "name=$ForkName" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Impossible de créer le fork GitHub." }
        $Available = $false
        for ($Attempt = 0; $Attempt -lt 15; $Attempt++) {
            if (Test-GitHubRepository -Name $Repository) { $Available = $true; break }
            Start-Sleep -Seconds 2
        }
        if (-not $Available) { throw "Le fork a été demandé, mais GitHub ne l’a pas encore rendu disponible." }
    }

    & gh repo clone $Repository $ForkDirectory
    if ($LASTEXITCODE -ne 0) { throw "Impossible de cloner $Repository." }
}

$AddonDestination = Join-Path $ForkDirectory "firefox-addon"
New-Item -ItemType Directory -Path $AddonDestination -Force | Out-Null
foreach ($DirectoryName in @("extension", "scripts", "tests", "docs", "companion")) {
    $DirectoryDestination = Join-Path $AddonDestination $DirectoryName
    New-Item -ItemType Directory -Path $DirectoryDestination -Force | Out-Null
    Get-ChildItem (Join-Path $AddonSource $DirectoryName) -Force | ForEach-Object {
        Copy-Item $_.FullName $DirectoryDestination -Recurse -Force
    }
}
foreach ($FileName in @(
    "package.json", "README.md", "PRIVACY.md", "CHANGELOG.md", "AMO-SUBMISSION.md",
    "RELEASE_NOTES.md", "LICENSE", "amo-metadata.json", ".gitignore", ".gitattributes"
)) {
    Copy-Item (Join-Path $AddonSource $FileName) (Join-Path $AddonDestination $FileName) -Force
}

$CompanionWorkflow = Join-Path $AddonSource ".github\workflows\companion-build.yml"
if (Test-Path $CompanionWorkflow) {
    $WorkflowDestination = Join-Path $ForkDirectory ".github\workflows"
    New-Item -ItemType Directory -Path $WorkflowDestination -Force | Out-Null
    Copy-Item $CompanionWorkflow (Join-Path $WorkflowDestination "companion-build.yml") -Force
}

Push-Location $ForkDirectory
try {
    $GitPaths = @("firefox-addon")
    if (Test-Path (Join-Path $ForkDirectory ".github\workflows\companion-build.yml")) {
        $GitPaths += ".github/workflows/companion-build.yml"
    }
    & git add @GitPaths
    & git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
        & git commit -m "Update Firefox assistant v$Version and desktop companion"
        if ($LASTEXITCODE -ne 0) { throw "Le commit Git a échoué." }
        & git push origin HEAD
        if ($LASTEXITCODE -ne 0) { throw "Le push GitHub a échoué." }
    }
    else {
        Write-Host "Aucune modification à publier."
    }

    if ($CreateRelease) {
        & gh release view $Tag --repo $Repository 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { throw "La release $Tag existe déjà." }
        if ($SignedXpiPath) {
            $Xpi = (Resolve-Path $SignedXpiPath).Path
        }
        else {
            $SignedCandidates = @(Get-ChildItem (Join-Path $AddonSource "dist\signed") -Filter "*.xpi" -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending)
            $Xpi = if ($SignedCandidates.Count -gt 0) {
                $SignedCandidates[0].FullName
            }
            else {
                Write-Warning "Aucun XPI signé AMO trouvé : la release contiendra le XPI non signé de développement."
                Join-Path $AddonSource "dist\eloquent-local-assistant-$Version-unsigned.xpi"
            }
        }
        $Sources = Join-Path $AddonSource "dist\eloquent-local-assistant-$Version-source.zip"
        & gh release create $Tag $Xpi $Sources --repo $Repository --title "Firefox add-on $Version" --notes-file (Join-Path $AddonSource "RELEASE_NOTES.md")
        if ($LASTEXITCODE -ne 0) { throw "La création de la release GitHub a échoué." }
    }
}
finally {
    Pop-Location
}

Write-Host "Fork publié : https://github.com/$Repository"
Write-Host "Code de l’extension : $AddonDestination"
