/**
 * Retorna o rótulo correto da fase eliminatória baseado na quantidade
 * de partidas na rodada (ou número de equipes competindo).
 *
 * Regras:
 * - round === 0 → "Fase de Grupos"
 * - 1 partida → "Final"
 * - 2 partidas → "Semifinal"
 * - 3-4 partidas → "Quartas de Final"
 * - 5-8 partidas → "Oitavas de Final"
 * - 9-16 partidas → "16 avos de Final"
 * - Acima → "Rodada Eliminatória"
 */
export function getEliminationRoundLabel(
  round: number,
  matchCountInRound: number,
): string {
  if (round === 0) return "Fase de Grupos";
  if (matchCountInRound <= 1) return "Final";
  if (matchCountInRound === 2) return "Semifinal";
  if (matchCountInRound <= 4) return "Quartas de Final";
  if (matchCountInRound <= 8) return "Oitavas de Final";
  if (matchCountInRound <= 16) return "16 avos de Final";
  return "Rodada Eliminatória";
}

/**
 * Versão curta para badges compactos.
 */
export function getEliminationRoundShortLabel(
  round: number,
  matchCountInRound: number,
): string {
  if (round === 0) return "Grupos";
  if (matchCountInRound <= 1) return "Final";
  if (matchCountInRound === 2) return "Semi";
  if (matchCountInRound <= 4) return "Quartas";
  if (matchCountInRound <= 8) return "Oitavas";
  if (matchCountInRound <= 16) return "16 avos";
  return "Elim.";
}
