/**
 * 🛡️ Combatente de Bugs — Auto-Healing Watchdog
 *
 * Roda silenciosamente ao carregar o torneio. Detecta inconsistências
 * estruturais e aplica correções seguras automaticamente, sem exigir
 * intervenção manual do organizador.
 *
 * Correções aplicadas (todas idempotentes e não-destrutivas):
 *  1. SELF_NEXT_*        → seta next_*_match_id = null
 *  2. DANGLING_NEXT_*    → seta next_*_match_id = null
 *  3. NEGATIVE_SCORE     → zera placar
 *  4. SELF_MATCH         → limpa team2_id (auto-confronto inválido)
 *  5. WINNER_NOT_IN_ROSTER → limpa winner_team_id e volta para 'pending'
 *  6. COMPLETED_NO_WINNER → volta status para 'pending'
 *
 * Não toca em duplicatas (DUPLICATE_TEAM_IN_ROUND) — esse caso requer
 * decisão humana porque envolve apagar registros legítimos.
 */
import { supabase } from "@/integrations/supabase/client";
import { scanTournamentIntegrity } from "./integrityScanner";

export interface AutoHealResult {
  scanned: number;
  fixed: number;
  remaining: number;
  appliedFixes: string[];
}

const RUN_FLAG_PREFIX = "bugCombatant:lastRun:";
const COOLDOWN_MS = 15_000; // permite re-scan rápido em background sem martelar
const WATCHDOG_INTERVAL_MS = 30_000; // varredura periódica
const REALTIME_DEBOUNCE_MS = 2_500; // espera estabilizar após mudança realtime

/**
 * Executa scan + auto-fix. Silencioso (não joga toast por padrão).
 * Retorna o que conseguiu consertar.
 */
export async function runBugCombatant(
  tournamentId: string,
  opts: { force?: boolean } = {}
): Promise<AutoHealResult> {
  // Cooldown para evitar loops em re-renders
  const flagKey = RUN_FLAG_PREFIX + tournamentId;
  if (!opts.force) {
    const last = Number(sessionStorage.getItem(flagKey) || 0);
    if (Date.now() - last < COOLDOWN_MS) {
      return { scanned: 0, fixed: 0, remaining: 0, appliedFixes: [] };
    }
  }
  sessionStorage.setItem(flagKey, String(Date.now()));

  const report = await scanTournamentIntegrity(tournamentId);
  if (report.issues.length === 0) {
    return { scanned: report.totalMatches, fixed: 0, remaining: 0, appliedFixes: [] };
  }

  const appliedFixes: string[] = [];
  let fixed = 0;

  // Agrupa correções por matchId para minimizar UPDATEs
  const patches = new Map<string, Record<string, any>>();
  const addPatch = (id: string, patch: Record<string, any>) => {
    const cur = patches.get(id) ?? {};
    patches.set(id, { ...cur, ...patch });
  };

  for (const issue of report.issues) {
    if (!issue.matchId) continue;
    switch (issue.code) {
      case "SELF_NEXT_WIN":
        addPatch(issue.matchId, { next_win_match_id: null });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: removida auto-referência (vencedor)`);
        break;
      case "SELF_NEXT_LOSE":
        addPatch(issue.matchId, { next_lose_match_id: null });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: removida auto-referência (perdedor)`);
        break;
      case "DANGLING_NEXT_WIN":
        addPatch(issue.matchId, { next_win_match_id: null });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: link quebrado de vencedor limpo`);
        break;
      case "DANGLING_NEXT_LOSE":
        addPatch(issue.matchId, { next_lose_match_id: null });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: link quebrado de perdedor limpo`);
        break;
      case "NEGATIVE_SCORE":
        addPatch(issue.matchId, { score1: 0, score2: 0 });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: placar negativo zerado`);
        break;
      case "SELF_MATCH":
        addPatch(issue.matchId, { team2_id: null, winner_team_id: null, status: "pending" });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: auto-confronto desfeito`);
        break;
      case "WINNER_NOT_IN_ROSTER":
        addPatch(issue.matchId, { winner_team_id: null, status: "pending" });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: vencedor inválido removido`);
        break;
      case "COMPLETED_NO_WINNER":
        addPatch(issue.matchId, { status: "pending" });
        appliedFixes.push(`🔧 ${issue.matchId.slice(0, 8)}: status revertido para pendente`);
        break;
      // DUPLICATE_TEAM_IN_ROUND: requer decisão humana, não tocar.
    }
  }

  // Aplica patches em paralelo (limite leve de concorrência via Promise.all)
  const updates = Array.from(patches.entries()).map(async ([matchId, patch]) => {
    const { error } = await supabase.from("matches").update(patch).eq("id", matchId);
    if (!error) fixed++;
  });
  await Promise.all(updates);

  const remaining = report.issues.length - fixed;
  if (fixed > 0) {
    console.info(
      `[🛡️ BugCombatant] ${fixed}/${report.issues.length} problemas corrigidos automaticamente.`,
      appliedFixes
    );
  }

  return {
    scanned: report.totalMatches,
    fixed,
    remaining,
    appliedFixes,
  };
}

/**
 * 🛡️ Watchdog em background — roda continuamente enquanto a página estiver aberta.
 *
 * - Faz scan inicial após 1.5s (espera dados carregarem)
 * - Repete a cada 30s
 * - Também escuta mudanças realtime na tabela `matches` e dispara scan extra
 *   (debounce 2.5s) — assim qualquer alteração feita por outro organizador
 *   é validada imediatamente.
 *
 * Retorna função de cleanup. Chame em useEffect.
 */
export function startBackgroundWatchdog(
  tournamentId: string,
  onFix: (result: AutoHealResult) => void
): () => void {
  let stopped = false;
  let realtimeTimer: ReturnType<typeof setTimeout> | null = null;

  const safeRun = async (force = false) => {
    if (stopped) return;
    try {
      const result = await runBugCombatant(tournamentId, { force });
      if (!stopped && result.fixed > 0) onFix(result);
    } catch (e) {
      console.warn("[🛡️ Watchdog] scan falhou:", e);
    }
  };

  // Scan inicial
  const initial = setTimeout(() => safeRun(true), 1_500);
  // Scans periódicos
  const interval = setInterval(() => safeRun(false), WATCHDOG_INTERVAL_MS);

  // Listener realtime — qualquer mudança em matches dispara scan debounced
  const channel = supabase
    .channel(`bug-combatant-${tournamentId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournamentId}` },
      () => {
        if (realtimeTimer) clearTimeout(realtimeTimer);
        realtimeTimer = setTimeout(() => safeRun(true), REALTIME_DEBOUNCE_MS);
      }
    )
    .subscribe();

  return () => {
    stopped = true;
    clearTimeout(initial);
    clearInterval(interval);
    if (realtimeTimer) clearTimeout(realtimeTimer);
    supabase.removeChannel(channel);
  };
}
