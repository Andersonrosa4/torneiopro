/**
 * Round Lock Guard
 *
 * Verifica se uma partida pode receber resultado.
 * Regra principal: somente as partidas que alimentam diretamente o alvo
 * (next_win_match_id / next_lose_match_id) precisam estar concluídas.
 * Fallback: rodada anterior na mesma chave/etapa quando não houver feeders.
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
  stage_id?: string | null;
  next_win_match_id?: string | null;
  next_lose_match_id?: string | null;
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

  const sameScope = (m: RoundLockMatch) =>
    m.modality_id === target.modality_id &&
    (m.stage_id ?? null) === (target.stage_id ?? null);

  const directFeeders = allMatches.filter((m) =>
    sameScope(m) &&
    m.id !== target.id &&
    (m.next_win_match_id === target.id || m.next_lose_match_id === target.id)
  );

  if (directFeeders.length > 0) {
    const pendingFeeders = directFeeders.filter((m) => m.status !== "completed").length;
    return pendingFeeders > 0
      ? {
          locked: true,
          reason: `Aguarde as partidas que alimentam este jogo. (${pendingFeeders} pendente(s))`,
        }
      : { locked: false, reason: "Dependências diretas concluídas" };
  }

  // Filtrar matches da mesma chave (bracket_type + bracket_half + modality + stage)
  const sameBracket = allMatches.filter((m) =>
    m.bracket_type === target.bracket_type &&
    m.bracket_half === target.bracket_half &&
    sameScope(m) &&
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
      reason: `Aguarde as dependências desta partida. (${pending} pendente(s))`,
    };
  }

  return { locked: false, reason: "Rodada anterior completa" };
}
