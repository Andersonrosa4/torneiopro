import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, ShieldCheck, AlertTriangle, Bot, Hand, Search, Play, Download, ExternalLink, AlertCircle, FilterX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { formatDateBR } from "@/lib/utils";
import {
  cursorToOrFilter,
  nextCursorFromPage,
  toCursor,
  type KeysetCursor,
} from "@/lib/bugCombatantLogCursor";
import {
  flushNow,
  recordCursorError,
  recordFirstLoad,
  recordLoadMore,
  recordReset,
  type ResetReason,
} from "@/lib/bugCombatantLogTelemetry";
import { toast } from "sonner";

type Source = "all" | "cron" | "manual";
type Scope = "tournament" | "all";

interface LogRow {
  id: string;
  tournament_id: string;
  scanned: number;
  fixed: number;
  remaining: number;
  source: string;
  applied_fixes: unknown;
  created_at: string;
}

interface Props {
  tournamentId: string;
  onOpenMatch?: (matchShortId: string) => void;
  isAdmin?: boolean;
}

const PAGE_SIZE = 25;

function formatDateTimeBR(iso: string): string {
  try {
    const d = new Date(iso);
    return `${formatDateBR(iso)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function parseFixes(raw: unknown): { matchShort: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((s) => {
      const [shortId, ...rest] = s.split(":");
      return { matchShort: (shortId ?? "").trim(), label: rest.join(":").trim() || "correção" };
    });
}

export default function BugCombatantLogPanel({ tournamentId, onOpenMatch, isAdmin }: Props) {
  // Chave única por torneio para preservar estado entre trocas de aba
  const stateKey = `bug-audit:${tournamentId}`;
  const persisted = useMemo<{
    source?: Source; scope?: Scope; search?: string; scrollY?: number;
  }>(() => {
    try {
      const raw = sessionStorage.getItem(stateKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<Source>(persisted.source ?? "all");
  const [scope, setScope] = useState<Scope>(persisted.scope ?? "tournament");
  const [search, setSearch] = useState(persisted.search ?? "");
  const [detail, setDetail] = useState<LogRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);
  // Cursor de paginação ESTÁVEL: só avança com respostas do servidor.
  // Inserções via realtime no topo da lista NÃO mexem nele — assim o
  // próximo loadMore continua de onde paramos, sem pular linhas.
  const cursorRef = useRef<KeysetCursor | null>(null);
  // Contador de páginas carregadas via loadMore (telemetria/perf).
  const pageIndexRef = useRef(0);
  // Motivo do próximo reset (por padrão "filters_changed"; sobrescrito antes do refetch).
  const nextResetReasonRef = useRef<ResetReason>("mount");

  // Persiste filtros + posição de rolagem (sessionStorage)
  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(stateKey, JSON.stringify({
          source, scope, search, scrollY: window.scrollY,
        }));
      } catch { /* quota cheia / modo privado */ }
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => { raf = 0; save(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    save(); // salva mudança de filtros imediatamente
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      save();
    };
  }, [stateKey, source, scope, search]);

  // Restaura scroll após a primeira carga concluir
  useEffect(() => {
    if (restoredRef.current || loading) return;
    const y = persisted.scrollY ?? 0;
    if (y > 0) {
      // aguarda a virtualizada montar e calcular alturas
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
      });
    }
    restoredRef.current = true;
  }, [loading, persisted.scrollY]);

  const runNow = useCallback(async () => {
    if (!isAdmin) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-healer", {
        body: { tournamentId },
      });
      if (error) throw error;
      const s = (data?.summary?.[0] ?? { scanned: 0, fixed: 0 }) as { scanned: number; fixed: number };
      toast.success(
        s.fixed > 0
          ? `Combatedor: ${s.fixed} correção(ões) aplicada(s) em ${s.scanned} partidas.`
          : `Combatedor: ${s.scanned} partidas verificadas, nenhum bug detectado.`,
      );
      nextResetReasonRef.current = "after_run";
      fetchLogs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha ao rodar o combatedor: ${msg}`);
    } finally {
      setRunning(false);
    }
  }, [isAdmin, tournamentId]);

  // Keyset pagination: ordena por (created_at desc, id desc) e usa o cursor
  // padronizado de `bugCombatantLogCursor`. Cursor é validado (formato canônico
  // ISO-8601 + UUID) antes de ser interpolado no filtro `or(...)` do PostgREST.
  const buildQuery = useCallback(
    (cursor: KeysetCursor | null) => {
      let q = supabase
        .from("bug_combatant_log")
        .select("id,tournament_id,scanned,fixed,remaining,source,applied_fixes,created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (scope === "tournament") q = q.eq("tournament_id", tournamentId);
      if (source !== "all") q = q.eq("source", source);
      if (cursor) q = q.or(cursorToOrFilter(cursor));
      return q;
    },
    [tournamentId, source, scope],
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Telemetria: registra reset (drop da lista atual) ANTES de zerar.
    const prevRowsCount = rows.length;
    const prevPageIndex = pageIndexRef.current;
    const reason = nextResetReasonRef.current;
    if (reason !== "mount" || prevRowsCount > 0) {
      recordReset({
        tournament_id: tournamentId,
        reason,
        source,
        scope,
        rows_dropped: prevRowsCount,
        page_index_dropped: prevPageIndex,
      });
    }
    nextResetReasonRef.current = "filters_changed"; // padrão para próximos resets
    // Reseta lista, paginação e cursor para recarregar do início
    setRows([]);
    setHasMore(true);
    cursorRef.current = null;
    pageIndexRef.current = 0;
    const startedAt = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let qErr: { message?: string } | null = null;
    let data: LogRow[] | null = null;
    try {
      const res = await buildQuery(null);
      qErr = res.error;
      data = (res.data ?? null) as LogRow[] | null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      recordCursorError(tournamentId, { message: msg, context: "first_load", source, scope });
      setError(msg || "Falha ao carregar a auditoria.");
      setHasMore(false);
      setLoading(false);
      return;
    }
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    if (qErr) {
      setError(qErr.message || "Falha ao carregar a auditoria.");
      setHasMore(false);
      recordFirstLoad({
        tournament_id: tournamentId,
        duration_ms: duration,
        page_size: 0,
        has_more: false,
        source, scope, ok: false, error: qErr.message,
      });
    } else if (data) {
      // Dedup defensivo (caso realtime tenha disparado em paralelo)
      const seen = new Set<string>();
      const unique = (data as LogRow[]).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      setRows(unique);
      const more = data.length === PAGE_SIZE;
      setHasMore(more);
      cursorRef.current = nextCursorFromPage(unique, null);
      recordFirstLoad({
        tournament_id: tournamentId,
        duration_ms: duration,
        page_size: unique.length,
        has_more: more,
        source, scope, ok: true,
      });
    } else {
      setHasMore(false);
    }
    setLoading(false);
  }, [buildQuery, tournamentId, source, scope, rows.length]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    // Cursor estável: prioriza o do servidor; se ausente (1ª página vazia ou
    // erro), tenta derivar da última linha visível. Linhas inseridas pelo
    // realtime no topo NÃO afetam o cursor.
    const cursor =
      cursorRef.current ?? toCursor(rows[rows.length - 1] ?? null);
    if (!cursor) return;
    setLoadingMore(true);
    const startedAt = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let qErr: { message?: string } | null = null;
    let data: LogRow[] | null = null;
    try {
      const res = await buildQuery(cursor);
      qErr = res.error;
      data = (res.data ?? null) as LogRow[] | null;
    } catch (e) {
      // Erros de validação de cursor caem aqui — desliga paginação.
      const msg = e instanceof Error ? e.message : String(e);
      recordCursorError(tournamentId, { message: msg, context: "load_more", source, scope });
      toast.error(`Cursor inválido para paginação: ${msg}`);
      setHasMore(false);
      setLoadingMore(false);
      return;
    }
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    const nextPageIndex = pageIndexRef.current + 1;
    if (qErr) {
      toast.error(`Falha ao carregar mais: ${qErr.message}`);
      setHasMore(false);
      recordLoadMore(tournamentId, {
        duration_ms: duration, page_size: 0, has_more: false,
        page_index: nextPageIndex, source, scope, ok: false, error: qErr.message,
      });
    } else if (data) {
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const next = data!.filter((r) => !seen.has(r.id));
        return [...prev, ...next];
      });
      const more = data.length === PAGE_SIZE;
      setHasMore(more);
      cursorRef.current = nextCursorFromPage(data, cursor);
      pageIndexRef.current = nextPageIndex;
      recordLoadMore(tournamentId, {
        duration_ms: duration, page_size: data.length, has_more: more,
        page_index: nextPageIndex, source, scope, ok: true,
      });
    }
    setLoadingMore(false);
  }, [buildQuery, hasMore, loadingMore, rows, tournamentId, source, scope]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Flush da telemetria pendente ao desmontar (best-effort).
  useEffect(() => {
    return () => { void flushNow(); };
  }, []);

  // Realtime: aplica diffs incrementais (INSERT/UPDATE/DELETE) sem refetch.
  // Mantém a ordenação (created_at desc, id desc) e o cursor de keyset intactos:
  // - INSERT entra ordenado (normalmente no topo) e sem duplicar
  // - UPDATE substitui a linha existente preservando posição
  // - DELETE remove pela id
  useEffect(() => {
    const matchesFilters = (row: LogRow) => {
      if (scope === "tournament" && row.tournament_id !== tournamentId) return false;
      if (source !== "all" && row.source !== source) return false;
      return true;
    };

    const insertOrdered = (prev: LogRow[], row: LogRow): LogRow[] => {
      // Dedup
      if (prev.some((r) => r.id === row.id)) return prev;
      // (created_at desc, id desc) — encontra primeira posição onde prev[i] é "menor"
      const isBefore = (a: LogRow, b: LogRow) => {
        if (a.created_at === b.created_at) return a.id > b.id;
        return a.created_at > b.created_at;
      };
      const idx = prev.findIndex((r) => !isBefore(r, row));
      if (idx === -1) {
        // Mais antigo que tudo já carregado → só insere se ainda há espaço (ou seja, se não houver mais páginas pendentes)
        if (hasMore) return prev;
        return [...prev, row];
      }
      const next = prev.slice();
      next.splice(idx, 0, row);
      return next;
    };

    const channel = supabase
      .channel(`bug-log-${tournamentId}-${scope}-${source}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bug_combatant_log" },
        (payload) => {
          const row = payload.new as LogRow | undefined;
          if (!row || !matchesFilters(row)) return;
          setRows((prev) => insertOrdered(prev, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bug_combatant_log" },
        (payload) => {
          const row = payload.new as LogRow | undefined;
          if (!row) return;
          setRows((prev) => {
            const exists = prev.some((r) => r.id === row.id);
            if (!exists) return matchesFilters(row) ? insertOrdered(prev, row) : prev;
            if (!matchesFilters(row)) return prev.filter((r) => r.id !== row.id);
            return prev.map((r) => (r.id === row.id ? { ...r, ...row } : r));
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "bug_combatant_log" },
        (payload) => {
          const oldRow = payload.old as { id?: string } | undefined;
          if (!oldRow?.id) return;
          setRows((prev) => prev.filter((r) => r.id !== oldRow.id));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, scope, source, hasMore]);

  // IntersectionObserver para scroll infinito
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const t = search.trim().toLowerCase();
    return rows.filter((r) =>
      r.id.toLowerCase().includes(t) ||
      r.tournament_id.toLowerCase().includes(t) ||
      JSON.stringify(r.applied_fixes ?? "").toLowerCase().includes(t),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.scanned += r.scanned;
        acc.fixed += r.fixed;
        acc.remaining += r.remaining;
        return acc;
      },
      { scanned: 0, fixed: 0, remaining: 0 },
    );
  }, [filtered]);

  const exportCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.info("Nada para exportar com os filtros atuais.");
      return;
    }
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "data_hora",
      "execucao_id",
      "torneio_id",
      "origem",
      "verificadas",
      "corrigidas",
      "pendentes",
      "match_id_curto",
      "correcao",
    ];
    const lines: string[] = [headers.join(";")];
    for (const r of filtered) {
      const fixes = parseFixes(r.applied_fixes);
      const when = formatDateTimeBR(r.created_at);
      if (fixes.length === 0) {
        lines.push([when, r.id, r.tournament_id, r.source, r.scanned, r.fixed, r.remaining, "", ""].map(esc).join(";"));
      } else {
        for (const f of fixes) {
          lines.push([when, r.id, r.tournament_id, r.source, r.scanned, r.fixed, r.remaining, f.matchShort, f.label].map(esc).join(";"));
        }
      }
    }
    // BOM para Excel reconhecer UTF-8
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const tag = scope === "all" ? "todos" : tournamentId.slice(0, 8);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `auditoria-bugs_${tag}_${source}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exportado: ${filtered.length} execução(ões).`);
  }, [filtered, scope, source, tournamentId]);

  return (
    <section className="rounded-xl border border-border bg-card p-3 sm:p-6 shadow-card">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <h2 className="text-base sm:text-lg font-semibold">Auditoria do Combatedor de Bugs</h2>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              size="sm"
              onClick={runNow}
              disabled={running || loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className={`w-4 h-4 mr-1.5 ${running ? "animate-pulse" : ""}`} />
              {running ? "Executando…" : "Rodar agora"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download className="w-4 h-4 mr-1.5" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { nextResetReasonRef.current = "manual_refresh"; fetchLogs(); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </header>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
        <Select value={source} onValueChange={(v) => setSource(v as Source)}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            <SelectItem value="cron">Automática (cron)</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={(v) => setScope(v as Scope)} disabled={!isAdmin}>
          <SelectTrigger><SelectValue placeholder="Escopo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tournament">Este torneio</SelectItem>
            <SelectItem value="all" disabled={!isAdmin}>
              Todos os torneios {!isAdmin && "(admin)"}
            </SelectItem>
          </SelectContent>
        </Select>
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID de partida ou correção…"
            className="pl-8"
          />
        </div>
      </div>

      {/* Totais */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <Badge variant="outline">Execuções: {filtered.length}</Badge>
        <Badge variant="outline">Verificadas: {totals.scanned}</Badge>
        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Corrigidas: {totals.fixed}</Badge>
        {totals.remaining > 0 && (
          <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Pendentes: {totals.remaining}</Badge>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <ul className="space-y-2" aria-busy="true" aria-label="Carregando auditoria">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={`sk-${i}`}
              className="rounded-lg border border-border bg-background/40 p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20 ml-auto" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Skeleton className="h-5 w-28 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-5 w-32 rounded-md" />
              </div>
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="text-center py-10 px-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="w-10 h-10 mx-auto mb-2 text-destructive" />
          <p className="text-sm font-medium text-destructive">Não foi possível carregar a auditoria.</p>
          <p className="text-xs text-muted-foreground mt-1 break-words">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchLogs} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Tentar novamente
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        rows.length > 0 || search.trim() ? (
          // Há dados carregados, mas filtros/busca zeraram a lista
          <div className="text-center py-10 text-muted-foreground">
            <FilterX className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum resultado para os filtros aplicados.</p>
            <p className="text-xs mt-1">Tente alterar a origem, o escopo ou limpar a busca.</p>
            {(search.trim() || source !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(""); setSource("all"); }}
                className="mt-4"
              >
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma execução registrada ainda.</p>
            <p className="text-xs mt-1">O robô só registra quando aplica correções — sistema saudável significa lista vazia.</p>
          </div>
        )
      ) : (
        <VirtualLogList
          items={filtered}
          scope={scope}
          onSelect={(r) => setDetail(r)}
          onOpenMatch={onOpenMatch}
        />
      )}

      {/* Sentinela para scroll infinito + botão de fallback */}
      {!loading && filtered.length > 0 && (
        <div ref={sentinelRef} className="flex justify-center pt-4">
          {hasMore ? (
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />Carregando…</>
              ) : (
                "Carregar mais"
              )}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Fim do histórico ({rows.length} registros)</span>
          )}
        </div>
      )}

      {/* Drawer de detalhes da execução */}
      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-hidden flex flex-col">
          {detail && (() => {
            const fixes = parseFixes(detail.applied_fixes);
            const isCron = detail.source === "cron";
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    Detalhes da execução
                  </SheetTitle>
                  <SheetDescription>
                    {formatDateTimeBR(detail.created_at)}
                  </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
                  <div className="space-y-4 pb-6">
                    {/* Origem */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={isCron
                        ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
                        : "bg-purple-500/15 text-purple-500 border-purple-500/30"}>
                        {isCron ? <Bot className="w-3 h-3 mr-1" /> : <Hand className="w-3 h-3 mr-1" />}
                        {isCron ? "Automática (cron)" : "Manual"}
                      </Badge>
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border p-3 text-center">
                        <div className="text-2xl font-semibold">{detail.scanned}</div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Verificadas</div>
                      </div>
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                        <div className="text-2xl font-semibold text-emerald-500">{detail.fixed}</div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Corrigidas</div>
                      </div>
                      <div className={`rounded-lg border p-3 text-center ${detail.remaining > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-border"}`}>
                        <div className={`text-2xl font-semibold ${detail.remaining > 0 ? "text-amber-500" : ""}`}>{detail.remaining}</div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Pendentes</div>
                      </div>
                    </div>

                    {/* Identificadores */}
                    <div className="rounded-lg border border-border p-3 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">execução</span>
                        <span className="truncate">{detail.id}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">torneio</span>
                        <span className="truncate">{detail.tournament_id}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">origem</span>
                        <span>{detail.source}</span>
                      </div>
                    </div>

                    {/* Lista de correções */}
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Correções aplicadas ({fixes.length})
                      </h3>
                      {fixes.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhuma correção registrada nesta execução.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {fixes.map((f, idx) => (
                            <li
                              key={idx}
                              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5"
                            >
                              <div className="flex flex-col min-w-0">
                                <span className="font-mono text-xs text-primary">{f.matchShort}</span>
                                <span className="text-[11px] text-muted-foreground truncate">{f.label}</span>
                              </div>
                              {onOpenMatch && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => { onOpenMatch(f.matchShort); setDetail(null); }}
                                >
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  Abrir
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* JSON cru (debug) */}
                    <details className="rounded-lg border border-border p-3 text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Ver registro bruto (JSON)
                      </summary>
                      <pre className="mt-2 overflow-auto text-[10px] leading-snug font-mono bg-background/60 p-2 rounded">
{JSON.stringify(detail, null, 2)}
                      </pre>
                    </details>
                  </div>
                </ScrollArea>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </section>
  );
}

// ----------------------------------------------------------------
// Lista virtualizada (renderiza apenas itens visíveis na janela)
// ----------------------------------------------------------------
interface VirtualLogListProps {
  items: LogRow[];
  scope: Scope;
  onSelect: (r: LogRow) => void;
  onOpenMatch?: (matchShortId: string) => void;
}

function VirtualLogList({ items, scope, onSelect, onOpenMatch }: VirtualLogListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 96, // altura média estimada por item; auto-mensurada via measureElement
    overscan: 8,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const offsetTop = parentRef.current?.offsetTop ?? 0;

  return (
    <div ref={parentRef} className="relative">
      <div style={{ height: totalSize, width: "100%", position: "relative" }}>
        {virtualItems.map((vi) => {
          const r = items[vi.index];
          if (!r) return null;
          const fixes = parseFixes(r.applied_fixes);
          const isCron = r.source === "cron";
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start - offsetTop}px)`,
                paddingBottom: 8,
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r);
                  }
                }}
                className="rounded-lg border border-border bg-background/40 p-3 cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge
                    className={
                      isCron
                        ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
                        : "bg-purple-500/15 text-purple-500 border-purple-500/30"
                    }
                  >
                    {isCron ? <Bot className="w-3 h-3 mr-1" /> : <Hand className="w-3 h-3 mr-1" />}
                    {isCron ? "Automática" : "Manual"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTimeBR(r.created_at)}</span>
                  {scope === "all" && (
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      torneio {r.tournament_id.slice(0, 8)}
                    </span>
                  )}
                  <div className="ml-auto flex gap-1.5 text-[11px]">
                    <span className="text-muted-foreground">{r.scanned} verif.</span>
                    <span className="text-emerald-500">{r.fixed} corr.</span>
                    {r.remaining > 0 && (
                      <span className="text-amber-500 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        {r.remaining} pend.
                      </span>
                    )}
                  </div>
                </div>
                {fixes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {fixes.slice(0, 6).map((f, idx) => (
                      <span
                        key={`${r.id}-${idx}`}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMatch?.(f.matchShort);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            onOpenMatch?.(f.matchShort);
                          }
                        }}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors font-mono cursor-pointer"
                        title={`Abrir partida ${f.matchShort} • ${f.label}`}
                      >
                        <span className="text-primary">{f.matchShort}</span>
                        <span className="text-muted-foreground"> · {f.label}</span>
                      </span>
                    ))}
                    {fixes.length > 6 && (
                      <span className="text-[11px] px-2 py-0.5 text-muted-foreground italic">
                        +{fixes.length - 6} (clique para ver tudo)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
