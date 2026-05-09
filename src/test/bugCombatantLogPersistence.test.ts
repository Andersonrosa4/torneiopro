import { describe, it, expect, beforeEach } from "vitest";
import {
  clearPersisted,
  getHydratableState,
  readPersisted,
  storageKey,
  writePersisted,
  __INTERNAL,
  type PersistedRow,
} from "@/lib/bugCombatantLogPersistence";

const T = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function row(id: string, created_at: string): PersistedRow {
  return {
    id, created_at,
    tournament_id: T,
    scanned: 1, fixed: 0, remaining: 0,
    source: "manual", applied_fixes: [],
  };
}

const validCursor = {
  created_at: "2025-06-01T12:30:00.000Z",
  id: "00000000-0000-4000-8000-00000000000a",
};

beforeEach(() => sessionStorage.clear());

describe("bugCombatantLogPersistence", () => {
  it("write/read roundtrip preserva schema versionado e cap de linhas", () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      row(`00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`,
          `2025-06-01T12:00:${String(i % 60).padStart(2, "0")}.000Z`),
    );
    writePersisted({
      tournament_id: T, source: "all", scope: "tournament", search: "",
      scrollY: 0, cursor: validCursor, rows: many, pageIndex: 5, hasMore: true,
    });
    const raw = JSON.parse(sessionStorage.getItem(storageKey(T))!);
    expect(raw.v).toBe(__INTERNAL.SCHEMA_VERSION);
    expect(raw.rows.length).toBe(__INTERNAL.MAX_PERSISTED_ROWS);
  });

  it("getHydratableState retorna o estado quando filtros e torneio batem", () => {
    writePersisted({
      tournament_id: T, source: "all", scope: "tournament", search: "",
      scrollY: 0, cursor: validCursor,
      rows: [row("00000000-0000-4000-8000-000000000001", "2025-06-01T12:00:00.000Z")],
      pageIndex: 1, hasMore: true,
    });
    const h = getHydratableState(T, "all", "tournament");
    expect(h).not.toBeNull();
    expect(h!.cursor).toEqual(validCursor);
    expect(h!.rows).toHaveLength(1);
    expect(h!.pageIndex).toBe(1);
  });

  it("getHydratableState devolve null quando filtros mudam", () => {
    writePersisted({
      tournament_id: T, source: "manual", scope: "tournament", search: "",
      scrollY: 0, cursor: validCursor,
      rows: [row("00000000-0000-4000-8000-000000000001", "2025-06-01T12:00:00.000Z")],
      pageIndex: 0, hasMore: true,
    });
    expect(getHydratableState(T, "cron", "tournament")).toBeNull();
    expect(getHydratableState(T, "manual", "all")).toBeNull();
  });

  it("getHydratableState devolve null quando torneio é outro", () => {
    writePersisted({
      tournament_id: T, source: "all", scope: "tournament", search: "",
      scrollY: 0, cursor: validCursor,
      rows: [row("00000000-0000-4000-8000-000000000001", "2025-06-01T12:00:00.000Z")],
      pageIndex: 0, hasMore: true,
    });
    expect(getHydratableState(OTHER, "all", "tournament")).toBeNull();
  });

  it("descarta estado se cursor persistido tem formato inválido", () => {
    sessionStorage.setItem(storageKey(T), JSON.stringify({
      v: __INTERNAL.SCHEMA_VERSION,
      tournament_id: T, source: "all", scope: "tournament", search: "",
      scrollY: 0,
      cursor: { created_at: "ontem", id: "nao-uuid" },
      rows: [row("00000000-0000-4000-8000-000000000001", "2025-06-01T12:00:00.000Z")],
      pageIndex: 0, hasMore: true,
      savedAt: Date.now(),
    }));
    expect(getHydratableState(T, "all", "tournament")).toBeNull();
  });

  it("descarta estado de versão antiga", () => {
    sessionStorage.setItem(storageKey(T), JSON.stringify({
      v: 0,
      tournament_id: T, source: "all", scope: "tournament",
      rows: [row("00000000-0000-4000-8000-000000000001", "2025-06-01T12:00:00.000Z")],
    }));
    expect(getHydratableState(T, "all", "tournament")).toBeNull();
  });

  it("aceita cursor null + rows hidratam (estado fim do histórico)", () => {
    writePersisted({
      tournament_id: T, source: "all", scope: "tournament", search: "",
      scrollY: 0, cursor: null,
      rows: [row("00000000-0000-4000-8000-000000000001", "2025-06-01T12:00:00.000Z")],
      pageIndex: 3, hasMore: false,
    });
    const h = getHydratableState(T, "all", "tournament");
    expect(h).not.toBeNull();
    expect(h!.cursor).toBeNull();
    expect(h!.hasMore).toBe(false);
  });

  it("clearPersisted remove o estado", () => {
    writePersisted({
      tournament_id: T, source: "all", scope: "tournament", search: "",
      scrollY: 0, cursor: null, rows: [], pageIndex: 0, hasMore: true,
    });
    clearPersisted(T);
    expect(readPersisted(T)).toEqual({});
  });
});
