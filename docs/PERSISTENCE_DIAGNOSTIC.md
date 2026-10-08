# Persistencia v0.2 — investigacao e aceite no GTA

## Evidencia e limites da conclusao

O erro original era lancado em `WorldStore.pump`, no loop de gravacao:
`!io.write(path, key, value) || io.read(path, key) !== value`.
O short-circuit nao lia quando a escrita retornava false e nao registrava qual
operacao, tipo ou comprimento divergiu. A serializacao e JSON com caracteres
nao ASCII escapados, convertido a hex ASCII, originalmente em blocos de 96.
O adapter usa `IniFile.WriteString(value, path, "GangWar", key)` e
`IniFile.ReadString(path, "GangWar", key)`.

O log DEV inspecionado confirmou CLEO Redux 1.5.1 x86, host SA 1.0 e IniFiles 1.2.
O arquivo da tentativa limpa continha `commit=pending` e `part0..part10`, todos
com 96 caracteres hex completos (1172 bytes). Portanto a gravacao chegou a part10,
mas o log nao prova se a falha foi write-false, read-missing, tipo inesperado ou
conteudo divergente. **Nao foi comprovado truncamento de blocos de 96.**

No codigo publico do IniFiles Redux 1.2, STR_MAX_LEN e 128. Entrada UTF-8,
saida UTF-8, section/key e leitura wchar_t usam esse limite; nSize do
GetPrivateProfileString e 128. Para ASCII, a capacidade teorica e 127 + NUL.
GetPath recebe primeiro char[128], apesar do destino final MAX_PATH. Nao confundir
com SA.IniFiles.cleo do CLEO 5.4.0, que tambem esta instalado.

A inspeção binaria local encontrou instrucoes com constante 128 no plugin,
compativeis com o source. Isso nao confirma todas as etapas do binding JavaScript.
A tentativa de leitura Win32 fora do GTA retornou chave/arquivo nao encontrado
apesar de a leitura .NET conseguir acessar o arquivo; esse resultado nao e uma
reproducao confiavel do plugin carregado no jogo. Nenhum handler foi carregado
fora do GTA. **A causa nativa exata permanece pendente do diagnostico em jogo.**

Referencias primarias:
[IniFiles Redux 1.2](https://github.com/cleolibrary/CLEO-Redux/blob/master/plugins/IniFiles/dllmain.cpp),
[SDK STR_MAX_LEN](https://github.com/cleolibrary/CLEO-Redux/blob/master/SDK/cleo_redux_sdk.h),
[contrato Win32 de truncamento](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getprivateprofilestring).

## Mudancas e garantias

- `adapters/ini.mts` preserva resultados reais, sem coerção/trim, valida caminho
  absoluto ASCII ate 127 bytes, key e tamanho de entrada. Falha antes de chamar
  uma API que possa truncar o path. Outros caminhos UTF-8 exigem diagnostico proprio.
- `persistence/ini-diagnostics.mts`: registra file/path/section/key/index/total,
  comprimento enviado, tipo/resultado da escrita, tipo/resultado redigido da
  leitura, comprimento lido, primeira divergencia e codes dos caracteres divergentes,
  excecoes e failureType. Nunca registra o estado completo nem conteudo de blocos.
- Antes de abrir snapshots, o preflight testa 1..127 caracteres sinteticos num
  arquivo novo `ini-probe-N.ini`, um caso por 50 ms. Seleciona tamanho <=96
  **somente entre os round-trips que passaram**, confirma 16 chaves part0..part15
  e rele todos os valores depois de o arquivo crescer. Se nao passar, nao abre/grava
  snapshots. Arquivos do probe nunca sao removidos ou sobrescritos automaticamente.
- Geracoes novas usam marcador
  `GW2:revision:count:chunkSize:hexLength:checksumA:checksumB`, com tamanho explicito.
  Mantem o teto de 288000 caracteres hex anterior; o count se adapta a blocos menores.
  O loader ainda aceita o marcador legado `revision:count:checksumA:checksumB`
  com blocos de 96, sem regravar arquivos na leitura.
- Dois slots continuam `world-a.ini` e `world-b.ini`. Antes dos blocos, grava e
  verifica `pending`. Cada bloco e gravado e comparado sem short-circuit. Depois
  rele a geracao inteira em lotes, compara conteudo/checksum/comprimento e so entao
  grava/verifica o marcador final e publica o estado/onReady. A geracao anterior
  nao e tocada durante escrita. Falha deixa a nova geracao nao confirmada.
- Nenhum snapshot: cria mundo e inicializa ranking/menu somente apos a primeira
  geracao confirmada. Um valido + outro invalido: recupera o valido e inicia
  **somente leitura**, com ranking/TAB/menu de inspeção; escritas/combate/simulacao
  ficam bloqueados ate arquivamento manual do invalido e reinicio do jogo.
  Isso preserva inclusive dados parcialmente recuperaveis, sem sobrescrita automatica.
- Ambos invalidos / apenas arquivo invalido: preserva ambos e reporta a falha;
  **nao** cria mundo por cima deles e **nao** mostra pronto.
- Backup existente `backups/persistencia-20261008-171243/world-a.ini` e arquivo
  da tentativa DEV foram apenas lidos nesta investigacao. Nao foram movidos/apagados.

## Datas e simulacao offline (problema separado)

O log real informou `Date.parse("2026-10-08T00:00:00.000Z") = 1791417647104` e
toISOString `2026-10-08T00:00:47.104Z`. O epoch correto e `1791417600000`.
O valor observado coincide exatamente com a conversao float32 desse epoch;
o erro e +47104 ms, nao dado invalido de createdAt. A origem interna desse
arredondamento no runtime nao foi corrigida nem se instalou outro runtime.

Validacao de createdAt permanece por calendario puro, sem Date.parse. O mundo
continua usando epochs numericos de Date.now, mas agora `ClockMonitor` faz:

- vetores numericos conhecidos (1970, bissexto 2000, data 2026), getTime/ISO e
  conversao de calendario pura `isoUtcToEpoch`;
- round-trip de now numerico, separado do parsing de strings;
- progresso contra GET_GAME_TIMER em janelas >=2 s, detectando retrocesso/deriva;
- limites do checkpoint: sem retrocesso e salto de no maximo 30 dias.

Se essas checagens falharem, offline fica explicitamente bloqueado/adiado e
lastProcessedAt nao e consumido. Gangues/ranking/menu ainda podem iniciar quando
o armazenamento passa. Pause/loading podem provocar bloqueio conservador por
deriva; confirme o relogio antes de reiniciar. Esses checks nao provam que a hora
absoluta do PC esta certa: compare log com UTC do Windows, sem mudar seu relogio.

```powershell
[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
[DateTimeOffset]::UtcNow.ToString("o")
```

Nao declare o offline validado apenas porque Date.now e finito ou porque Node passa.

## Como executar o diagnostico e fazer deploy

1. Feche GTA. **Nao remova o backup existente.** O ultimo boot criou novamente
   um `world-a.ini` incompleto na DEV. Com ele presente e sem outra geracao integra,
   o comportamento correto agora e preservar e bloquear, nao reinicializar.
   Se quiser repetir a primeira execucao limpa, arquive manualmente essa tentativa
   em uma nova pasta de backup, mantendo arquivo original recuperavel. Nao mexa em
   snapshots integros ou em saves do GTA para "limpar" o erro.
2. `config/persistence.mts` vem temporariamente com diagnosticMode `preflight`.
   Para medir truncamento de leitura acima do limite teorico, altere para `limits`.
   Esse modo le a fixture sintetica `ini-read-limits.ini` (16..512) ANTES do probe.
   Valores >127 foram preparados no arquivo, nao enviados ao buffer de escrita;
   evita provocar overflow do plugin ao tentar gravar strings grandes.
3. Na raiz do projeto:

```powershell
npm run typecheck
npm run verify:cleo
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -GamePath "C:\Games\GTA-SA-GangWar-DEV"
```

Deploy copia somente codigo/manifesto/fixture sintetica; nao copia snapshots nem
backups. Nenhum novo teste unitario/framework foi criado.

4. Abra GTA, carregue save fora de missao e aguarde o diagnostico e a escrita/releitura.
   Com estado social grande, sao dezenas de segundos em lotes, sem busy-loop.
   Acompanhe `write ...%` e `recheck ...%` em cleo_redux.log. Aceite exige:
   `[persistencia-probe] OK`, `OK: primeiro cadastro`, `[mundo] OK`, `[ranking] OK`,
   `[menu-dev] OK` e `Gang War v0.2 pronto`.
5. Teste Ctrl+G percorrendo quatro gangues e Ctrl+M abrindo DEV. So depois de
   marcador confirmado, feche e reabra para confirmar leitura da mesma revisao.
6. Se falhar, envie logs `[persistencia-io]`, `[persistencia-probe]`,
   `[relogio-diagnostico]`, `[offline]` e erro subsequente. Nao e necessario enviar
   JSON do mundo; preserve INIs/probes/backups para diagnostico.
7. Apos confirmar limites no GTA, pode voltar de `limits` para `preflight`.
   `off` e opcao manual **somente depois** de confirmar e registrar
   confirmedChunkSize para esta instalacao; nao e forma de esconder um probe que falha.

Validacao de tipos/APIs nao comprova IO nativo. Esta entrega prepara a verificacao
real e corrige o protocolo/diagnostico; o erro nativo reportado nao foi declarado
resolvido sem um boot real bem-sucedido no GTA.
