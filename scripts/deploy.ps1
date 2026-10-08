param(
    [string]$GamePath = "C:\Games\GTA-SA-GangWar-DEV",
    [switch]$InstallImGuiPoc
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

try {
    $source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\src\GangWarOffline"))
    if (-not (Test-Path -LiteralPath (Join-Path $source "index.ts") -PathType Leaf)) {
        throw "Script de entrada nao encontrado: $source\index.ts"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $GamePath "gta_sa.exe") -PathType Leaf)) {
        throw "Diretorio do GTA nao encontrado (gta_sa.exe ausente): $GamePath"
    }

    $resolvedGamePath = (Resolve-Path -LiteralPath $GamePath).ProviderPath
    $destination = Join-Path $resolvedGamePath "CLEO\GangWarOffline"
    # Allowlist: entrada, modulos, manifesto e fixture INI sintetica (nunca snapshots).
    $files = @(Get-ChildItem -LiteralPath $source -Recurse -File | Where-Object {
        ($_.Extension -in @(".ts", ".mts") -or $_.Name -in @("mod.json", "ini-read-limits.ini")) -and $_.Name -notlike "*.d.ts" -and
        $_.FullName -notmatch '[\\/](node_modules|tests|\.git)[\\/]'
    })
    New-Item -ItemType Directory -Path $destination -Force | Out-Null

    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($source.Length + 1)
        $target = Join-Path $destination $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }

    if ($InstallImGuiPoc) {
        $pocSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\src\ImGuiReduxPoc"))
        if (-not (Test-Path -LiteralPath (Join-Path $pocSource "mod.json") -PathType Leaf) -or
            -not (Test-Path -LiteralPath (Join-Path $pocSource "index.js") -PathType Leaf)) {
            throw "POC ImGuiRedux incompleta: $pocSource"
        }
        $pocDestination = Join-Path $resolvedGamePath "CLEO\GangWarImGuiPoc"
        New-Item -ItemType Directory -Path $pocDestination -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $pocSource "mod.json") -Destination (Join-Path $pocDestination "mod.json") -Force
        Copy-Item -LiteralPath (Join-Path $pocSource "index.js") -Destination (Join-Path $pocDestination "index.js") -Force
        Write-Host "Gang War Offline: POC ImGuiRedux instalada (Ctrl+I alterna o painel)." -ForegroundColor Yellow
    }

    Write-Host "Gang War Offline: deploy concluido ($($files.Count) arquivos)!" -ForegroundColor Green
    Write-Host "Destino: $destination"
    Write-Host "Carregue um save fora de missoes e aguarde Gang War pronto. TAB: jogadores; Ctrl+G: painel de gangues; T: chat; /help: comandos; ! no inicio: gangue."
} catch {
    Write-Error "Gang War Offline: deploy falhou. $($_.Exception.Message)"
    exit 1
}
