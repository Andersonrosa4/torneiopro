/**
 * Integração: BugCombatantLogPanel — hidratação após payload GRANDE que
 * forçou queda para os níveis 3/4 da escada de fallback de persistência.
 *
 * Cenário simulado (refresh de aba):
 * 1. O usuário tem uma sessão ativa com muitos rows + cursor; ao tentar
 *    persistir (visibilitychange/pagehide), `setItem` lança
 *    QuotaExceededError em todos os payloads que carregam rows. A escada
 *    desce até o nível 3 (rowsLimit=0, cursor preservado) ou nível 4
 *    (rowsLimit=0, cursor=null), conforme o filtro do mock.
 * 2. A "aba fecha e reabre" → o teste limpa o registro de chamadas e
 *    monta o painel novamente lendo o sessionStorage.
 * 3. Validações:
 *    - O painel NÃO crasha durante a hidratação.
 *    - Como `rows` está vazio no storage, `getHydratableState` retorna
 *      null e o painel refetcha a 1ª página com `cursor: null`.
 *    - A chamada à edge function `bug-combatant-log` ocorre exatamente 1x.
 *    - Filtros (source/scope) e scrollY persistidos são mantidos no
 *      storage (verificável via leitura crua), mesmo após a queda.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  storageKey,
  writePersisted,
  readPersisted,
  clearPersisted,
  __INTERNAL,
  type PersistedRow,
} from "@/lib/bugCombatantLogPersistence";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const invokeMock = vi.fn();

class IOStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
(globalThis as any).IntersectionObserver =
  (globalThis as any).IntersectionObserver ?? IOStub;

vi.mock("@/integrations/supabase/client", () => {
  const channelStub = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  };
  return {
    supabase: {
      functions: { invoke: invokeMock },
      channel: vi.fn(() => channelStub),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    measureElement: () => {},
  }),
}));

vi.mock("@/lib/bugCombatantLogTelemetry", () => ({
  flushNow: vi.fn(),
  recordCursorError: vi.fn(),
  recordFirstLoad: vi.fn(),
  recordLoadMore: vi.fn(),
  recordReset: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// ─── Fixtures ──────────────────────────────────────────────────────────────
const TOURNAMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROW_ID_TAIL = "33333333-3333-4333-8333-333333333333";

function row(i: number): PersistedRow {
  return {
    id: `${i.toString(16).padStart(8, "0")}-3333-4333-8333-333333333333`.slice(0, 36),
    tournament_id: TOURNAMENT_ID,
    scanned: 1, fixed: 0, remaining: 0,
    source: "manual",
    applied_fixes: ["m1:fix"],
    created_at: `2025-02-0${(i % 9) + 1}T08:00:00.000Z`,
  };
}

async function loadPanel() {
  const mod = await import("@/components/BugCombatantLogPanel");
  return mod.default;
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({
    data: { rows: [], cursor: null, limit: 25, count: 0 },
    error: null,
  });
  sessionStorage.clear();
  __INTERNAL.resetRowsCache();
});

afterEach(() => {
  cleanup();
  clearPersisted(TOURNAMENT_ID);
});

// ─── Casos ─────────────────────────────────────────────────────────────────
describe("BugCombatantLogPanel — hidratação após queda para nível 3/4", () => {
  it("nível 3: persistência reduzida (rows=[], cursor preservado) → painel hidrata sem crash e refetcha 1ª página", () => {
    // Faz `setItem` rejeitar qualquer payload que ainda contenha rows,
    // forçando a escada até o nível 3 (rowsLimit=0, cursor preservado).
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    setItemSpy.mockImplementation(function (this: Storage, key: string, value: string) {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed.r) && parsed.r.length > 0) {
        const e: any = new Error("Quota");
        e.name = "QuotaExceededError"; e.code = 22;
        throw e;
      }
      (this as any)[key] = value;
    });

    const r = writePersisted({
      tournament_id: TOURNAMENT_ID,
      source: "manual", scope: "tournament", search: "foo",
      scrollY: 4321,
      cursor: { created_at: "2025-02-01T08:00:00.000Z", id: ROW_ID_TAIL },
      rows: Array.from({ length: 80 }, (_, i) => row(i)),
      pageIndex: 3, hasMore: true,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe(3);
    setItemSpy.mockRestore();

    // Sanity: snapshot final no storage tem cursor + filtros, mas sem rows.
    const back = readPersisted(TOURNAMENT_ID);
    expect(back.rows).toEqual([]);
    expect(back.cursor).toEqual({ created_at: "2025-02-01T08:00:00.000Z", id: ROW_ID_TAIL });
    expect(back.source).toBe("manual");
    expect(back.scope).toBe("tournament");
    expect(back.scrollY).toBe(4321);
    expect(sessionStorage.getItem(storageKey(TOURNAMENT_ID))).not.toBeNull();

    // "Reabertura da aba": monta o painel.
    invokeMock.mockClear();
    return loadPanel().then(async (Panel) => {
      expect(() => render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />)).not.toThrow();

      await waitFor(() => {
        const calls = invokeMock.mock.calls.filter(
          (c) => c[0] === "bug-combatant-log",
        );
        expect(calls).toHaveLength(1);
        // Sem rows hidratáveis → 1ª página, cursor null.
        expect(calls[0][1].body.cursor).toBeNull();
        expect(calls[0][1].body.tournament_id).toBe(TOURNAMENT_ID);
      });
    });
  });

  it("nível 4: persistência mínima (rows=[], cursor=null) → painel hidrata sem crash e refetcha 1ª página", async () => {
    // Aceita só o nível 4 (sem rows e sem cursor).
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    setItemSpy.mockImplementation(function (this: Storage, key: string, value: string) {
      const parsed = JSON.parse(value);
      if ((Array.isArray(parsed.r) && parsed.r.length > 0) || parsed.c !== null) {
        const e: any = new Error("Quota");
        e.name = "QuotaExceededError"; e.code = 22;
        throw e;
      }
      (this as any)[key] = value;
    });

    const r = writePersisted({
      tournament_id: TOURNAMENT_ID,
      source: "cron", scope: "all", search: "",
      scrollY: 999,
      cursor: { created_at: "2025-02-01T08:00:00.000Z", id: ROW_ID_TAIL },
      rows: Array.from({ length: 60 }, (_, i) => row(i)),
      pageIndex: 5, hasMore: false,
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe(4);
    setItemSpy.mockRestore();

    // Sanity: cursor foi dropado, mas filtros + scrollY sobreviveram.
    const back = readPersisted(TOURNAMENT_ID);
    expect(back.rows).toEqual([]);
    expect(back.cursor).toBeNull();
    expect(back.source).toBe("cron");
    expect(back.scope).toBe("all");
    expect(back.scrollY).toBe(999);

    // "Reabertura da aba".
    invokeMock.mockClear();
    const Panel = await loadPanel();
    expect(() => render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />)).not.toThrow();

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        (c) => c[0] === "bug-combatant-log",
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][1].body.cursor).toBeNull();
      expect(calls[0][1].body.tournament_id).toBe(TOURNAMENT_ID);
    });
  });
});
