# POC ImGuiRedux na instalacao DEV

Esta POC e isolada do `GangWarOffline`: ela nao altera saves, snapshots, dados de gangues ou a interface social existente.

## Pre-requisito conferido

Instale somente `ImGuiReduxWin32.cleo` na pasta `CLEO` do GTA fechado. O pacote e destinado ao CLEO Redux em jogos 32-bit, incluindo GTA San Andreas. Nao instale CLEO+ para esta etapa.

## Deploy

```powershell
npm run deploy -- -GamePath "C:\Games\GTA-SA-GangWar-DEV" -InstallImGuiPoc
```

## Validacao manual

1. Inicie um save fora de missao.
2. Confirme no `cleo_redux.log` a linha `[imgui-poc] OK` e a versao do plugin.
3. Confirme o painel central escuro `Gang War Offline - ImGuiRedux POC`.
4. Pressione e solte Ctrl+I repetidamente: o painel deve alternar uma vez por toque, sem piscar e sem perder os controles do GTA.
5. Dirija e abra o mapa; confirme que nao ha travamento ou queda de estabilidade.

Se a linha informar que ImGuiRedux nao foi carregado, feche o GTA, confirme que `CLEO\ImGuiReduxWin32.cleo` existe e envie o trecho inicial do `cleo_redux.log`.

A POC ja passou no log real da instalacao DEV. O Social System passou a usar ImGuiRedux para chat e TAB quando o global do plugin esta disponivel; o painel Ctrl+I continua opcional e inicia oculto.
