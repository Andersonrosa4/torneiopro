/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║          REGIMENTO OFICIAL — DUPLA ELIMINAÇÃO (IMUTÁVEL)               ║
 * ║                                                                          ║
 * ║  Este arquivo é a FONTE ÚNICA DE VERDADE para todas as regras           ║
 * ║  do formato Dupla Eliminação. Qualquer alteração no sistema              ║
 * ║  DEVE respeitar TODAS as regras aqui documentadas.                       ║
 * ║                                                                          ║
 * ║  ⛔ PROIBIDO: modificar, ignorar ou contornar qualquer regra abaixo.    ║
 * ║  ⛔ PROIBIDO: gambiarras, swaps ad-hoc, reordenações no scheduler.     ║
 * ║  ⛔ PROIBIDO: qualquer alteração sem solicitação explícita do usuário.  ║
 * ║                                                                          ║
 * ║  MODO BLOQUEADO: Estas regras estão CONGELADAS e BLINDADAS.             ║
 * ║  Qualquer conflito com novos pedidos → BLOQUEAR e pedir esclarecimento. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── ÚLTIMA ATUALIZAÇÃO: 2026-02-14 ──
 * ── VERSÃO BLINDADA: 2.0.0 ──
 */

// ═══════════════════════════════════════════════════════════════
// REGRA 1: FÓRMULA DE PARTIDAS (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Total de partidas = (2 × N) − 3, onde N = número de equipes.
// Final ÚNICA, sem reset de bracket.
// ⛔ NUNCA adicionar partidas extras, "if necessary" ou grand final reset.

// ═══════════════════════════════════════════════════════════════
// REGRA 2: IRON RULE — CONVENÇÃO DE SLOTS (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Em partidas da Chave dos Perdedores R2+:
//   • Sobrevivente dos Perdedores (Venc.) → SEMPRE team1_id (topo do card)
//   • Perdedor caindo dos Vencedores (Perd.) → SEMPRE team2_id (base do card)
//
// Em partidas da Chave dos Perdedores R1 (AMBOS são droppers):
//   • Dropper de posição ÍMPAR da Winners → team1_id
//   • Dropper de posição PAR da Winners → team2_id
//   ⛔ NUNCA usar team2_id fixo quando dois droppers alimentam a mesma
//      partida — isso causa race condition e perda de dados.
//
// SAFETY NET: Se slot preferido ocupado → usar o outro com log [🚨 SLOT COLLISION].
// Se ambos ocupados → log [💀 BOTH SLOTS FULL] — situação crítica.
// ⛔ NUNCA inverter esta convenção.

// ═══════════════════════════════════════════════════════════════
// REGRA 3: MIRROR CROSSING — ROTEAMENTO ESPELHADO (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Perdedores da Chave de Vencedores caem para o lado OPOSTO:
//   • Winners A (upper) → Losers Lower (bracket 4, half=lower)
//   • Winners B (lower) → Losers Upper (bracket 3, half=upper)
//
// ⛔ Violações BLOQUEIAM a geração do bracket. NUNCA enviar para o mesmo lado.

// ═══════════════════════════════════════════════════════════════
// REGRA 4: CRUZAMENTO DAS SEMIFINAIS — ANTI-REMATCH (BLINDADA)
// ═══════════════════════════════════════════════════════════════
//   Semi 1: Campeão Winners A  vs  Campeão Losers Upper (perdedores da Winners B)
//   Semi 2: Campeão Winners B  vs  Campeão Losers Lower (perdedores da Winners A)
//
// REGRA DE OURO: Uma equipe NUNCA enfrenta na semifinal alguém da
// mesma chave de vencedores (A ou B) original.
// ⛔ NUNCA parear Winners A com Losers Lower diretamente (o mirror já cruzou).

// ═══════════════════════════════════════════════════════════════
// REGRA 5: ELIMINAÇÃO EM SEMIFINAL E FINAL (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Qualquer derrota em Semifinal ou Final = ELIMINAÇÃO IMEDIATA.
// ⛔ NUNCA criar next_lose_match_id para semifinais ou finais.

// ═══════════════════════════════════════════════════════════════
// REGRA 6: FEEDER LABELS — EXIBIÇÃO VISUAL (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Rótulos (Venc.X / Perd.Y) atribuídos ao slot CORRETO baseado em
// qual equipe realmente ocupa aquele slot, NÃO por ordem de índice.
// Prioridade: 1) winner_team_id do feeder, 2) loser do feeder, 3) Regra 2.
// ⛔ NUNCA usar termos em inglês (Game, Match, Winner, Loser, BYE).

// ═══════════════════════════════════════════════════════════════
// REGRA 7: EXIBIÇÃO VISUAL — VENCEDOR SEMPRE NO TOPO (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Quando um card tem feeder "winner" e "loser":
//   • Venc. SEMPRE aparece na parte de cima do card.
//   • Se team1=loser e team2=winner → swap VISUAL (dados intactos).
// ⛔ NUNCA alterar dados reais no banco para corrigir exibição.

// ═══════════════════════════════════════════════════════════════
// REGRA 8: PAREAMENTO SEQUENCIAL NA R1 DOS PERDEDORES (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Na Rodada 1 da Chave dos Perdedores, o pareamento é SEQUENCIAL
// por ordem de position ascendente:
//   Perd.1 vs Perd.2, Perd.3 vs Perd.4, Perd.5 vs Perd.6, etc.
// Quem jogou ANTES na Winners joga PRIMEIRO na Losers (descanso natural).
// ⛔ NUNCA usar espelhamento reverso (primeiro vs último).
// ⛔ NUNCA reordenar os pares no scheduler — a ordem é definida na GERAÇÃO.

// ═══════════════════════════════════════════════════════════════
// REGRA 9: ANTI-REMATCH — INTERCALAÇÃO REVERSA NA R2 (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Na R2+ dos Perdedores, os novos perdedores que caem da Winners são
// intercalados em ordem REVERSA com os sobreviventes da rodada anterior.
//
// EXEMPLO CONCRETO (16 equipes por lado):
//   Losers R1: Perd.9 vs Perd.10 → Jogo 17 (sobrevivente = surv[0])
//   Winners R2: Venc.9 vs Venc.10 → Jogo 29 (se perde → dropper)
//   SEM inversão: surv[0] vs Perd.29 → REMATCH possível (Perd.9 vs Venc.9)
//   COM inversão: surv[0] vs Perd.32 → Times de origens DISTANTES
//
// MECÂNICA: newLosers.sort(position ASC).reverse() antes de intercalar.
// GARANTIA: Ex-adversários da Winners NÃO se reencontram antes da R3 da Losers.
// ⛔ NUNCA intercalar na mesma ordem — SEMPRE reversa.

// ═══════════════════════════════════════════════════════════════
// REGRA 10: CHAPÉU — SLOT DE ESPERA (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Quando N não é potência de 2, equipes ímpares recebem "Chapéu".
// Equipes em Chapéu NÃO podem progredir sem adversário definido.
// Visualmente: badges cinza "Aguardando".
// ⛔ NUNCA conceder avanço automático (BYE) — SEMPRE Chapéu.

// ═══════════════════════════════════════════════════════════════
// REGRA 11: CASCATA DE RESETS (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// Edições na Winners → regeneram Winners + Losers a partir do ponto.
// Edições na Losers → regeneram apenas Losers a partir do ponto.
// Semifinal/Final → reset total dessas fases.
// ⛔ NUNCA fazer reset total quando a edição é apenas na Losers.

// ═══════════════════════════════════════════════════════════════
// REGRA 12: NUMERAÇÃO SEQUENCIAL CONTÍNUA (BLINDADA)
// ═══════════════════════════════════════════════════════════════
// A numeração dos jogos é ESTRITAMENTE sequencial: 1, 2, 3, 4...
// Ordem de emissão no scheduler: WA R1 → WB R1 → LS R1 → LI R1 → WA R2 → ...
// ⛔ NUNCA permitir saltos na numeração (ex: 16 → 25).
// ⛔ NUNCA reordenar jogos no scheduler — a ordem vem da GERAÇÃO.
// ⛔ NUNCA trocar posição de jogos como "gambiarra" anti-consecutivo.

export const DOUBLE_ELIMINATION_RULES_VERSION = '2.0.0';
export const DOUBLE_ELIMINATION_RULES_DATE = '2026-02-14';
