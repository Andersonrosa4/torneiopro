/**
 * Round Lock Guard
 *
 * Verifica se uma partida pode receber resultado.
 * Regra: todos os matches da rodada anterior, na mesma chave
 * (bracket_type + bracket_half), devem estar "completed".
 *
 * Round 1 (ou round 0 para grupos) nunca é bloqueada.
 * Módulo puro — sem dependências de UI, banco ou React.
 */

export interface RoundLockMatch {
  id: string;
  round: number;
  status: string;
  bracket_type: string | null;
  bracket_half: string | null;
  modality_id?: string | null;
}

export interface RoundLockResult {
  locked: boolean;
  reason: string;
}

/**
 * Verifica se um match está bloqueado por dependência de rodada anterior.
 */
export function isRoundLocked(
  target: RoundLockMatch,
  allMatches: RoundLockMatch[],
): RoundLockResult {
  const prevRound = target.round - 1;

  // Primeira rodada da chave nunca é bloqueada
  if (prevRound <= 0 && target.round <= 1) {
    return { locked: false, reason: "Primeira rodada — sem dependência" };
  }

  // Para fase de grupos (round 0), nunca bloquear
  if (target.round === 0) {
    return { locked: false, reason: "Fase de grupos — sem bloqueio de rodada" };
  }

  // Filtrar matches da mesma chave (bracket_type + bracket_half + modality)
  const sameBracket = allMatches.filter((m) =>
    m.bracket_type === target.bracket_type &&
    m.bracket_half === target.bracket_half &&
    m.modality_id === target.modality_id &&
    m.round === prevRound
  );

  // Se não há matches na rodada anterior (ex: round 1 sem round 0), liberar
  if (sameBracket.length === 0) {
    return { locked: false, reason: "Sem partidas na rodada anterior desta chave" };
  }

  const allCompleted = sameBracket.every((m) => m.status === "completed");

  if (!allCompleted) {
    const pending = sameBracket.filter((m) => m.status !== "completed").length;
    return {
      locked: true,
      reason: `Finalize a rodada anterior antes de lançar este resultado. (${pending} partida(s) pendente(s))`,
    };
  }

  return { locked: false, reason: "Rodada anterior completa" };
}
