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

// Defaults (usados se a leitura da tabela `bug_combatant_config` falhar)
const DEFAULT_COOLDOWN_MS = 15_000;
const DEFAULT_WATCHDOG_INTERVAL_MS = 30_000;
const DEFAULT_REALTIME_DEBOUNCE_MS = 2_500;

// Limites de segurança (espelham os CHECKs da tabela)
const BOUNDS = {
  cooldown_ms: { min: 1_000, max: 600_000 },
  watchdog_interval_ms: { min: 5_000, max: 3_600_000 },
  realtime_debounce_ms: { min: 250, max: 60_000 },
} as const;

export interface BugCombatantConfig {
  cooldownMs: number;
  watchdogIntervalMs: number;
  realtimeDebounceMs: number;
}

const DEFAULT_CONFIG: BugCombatantConfig = {
  cooldownMs: DEFAULT_COOLDOWN_MS,
  watchdogIntervalMs: DEFAULT_WATCHDOG_INTERVAL_MS,
  realtimeDebounceMs: DEFAULT_REALTIME_DEBOUNCE_MS,
};

const CONFIG_TTL_MS = 60_000; // re-busca no máximo 1x/min
let configCache: { value: BugCombatantConfig; fetchedAt: number } | null = null;
let inflight: Promise<BugCombatantConfig> | null = null;

function clamp(n: unknown, key: keyof typeof BOUNDS, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(BOUNDS[key].max, Math.max(BOUNDS[key].min, Math.floor(v)));
}

/**
 * Busca a configuração do robô auditor. Cache de 60s + dedupe de chamadas
 * concorrentes. Em qualquer falha (RLS, rede, tabela ausente) cai nos defaults.
 */
export async function getBugCombatantConfig(
  opts: { force?: boolean } = {}
): Promise<BugCombatantConfig> {
  const now = Date.now();
  if (!opts.force && configCache && now - configCache.fetchedAt < CONFIG_TTL_MS) {
    return configCache.value;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("bug_combatant_config")
        .select("cooldown_ms,watchdog_interval_ms,realtime_debounce_ms")
        .eq("id", "singleton")
        .maybeSingle();
      if (error || !data) {
        configCache = { value: DEFAULT_CONFIG, fetchedAt: now };
        return DEFAULT_CONFIG;
      }
      const value: BugCombatantConfig = {
        cooldownMs: clamp(data.cooldown_ms, "cooldown_ms", DEFAULT_COOLDOWN_MS),
        watchdogIntervalMs: clamp(data.watchdog_interval_ms, "watchdog_interval_ms", DEFAULT_WATCHDOG_INTERVAL_MS),
        realtimeDebounceMs: clamp(data.realtime_debounce_ms, "realtime_debounce_ms", DEFAULT_REALTIME_DEBOUNCE_MS),
      };
      configCache = { value, fetchedAt: now };
      return value;
    } catch {
      configCache = { value: DEFAULT_CONFIG, fetchedAt: now };
      return DEFAULT_CONFIG;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Invalida o cache para forçar releitura imediata (ex.: após admin salvar). */
export function invalidateBugCombatantConfigCache(): void {
  configCache = null;
}

/** Motivo da execução — registrado em `bug_combatant_log.reason`. */
export type WatchdogReason = "initial" | "periodic" | "realtime" | "manual";

/**
 * Executa scan + auto-fix. Silencioso (não joga toast por padrão).
 * Sempre que `reason` for fornecido e a execução não for abortada por cooldown,
 * grava uma linha em `bug_combatant_log` com motivo e duração — mesmo quando
 * não houve correções (necessário para auditoria detalhada). RLS exige admin
 * para inserir; falhas de insert são silenciadas (best-effort).
 */
export async function runBugCombatant(
  tournamentId: string,
  opts: { force?: boolean; reason?: WatchdogReason } = {}
): Promise<AutoHealResult> {
  // Cooldown para evitar loops em re-renders (configurável via DB)
  const cfg = await getBugCombatantConfig();
  const flagKey = RUN_FLAG_PREFIX + tournamentId;
  if (!opts.force) {
    const last = Number(sessionStorage.getItem(flagKey) || 0);
    if (Date.now() - last < cfg.cooldownMs) {
      return { scanned: 0, fixed: 0, remaining: 0, appliedFixes: [] };
    }
  }
  sessionStorage.setItem(flagKey, String(Date.now()));

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const report = await scanTournamentIntegrity(tournamentId);

  const finish = async (result: AutoHealResult) => {
    if (!opts.reason) return result;
    const duration_ms = Math.max(
      0,
      Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0)
    );
    try {
      await supabase.from("bug_combatant_log").insert({
        tournament_id: tournamentId,
        scanned: result.scanned,
        fixed: result.fixed,
        remaining: result.remaining,
        applied_fixes: result.appliedFixes,
        source: "cron",
        reason: opts.reason,
        duration_ms,
      });
    } catch {
      // best-effort — RLS pode bloquear (não-admin); não falhar o watchdog
    }
    return result;
  };

  if (report.issues.length === 0) {
    return finish({ scanned: report.totalMatches, fixed: 0, remaining: 0, appliedFixes: [] });
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

  return finish({
    scanned: report.totalMatches,
    fixed,
    remaining,
    appliedFixes,
  });
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
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentDebounceMs = DEFAULT_REALTIME_DEBOUNCE_MS;

  const safeRun = async (reason: WatchdogReason, force = false) => {
    if (stopped) return;
    try {
      const result = await runBugCombatant(tournamentId, { force, reason });
      if (!stopped && result.fixed > 0) onFix(result);
    } catch (e) {
      console.warn("[🛡️ Watchdog] scan falhou:", e);
    }
  };

  // Aplica intervalos vindos da config (com re-aplicação se mudarem)
  let lastIntervalMs = 0;
  const applyConfig = async () => {
    if (stopped) return;
    const cfg = await getBugCombatantConfig({ force: true });
    currentDebounceMs = cfg.realtimeDebounceMs;
    if (cfg.watchdogIntervalMs !== lastIntervalMs) {
      lastIntervalMs = cfg.watchdogIntervalMs;
      if (interval) clearInterval(interval);
      interval = setInterval(() => safeRun("periodic", false), cfg.watchdogIntervalMs);
    }
  };

  // Scan inicial + bootstrap da config
  const initial = setTimeout(() => {
    void applyConfig();
    void safeRun("initial", true);
  }, 1_500);

  // Re-leitura periódica da config (a cada 60s) — pega ajustes do admin sem recarregar
  const configRefresh = setInterval(() => void applyConfig(), 60_000);

  // Listener realtime — qualquer mudança em matches dispara scan debounced
  const channel = supabase
    .channel(`bug-combatant-${tournamentId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournamentId}` },
      () => {
        if (realtimeTimer) clearTimeout(realtimeTimer);
        realtimeTimer = setTimeout(() => safeRun("realtime", true), currentDebounceMs);
      }
    )
    .subscribe();

  return () => {
    stopped = true;
    clearTimeout(initial);
    clearInterval(configRefresh);
    if (interval) clearInterval(interval);
    if (realtimeTimer) clearTimeout(realtimeTimer);
    supabase.removeChannel(channel);
  };
}
