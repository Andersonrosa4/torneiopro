/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          REGIMENTO OFICIAL — DUPLA ELIMINAÇÃO (IMUTÁVEL)           ║
 * ║                                                                      ║
 * ║  Este arquivo é a FONTE ÚNICA DE VERDADE para todas as regras       ║
 * ║  do formato Dupla Eliminação. Qualquer alteração no sistema          ║
 * ║  DEVE respeitar TODAS as regras aqui documentadas.                   ║
 * ║                                                                      ║
 * ║  PROIBIDO: modificar, ignorar ou contornar qualquer regra abaixo.   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ── ÚLTIMA ATUALIZAÇÃO: 2026-02-14 ──
 */

// ═══════════════════════════════════════════════════
// REGRA 1: FÓRMULA DE PARTIDAS
// ═══════════════════════════════════════════════════
// Total de partidas = (2 × N) − 3, onde N = número de equipes.
// Final ÚNICA, sem reset de bracket.

// ═══════════════════════════════════════════════════
// REGRA 2: IRON RULE — CONVENÇÃO DE SLOTS (IMUTÁVEL)
// ═══════════════════════════════════════════════════
// Em partidas da Chave dos Perdedores com feeders mistos:
//   • Sobrevivente dos Perdedores (Venc.) → SEMPRE team1_id (topo do card)
//   • Perdedor caindo dos Vencedores (Perd.) → SEMPRE team2_id (base do card)
//
// Esta convenção ELIMINA colisões de slots e garante
// que o vencedor sempre aparece no topo visual do card.
//
// SAFETY NET: Se o slot preferido estiver ocupado, usar o outro
// com log de erro [🚨 SLOT COLLISION]. Se ambos ocupados,
// log [💀 BOTH SLOTS FULL] — situação crítica.

// ═══════════════════════════════════════════════════
// REGRA 3: MIRROR CROSSING — ROTEAMENTO ESPELHADO
// ═══════════════════════════════════════════════════
// Perdedores da Chave de Vencedores caem para o lado OPOSTO:
//   • Winners A (upper) → Losers Lower (bracket 4, half=lower)
//   • Winners B (lower) → Losers Upper (bracket 3, half=upper)
//
// Este cruzamento é OBRIGATÓRIO e verificado na geração.
// Violações BLOQUEIAM a geração do bracket.

// ═══════════════════════════════════════════════════
// REGRA 4: CRUZAMENTO DAS SEMIFINAIS (ANTI-REMATCH)
// ═══════════════════════════════════════════════════
// As semifinais CRUZAM Winners com Losers do lado OPOSTO original:
//
//   Semi 1: Campeão Winners A  vs  Campeão Losers Upper (que tem perdedores da Winners B)
//   Semi 2: Campeão Winners B  vs  Campeão Losers Lower (que tem perdedores da Winners A)
//
// REGRA DE OURO: Uma equipe NUNCA pode enfrentar na semifinal
// alguém que estava na mesma chave de vencedores (A ou B) no início.
//
// LINKAGEM NA GERAÇÃO:
//   • Winners A final → next_win → Semi 1
//   • Winners B final → next_win → Semi 2
//   • Losers Upper final (has W-B losers) → next_win → Semi 1
//   • Losers Lower final (has W-A losers) → next_win → Semi 2
//
// LEGACY FALLBACK:
//   • Losers champion vai para semi do MESMO bracket_half
//     (NÃO do oposto, pois o mirror routing já cruzou os lados)

// ═══════════════════════════════════════════════════
// REGRA 5: ELIMINAÇÃO EM SEMIFINAL E FINAL
// ═══════════════════════════════════════════════════
// Qualquer derrota em Semifinal ou Final = ELIMINAÇÃO IMEDIATA.
// O perdedor NÃO cai para nenhuma chave. Não existe next_lose_match_id
// para partidas de semifinal ou final.

// ═══════════════════════════════════════════════════
// REGRA 6: FEEDER LABELS — EXIBIÇÃO VISUAL
// ═══════════════════════════════════════════════════
// Os rótulos de origem (Venc.X / Perd.Y) devem ser atribuídos
// ao slot CORRETO baseado em qual equipe realmente ocupa aquele slot,
// NÃO por ordem de índice no array.
//
// Prioridade de detecção do slot:
//   1. Verificar winner_team_id do feeder → qual slot do target ocupa
//   2. Verificar loser do feeder → qual slot do target ocupa
//   3. Fallback: usar convenção de slots (Regra 2)

// ═══════════════════════════════════════════════════
// REGRA 7: EXIBIÇÃO VISUAL — VENCEDOR SEMPRE NO TOPO
// ═══════════════════════════════════════════════════
// Quando um card tem um feeder "winner" e um "loser",
// o feeder "winner" (Venc.) SEMPRE aparece na parte de cima.
// Se team1 tem feeder "loser" e team2 tem feeder "winner",
// a exibição visual é TROCADA (swap) — mantendo dados intactos.
// Se ambos são do mesmo tipo (winner+winner ou sem feeder), sem swap.

// ═══════════════════════════════════════════════════
// REGRA 8: PAREAMENTO SEQUENCIAL NA R1 DOS PERDEDORES
// ═══════════════════════════════════════════════════
// Na Rodada 1 da Chave dos Perdedores, o pareamento é SEQUENCIAL
// por order de position: Perd.1 vs Perd.2, Perd.3 vs Perd.4, etc.
// Quem jogou antes na Winners joga primeiro na Losers.

// ═══════════════════════════════════════════════════
// REGRA 9: ANTI-REMATCH NAS RODADAS 1-2 DOS PERDEDORES
// ═══════════════════════════════════════════════════
// Na R2 dos Perdedores, os novos perdedores que caem da Winners são
// intercalados em ordem REVERSA com os sobreviventes da R1.
// Ex: Sobrevivente do 1º jogo da Losers R1 (Perd.9 vs Perd.10)
// enfrenta o dropper do ÚLTIMO jogo da Winners R2, não do primeiro.
// Isso impede que um time enfrente seu ex-adversário da Winners
// antes da Rodada 3 dos Perdedores.

// ═══════════════════════════════════════════════════
// REGRA 10: CHAPÉU (SLOT DE ESPERA)
// ═══════════════════════════════════════════════════
// Quando o número de equipes não é potência de 2, equipes ímpares
// recebem "Chapéu" — um slot de espera que aguarda adversário real.
// Equipes em Chapéu NÃO podem progredir sem adversário definido.
// Visualmente identificados por badges cinza "Aguardando".

// ═══════════════════════════════════════════════════
// REGRA 11: CASCATA DE RESETS
// ═══════════════════════════════════════════════════
// Edições na Winners regeneram Winners + Losers a partir do ponto.
// Edições na Losers regeneram apenas Losers a partir do ponto.
// Semifinal/Final: reset total dessas fases.

// ═══════════════════════════════════════════════════
// REGRA 12: ORDENAÇÃO POR DESCANSO (EARLIEST-FIRST)
// ═══════════════════════════════════════════════════
// Na R1 da Chave dos Perdedores, após o espelhamento reverso,
// os pares são ORDENADOS pelo máximo número de jogo (position)
// de forma ASCENDENTE. Isso garante que:
//   - Times que jogaram antes na Winners jogam primeiro na Losers
//   - Times que acabaram de jogar ficam para o final, tendo descanso
//   - O anti-consecutivo é resolvido naturalmente: o par com o
//     último jogo da Winners é sempre o último jogo da Losers R1
// PROIBIDO: trocar a posição/ordem dos jogos no scheduler ou
// fazer swaps ad-hoc — a ordenação por max-position é a única
// forma correta de garantir descanso.

export const DOUBLE_ELIMINATION_RULES_VERSION = '1.2.0';
export const DOUBLE_ELIMINATION_RULES_DATE = '2026-02-14';
