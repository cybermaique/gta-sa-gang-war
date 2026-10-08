param(
    [string]$GamePath = "C:\Games\GTA-SA-GangWar-DEV"
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
    # Allowlist: somente o ponto de entrada e os modulos TypeScript do mod.
    $files = @(Get-ChildItem -LiteralPath $source -Recurse -File | Where-Object {
        $_.Extension -in @(".ts", ".mts") -and $_.Name -notlike "*.d.ts" -and
        $_.FullName -notmatch '[\\/](node_modules|tests|\.git)[\\/]'
    })
    New-Item -ItemType Directory -Path $destination -Force | Out-Null

    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($source.Length + 1)
        $target = Join-Path $destination $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }

    Write-Host "Gang War Offline v0.1: deploy concluido ($($files.Count) arquivos)!" -ForegroundColor Green
    Write-Host "Destino: $destination"
    Write-Host "Carregue um save fora de missoes e use o atalho indicado na mensagem inicial do mod para consultar o ranking DEMO."
} catch {
    Write-Error "Gang War Offline: deploy falhou. $($_.Exception.Message)"
    exit 1
}
