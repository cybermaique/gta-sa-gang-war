# Fase 10.1 — Social System e scoreboard

## Implementado na branch atual

O codigo anterior nao possuia chat nem identidades sociais. Este complemento cria
a base social vinculada aos **100 membros virtuais existentes**, mais CJ; nao
cria NPCs para preencher a lista. Os NPCs fisicos dos pools de combate/guardas
apontam para as mesmas identidades estaveis. Handles nunca sao persistidos.

- Tags iniciais `[GSF]`, `[BLS]`, `[VGS]`, `[AZT]` em `config/gangs.mts`.
- `core/social.mts` deriva nome/tag/cor da associacao com a gangue. Nickname nunca
  contem tag. Mudancas de tag afetam chat, scoreboard, feed e notificacoes.
- O modelo de persistencia inclui nickname, gangue, online/offline, kills,
  deaths, score, conquistas, defesas, vitorias GZ e patente opcional, todos
  validados. A gravacao INI esta pendente; o modo DEV atual e em memoria.
- IDs internos dos bots reutilizam `members.id`; CJ usa `human-cj`.
  IDs numericos online sao unicos, com CJ em 0 no inicio de cada sessao.
  Entradas/saidas durante a sessao nao renumeram os demais; IDs de sessao nao
  substituem identidade interna. Offline tem `sessionId: null`.
- Online virtual nao significa NPC fisico no mapa. A presenca inicial e configurada
  como online para todos os membros, com estatisticas individuais **zero**.
- Scoreboard central com ID, nickname/tag/color, score, K/D e destaque de CJ.
  Ordem por score, kills, deaths, humano no empate e ID estavel (comparacao ASCII
  independente de locale); ranking de gangues continua Ctrl+G.
- Chat global/gangue real, digitado pelo humano; sem dialogos/ping inventados.
  Filtro de gangue e aplicado ao HUD, nao apenas ao prefixo da mensagem.

## Teclas e configuracao

`src/GangWarOffline/config/social.mts` centraliza TAB, modo, paginacao, limites,
atalhos e pesos. Modo padrao `tabMode: "hold"`; altere para `"toggle"` e faca novo
deploy para abrir/fechar por um toque, com debounce por borda.

| Tecla | Acao |
| --- | --- |
| TAB segurado / solto | Exibe / oculta jogadores (hold) |
| PgUp / PgDn | Pagina anterior / seguinte; sem repetir ao segurar |
| T | Abrir chat no canto superior esquerdo |
| Seta Cima / Baixo com chat aberto | Percorrer historico; uma linha por toque |
| ! no inicio da mensagem | Enviar ao chat da gangue, sem incluir ! no texto |
| Enter / Esc | Enviar / fechar sem enviar |
| Ctrl+Y | Atalho legado para abrir o chat da gangue |
| Ctrl+G | Abrir/fechar ranking de gangues; sem ImGui, mostrar no chat |
  | Ctrl+M | Abrir/fechar painel visual do menu DEV; suprimido enquanto chat, TAB ou ranking estao abertos |

Pressione T e digite diretamente, sem clicar. O Input plugin do CLEO Redux le
o teclado do Windows enquanto o controle de CJ esta suspenso. A barra preta
aparece abaixo do historico, no canto superior esquerdo, sem botoes. Digite
`!texto` para a gangue; o `!` e usado para escolher o canal e nao aparece na
mensagem enviada. Entrada basica ASCII: letras, numeros, espaco e pontuacao
com Shift (incluindo Shift+1 para `!` no layout usual). Acentos e composicao
de texto/IME nao sao suportados por esta leitura de teclas virtuais.
No layout pt-BR da instalacao DEV, a tecla `;` usa VK 191, a tecla `/` usa
VK 193 (ABNT_C1) e a divisao do teclado numerico usa VK 111. Esses codigos
foram conferidos no Windows e nas enumeracoes do CLEO Redux instalado.
Dentro do chat, `/nick MeuNick` altera o nickname de CJ; `/tag [ABC]` altera
a tag da gangue humana (1–5 letras maiusculas/digitos entre colchetes).
`/gangs [pagina]` consulta o ranking completo (8 por pagina); `/gang` mostra
a propria gangue e `/gang BLS` ou `/gang [BLS]` consulta outra. `/top [pagina]`
lista jogadores online por score (7 por pagina); `/stats` mostra CJ e `/help`
lista comandos. Consultas nao sao publicadas como mensagens de jogador: entram
no mesmo historico visual do chat com estilo de sistema e permanecem enquanto
couberem no historico da sessao. Ctrl+G
abre/fecha painel com pontuacao e propriedades, com PgUp/PgDn para paginas.
Sem ImGui, Ctrl+G apresenta o ranking no chat SCM. TAB continua exclusivo para
jogadores. Boas-vindas e top 5 aparecem uma vez por sessao apos o mundo ficar
pronto, inclusive dentro de casa; ausencia de interface nao impede o carregamento.
  HUD, chat, TAB e ranking funcionam em interiores se CJ estiver jogando, fora de
  missao e sem fade. Simulacao fisica, NPCs, captura e menu DEV continuam
  restritos ao exterior por seguranca.

  O menu DEV e renderizado pelo ImGuiRedux quando disponivel: Ctrl+M abre/fecha uma janela
  centralizada com pagina, alvo, acao, valor e slot. Ctrl+Left/Right muda a pagina; Ctrl+N/B/L
  continuam alterando a selecao;
  Ctrl+Up/Down ajusta o valor, Ctrl+Enter executa e Ctrl+Esc interrompe. Sem ImGuiRedux,
  o adapter usa o fallback textual anterior, sem perder os comandos.
Notificacoes do Gang War (confirmacoes, eventos e avisos de atalho) usam um
aviso ImGui centralizado no topo por alguns segundos, separado do historico do
chat. Mensagens originais do GTA nao sao interceptadas nem reposicionadas.
No modo DEV atual, as alteracoes entram no estado da sessao e se perdem ao
reiniciar. Configuracao inicial nao sobrescreve tags/nicknames presentes em
um estado INI integro quando esse modo de persistencia voltar a ser habilitado.

Durante TAB, `SET_PLAYER_DISPLAY_VITAL_STATS_BUTTON(0, false)` evita o painel
original de atributos; ao fechar, a acao e restaurada. Nao bloqueia movimento ou
combate. Outros bindings personalizados de TAB e outros mods exigem verificacao
manual; nao se altera `gta_sa.set` nem sao emuladas teclas.

Durante digitacao, o chat possui temporariamente o controle do jogador via
`SET_PLAYER_CONTROL`; nao interrompe o loop, NPCs ou relogio da disputa. Ao
enviar/cancelar restaura somente o controle que tomou. Missoes/cutscenes/fade
têm prioridade e ocultam as interfaces. Restauracao do controle e adiada se
outro estado especial ainda esta ativo. Feche chat antes de desligar/recarregar
o mod; hot reload durante digitacao/combate nao foi validado.

## Pontuacao e evidencia

Pesos padrao: abate confirmado 5, conquista 20, defesa territorial 15,
vitoria GZ 25. A resolucao confirmada de uma disputa atribui pontos somente aos
vencedores participantes: NPCs que realmente foram criados para o combate e CJ
que iniciou a disputa dentro da area. Tropas apenas reservadas/pendentes nao
recebem pontos. Transferencias DEV, compra de base, aparicao no TAB e simulacao
offline agregada das gangues nao atribuem score individual.
Outros eventos podem adicionar chaves/pesos em `SOCIAL_CONFIG.points`, mas so
pontuam quando um produtor confirmado os integra a `award`; evento sem peso e
rejeitado. A configuracao isolada nunca gera eventos ou pontos.

Mortes de CJ e NPCs do mod sao observadas por transicao/handle registrado e
`IS_CHAR_DEAD`; despawn/handle invalido nao e morte. O feed sem autor mostra
"autoria desconhecida". Sem prova de autoria, **kills e pontos por abate nao
sao incrementados**, mesmo se CJ estava mirando no NPC. Suicidio/friendly fire
nao concede ponto por abate. O motor aceita defesa e eventos GZ reais; combate
especifico de defesa de bases ainda nao existe e nao e simulado neste complemento.
K/D = kills / max(1, deaths), duas casas: 0/0 → 0.00; 3/0 → 3.00.

Contadores/pontos sao publicados apos a transacao do WorldStore, com deduplicacao
dos eventos recentes (512 tokens). No modo `memory`, a transacao nao grava INI.
A origem em runtime emite IDs unicos por sessao;
nao e uma API para reprocessar historicos antigos arbitrarios.

## Persistencia e desempenho

`WorldStore` possui snapshots A/B e checksum no modo INI, mas esse modo ainda
nao passou na instalacao DEV. O padrao atual e `memory`, que nao toca nesses
arquivos nem altera saves do GTA. O schema continua 2, com `social.version: 1`.
Veja [diagnostico de persistencia](PERSISTENCE_DIAGNOSTIC.md).

Scoreboard desenha somente quando visivel, com 13 linhas por pagina. Ordenacao e
dados sao atualizados a cada 500 ms ou revisao/pagina, nao em cada frame.
ImGuiRedux renderiza TAB e chat a cada frame quando presente; sem o plugin, o
renderer SCM continua como fallback. Oculto, nao ordena nem desenha scoreboard.
O painel TAB usa proporcao 4:3 (ate 800 x 600 em 1920 x 1080), fundo preto
translucido, borda fina, colunas fixas e linha vermelha para CJ. A ultima coluna
e K/D real, nao ping simulado. PgUp/PgDn percorrem as paginas enquanto TAB fica
segurado; em resolucoes menores o painel reduz de tamanho e permanece centralizado.
Chat pode ocupar 220 px de altura (antes 82 px), com ate 8 linhas recentes no
fallback e ate 40 mensagens no historico de sessao. No ImGui, o numero de
linhas visiveis considera a altura real da fonte. O texto e desenhado direto
no HUD, sem a barra de rolagem nativa. Com T aberto, Cima/Baixo percorrem as
mensagens antigas e um indicador discreto mostra a posicao; com o chat fechado,
sempre aparecem as linhas mais recentes e nenhum indicador. A barra de entrada
fica abaixo das linhas visiveis, sem cobrir a ultima mensagem. Consultas locais
como `/gangs` podem expandir temporariamente o historico para mostrar todas as
suas linhas. O plugin Input captura digitacao sem foco ou clique; o renderer SCM
mantem FXT local como fallback.

O modo atual de teste e `memory`: chat, score e identidades mudam durante a
sessao, mas nao sobrevivem ao fechamento do GTA. Os snapshots INI sao preservados
para diagnostico. Chat aparece imediatamente com `*` enquanto pendente na fila;
fila limitada a 64 eventos e envio invalido rejeitado.

## Integracao de participantes virtuais

Outros scripts locais podem emitir eventos CLEO Redux. Exemplo em um script
que executa no jogo (nao no Node):

```ts
dispatchEvent("GangWar:chat", {
  participantId: "ballas-1", channel: "global", text: "Mensagem realmente enviada."
});
dispatchEvent("GangWar:presence", { participantId: "ballas-1", online: false });
dispatchEvent("GangWar:notification", { participantId: "grove-street-1", text: "Cheguei a base." });
```

Use identidade interna, nao ID numerico. Canais: `global` ou `gang`.
Payloads/participantes sao validados; nao ha evento publico para conceder pontos
sem evidencia. NPC fisicamente registrado volta a online ao confirmar presenca.

## CLEO+ opcional: nao instalado nem exigido

`adapters/social-capabilities.mts` define interfaces desacopladas para projecao
da cabeca e autoria confirmada. O provider padrao nao implementa essas capacidades.
Um provider futuro e injetado em `startWorldRuntime` e so e usado quando declara
compatibilidade **e verificacao nesta instalacao**. Falha de uma capacidade
opcional desativa somente aquela capacidade, sem derrubar chat/TAB.

Diagnostico somente leitura:

```powershell
npm run diagnose:social
```

Na inspecao atual: log confirma CLEO Redux 1.5.1 x86 / catalogo 1.67; nenhum
arquivo CLEO+.asi/.cleo nem registro de carregamento foi encontrado. Catalogo
contém `CONVERT_3D_TO_SCREEN_2D` e `GET_CHAR_DAMAGE_LAST_FRAME`, mas isso **nao**
prova disponibilidade. Ultimo dano tambem **nao** prova quem matou o NPC.
Nenhum desses comandos e chamado. Nao se instala plugin, altera exe ou acessa
memoria por offsets. Nametags 3D e autoria precisa dos abates permanecem pendentes
de comprovacao de plugin/versao/ABI e comportamento real no jogo.

## Validacao manual obrigatoria

Com GTA fechado, execute `npm run typecheck`, `npm run verify:cleo` e
`npm run diagnose:social`. Depois:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -GamePath "C:\Games\GTA-SA-GangWar-DEV"
```

1. Abra GTA e carregue um save dentro de casa. Confirme as boas-vindas antes de
   sair pela porta; depois confira `Gang War pronto` e os logs
   `[social]`, `[social-ui] ImGuiRedux detectado` e `[atalhos]`. O modo `memory`
   nao le nem altera snapshots antigos.
2. Segure TAB: painel central, total 101 inicial (100 virtuais + CJ), quatro
   tags/cores, ID 0 de CJ destacado, scores 0 e K/D 0.00 em primeira migracao.
   Paginar ate o fim; nenhum ID online se repete. Soltar oculta imediatamente.
3. Enquanto TAB esta aberto, verifique que CJ pode andar/combater, sem painel de
   atributos original. Depois de fechar, confirme atributos originais novamente.
   Verifique widescreen, layout do notebook e outros mods de HUD.
4. Alterar tabMode para toggle, redeploy com GTA fechado: um toque abre, segurar
   nao alterna repetidamente, segundo toque fecha. Restaure hold se preferir.
5. T: digite `ola` sem clicar e envie com Enter; confira a mensagem global.
   Pressione T de novo, digite `!ola gangue` e envie; confirme o canal da gangue,
   a tag/cor e que o `!` nao foi salvo. Esc fecha sem enviar. Ctrl+Y continua
   aceito para quem usava o atalho antigo. Confirme que CJ volta a se mover.
6. `/nick MeuNick`, `/tag [TEST]`: conferir nome derivado no chat/TAB/notificacoes
   durante a sessao. No modo `memory`, a mudanca se perde ao reiniciar o GTA.
   Restaurar tag com `/tag [GSF]` se desejado.
7. Ctrl+G abre/fecha o painel de gangues; confira pontos e propriedades apos
   uma transferencia DEV. Consulte `/gangs`, `/gang BLS`, `/top`, `/stats` e `/help`.
   Missao/cutscene deve ocultar HUD social, sem habilitar controles indevidamente.
8. Capture um territorio real e uma GZ calibrada pelo DEV: apenas participantes
   vencedores ganham pontos na sessao. Transferencia DEV nao da
   pontos. NPC reservado que nao apareceu nao pontua. Verifique defesa vencedora.
9. Observe morte de um NPC fisico do mod: deaths cresce uma vez, feed com tag,
   autor desconhecido, nenhum kill inventado. Repetir streaming/despawn nao altera
   deaths. Morte de CJ deve contar uma vez na sessao; confira K/D sem divisao por zero.
10. Reinicie sem CLEO+: chat/TAB continuam normais; log registra apenas capacidade
    opcional indisponivel, sem disposed/erro de inicializacao.

Nenhum novo teste unitario foi criado. Tipos, auditoria de comandos e testes
antigos nao substituem estes passos. Funcionalidade no GTA ainda depende do
aceite manual; nao foi alegada validacao visual/combate dentro do jogo.

Referencias: [FXT local](https://re.cleo.li/docs/en/using-fxt.html),
[API de timers e eventos](https://re.cleo.li/docs/en/api.html),
[Sanny Builder Library](https://library.sannybuilder.com/).
