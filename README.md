# San Andreas: Gang War Offline

Persistencia v0.2: [diagnostico INI, datas e instrucoes de aceite no GTA](docs/PERSISTENCE_DIAGNOSTIC.md).
O IniFiles 1.2 ainda falha na releitura do snapshot real nesta instalacao. Por isso,
o modo atual e `memory`: recursos v0.2 inicializam para teste integrado, sem tocar
em snapshots e sem preservar alteracoes entre reinicios.

Complemento Fase 10.1: chat global/gangue, tags persistentes, identidades, score
individual e scoreboard TAB. [Configuracao e validacao manual](docs/SOCIAL_SYSTEM.md).
Na instalacao DEV com ImGuiReduxWin32, TAB e chat usam a interface ImGui.
T abre a barra de chat no alto da tela; `!mensagem` envia para a gangue.
Enter envia e Esc fecha, sem mouse. Ctrl+Y permanece como atalho legado.
Nametags 3D/autoria precisa de abates sao capacidades opcionais pendentes; CLEO+
nao e instalado nem exigido.

Mod single-player de GTA San Andreas classico, inspirado em SA-MP Gang War.
A v0.2 conecta gangues/ranking, territorios, disputas, GZs, economia, bases, equipamentos,
respawn e veiculos. **O modo de teste atual e em memoria; persistencia INI permanece pendente.**

## Ambiente e desenvolvimento

GTA SA 1.0 US, CLEO 5.4.0, CLEO Redux 1.5.1 x86, Windows 11 e PowerShell.
Node 20.20+ e npm somente para ferramentas. ImGuiReduxWin32.cleo foi instalado
apenas na copia DEV do GTA para a interface social; CLEO+ ainda nao e exigido.
TypeScript ES2020, modulos .mts, sem Node no runtime GTA.

```powershell
cd C:\dev\sa-gang-war-offline
npm ci
npm run typecheck
npm run verify:cleo -- "C:\Games\GTA-SA-GangWar-DEV"
# Suite existente da Fase 1 (nao cobre as novas funcionalidades):
npm test
```

A Fase 1 foi integrada a main em 9300d40. Desenvolvimento em feat/gang-war-core-v0.2,
sem commits/push/merge automaticos. Nao foram criados ou ampliados testes unitarios.
O verificador de APIs confere comandos/parametros e imports contra CLEO/.config/sa.json,
plugins instalados e manifesto. Isso nao substitui a execucao dentro da engine.

## Deploy e armazenamento

Faca deploy **com o jogo fechado**:

```powershell
npm run deploy -- -GamePath "C:\Games\GTA-SA-GangWar-DEV"
```

Ou, depois das verificacoes, apenas copie o mod:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -GamePath "C:\Games\GTA-SA-GangWar-DEV"
```

Destino: `<GamePath>\CLEO\GangWarOffline`. Copia fontes e mod.json, preserva imports e arquivos
existentes. Nao copia testes/node_modules/Git, nao instala plugins nem altera executavel/saves.
O manifesto pede apenas fs. Usa IniFile e Fs dos plugins **ja instalados**; nao muda cleo.ini.
Em politica Strict, fs precisa estar permitido pelo usuario; o mod falha explicitamente se nao puder gravar.

O modo padrao e definido em `src/GangWarOffline/config/persistence.mts` como `memory`.
Ele nao le, cria, altera ou recupera `world-a.ini`/`world-b.ini`; esses snapshots permanecem
preservados para analise. Ao fechar/reabrir o GTA, as alteracoes de mundo, chat, score e K/D
feitas no teste sao descartadas. Mude para `ini` somente depois de validar no GTA uma estrategia
de gravacao que passe escrita, leitura e releitura do snapshot completo.

Ao carregar um save ou iniciar novo jogo, a mensagem `Gang War Offline v0.2 ativo! Ctrl + G: ranking.`
aparece quando o jogo entra em estado seguro. Em seguida, use os atalhos abaixo para testar os
sistemas integrados sem persistencia.

## Menu DEV e ranking

Atalhos centralizados em config/keyboard.mts; uma acao por pressionamento.

| Atalho | Acao |
| --- | --- |
| Ctrl + G | Abrir/fechar painel do ranking de gangues; fallback no chat |
| Ctrl + M | Abrir/fechar painel visual do menu DEV |
| Ctrl + Esquerda / Direita | Pagina anterior/proxima |
| Ctrl + N | Proxima acao da pagina |
| Ctrl + B | Proximo territorio/GZ/base-alvo |
| Ctrl + L | Proximo slot de pickup/veiculo |
| Ctrl + Cima / Baixo | Ajustar valor da acao |
| Ctrl + Enter | Executar acao selecionada |
| Ctrl + Esc | Interromper mod e remover entidades gerenciadas |

Paginas: Territorios, Gang Zones, Banco, Bases, Pickups, Respawn, Veiculos.
Solte pelo menos uma tecla antes de repetir. O painel ImGuiRedux centraliza o menu em uma janela
escura com pagina, alvo, acao, valor e slot visiveis ao mesmo tempo; a pagina selecionada fica
destacada e os atalhos disponiveis aparecem no proprio painel. Ctrl+M funciona como abrir/fechar,
Ctrl+Esquerda/Direita troca paginas sem usar ciclos acidentais, e Ctrl+B fica reservado aos alvos.
Se o ImGuiRedux nao estiver disponivel, o menu usa o
fallback de texto legado e mantem a mesma navegacao por atalhos.
No chat (T), `/gangs [pagina]`, `/gang [TAG]`, `/top [pagina]`, `/stats` e `/help`
fazem consultas locais sem publicar mensagens. O top 5 aparece uma vez por sessao
quando o mundo estiver pronto. O modo DEV `memory` ainda nao grava em disco.
Inspecionar registra os dados completos no cleo_redux.log. Em missoes, cutscenes, interiores
ou fades, os efeitos do mundo sao suprimidos; o ranking tambem respeita ONMISSION.
O chat, o TAB, o painel Ctrl+G e a mensagem de boas-vindas podem aparecer dentro
de casa assim que o mundo estiver pronto; NPCs, capturas e menu DEV aguardam o exterior.
Avisos do Gang War ficam centralizados no topo para nao cobrirem o chat; mensagens
nativas do GTA permanecem inalteradas.

Indices de gangue: 0=Grove, 1=Ballas, 2=Vagos, 3=Aztecas; transferencia de base aceita 4=livre.
Comprar usa Grove; Comprar por gangue (DEV) permite testar outra gangue e debita o banco do comprador.
Tipos de pickup: 0=vida, 1=colete, 2=Desert Eagle, 3=Tec-9, 4=Micro SMG,
5=Sawn-off, 6=AK-47, 7=M4, 8=Sniper, 9=granadas.
Veiculos: 0=Greenwood, 1=Savanna, 2=Sultan, 3=Rhino, 4=Hydra, 5=Hunter;
modelos militares exigem base nivel 4.

## Calibracao e uso inicial

Coordenadas dos primeiros territorios usam GAN1, IWD4 e ELS4 de data/info.zon.
El Corona e GZs aguardam calibracao; bases/spawns/garagens nao recebem pontos inventados.

1. Entre em Ganton/Idlewood e confira entrada/saida, blip e proprietario. Use Ctrl+G.
2. Para editar territorio/GZ, selecione alvo, execute "Marcar canto A", caminhe ate o canto
   oposto e execute "Marcar canto B e salvar". Cada eixo precisa ter 5 a 1000 metros.
3. Na pagina Bases, selecione Base Grove, fique num local aberto e execute "Calibrar base aqui".
   Marque um ponto de respawn a pe, parado e fora da agua. Execute Comprar perto da base.
4. Em Pickups, selecione essa base, escolha tipo e execute Adicionar. Ctrl+L escolhe slot;
   altere tipo/municao/cooldown/posicao ou remova-o. Aproximar-se concede o beneficio depois de salvar.
5. Em Respawn, cadastre um ponto seguro na cidade correspondente (0=LS, 1=SF, 2=LV),
   selecione a cidade ou uma base propria. Cadastre varios pontos para selecao aleatoria.
6. Em Veiculos, calibre cada slot num espaco livre/pista, orientando CJ para a direcao desejada.
   Afaste-se pelo menos 5 metros para permitir spawn. Pode configurar modelo, cor e reposicao.
7. Entre numa zona inimiga e selecione Iniciar captura. A reserva de tropas e salva antes dos
   NPCs aparecerem. Fique na area com aliados, enfrente defensores e aguarde resultado/historico.
8. Base da Fabrica, SF, LV e Area 51 seguem o mesmo fluxo de calibracao. Area 51 nao tem disputa semanal.

Nao confunda transferencia DEV com vitoria de captura. O banco usa carteira do mod, nao dinheiro CJ.
Catalogo/configuracoes ficam em config/world.mts. IDs novos de zonas/bases sao acrescentados ao
estado existente; edicoes de IDs existentes nao apagam a personalizacao persistida.

## Validacao manual obrigatoria

- Primeiro load em memoria: [persistencia] Modo memoria, [validacao] OK, [ranking] OK e [atalho] OK no log.
- Ctrl+G segurado nao repete; menu permite calibrar, consultar e modificar somente os alvos previstos.
- Territorio muda de cor/proprietario e pontua no ranking; completar uma disputa troca a propriedade.
- 3v3 e reforcos respeitam maximo 8 NPCs; mortes afetam captura; sair para missao interrompe combate.
- Banco: comparar saldo/carteira antes/depois de deposito, saque, compra e recarregamento.
- GZ calibrada: repetir disputa e verificar pontuacao propria e historico.
- Pickup proprio concede vida/colete/arma; rival nao concede; segurar sobre o icone respeita cooldown.
- Morte fora de missao usa cidade/base propria; perda da base selecionada usa fallback; nunca move CJ vivo.
- Garagem: uma unidade por slot, portas rivais, destruicao e reposicao; military somente nivel 4.
- Fechar e reabrir o jogo: confirmar que o estado volta ao cadastro inicial; isso e esperado no modo memoria.
- Persistencia/recovery de snapshots nao fazem parte do aceite deste modo enquanto o IniFiles nao for corrigido.
- Ctrl+Esc encerra entidades. Evite hot reload e salvar o GTA enquanto ha entidades do mod ativas.

## Limites e compatibilidade

Marcadores coloridos sao reais; retangulos preenchidos de gang zones no radar nao estao disponiveis
nas APIs verificadas sem extensoes novas e permanecem uma limitacao. Pickups usam objetos giratorios
com coleta controlada, para impor permissao/cooldown em vez de grants automaticos da engine.
Colisao/altura, INI, modelos, tiros e override de respawn exigem aceite no GTA; checagem de tipos nao basta.
Nao foi usado comando marcado unsupported, SA-MP ou CLEO+; nenhum plugin novo foi instalado.

No maximo 8 NPCs em combate ou 2 guardas; 24 icones e 12 veiculos ativos. Streaming a 180 m,
mundo a 250 ms, teclado/IO a 50 ms. Reservas duraveis podem adiar um beneficio se houver interrupcao;
priorizamos nao duplicar recursos. Handles nao sao persistidos. Hot reload em combate nao foi validado.

Mantida a validacao pura de createdAt, sem Date.parse/new Date/toISOString. O diagnostico [compat-data]
continua no log. Date.now numerico passa por verificacao em runtime; falhar bloqueia o mundo offline.
As Fases 11 a 15, IA avancada e eventos semanais estao fora desta entrega.

Detalhes essenciais: [Roadmap](docs/ROADMAP.md), [Arquitetura](docs/ARCHITECTURE.md),
[Regras](docs/GAME_RULES.md). Referencias: [CLEO Redux](https://re.cleo.li/docs/en/),
[permissao fs](https://re.cleo.li/docs/en/permissions.html), [Sanny Builder Library](https://library.sannybuilder.com/).
