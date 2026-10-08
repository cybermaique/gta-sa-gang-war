param(
    [string]$GamePath = "C:\Games\GTA-SA-GangWar-DEV"
)

$source = Join-Path $PSScriptRoot "..\src\GangWarOffline"
$destination = Join-Path $GamePath "CLEO\GangWarOffline"

if (-not (Test-Path (Join-Path $GamePath "gta_sa.exe"))) {
    throw "Diretorio do GTA nao encontrado: $GamePath"
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null

Copy-Item -Path "$source\*" `
    -Destination $destination `
    -Recurse -Force

Write-Host "Gang War Offline: deploy concluido!" -ForegroundColor Green
