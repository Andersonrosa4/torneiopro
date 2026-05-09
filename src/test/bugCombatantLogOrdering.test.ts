import { describe, it, expect } from "vitest";
import {
  appendPage,
  applyRealtimeEvent,
  dedupById,
  insertOrdered,
  matchesFilters,
  sortDesc,
  type LogFilters,
  type OrderableLogRow,
} from "@/lib/bugCombatantLogOrdering";

const T = "tour-1";
const OTHER = "tour-2";
const baseFilters: LogFilters = { tournamentId: T, scope: "tournament", source: "all" };

function row(
  id: string,
  created_at: string,
  opts: Partial<OrderableLogRow> = {},
): OrderableLogRow {
  return {
    id,
    created_at,
    tournament_id: T,
    source: "manual",
    ...opts,
  };
}

/** Gera uma "página" simulando o servidor: ordena desc e fatia. */
function serverPage(
  all: OrderableLogRow[],
  cursor: { created_at: string; id: string } | null,
  pageSize: number,
  filters: LogFilters,
): OrderableLogRow[] {
  const filtered = all.filter((r) => matchesFilters(r, filters));
  const sorted = sortDesc(filtered);
  const start = cursor
    ? sorted.findIndex(
        (r) => r.created_at < cursor.created_at ||
          (r.created_at === cursor.created_at && r.id < cursor.id),
      )
    : 0;
  if (start === -1) return [];
  return sorted.slice(start, start + pageSize);
}

describe("bugCombatantLogOrdering", () => {
  describe("sortDesc / dedupById", () => {
    it("ordena por (created_at desc, id desc)", () => {
      const out = sortDesc([
        row("a", "2025-01-01T00:00:00Z"),
        row("b", "2025-01-02T00:00:00Z"),
        row("c", "2025-01-02T00:00:00Z"),
      ]);
      expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
    });

    it("remove duplicados por id mantendo o primeiro", () => {
      const r1 = row("a", "2025-01-01T00:00:00Z", { source: "cron" });
      const r2 = row("a", "2025-01-01T00:00:00Z", { source: "manual" });
      const out = dedupById([r1, r2, row("b", "2025-01-02T00:00:00Z")]);
      expect(out).toHaveLength(2);
      expect(out[0]).toBe(r1);
    });
  });

  describe("insertOrdered", () => {
    it("insere no topo quando é a mais nova", () => {
      const prev = [row("b", "2025-01-02T00:00:00Z"), row("a", "2025-01-01T00:00:00Z")];
      const out = insertOrdered(prev, row("c", "2025-01-03T00:00:00Z"), false);
      expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
    });

    it("respeita desempate por id quando created_at empata", () => {
      const prev = [row("b", "2025-01-02T00:00:00Z"), row("a", "2025-01-01T00:00:00Z")];
      const out = insertOrdered(prev, row("z", "2025-01-02T00:00:00Z"), false);
      expect(out.map((r) => r.id)).toEqual(["z", "b", "a"]);
    });

    it("não duplica quando o id já existe", () => {
      const prev = [row("b", "2025-01-02T00:00:00Z")];
      const out = insertOrdered(prev, row("b", "2025-01-02T00:00:00Z"), false);
      expect(out).toBe(prev);
    });

    it("descarta linhas mais antigas que o cursor quando hasMore=true", () => {
      const prev = [row("c", "2025-01-03T00:00:00Z"), row("b", "2025-01-02T00:00:00Z")];
      const out = insertOrdered(prev, row("a", "2025-01-01T00:00:00Z"), true);
      expect(out).toBe(prev);
    });

    it("anexa no final quando hasMore=false e linha é a mais antiga", () => {
      const prev = [row("c", "2025-01-03T00:00:00Z"), row("b", "2025-01-02T00:00:00Z")];
      const out = insertOrdered(prev, row("a", "2025-01-01T00:00:00Z"), false);
      expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
    });
  });

  describe("matchesFilters", () => {
    it("filtra por tournament quando scope=tournament", () => {
      expect(matchesFilters(row("a", "x", { tournament_id: OTHER }), baseFilters)).toBe(false);
      expect(matchesFilters(row("a", "x"), baseFilters)).toBe(true);
    });

    it("ignora tournament quando scope=all", () => {
      const f: LogFilters = { ...baseFilters, scope: "all" };
      expect(matchesFilters(row("a", "x", { tournament_id: OTHER }), f)).toBe(true);
    });

    it("filtra por source", () => {
      const f: LogFilters = { ...baseFilters, source: "cron" };
      expect(matchesFilters(row("a", "x", { source: "manual" }), f)).toBe(false);
      expect(matchesFilters(row("a", "x", { source: "cron" }), f)).toBe(true);
    });
  });

  describe("applyRealtimeEvent", () => {
    it("INSERT que não passa nos filtros é ignorado", () => {
      const prev = [row("a", "2025-01-01T00:00:00Z")];
      const out = applyRealtimeEvent(
        prev,
        { type: "INSERT", row: row("b", "2025-01-02T00:00:00Z", { tournament_id: OTHER }) },
        baseFilters,
        false,
      );
      expect(out).toBe(prev);
    });

    it("UPDATE remove a linha quando ela deixa de bater com os filtros", () => {
      const prev = [row("a", "2025-01-01T00:00:00Z", { source: "manual" })];
      const out = applyRealtimeEvent(
        prev,
        { type: "UPDATE", row: row("a", "2025-01-01T00:00:00Z", { source: "cron" }) },
        { ...baseFilters, source: "manual" },
        false,
      );
      expect(out.map((r) => r.id)).toEqual([]);
    });

    it("UPDATE de uma linha não carregada que passa nos filtros insere ordenado", () => {
      const prev = [row("a", "2025-01-01T00:00:00Z")];
      const out = applyRealtimeEvent(
        prev,
        { type: "UPDATE", row: row("z", "2025-01-05T00:00:00Z") },
        baseFilters,
        false,
      );
      expect(out.map((r) => r.id)).toEqual(["z", "a"]);
    });

    it("DELETE remove pela id e é idempotente", () => {
      const prev = [row("a", "2025-01-01T00:00:00Z"), row("b", "2025-01-02T00:00:00Z")];
      const once = applyRealtimeEvent(prev, { type: "DELETE", id: "a" }, baseFilters, false);
      const twice = applyRealtimeEvent(once, { type: "DELETE", id: "a" }, baseFilters, false);
      expect(once.map((r) => r.id)).toEqual(["b"]);
      expect(twice.map((r) => r.id)).toEqual(["b"]);
    });
  });

  describe("alternância de filtros", () => {
    it("re-filtrar uma lista é estável e sem duplicados", () => {
      const all = [
        row("a", "2025-01-01T00:00:00Z", { source: "cron" }),
        row("b", "2025-01-02T00:00:00Z", { source: "manual" }),
        row("c", "2025-01-03T00:00:00Z", { source: "cron" }),
        row("d", "2025-01-03T00:00:00Z", { source: "manual" }),
      ];
      const fCron: LogFilters = { ...baseFilters, source: "cron" };
      const filtered = sortDesc(dedupById(all.filter((r) => matchesFilters(r, fCron))));
      expect(filtered.map((r) => r.id)).toEqual(["c", "a"]);
    });
  });

  describe("paginação keyset com inserções em tempo real durante o load", () => {
    it("carrega 3 páginas sem duplicar e mantém ordem desc, mesmo com INSERTs intercalados", () => {
      // 25 linhas no servidor
      const server: OrderableLogRow[] = Array.from({ length: 25 }, (_, i) => {
        const n = 25 - i; // n: 25..1
        const ts = `2025-01-01T00:${String(n).padStart(2, "0")}:00Z`;
        return row(`s${String(n).padStart(2, "0")}`, ts);
      });
      const PAGE = 10;

      // Página 1
      let p1 = serverPage(server, null, PAGE, baseFilters);
      let rows: OrderableLogRow[] = appendPage([], p1);
      let cursor = { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id };
      let hasMore = p1.length === PAGE;

      // Realtime: chega uma linha NOVA (mais nova que tudo)
      const liveNew = row("live-new", "2025-02-01T00:00:00Z");
      server.push(liveNew);
      rows = applyRealtimeEvent(rows, { type: "INSERT", row: liveNew }, baseFilters, hasMore);
      expect(rows[0].id).toBe("live-new");

      // Realtime: chega uma linha ANTIGA, ainda não paginada → deve ser descartada (hasMore=true)
      const liveOld = row("live-old", "2024-12-01T00:00:00Z");
      server.push(liveOld);
      const beforeOld = rows;
      rows = applyRealtimeEvent(rows, { type: "INSERT", row: liveOld }, baseFilters, hasMore);
      expect(rows).toBe(beforeOld);

      // Página 2 — usa cursor da última linha do servidor já recebida (não da live-new)
      const p2 = serverPage(server, cursor, PAGE, baseFilters);
      rows = appendPage(rows, p2);
      cursor = { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id };
      hasMore = p2.length === PAGE;

      // Realtime entre páginas: uma INSERT que duplica algo já carregado
      const dup = { ...rows[5] };
      const beforeDup = rows;
      rows = applyRealtimeEvent(rows, { type: "INSERT", row: dup }, baseFilters, hasMore);
      expect(rows).toBe(beforeDup);

      // Página 3
      const p3 = serverPage(server, cursor, PAGE, baseFilters);
      rows = appendPage(rows, p3);
      hasMore = p3.length === PAGE;

      // Agora, com hasMore=false, a linha antiga vinda do realtime deve entrar
      rows = applyRealtimeEvent(rows, { type: "INSERT", row: liveOld }, baseFilters, hasMore);

      // Sem duplicados
      const ids = rows.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);

      // Ordem desc preservada
      for (let i = 1; i < rows.length; i++) {
        expect(isBeforeOrEq(rows[i - 1], rows[i])).toBe(true);
      }

      // Inclui live-new no topo e live-old no fundo
      expect(rows[0].id).toBe("live-new");
      expect(rows[rows.length - 1].id).toBe("live-old");

      // Total = 25 originais + 2 vindas do realtime
      expect(rows).toHaveLength(27);
    });

    it("alternar filtro durante carregamento não introduz duplicatas", () => {
      const all: OrderableLogRow[] = [
        row("a", "2025-01-01T00:00:00Z", { source: "cron" }),
        row("b", "2025-01-02T00:00:00Z", { source: "manual" }),
        row("c", "2025-01-03T00:00:00Z", { source: "cron" }),
      ];
      // Carrega tudo com source=all
      const allF: LogFilters = { ...baseFilters, source: "all" };
      let rows = appendPage([], serverPage(all, null, 10, allF));
      // Alterna para source=cron — aplicação reseta (refetch)
      const cronF: LogFilters = { ...baseFilters, source: "cron" };
      rows = appendPage([], serverPage(all, null, 10, cronF));
      // Realtime de manual chega: deve ser ignorado
      rows = applyRealtimeEvent(
        rows,
        { type: "INSERT", row: row("d", "2025-01-04T00:00:00Z", { source: "manual" }) },
        cronF,
        false,
      );
      expect(rows.map((r) => r.id)).toEqual(["c", "a"]);
    });
  });
});

function isBeforeOrEq(a: OrderableLogRow, b: OrderableLogRow): boolean {
  if (a.created_at === b.created_at) return a.id >= b.id;
  return a.created_at > b.created_at;
}
