// Telemetria leve para a aba "Auditoria do Combatedor de Bugs".
// Mede em produção:
//   - taxa de RESET de paginação (refetch da 1ª página)
//   - erros de CURSOR (formato inválido, falha no .or, etc.)
//   - performance do LOAD_MORE (duração, tamanho da página, tem mais?)
//
// Princípios:
// - Best-effort: nunca lança, nunca quebra UI. Falhas no transporte são silenciosas.
// - Buffer + flush em janela curta para não sobrecarregar o backend.
// - Persiste em `public.activities` (visibility='private') quando há sessão;
//   sem sessão, mantém em memória e expõe via `window.__bugAuditTelemetry`.
// - Console é silencioso por padrão. Para depurar localmente:
//     localStorage.setItem('bug-audit:debug', '1')
//
// Stats agregados ficam disponíveis em `getTelemetrySnapshot()` e em
// `window.__bugAuditTelemetry` para inspeção rápida no DevTools.

import { supabase } from "@/integrations/supabase/client";

export type BugAuditEventType =
  | "load_more"
  | "reset"
  | "cursor_error"
  | "first_load";

export type ResetReason =
  | "filters_changed"   // mudança de source/scope dispara fetchLogs
  | "manual_refresh"    // botão "Atualizar"
  | "after_run"         // após "Rodar agora"
  | "mount";            // 1ª carga ao montar o componente

export interface LoadMoreMetrics {
  duration_ms: number;
  page_size: number;
  has_more: boolean;
  page_index: number;     // 1 = segunda página (loadMore #1), 2 = #2, ...
  source: string;
  scope: string;
  ok: boolean;
  error?: string;
}

export interface CursorErrorMetrics {
  message: string;
  context: "load_more" | "first_load" | "build_query" | "load_more_fallback" | "scroll_restore";
  source: string;
  scope: string;
}

export interface BugAuditEvent {
  type: BugAuditEventType;
  ts: number;
  tournament_id: string;
  payload: Record<string, unknown>;
}

interface AggregateStats {
  total_first_loads: number;
  total_resets_by_reason: Record<ResetReason, number>;
  total_load_more: number;
  total_load_more_ok: number;
  total_load_more_failed: number;
  total_cursor_errors: number;
  // performance do load_more
  load_more_duration_ms_sum: number;
  load_more_duration_ms_max: number;
  // taxa = resets / (resets + load_more) — proxy de "quão frequente refetch vs paginar"
  pagination_reset_rate(): number;
  load_more_avg_ms(): number;
}

const isBrowser = typeof window !== "undefined";
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER = 50;

const buffer: BugAuditEvent[] = [];
const stats = {
  total_first_loads: 0,
  total_resets_by_reason: {
    filters_changed: 0,
    manual_refresh: 0,
    after_run: 0,
    mount: 0,
  } as Record<ResetReason, number>,
  total_load_more: 0,
  total_load_more_ok: 0,
  total_load_more_failed: 0,
  total_cursor_errors: 0,
  load_more_duration_ms_sum: 0,
  load_more_duration_ms_max: 0,
};

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function debugEnabled(): boolean {
  if (!isBrowser) return false;
  try { return localStorage.getItem("bug-audit:debug") === "1"; } catch { return false; }
}

function logDebug(label: string, evt: BugAuditEvent) {
  if (!debugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`[bug-audit:telemetry] ${label}`, evt);
}

function scheduleFlush() {
  if (!isBrowser || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

function enqueue(evt: BugAuditEvent) {
  buffer.push(evt);
  logDebug(evt.type, evt);
  if (buffer.length >= MAX_BUFFER) {
    void flush();
  } else {
    scheduleFlush();
  }
  publishWindowSnapshot();
}

/** Envia o buffer para `activities`. Tudo silencioso em caso de falha. */
async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) {
      // Sem usuário: nada para persistir; mantemos só em memória/window.
      return;
    }
    const rows = batch.map((evt) => ({
      actor_id: uid,
      verb: evt.type,
      object_type: "bug_audit_telemetry",
      object_id: null as string | null,
      visibility: "private",
      sport: null as string | null,
      metadata: {
        tournament_id: evt.tournament_id,
        ts: evt.ts,
        ...evt.payload,
      },
    }));
    const { error } = await supabase.from("activities").insert(rows);
    if (error && debugEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[bug-audit:telemetry] flush falhou:", error.message);
    }
  } catch (err) {
    if (debugEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[bug-audit:telemetry] flush exception:", err);
    }
  } finally {
    flushing = false;
    if (buffer.length > 0) scheduleFlush();
  }
}

export function recordFirstLoad(args: {
  tournament_id: string;
  duration_ms: number;
  page_size: number;
  has_more: boolean;
  source: string;
  scope: string;
  ok: boolean;
  error?: string;
}): void {
  stats.total_first_loads += 1;
  enqueue({
    type: "first_load",
    ts: Date.now(),
    tournament_id: args.tournament_id,
    payload: {
      duration_ms: Math.round(args.duration_ms),
      page_size: args.page_size,
      has_more: args.has_more,
      source: args.source,
      scope: args.scope,
      ok: args.ok,
      error: args.error,
    },
  });
}

export function recordReset(args: {
  tournament_id: string;
  reason: ResetReason;
  source: string;
  scope: string;
  rows_dropped: number;     // tamanho da lista antes do reset
  page_index_dropped: number; // quantos loadMores foram perdidos
}): void {
  stats.total_resets_by_reason[args.reason] += 1;
  enqueue({
    type: "reset",
    ts: Date.now(),
    tournament_id: args.tournament_id,
    payload: {
      reason: args.reason,
      source: args.source,
      scope: args.scope,
      rows_dropped: args.rows_dropped,
      page_index_dropped: args.page_index_dropped,
    },
  });
}

export function recordLoadMore(
  tournament_id: string,
  m: LoadMoreMetrics,
): void {
  stats.total_load_more += 1;
  if (m.ok) stats.total_load_more_ok += 1;
  else stats.total_load_more_failed += 1;
  stats.load_more_duration_ms_sum += m.duration_ms;
  if (m.duration_ms > stats.load_more_duration_ms_max) {
    stats.load_more_duration_ms_max = m.duration_ms;
  }
  enqueue({
    type: "load_more",
    ts: Date.now(),
    tournament_id,
    payload: {
      duration_ms: Math.round(m.duration_ms),
      page_size: m.page_size,
      has_more: m.has_more,
      page_index: m.page_index,
      source: m.source,
      scope: m.scope,
      ok: m.ok,
      error: m.error,
    },
  });
}

export function recordCursorError(
  tournament_id: string,
  m: CursorErrorMetrics,
): void {
  stats.total_cursor_errors += 1;
  enqueue({
    type: "cursor_error",
    ts: Date.now(),
    tournament_id,
    payload: {
      message: m.message?.slice(0, 500),
      context: m.context,
      source: m.source,
      scope: m.scope,
    },
  });
}

export function getTelemetrySnapshot(): AggregateStats & {
  buffered: number;
} {
  const totalLoadMoreOrFirst = Math.max(
    stats.total_load_more + stats.total_first_loads,
    1,
  );
  const totalActions =
    Object.values(stats.total_resets_by_reason).reduce((a, b) => a + b, 0) +
    stats.total_load_more;
  return {
    ...stats,
    buffered: buffer.length,
    pagination_reset_rate() {
      if (totalActions === 0) return 0;
      const resets =
        Object.values(stats.total_resets_by_reason).reduce((a, b) => a + b, 0) -
        stats.total_resets_by_reason.mount; // 'mount' é inevitável; não conta no rate
      const denom = Math.max(stats.total_load_more + resets, 1);
      return resets / denom;
    },
    load_more_avg_ms() {
      return stats.load_more_duration_ms_sum / totalLoadMoreOrFirst;
    },
  };
}

function publishWindowSnapshot() {
  if (!isBrowser) return;
  try {
    (window as unknown as { __bugAuditTelemetry?: unknown }).__bugAuditTelemetry =
      getTelemetrySnapshot();
  } catch { /* ignore */ }
}

/** Força flush imediato (por exemplo, em unmount). Best-effort. */
export function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flush();
}

/** Para testes: zera buffer e contadores. */
export function _resetTelemetryForTests(): void {
  buffer.length = 0;
  stats.total_first_loads = 0;
  stats.total_resets_by_reason = {
    filters_changed: 0, manual_refresh: 0, after_run: 0, mount: 0,
  };
  stats.total_load_more = 0;
  stats.total_load_more_ok = 0;
  stats.total_load_more_failed = 0;
  stats.total_cursor_errors = 0;
  stats.load_more_duration_ms_sum = 0;
  stats.load_more_duration_ms_max = 0;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
}
