/**
 * Retorna o rótulo correto da fase eliminatória baseado na quantidade
 * EXATA de partidas na rodada.
 *
 * Regras:
 * - round === 0 → "Fase de Grupos"
 * - 1 jogo  → "Final"
 * - 2 jogos → "Semifinal"
 * - 3-4 jogos → "Quartas de Final"
 * - 5-8 jogos → "Oitavas de Final"
 * - 9-16 jogos → "16 avos de Final"
 * - Acima → "Jogos"
 */
export function getEliminationRoundLabel(
  round: number,
  matchCountInRound: number,
): string {
  if (round === 0) return "Fase de Grupos";
  if (matchCountInRound === 1) return "Final";
  if (matchCountInRound === 2) return "Semifinal";
  if (matchCountInRound >= 3 && matchCountInRound <= 4) return "Quartas de Final";
  if (matchCountInRound >= 5 && matchCountInRound <= 8) return "Oitavas de Final";
  if (matchCountInRound >= 9 && matchCountInRound <= 16) return "16 avos de Final";
  return "Jogos";
}

/**
 * Versão curta para badges compactos.
 */
export function getEliminationRoundShortLabel(
  round: number,
  matchCountInRound: number,
): string {
  if (round === 0) return "Grupos";
  if (matchCountInRound === 1) return "Final";
  if (matchCountInRound === 2) return "Semi";
  if (matchCountInRound >= 3 && matchCountInRound <= 4) return "Quartas";
  if (matchCountInRound >= 5 && matchCountInRound <= 8) return "Oitavas";
  if (matchCountInRound >= 9 && matchCountInRound <= 16) return "16 avos";
  return "Jogos";
}
