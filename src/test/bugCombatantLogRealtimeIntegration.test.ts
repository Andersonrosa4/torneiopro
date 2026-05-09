// Teste de integração: simula um servidor com paginação keyset e eventos
// de realtime (INSERT/UPDATE/DELETE) intercalados com chamadas loadMore.
// Garante que não há duplicação nem "pulos" de páginas.

import { describe, it, expect } from "vitest";
import {
  appendPage,
  applyRealtimeEvent,
  matchesFilters,
  sortDesc,
  type LogFilters,
  type OrderableLogRow,
} from "@/lib/bugCombatantLogOrdering";
import {
  nextCursorFromPage,
  toCursor,
  type KeysetCursor,
} from "@/lib/bugCombatantLogCursor";

const T = "11111111-1111-1111-1111-111111111111";
const filters: LogFilters = { tournamentId: T, scope: "tournament", source: "all" };

function uuid(n: number): string {
  const h = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
}

function row(id: string, created_at: string, opts: Partial<OrderableLogRow> = {}): OrderableLogRow {
  return { id, created_at, tournament_id: T, source: "manual", ...opts };
}

/** Simula uma resposta paginada do servidor aplicando filtros e cursor. */
function fakeServerFetch(
  store: OrderableLogRow[],
  cursor: KeysetCursor | null,
  limit: number,
  f: LogFilters,
): OrderableLogRow[] {
  const visible = sortDesc(store.filter((r) => matchesFilters(r, f)));
  const start = cursor
    ? visible.findIndex(
        (r) =>
          r.created_at < cursor.created_at ||
          (r.created_at === cursor.created_at && r.id < cursor.id),
      )
    : 0;
  if (start === -1) return [];
  return visible.slice(start, start + limit);
}

describe("integração: realtime + loadMore com keyset", () => {
  it("INSERT/UPDATE/DELETE intercalados não duplicam, não pulam páginas e mantêm ordem", () => {
    // Servidor com 50 linhas: t01 (mais nova) ... t50 (mais antiga)
    const store: OrderableLogRow[] = Array.from({ length: 50 }, (_, i) => {
      const n = i + 1;
      const minute = String(60 - n).padStart(2, "0");
      return row(uuid(n), `2025-06-01T12:${minute}:00.000Z`);
    });

    const PAGE = 10;
    let rows: OrderableLogRow[] = [];
    let cursor: KeysetCursor | null = null;
    let hasMore = true;

    const loadMore = () => {
      const page = fakeServerFetch(store, cursor, PAGE, filters);
      rows = appendPage(rows, page);
      cursor = nextCursorFromPage(page, cursor);
      hasMore = page.length === PAGE;
      return page;
    };

    // Página 1
    const p1 = loadMore();
    expect(p1).toHaveLength(PAGE);
    expect(rows).toHaveLength(10);

    // Realtime entre p1 e p2: INSERT no topo (mais nova)
    const liveTop = row(uuid(1001), "2025-07-01T00:00:00.000Z");
    store.push(liveTop);
    rows = applyRealtimeEvent(rows, { type: "INSERT", row: liveTop }, filters, hasMore);
    expect(rows[0].id).toBe(liveTop.id);

    // Realtime: INSERT antigo (cai além do que foi carregado) → descartado
    const liveOld = row(uuid(1002), "2024-01-01T00:00:00.000Z");
    store.push(liveOld);
    const before = rows;
    rows = applyRealtimeEvent(rows, { type: "INSERT", row: liveOld }, filters, hasMore);
    expect(rows).toBe(before);

    // Realtime: UPDATE em uma linha já carregada (muda um campo livre)
    const target = rows[5];
    const updated = { ...target, source: "cron" } as OrderableLogRow;
    rows = applyRealtimeEvent(rows, { type: "UPDATE", row: updated }, filters, hasMore);
    expect(rows[5].source).toBe("cron");

    // Realtime: DELETE de uma linha já carregada
    const toDelete = rows[7].id;
    rows = applyRealtimeEvent(rows, { type: "DELETE", id: toDelete }, filters, hasMore);
    expect(rows.find((r) => r.id === toDelete)).toBeUndefined();

    // Página 2 — cursor deve continuar a partir do servidor, não do realtime
    const p2 = loadMore();
    expect(p2).toHaveLength(PAGE);
    // Todas as linhas de p2 são estritamente mais antigas que a última de p1
    const lastOfP1 = p1[p1.length - 1];
    for (const r of p2) {
      expect(
        r.created_at < lastOfP1.created_at ||
          (r.created_at === lastOfP1.created_at && r.id < lastOfP1.id),
      ).toBe(true);
    }

    // Realtime durante loadMore: DELETE de uma linha que ainda não foi paginada
    // não deve afetar páginas já recebidas, mas deve sumir do store para a próxima.
    const futureRow = sortDesc(store).find(
      (r) => !rows.some((x) => x.id === r.id) && r.id !== liveOld.id,
    )!;
    store.splice(store.indexOf(futureRow), 1);

    // Página 3
    const p3 = loadMore();
    // Não pode conter futureRow (foi deletada antes do fetch)
    expect(p3.find((r) => r.id === futureRow.id)).toBeUndefined();

    // Página 4
    loadMore();
    // Página 5 (última) — força hasMore=false ao fim
    while (hasMore) loadMore();

    // Agora liveOld (antiga, fora das páginas) entra no fundo, pois hasMore=false
    rows = applyRealtimeEvent(rows, { type: "INSERT", row: liveOld }, filters, hasMore);
    expect(rows[rows.length - 1].id).toBe(liveOld.id);

    // === Invariantes globais ===

    // 1) Sem duplicatas
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);

    // 2) Ordem (created_at desc, id desc) preservada
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      const ok =
        a.created_at > b.created_at || (a.created_at === b.created_at && a.id >= b.id);
      expect(ok).toBe(true);
    }

    // 3) Sem "pulos": entre páginas consecutivas do servidor, não pode haver
    //    uma linha visível no servidor (na época da consulta) que tenha sido
    //    omitida. Verificamos comparando com o snapshot final do servidor:
    //    qualquer linha do servidor que não foi deletada deve estar em `rows`,
    //    com exceção das linhas inseridas via realtime (já adicionadas).
    const finalServerIds = new Set(
      sortDesc(store.filter((r) => matchesFilters(r, filters))).map((r) => r.id),
    );
    // Remove o id deletado via realtime (não está no rows nem deve estar no server check)
    finalServerIds.delete(toDelete);
    // futureRow foi deletada do store antes do fetch
    finalServerIds.delete(futureRow.id);
    for (const id of finalServerIds) {
      expect(ids).toContain(id);
    }

    // 4) liveTop e liveOld estão presentes
    expect(ids).toContain(liveTop.id);
    expect(ids).toContain(liveOld.id);
  });

  it("DELETE durante loadMore não corrompe o cursor", () => {
    const store: OrderableLogRow[] = Array.from({ length: 20 }, (_, i) => {
      const n = i + 1;
      const minute = String(60 - n).padStart(2, "0");
      return row(uuid(n), `2025-06-01T10:${minute}:00.000Z`);
    });

    let rows: OrderableLogRow[] = [];
    let cursor: KeysetCursor | null = null;

    // p1
    const p1 = fakeServerFetch(store, cursor, 5, filters);
    rows = appendPage(rows, p1);
    cursor = nextCursorFromPage(p1, cursor);
    const cursorAfterP1 = cursor;
    expect(cursor).toEqual(toCursor(p1[p1.length - 1]));

    // DELETE da última linha já carregada — cursor NÃO deve mudar
    rows = applyRealtimeEvent(
      rows,
      { type: "DELETE", id: p1[p1.length - 1].id },
      filters,
      true,
    );
    expect(cursor).toBe(cursorAfterP1);

    // p2 continua a partir do cursor original (do servidor), sem pular linhas
    const p2 = fakeServerFetch(store, cursor, 5, filters);
    rows = appendPage(rows, p2);
    expect(p2).toHaveLength(5);

    // Sem duplicatas
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
