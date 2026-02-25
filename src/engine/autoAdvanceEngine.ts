/**
 * Motor de Auto-Avanço — Fase de Grupos → Eliminatórias
 *
 * Verifica se todas as partidas de grupo de uma modalidade estão completed.
 * Retorna flag indicando se o avanço automático deve ser disparado.
 *
 * Módulo puro — sem dependências de UI, banco ou React.
 */

export interface AutoAdvanceMatch {
  id: string;
  round: number;
  status: string;
  modality_id?: string | null;
}

export interface AutoAdvanceResult {
  shouldAdvance: boolean;
  reason: string;
}

/**
 * Verifica se o auto-avanço deve ser disparado para a modalidade.
 *
 * @param matches - Todas as partidas da modalidade
 * @param autoAdvanceEnabled - Flag opt-out (default true)
 */
export function checkAutoAdvance(
  matches: AutoAdvanceMatch[],
  autoAdvanceEnabled: boolean = true
): AutoAdvanceResult {
  if (!autoAdvanceEnabled) {
    return { shouldAdvance: false, reason: "Auto-avanço desativado pelo organizador" };
  }

  const groupMatches = matches.filter((m) => m.round === 0);

  if (groupMatches.length === 0) {
    return { shouldAdvance: false, reason: "Nenhuma partida de grupo encontrada" };
  }

  const knockoutMatches = matches.filter((m) => m.round > 0);
  const knockoutWithTeams = knockoutMatches.some(
    (m) => (m as any).team1_id || (m as any).team2_id
  );

  if (knockoutWithTeams) {
    return { shouldAdvance: false, reason: "Eliminatórias já possuem equipes atribuídas" };
  }

  const allCompleted = groupMatches.every((m) => m.status === "completed");

  if (!allCompleted) {
    return { shouldAdvance: false, reason: "Partidas de grupo ainda pendentes" };
  }

  return { shouldAdvance: true, reason: "Todas as partidas de grupo finalizadas" };
}
