/**
 * Integração: garante que, ao hidratar do sessionStorage com filtros + cursor
 * canônicos batendo com o estado salvo, o BugCombatantLogPanel NÃO dispara
 * `fetchLogs` na primeira renderização (i.e. não chama a edge function
 * `bug-combatant-log`). Cobre o caminho de "retomada após refresh".
 *
 * Também valida o caminho oposto: quando o sessionStorage está vazio (ou com
 * filtros divergentes), o panel chama a edge function exatamente uma vez no
 * mount (1ª página).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import {
  storageKey,
  writePersisted,
  clearPersisted,
} from "@/lib/bugCombatantLogPersistence";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const invokeMock = vi.fn();

// jsdom não tem IntersectionObserver — stub mínimo (panel usa para infinite scroll).
class IOStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
(globalThis as any).IntersectionObserver = (globalThis as any).IntersectionObserver ?? IOStub;


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

// Virtualizer — devolve um shape mínimo para evitar mexer no DOM real.
vi.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    measureElement: () => {},
  }),
}));

// Telemetria — silencia I/O de fundo.
vi.mock("@/lib/bugCombatantLogTelemetry", () => ({
  flushNow: vi.fn(),
  recordCursorError: vi.fn(),
  recordFirstLoad: vi.fn(),
  recordLoadMore: vi.fn(),
  recordReset: vi.fn(),
}));

// sonner — evita render do toaster.
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// ─── Fixtures ──────────────────────────────────────────────────────────────
const TOURNAMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_ID_NEW = "11111111-1111-4111-8111-111111111111";
const ROW_ID_OLD = "22222222-2222-4222-8222-222222222222";

function makePersistedRows() {
  return [
    {
      id: ROW_ID_NEW,
      tournament_id: TOURNAMENT_ID,
      scanned: 10,
      fixed: 1,
      remaining: 0,
      source: "cron",
      applied_fixes: [],
      created_at: "2025-01-02T12:00:00.000Z",
    },
    {
      id: ROW_ID_OLD,
      tournament_id: TOURNAMENT_ID,
      scanned: 5,
      fixed: 0,
      remaining: 0,
      source: "cron",
      applied_fixes: [],
      created_at: "2025-01-02T08:00:00.000Z",
    },
  ];
}

async function loadPanel() {
  // Importa após registrar mocks.
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
});

afterEach(() => {
  cleanup();
  clearPersisted(TOURNAMENT_ID);
});

// ─── Casos ─────────────────────────────────────────────────────────────────
describe("BugCombatantLogPanel — hidratação após refresh", () => {
  it("hidrata do sessionStorage e NÃO chama a edge function no mount quando filtros + cursor batem", async () => {
    // Simula um refresh: estado prévio salvo com filtros (source=all, scope=tournament)
    // e cursor canônico apontando para a linha mais antiga visível.
    writePersisted({
      tournament_id: TOURNAMENT_ID,
      source: "all",
      scope: "tournament",
      search: "",
      scrollY: 0,
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: ROW_ID_OLD },
      rows: makePersistedRows(),
      pageIndex: 1,
      hasMore: true,
    });

    // Sanity: o sessionStorage realmente tem o snapshot.
    expect(sessionStorage.getItem(storageKey(TOURNAMENT_ID))).not.toBeNull();

    const Panel = await loadPanel();
    render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />);

    // Dá tempo para qualquer efeito assíncrono de fetch acidental aparecer.
    await new Promise((r) => setTimeout(r, 30));

    expect(invokeMock).not.toHaveBeenCalledWith(
      "bug-combatant-log",
      expect.anything(),
    );
  });

  it("descarta hidratação e chama a edge function quando o cursor persistido é INVÁLIDO", async () => {
    writePersisted({
      tournament_id: TOURNAMENT_ID,
      source: "all",
      scope: "tournament",
      search: "",
      scrollY: 0,
      // Cursor com id em maiúsculas viola o formato canônico → hydrate deve devolver null.
      cursor: { created_at: "2025-01-02T08:00:00.000Z", id: ROW_ID_OLD.toUpperCase() } as any,
      rows: makePersistedRows(),
      pageIndex: 1,
      hasMore: true,
    });

    const Panel = await loadPanel();
    render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "bug-combatant-log",
        expect.objectContaining({
          body: expect.objectContaining({
            tournament_id: TOURNAMENT_ID,
            cursor: null, // 1ª página: sem cursor
          }),
        }),
      );
    });
  });

  it("sem nada no sessionStorage, chama a edge function exatamente 1x no mount (1ª página)", async () => {
    const Panel = await loadPanel();
    render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />);

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        (c) => c[0] === "bug-combatant-log",
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][1].body.cursor).toBeNull();
    });
  });
});
