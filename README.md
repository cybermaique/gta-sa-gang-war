# San Andreas: Gang War Offline

Mod single-player para GTA San Andreas, inspirado nos servidores SA-MP Gang War.

O objetivo é evoluir para um mundo persistente com aproximadamente 20 gangues controladas por IA.

## Status: Fase 1 — Gang System v0.1

Implementado:

- Cadastro demonstrativo de Grove Street Families, Ballas, Los Santos Vagos e Varrios Los Aztecas.
- Grove Street como gangue do jogador.
- Modelo tipado com ID estável, nome, cor, líder opcional, membros, banco, territórios, GZs,
  bases, vitórias, derrotas, agressividade, habilidade, indicador do jogador e data de registro.
- Pontuação configurável, ranking recalculável e desempate determinístico por ID ascendente.
- Validação de dados, contagens inteiras não negativas, saldo finito não negativo e IDs únicos.
- Ranking completo no `cleo_redux.log` ao iniciar e consulta por Ctrl + G no jogo.
- Testes automatizados do domínio, do adapter, da entrada real com APIs simuladas e do deploy PowerShell.

**Os números são dados de demonstração em memória. Não representam nem modificam o save do GTA.**
Os IDs são referências estáveis para futuros membros individuais, propriedades e relações;
nesta fase, essas entidades ainda não existem. Vitórias e derrotas são apenas dados do cadastro.

## Tecnologias e requisitos

- GTA San Andreas clássico PC 1.0 US, CLEO 5 e CLEO Redux com suporte a TypeScript.
- Ambiente de desenvolvimento inspecionado: Windows 11, CLEO 5.4.0 e CLEO Redux 1.5.1 x86.
- Node.js 20.20 ou superior e npm, apenas para desenvolvimento e testes.
- TypeScript 5.9, `tsx` 4, `@types/node` 20 e Git.
- PowerShell para deploy. Os testes de deploy são omitidos com indicação explícita caso não exista
  `powershell.exe` (Windows) ou `pwsh` (outros sistemas).

O código que roda no GTA não depende de Node.js, `node_modules`, frameworks ou banco de dados.
O CLEO Redux carrega e transpila o TypeScript diretamente; não há etapa de build obrigatória.
As dependências estão somente em `devDependencies`, com versões resolvidas no `package-lock.json`.

## Desenvolvimento

No PowerShell, dentro do repositório:

```powershell
cd C:\dev\sa-gang-war-offline
npm ci
npm run typecheck
npm test
# Ou executar tipos e testes juntos:
npm run check
```

O `tsconfig.json` verifica o runtime com ES2020 e sem tipos de Node ou DOM. `types/cleo.d.ts`
contém somente os globais utilizados, conferidos nas definições instaladas em
`CLEO\.config\sa.d.ts` (Sanny Builder Library v1.67).
O `tsconfig.tests.json` habilita os tipos de Node exclusivamente para os testes.

## Deploy

Instale previamente o CLEO 5 e o CLEO Redux na instalação de desenvolvimento.
Confira o caminho: o script exige que exista `<GamePath>\gta_sa.exe`.

```powershell
# Valida tipos e testes antes de copiar o mod para este caminho explícito:
npm run deploy -- -GamePath "C:\Games\GTA-SA-GangWar-DEV"
```

Alternativa direta, depois de executar `npm run check`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -GamePath "C:\Games\GTA-SA-GangWar-DEV"
```

O parâmetro tem como padrão `C:\Games\GTA-SA-GangWar-DEV`. Para outra instalação, forneça
`-GamePath`. O deploy copia `index.ts` e todos os módulos `.mts` preservando o caminho relativo para:

```text
<GamePath>\CLEO\GangWarOffline\
```

O deploy falha com código 1 e uma mensagem se faltar o executável, o ponto de entrada ou ocorrer
um erro de cópia. Copia somente fontes `.ts`/`.mts` de `src/GangWarOffline`, excluindo declarações
`.d.ts`, `node_modules`, testes e Git. Substitui arquivos do mod com o mesmo nome; não remove
arquivos existentes, outros mods, executável ou saves. Não instala plugins ou ASI loaders.

Os testes de deploy usam uma instalação temporária com executável fictício, verificam a cópia
de todos os módulos e a preservação dos outros arquivos; nunca executam o GTA.

## Consultar o ranking dentro do GTA

1. Faça o deploy, abra o jogo e carregue um save ou inicie um novo jogo.
2. Fora de uma missão, confirme a mensagem `Gang War Offline v0.1 carregado! Ctrl + G: ranking DEMO.`
3. Segure **Ctrl** e pressione **G**. A primeira consulta apresenta o primeiro colocado.
4. Cada novo pressionamento mostra a próxima gangue. Depois da quarta posição, volta à primeira.
5. Grove Street recebe a identificação `[JOGADOR]`. O texto é marcado `DEMO`.
6. Confira também `<GamePath>\cleo_redux.log`: a inicialização deve registrar `[GangWar]`,
   `[validacao] OK: 4 gangues validadas`, `[ranking] OK` com os dados completos das quatro
   gangues e `[atalho] OK: Ctrl + G registrado` antes da confirmação de sucesso.

O atalho fica centralizado em `src/GangWarOffline/config/keyboard.mts`: códigos das teclas
e texto apresentado no jogo. Ctrl usa o código virtual 17 (`0x11`); G usa 71 (`0x47`),
conferidos em `CLEO/.config/sa.enums.mts` da instalação CLEO Redux 1.5.1 e na
[tabela de virtual keys do Windows](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes).
Para alterar o atalho futuramente, ajuste `RANKING_SHORTCUT.keys` e `RANKING_SHORTCUT.label` nessa configuração.

O adapter consulta as teclas com `Pad.IsKeyPressed` a cada 50 ms usando `setInterval`.
Só aciona quando **todas as teclas da combinação** estão pressionadas ao mesmo tempo.
Ctrl sozinho ou G sozinho não acionam. Detecta a transição da combinação de solta para
pressionada, sem repetir enquanto ambas estiverem seguradas. Para avançar, solte e pressione
G novamente; pode manter Ctrl segurado. A ordem de pressionamento não importa, desde que
as teclas fiquem pressionadas simultaneamente. Soltar Ctrl também libera um novo acionamento.
Uma combinação já segurada ao carregar o script é ignorada até soltar pelo menos uma
das teclas e pressioná-la novamente. Não há espera bloqueante no listener.
O ranking só é recalculado na inicialização ou em um novo acionamento; o timer não registra logs.
Cada posição usa uma caixa curta, sem depender de texto multilinha.

Durante missões (`ONMISSION`), a exibição inicial e Ctrl + G são suprimidas para preservar os textos
da missão; a posição não avança. Depois da missão, solte e pressione a combinação novamente.
O mod não altera `ONMISSION`, armas, controles, NPCs ou territórios originais.
Se a consulta falhar, o timer é desativado e o erro é registrado uma única vez.

### Checklist manual de aceite

- Mensagem e ranking completo no log ao carregar o jogo.
- Ordem/pontuação igual à tabela abaixo; Grove Street marcada como jogador.
- Ctrl sozinho e G sozinho não abrem o ranking.
- Segurar Ctrl + G não avança várias posições; manter Ctrl e soltar/pressionar G avança e circula após a quarta.
- Recarregar o save reinicia o cadastro de demonstração e a navegação.
- Nenhum texto do ranking durante uma missão.
- Conferir se outro mod já usa Ctrl + G; conflitos entre mods exigem ajuste de `config/keyboard.mts`.

Essas verificações visuais e de convivência com os mods instalados exigem teste manual no GTA.
Testes com API simulada não confirmam renderização, foco, pausas, cutscenes ou compatibilidade
com cada instalação. Toques mais rápidos que a amostragem de 50 ms podem não ser detectados.

## Regras de pontuação

Pesos centralizados em `src/GangWarOffline/config/scoring.mts`:

| Recurso | Pontos |
| --- | ---: |
| Território | 100 por unidade |
| Gang Zone (GZ) | 250 por unidade |
| Base | 500 por unidade |
| Banco | 10 por $10.000 completos, limitado a 300 |

Fórmula: `territórios * 100 + GZs * 250 + bases * 500 + min(floor(banco / 10000) * 10, 300)`.
Vitórias, derrotas, membros, agressividade e habilidade não pontuam nesta versão.
Em empate, vence o ID em ordem alfabética ASCII crescente, independentemente da ordem de cadastro.
As posições são sequenciais (1, 2, 3...) mesmo em empate. O ranking copia as gangues e não modifica
o array nem os objetos de entrada. IDs duplicados e pontuação acima da precisão segura são rejeitados.

Os dados centralizados em `config/gangs.mts` produzem:

| Posição | Gangue | Pontos |
| ---: | --- | ---: |
| 1 | Ballas | 2110 |
| 2 | Los Santos Vagos | 1950 |
| 3 | Grove Street Families (jogador) | 1580 |
| 4 | Varrios Los Aztecas | 970 |

`createInitialGangs()` retorna cópias independentes da configuração congelada.
`calculateGangScore(gang, config)`, `rankGangs(gangs, config)` e `getGangById(gangs, id)`
podem ser usados fora do GTA. A busca retorna `undefined` quando o ID não existe.
`createdAt` é a data ISO UTC fixa do registro da configuração v0.1, não a data do save.
Seu contrato é `YYYY-MM-DDTHH:mm:ss.sssZ` (24 caracteres). A validação pura em `core/dates.mts`
confere formato, calendário gregoriano (incluindo anos bissextos) e limites de hora/minuto/segundo.
Não usa `Date.parse`, `new Date` ou `toISOString` para decidir se uma gangue é válida.
Rejeita datas impossíveis, offsets, espaços, segundos 60 e hora 24; o campo continua sendo string UTC.

## Diagnóstico de compatibilidade de datas no CLEO

A instalação CLEO Redux 1.5.1 registrou a rejeição de Grove Street durante `createInitialGangs()`.
O valor confirmado no repositório e no mod instalado é `2026-10-08T00:00:00.000Z` para as quatro
gangues: uma data válida no formato exigido. A validação antiga exigia regex, `Date.parse` finito
e igualdade entre `new Date(value).toISOString()` e a string original. O log antigo reunia essas
verificações numa mesma mensagem e não identificava qual delas falhou. Os testes Node passaram,
mas não mediram o resultado individual das APIs de Date no CLEO.

A correção preserva o contrato e valida explicitamente o calendário, eliminando a dependência
de parsing/normalização nativos de Date. Não há conversão de formato, troca de data, polyfill ou
relaxamento da validação. A divergência exata das APIs do runtime deve ser confirmada com o diagnóstico abaixo.

`adapters/diagnostics.mts` é importado pela entrada e executado automaticamente **uma vez ao
carregar o mod dentro do CLEO**, sem ação adicional, gravação de arquivos ou timer próprio.
Após novo deploy e carregamento do save, procure a linha `[GangWar] [compat-data]` no log:

- `value`, `valueType` e `valueLength`: string exata, seu tipo e comprimento.
- `legacyRegexMatches`: resultado da expressão regular original, avaliada separadamente.
- `canonicalFormat` e `calendarValid`: resultado do formato e da validação de calendário.
- `calendarSelfTestPasses` e `calendarSelfTestFailures`: teste executado no runtime para a data
  do cadastro, anos bissextos, fevereiro impossível e hora 24; esperado `true` e lista vazia.
- `dateParse`, `dateParseType`, `dateParseFinite` ou `dateParseError`: resultado de `Date.parse`.
- `constructedTime`, `toISOString`, `roundTripMatches` ou `dateRoundTripError`: resultado separado
  da construção/normalização da data.
- `legacyValidationPasses`: se a validação antiga passaria nesse runtime.

Se `calendarValid` for `true` e `legacyValidationPasses` for `false`, confira `legacyRegexMatches`
e os resultados de Date para identificar qual etapa divergiu. Exceções dessas APIs são capturadas
e registradas sem bloquear o cadastro.
Se ambos forem `true`, o problema antigo não foi reproduzido nesse carregamento: confira os
arquivos efetivamente instalados e a sessão/horário do log antes de atribuir a falha a uma API.

Erros de inicialização agora incluem a etapa: `ERRO [validacao]`, `ERRO [ranking]`,
`ERRO [apresentacao]` ou `ERRO [atalho]`. Uma data inválida também informa seu valor na mensagem.
Erros posteriores de consulta usam `ERRO [consulta-ranking]` e encerram o timer para evitar repetições.
Falhar na validação não deve produzir a confirmação de registro do atalho ou de inicialização completa.

Os testes de regressão simulam Date incompatível no domínio, no adapter e no `index.ts` real
carregado em Node com globais CLEO simulados. Confirmam quatro gangues, ranking, registro das
teclas 17/71 e um único acionamento de Ctrl + G mesmo mantendo o atalho pressionado.
Esses testes **não substituem o aceite dentro do GTA**: confirme o diagnóstico, as três etapas OK,
a mensagem inicial e a navegação pelas quatro posições no jogo.

## Estrutura

```text
src/GangWarOffline/
  index.ts
  core/
    dates.mts
    types.mts
    gangs.mts
    ranking.mts
  config/
    gangs.mts
    keyboard.mts
    scoring.mts
  adapters/
    diagnostics.mts
    gta.mts
types/cleo.d.ts
tests/
  dates.test.ts
  gangs.test.ts
  ranking.test.ts
  gta.test.ts
  entry.test.ts
  deploy.test.ts
scripts/deploy.ps1
package.json
package-lock.json
tsconfig.json
tsconfig.tests.json
.gitignore
README.md
```

A integração global com CLEO fica no `index.ts`; `adapters/gta.mts` controla a apresentação e
recebe uma API injetável. O core depende apenas das configurações do próprio mod.
Os módulos auxiliares usam `.mts` com imports relativos explícitos, suportados pelo CLEO Redux,
para não serem executados como scripts independentes. O único ponto de entrada é `index.ts`.

Referências verificadas:

- [TypeScript e configuração](https://re.cleo.li/docs/en/typescript.html)
- [Imports, incluindo módulos .mts](https://re.cleo.li/docs/en/imports.html)
- [Diretórios com index.ts e ciclo de vida](https://re.cleo.li/docs/en/script-lifecycle.html)
- [API: HOST, ONMISSION, log, showTextBox e timers](https://re.cleo.li/docs/en/api.html)
- [Programação assíncrona e timers](https://re.cleo.li/docs/en/async.html)
- [Exemplo oficial com Pad.IsKeyPressed](https://github.com/cleolibrary/CLEO-Redux)

## Limitações e próximas fases

A v0.1 mantém somente dados de demonstração durante a sessão. Reiniciar o script, carregar
outro save ou reabrir o jogo reinicializa esses dados. Não há persistência, sincronização com
save, conquistas, NPCs, economia real, combates, IA ou simulação offline. Cores e estatísticas
estão no modelo, mas não há HUD própria ou marcação de áreas do mapa.

Planejado para futuras fases:

- Conquista e defesa de territórios, GZs e bases.
- Economia, bancos e disputa semanal da Área 51.
- Bots avançados de combate e IA estratégica para aproximadamente 20 gangues.
- Mundo persistente offline, simulação entre sessões e relações entre gangues.
- Conversas e vozes com IA.
