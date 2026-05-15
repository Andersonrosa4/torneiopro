/**
 * Integrity Scanner — "Combatente de bugs"
 *
 * Varre o estado atual do torneio e reporta inconsistências estruturais
 * antes que virem bugs visíveis. Usado tanto para alertas em tela quanto
 * para validação preventiva antes de operações destrutivas.
 */
import { supabase } from "@/integrations/supabase/client";

export type IntegrityIssue = {
  severity: "error" | "warn";
  code: string;
  message: string;
  matchId?: string;
  modalityId?: string;
  stageId?: string | null;
};

export interface IntegrityReport {
  ok: boolean;
  totalMatches: number;
  issues: IntegrityIssue[];
  scannedAt: string;
}

/**
 * Scans matches for a tournament (optionally narrowed by modality/stage).
 * Detects: orphan stage_id, self-referencing next_*, winner not in roster,
 * negative scores, duplicate teams in same round/bracket_type, status mismatches.
 */
export async function scanTournamentIntegrity(
  tournamentId: string,
  scope?: { modalityId?: string; stageId?: string | null }
): Promise<IntegrityReport> {
  const issues: IntegrityIssue[] = [];

  let q: any = supabase.from("matches").select("*").eq("tournament_id", tournamentId);
  if (scope?.modalityId) q = q.eq("modality_id", scope.modalityId);
  if (scope?.stageId !== undefined) {
    q = scope.stageId === null ? q.is("stage_id", null) : q.eq("stage_id", scope.stageId);
  }

  const { data: matches, error } = await q;
  if (error) {
    return {
      ok: false,
      totalMatches: 0,
      issues: [{ severity: "error", code: "FETCH_FAILED", message: error.message }],
      scannedAt: new Date().toISOString(),
    };
  }

  const list = (matches ?? []) as any[];
  const idSet = new Set(list.map((m) => m.id));

  // Index for duplicate detection
  const seen = new Map<string, string[]>(); // key=`${round}|${bracket_type}|${teamId}`

  for (const m of list) {
    // 1. Self-references
    if (m.next_win_match_id && m.next_win_match_id === m.id) {
      issues.push({ severity: "error", code: "SELF_NEXT_WIN", message: `Partida aponta para si mesma como próxima (vencedor)`, matchId: m.id });
    }
    if (m.next_lose_match_id && m.next_lose_match_id === m.id) {
      issues.push({ severity: "error", code: "SELF_NEXT_LOSE", message: `Partida aponta para si mesma como próxima (perdedor)`, matchId: m.id });
    }

    // 2. Dangling next_* references (apontam para id que não existe no escopo)
    if (m.next_win_match_id && !idSet.has(m.next_win_match_id)) {
      issues.push({ severity: "warn", code: "DANGLING_NEXT_WIN", message: `next_win_match_id aponta para partida inexistente`, matchId: m.id });
    }
    if (m.next_lose_match_id && !idSet.has(m.next_lose_match_id)) {
      issues.push({ severity: "warn", code: "DANGLING_NEXT_LOSE", message: `next_lose_match_id aponta para partida inexistente`, matchId: m.id });
    }

    // 3. Winner sanity
    if (m.winner_team_id && m.team1_id && m.team2_id) {
      if (m.winner_team_id !== m.team1_id && m.winner_team_id !== m.team2_id) {
        issues.push({ severity: "error", code: "WINNER_NOT_IN_ROSTER", message: `Vencedor não pertence aos times da partida`, matchId: m.id });
      }
    }

    // 4. Auto-confronto
    if (m.team1_id && m.team2_id && m.team1_id === m.team2_id) {
      issues.push({ severity: "error", code: "SELF_MATCH", message: `Mesma equipe em ambos os lados`, matchId: m.id });
    }

    // 5. Placar negativo
    if ((m.score1 ?? 0) < 0 || (m.score2 ?? 0) < 0) {
      issues.push({ severity: "error", code: "NEGATIVE_SCORE", message: `Placar negativo`, matchId: m.id });
    }

    // 6. Status finalizado sem vencedor
    if (m.status === "completed" && !m.winner_team_id && m.team1_id && m.team2_id) {
      issues.push({ severity: "warn", code: "COMPLETED_NO_WINNER", message: `Partida concluída sem vencedor declarado`, matchId: m.id });
    }

    // 6b. Vencedor declarado sem times definidos (vencedor fantasma)
    // Sintoma clássico: card aparece "Finalizado" com troféu mas team1/team2 = "A definir" e placar 0×0
    if (m.winner_team_id && (!m.team1_id || !m.team2_id)) {
      issues.push({
        severity: "error",
        code: "WINNER_WITHOUT_TEAMS",
        message: `Vencedor definido sem ambos os times presentes (vencedor fantasma)`,
        matchId: m.id,
      });
    }

    // 6c. Status concluído mas sem placar e sem times — propagação quebrada
    if (
      m.status === "completed" &&
      (m.score1 ?? 0) === 0 &&
      (m.score2 ?? 0) === 0 &&
      (!m.team1_id || !m.team2_id)
    ) {
      issues.push({
        severity: "error",
        code: "COMPLETED_WITHOUT_TEAMS",
        message: `Partida marcada como concluída sem times definidos`,
        matchId: m.id,
      });
    }

    // 7. Duplicidade de time no mesmo round + bracket_type
    const bt = m.bracket_type ?? "winners";
    for (const tid of [m.team1_id, m.team2_id]) {
      if (!tid) continue;
      const key = `${m.round}|${bt}|${tid}`;
      const arr = seen.get(key) ?? [];
      arr.push(m.id);
      seen.set(key, arr);
    }
  }

  // Materializar duplicatas
  for (const [key, ids] of seen.entries()) {
    if (ids.length > 1) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_TEAM_IN_ROUND",
        message: `Equipe duplicada em ${ids.length} partidas do round (${key})`,
      });
    }
  }

  return {
    ok: issues.filter((i) => i.severity === "error").length === 0,
    totalMatches: list.length,
    issues,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Conveniência: lança erro se houver qualquer issue de severidade "error".
 * Use ANTES de operações destrutivas para abortar com mensagem clara.
 */
export async function assertTournamentIntegrity(
  tournamentId: string,
  scope?: { modalityId?: string; stageId?: string | null }
): Promise<void> {
  const report = await scanTournamentIntegrity(tournamentId, scope);
  const errors = report.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    const summary = errors.slice(0, 5).map((e) => `• [${e.code}] ${e.message}`).join("\n");
    throw new Error(`[INTEGRITY] ${errors.length} erro(s) detectado(s):\n${summary}`);
  }
}

// =============================================================================
// PROPAGATION CONSISTENCY SCANNER
// =============================================================================
// Verifica, partida a partida concluída, se o vencedor declarado foi
// efetivamente propagado para o slot correto da próxima partida (next_win)
// e — quando aplicável — se o perdedor caiu no destino correto (next_lose,
// usado em 3º lugar e em chaves de dupla eliminação).
// =============================================================================

export interface PropagationIssue {
  matchId: string;
  modalityId: string | null;
  round: number;
  position: number;
  bracketType: string;
  kind: "winner_not_propagated" | "loser_not_propagated" | "wrong_team_in_destination" | "dangling_destination";
  detail: string;
}

export interface ModalityConsistencyReport {
  modalityId: string;
  modalityName: string;
  totalMatches: number;
  completedMatches: number;
  expectedPropagations: number;     // total de slots de destino que deveriam estar preenchidos
  successfulPropagations: number;   // slots corretamente preenchidos
  brokenPropagations: number;       // slots ausentes ou com time errado
  issues: PropagationIssue[];
  ok: boolean;
}

export interface PropagationConsistencyReport {
  ok: boolean;
  scannedAt: string;
  totalIssues: number;
  modalities: ModalityConsistencyReport[];
}

/**
 * Varre TODAS as modalidades de um torneio e devolve um relatório agrupado
 * com a contagem de propagações quebradas por modalidade.
 *
 * Regras de checagem:
 *  - Toda match `completed` com `winner_team_id` E com `next_win_match_id`
 *    deve resultar no winner_team_id presente em team1_id OU team2_id da
 *    partida de destino (a menos que a partida de destino também esteja
 *    `completed` — nesse caso já foi consumida).
 *  - Se houver `next_lose_match_id` (3º lugar / dupla eliminação), o
 *    perdedor (= o time que não venceu) deve estar presente no destino,
 *    nas mesmas condições.
 *  - Destino inexistente (id presente mas não está na lista) = dangling.
 */
export async function scanPropagationConsistency(
  tournamentId: string
): Promise<PropagationConsistencyReport> {
  // 1) Modalidades
  const { data: mods, error: modErr } = await supabase
    .from("modalities")
    .select("id, name")
    .eq("tournament_id", tournamentId);

  if (modErr) {
    return {
      ok: false,
      scannedAt: new Date().toISOString(),
      totalIssues: 0,
      modalities: [],
    };
  }

  // 2) Todas as partidas do torneio (uma única query)
  const { data: matches } = await supabase
    .from("matches")
    .select("id, modality_id, round, position, bracket_type, status, team1_id, team2_id, winner_team_id, next_win_match_id, next_lose_match_id")
    .eq("tournament_id", tournamentId);

  const all = (matches ?? []) as any[];
  const byId = new Map<string, any>(all.map((m) => [m.id, m]));

  const modalityReports: ModalityConsistencyReport[] = [];
  let totalIssues = 0;

  for (const mod of (mods ?? [])) {
    const modMatches = all.filter((m) => m.modality_id === mod.id);
    const completed = modMatches.filter((m) => m.status === "completed" && m.winner_team_id);

    let expected = 0;
    let success = 0;
    const issues: PropagationIssue[] = [];

    for (const m of completed) {
      const loserId =
        m.team1_id && m.team2_id
          ? m.winner_team_id === m.team1_id
            ? m.team2_id
            : m.winner_team_id === m.team2_id
              ? m.team1_id
              : null
          : null;

      // ── Vencedor → next_win
      if (m.next_win_match_id) {
        expected++;
        const dest = byId.get(m.next_win_match_id);
        if (!dest) {
          issues.push({
            matchId: m.id, modalityId: m.modality_id, round: m.round, position: m.position,
            bracketType: m.bracket_type ?? "winners",
            kind: "dangling_destination",
            detail: `Destino do vencedor (R${m.round}P${m.position}) não existe (${m.next_win_match_id})`,
          });
        } else if (dest.status === "completed") {
          // já consumido — considera ok
          success++;
        } else if (dest.team1_id === m.winner_team_id || dest.team2_id === m.winner_team_id) {
          success++;
        } else if (!dest.team1_id && !dest.team2_id) {
          issues.push({
            matchId: m.id, modalityId: m.modality_id, round: m.round, position: m.position,
            bracketType: m.bracket_type ?? "winners",
            kind: "winner_not_propagated",
            detail: `Vencedor da R${m.round}P${m.position} não foi colocado em R${dest.round}P${dest.position}`,
          });
        } else {
          issues.push({
            matchId: m.id, modalityId: m.modality_id, round: m.round, position: m.position,
            bracketType: m.bracket_type ?? "winners",
            kind: "wrong_team_in_destination",
            detail: `Slot de destino R${dest.round}P${dest.position} preenchido com outro time (esperado vencedor de R${m.round}P${m.position})`,
          });
        }
      }

      // ── Perdedor → next_lose (3º lugar / dupla eliminação)
      if (m.next_lose_match_id && loserId) {
        expected++;
        const dest = byId.get(m.next_lose_match_id);
        if (!dest) {
          issues.push({
            matchId: m.id, modalityId: m.modality_id, round: m.round, position: m.position,
            bracketType: m.bracket_type ?? "winners",
            kind: "dangling_destination",
            detail: `Destino do perdedor (R${m.round}P${m.position}) não existe (${m.next_lose_match_id})`,
          });
        } else if (dest.status === "completed") {
          success++;
        } else if (dest.team1_id === loserId || dest.team2_id === loserId) {
          success++;
        } else if (!dest.team1_id && !dest.team2_id) {
          issues.push({
            matchId: m.id, modalityId: m.modality_id, round: m.round, position: m.position,
            bracketType: m.bracket_type ?? "winners",
            kind: "loser_not_propagated",
            detail: `Perdedor da R${m.round}P${m.position} não foi colocado em R${dest.round}P${dest.position}`,
          });
        } else {
          issues.push({
            matchId: m.id, modalityId: m.modality_id, round: m.round, position: m.position,
            bracketType: m.bracket_type ?? "winners",
            kind: "wrong_team_in_destination",
            detail: `Slot de perdedor R${dest.round}P${dest.position} preenchido com outro time`,
          });
        }
      }
    }

    const broken = issues.length;
    totalIssues += broken;

    modalityReports.push({
      modalityId: mod.id,
      modalityName: mod.name,
      totalMatches: modMatches.length,
      completedMatches: completed.length,
      expectedPropagations: expected,
      successfulPropagations: success,
      brokenPropagations: broken,
      issues,
      ok: broken === 0,
    });
  }

  return {
    ok: totalIssues === 0,
    scannedAt: new Date().toISOString(),
    totalIssues,
    modalities: modalityReports,
  };
}
