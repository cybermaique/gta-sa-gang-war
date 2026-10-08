# Regras Gang War v0.2

- Quatro gangues; Grove e a do jogador. Banco inicial herda o seed da Fase 1; cada carteira
  do mod comeca uma unica vez com $5000. Dinheiro/estatisticas do save GTA nao sao importados.
- Territorio: 100 pontos; GZ: 250; base: 500; banco: 10 por $10000 completos, teto de 300.
  Empate por ID. Apenas zonas com limites definidos contam; membros derivam dos integrantes.
- Territorio: 120 s, alvo 100 pontos, 3v3. GZ: 180 s, alvo 150 pontos.
  Presenca liquida de atacantes/defensores conta por segundo; minimo de 2 atacantes incluindo CJ.
  Cada morte altera 15 pontos. Vencer exige manter o minimo de atacantes; expirar favorece defesa.
- Uma onda de reforcos (um por lado) apos 30 s; maximo 8 NPCs. Reservas antes do spawn,
  recuperacao 10 minutos, mortes dobram a recuperacao no resultado. Missao/cutscene cancela combate.
- Captura muda proprietario, conta vitoria/derrota, paga $1000, gera historico e cooldown de 1 h.
  Comandos DEV de transferencia sao administrativos, nao recompensam capturas.
- Simulacao retroativa: passos de 1 h, no maximo 24 por retorno; resto do intervalo e consumido
  sem multiplicar eventos em reloads. Limite de 1 perda do jogador e protecao do ultimo territorio.
  Receita por hora: $500/territorio e $750/GZ; custo $5/membro e $150/base, saldo nunca negativo.
  Ataques rivais custam $500, usam tropas disponiveis/habilidade e cooldowns; maximo um por hora.
- Banco/carteira sao exclusivamente do mod. Deposito/saque conservam o total entre eles.
  Compras exigem saldo e posicao/respawn calibrados. Equipar logicamente um membro em base
  custa $50 e tem cooldown de 1 h, sem spawn de todos os integrantes.
- Niveis de base: pickups/veiculos = 3/1, 5/2, 8/3, 12/4. Niveis e limites ficam em config.
  Area 51: nivel 4; Rhino/Hydra/Hunter disponiveis como slots, sem disputa semanal.
- Pickups usam objetos de equipamento giratorios e coleta gerenciada para controlar permissao;
  nao sao pickups automaticos que qualquer ped possa consumir. Vida/colete ate 100; nao reduzem
  valores ja maiores. Armas/municao e cooldown editaveis; padrao 60 s, persistido antes do grant.
- Veiculos comuns: reposicao 5 min; militares: 30 min. Modelo/cor/ponto/cooldown editaveis.
  Slot reservado antes do spawn, uma unidade gerenciada; portas rivais fechadas para CJ.
  Perder a base revoga beneficios; CJ sai normalmente de carro rival, sem teleport forçado.
- Respawn do jogador usa ponto aleatorio cadastrado na cidade ou base propria. Perder a base
  selecionada volta a cidade padrao. Sem ponto calibrado, preserva o respawn original.
  Override apenas apos morte observada em free roam; nunca teleportamos jogador vivo.
- Membros recuperam-se logicamente fora do alcance; perto do CJ ha ate dois guardas em base/cidade.
  Combates substituem esse pool. NPCs recebem armas existentes no loadout persistido.

Configure em `config/world.mts`. IDs novos de zonas/bases sao adicionados ao carregar o mundo;
IDs existentes preservam seus proprietarios, coordenadas e equipamentos persistidos. Use o menu
DEV para editar propriedades existentes sem apagar o estado. Limites globais: 24 icones e 12 veiculos.
