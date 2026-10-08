# Arquitetura v0.2

`index.ts` conecta globais CLEO a adapters. Em CLEO com `native`, inicializa `world-runtime.mts`.
Em ferramentas sem engine, preserva o ranking v0.1 e registra explicitamente que o mundo nao iniciou.
Esse caminho permite executar a suite antiga sem fingir que ela verifica o mundo v0.2.

- `core/world-types.mts`, `world.mts`: entidades, validacao, calibracao e sincronizacao.
- `core/battles.mts`, `economy.mts`, `offline.mts`, `bases.mts`, `respawn.mts`: regras de dominio.
- `config/world.mts`, `commands.mts`, `keyboard.mts`: catalogo, limites, balanceamento e menu.
- `adapters/engine.mts`: chamadas nativas existentes na biblioteca SA instalada.
- `adapters/territories.mts`, `combat.mts`, `members.mts`, `assets.mts`: entidades transitorias.
- `adapters/dev-menu.mts`, `world-runtime.mts`: interface e coordenacao.
- `persistence/store.mts`: carregamento/gravação de estado via IO injetada, sem Node no GTA.

## Fonte de verdade

`WorldStore.world` e o unico estado duradouro publicado. Proprietarios vivem em zonas/bases;
banco vive em `gangs`, carteira em `wallets`, integrantes em `members`. As contagens da Fase 1
e o ranking sao derivados desses recursos por `syncWorld`, inclusive apos carregar um snapshot.
Os valores demonstrativos de territorios/bases da Fase 1 nao viram propriedades ficticias.

Uma operacao clona o snapshot, aplica regras e valida. Durante a gravacao, novos comandos de
mutacao aguardam; o estado anterior continua publicado. Depois do marcador final, publica-se
a nova revisao e aplicam-se efeitos no GTA. Grant de equipamento e spawn sao reservados primeiro.
Falhar entre reserva e efeito pode adiar/perder aquele beneficio, mas nao reaplica um credito.

## Armazenamento

`CLEO/GangWarOffline/world-a.ini` e `world-b.ini` alternam como atual/anterior.
JSON e convertido para ASCII/hex, em blocos de 96 caracteres para evitar truncamento de strings
e interpretacao de aspas/comentarios INI. Sao processados quatro blocos a cada 50 ms; cada escrita
e lida novamente. Um marcador com revisao, contagem e checksum Adler-32 e escrito por ultimo.
No load, valida-se checksum/schema/referencias e escolhe-se a geracao integra mais recente.
Se uma falhar, tenta-se a outra. Se ambas falharem, preserva-se tudo e bloqueiam-se mutacoes.
Limite: 3000 blocos por geracao. Nao ha garantia contra falhas de hardware/cache do Windows.

Nao ha estado no save GTA nem handles de engine persistidos. A permissao `fs` e declarada no
`mod.json` e depende da politica do CLEO; nao mudamos `cleo.ini`. Plugins INI/arquivos ja existem
na instalacao inspecionada. Sao APIs nativas, nao `node:fs`.

## Tempo e entidades

Data de registro continua usando o validador de calendario puro da Fase 1. O relogio offline
usa `Date.now` numerico com verificacao de intervalo/inteiro e log; Date.parse/toISOString nao
controlam o estado. Se o relogio falhar, inicializacao do mundo falha explicitamente.

Teclado e IO: 50 ms; mundo: 250 ms; tarefas de combate: 3 s; notificacao de captura: 5 s.
Maximo de 8 NPCs em disputa e 2 guardas fora dela, nunca os dois pools juntos.
Modelos sao requisitados sem espera bloqueante. Itens/veiculos so fazem streaming perto do CJ.
Cada slot tem um handle de sessao; morte/destroicao/cooldown nao produzem loops infinitos.

Use Ctrl+Esc para encerrar entidades antes de recarregar scripts. Deploy somente com jogo fechado.
Nao encontramos evento de disposicao de script utilizavel nas definicoes instaladas; portanto,
hot reload durante disputa nao e um fluxo validado de limpeza. Evite saves GTA enquanto o mod cria
entidades; o estado persistente do mod nao depende de salvar o GTA.

## Verificacao

`scripts/verify-cleo-api.mjs` verifica imports, nomes/entradas dos comandos, flags de suporte,
plugins instalados e manifesto contra `CLEO/.config/sa.json`. Nao comprova comportamento runtime.
A checagem de tipos usa ES2020; a suite existente cobre a Fase 1, nao as novas fases.
Aceite de combate, modelos, INI, permissao, respawn e limpeza exige o GTA real.
