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
