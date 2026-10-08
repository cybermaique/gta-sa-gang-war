# Gang War v0.2 — estado de entrega

Base: main `9300d40`, merge da Fase 1. Branch: `feat/gang-war-core-v0.2`.
Nao foram criados/ampliados testes unitarios nem instaladas dependencias novas.

| Fase | Implementacao | Aceite pendente |
| --- | --- | --- |
| 2 | Cadastro, entrada/saida, calibracao, transferencia e ranking; blips por proprietario | Calibrar El Corona; radar retangular bloqueado sem API adicional |
| 3 | Captura por presenca/mortes, NPCs 3v3, uma onda de reforcos, resultado/historico | Streaming de modelos, combate e limpeza no GTA |
| 4 | Dois snapshots INI, checksum, publicacao apos gravacao, recuperacao; simulacao limitada | Permissao fs, APIs INI e Date.now no CLEO real; interrupcao/recuperacao |
| 5 | GZs separadas, regras/pontos/historico e simulacao offline | Calibrar dois cantos das GZs e disputar no GTA |
| 6 | Banco/carteira do mod, receitas, custos, compras, transacoes | Conferir saldos e durabilidade no jogo |
| 7 | Catalogo LS/SF/LV, Fabrica e Area 51; compra, niveis, permissao | Calibrar posicao e respawn das bases |
| 8 | Icones giratorios, vida/colete/armas, cooldown persistido, editor e slots | Visual, coleta e permissao; abastecimento NPC abstrato |
| 9 | Preferencia de cidade/base, fallback, override nativo; recuperacao de membros | Calibrar spawns e validar morte/respawn fora de missao |
| 10 | Slots/modelos/cores, spawn reservado, limites, cooldown e limpeza | Calibrar garagem/pista; validar colisao, permissao e reposicao |

Todas as linhas incluem codigo integrado, mas nao equivalem a aceite no jogo.
O preenchimento de areas coloridas no radar nao esta implementado: a biblioteca instalada
nao oferece comando de retangulo de radar sem extensoes adicionais. Os blips sao o fallback real.
Nao foram usados comandos SA-MP, CLEO+, memoria do executavel ou plugins novos.

Coordenadas iniciais de Ganton, Idlewood e East Los Santos foram extraidas de `data/info.zon`.
Pontos fisicos de bases, GZs, pickups, respawn e veiculos dependem de calibracao pelo CJ.
Isto evita publicar coordenadas de spawn inventadas ou prometer colisao segura sem teste local.

Para retomar: executar a validacao manual do README, registrar logs das APIs/colisao,
ajustar as configuracoes e somente entao solicitar publicacao. As Fases 11 a 15 estao fora do escopo;
Area 51 tem apenas catalogo e slots de nivel 4, sem evento/leilao semanal.
