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
// REGRA 8: ESPELHAMENTO REVERSO NA R1 DOS PERDEDORES
// ═══════════════════════════════════════════════════
// Na Rodada 1 da Chave dos Perdedores, o pareamento segue
// espelhamento reverso: primeiro com último, segundo com penúltimo.
// Evita confrontos sequenciais imediatos.

// ═══════════════════════════════════════════════════
// REGRA 9: ANTI-REPETIÇÃO NAS RODADAS INICIAIS
// ═══════════════════════════════════════════════════
// Nas rodadas 1-2 dos perdedores, o sistema verifica se duas equipes
// já se enfrentaram antes. Se houver rematch, busca slot alternativo
// na mesma rodada. Se não houver alternativa, mantém o pareamento.

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
// REGRA 12: ANTI-CONSECUTIVO (BACK-TO-BACK PROIBIDO)
// ═══════════════════════════════════════════════════
// Nenhum time pode jogar duas partidas consecutivas na sequência.
// O scheduler detecta automaticamente feeders (next_win/next_lose)
// e reordena partidas dentro do mesmo bloco para garantir que o
// perdedor/vencedor de um jogo N nunca jogue imediatamente no jogo N+1.
// Exemplo: se o Jogo 16 alimenta o Jogo 17 via next_lose_match_id,
// o Jogo 17 é trocado por outro jogo do mesmo bloco que não tenha
// conflito de feeder.

export const DOUBLE_ELIMINATION_RULES_VERSION = '1.1.0';
export const DOUBLE_ELIMINATION_RULES_DATE = '2026-02-14';
