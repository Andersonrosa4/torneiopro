/**
 * Integração: BugCombatantLogPanel — comportamento de persistência durante
 * rolagem contínua.
 *
 * Garantias verificadas:
 * 1. Burst de eventos `scroll` em 1s NÃO escreve mais que ~4 vezes/s no
 *    sessionStorage (throttle leading+trailing de 250ms).
 * 2. Ao fechar/ocultar a aba (`pagehide`/`visibilitychange`), o `flush`
 *    grava a posição final mais recente, mesmo se ela estava pendente
 *    no trailing do throttle.
 * 3. O valor `scrollY` persistido reflete o último evento (não o primeiro).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import { storageKey } from "@/lib/bugCombatantLogPersistence";

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

// ─── Helpers ───────────────────────────────────────────────────────────────
const TOURNAMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let scrollYValue = 0;

function setScrollY(v: number) {
  scrollYValue = v;
}

function installScrollYGetter() {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => scrollYValue,
  });
}

function getAuditWrites(setItemSpy: ReturnType<typeof vi.spyOn>): Array<{ key: string; value: string }> {
  return setItemSpy.mock.calls
    .filter((c) => typeof c[0] === "string" && (c[0] as string).startsWith("bug-audit:"))
    .map((c) => ({ key: c[0] as string, value: c[1] as string }));
}

function parseY(json: string): number | null {
  try {
    const p = JSON.parse(json);
    return typeof p?.y === "number" ? p.y : null;
  } catch {
    return null;
  }
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
  scrollYValue = 0;
  installScrollYGetter();
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});

// ─── Casos ─────────────────────────────────────────────────────────────────
describe("BugCombatantLogPanel — throttle de persistência durante scroll", () => {
  it("burst de 60 scroll-events em ~1s gera ≤ ~5 writes (≤ 4/s + leading)", async () => {
    const Panel = await loadPanel();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />);

    // Espera o panel estabilizar (mount, fetch da 1ª página, useEffect de
    // persistência efetivado). Após estabilização, zeramos a contagem para
    // medir APENAS as writes induzidas pelo scroll.
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    await act(async () => { await Promise.resolve(); });
    setItemSpy.mockClear();

    // Agora trocamos para fake timers (incluindo performance.now, base do
    // throttle). Dispatch 60 eventos em 1s simulado (~16ms entre frames).
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
    });

    const FRAMES = 60;
    const FRAME_MS = 16;
    for (let i = 1; i <= FRAMES; i++) {
      setScrollY(i * 10);
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(FRAME_MS);
    }
    // Avança o suficiente para o trailing final disparar.
    vi.advanceTimersByTime(300);

    const writes = getAuditWrites(setItemSpy);
    // Janela total ≈ 60*16 + 300 = 1260ms. Throttle 250ms → no MÁXIMO
    // ⌈1260/250⌉ + 1 (leading) = 6 writes. Folga p/ jitter de timing: ≤ 7.
    expect(writes.length).toBeGreaterThanOrEqual(2); // leading + ao menos 1 trailing
    expect(writes.length).toBeLessThanOrEqual(7);

    // Sanity adicional: taxa observada ≤ 5/s (4/s nominal + leading).
    expect(writes.length / 1.26).toBeLessThanOrEqual(5);

    // O último write deve refletir a última posição de scroll (60*10 = 600).
    const lastY = parseY(writes[writes.length - 1].value);
    expect(lastY).toBe(600);

    setItemSpy.mockRestore();
  });

  it("flush em pagehide grava a posição final mesmo com trailing pendente", async () => {
    const Panel = await loadPanel();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    await act(async () => { await Promise.resolve(); });

    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
    });

    // 1) leading dispara no 1º scroll (y=100). 2) scroll y=200 fica pendente
    // (trailing agendado para ~250ms). 3) Antes do trailing disparar, a aba
    // some → pagehide → flush() força a gravação imediata com y=200.
    setScrollY(100);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(50);

    setScrollY(200);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(50); // ainda dentro do intervalo de 250ms

    setItemSpy.mockClear(); // mede apenas o efeito do flush

    window.dispatchEvent(new Event("pagehide"));

    const flushWrites = getAuditWrites(setItemSpy);
    expect(flushWrites.length).toBeGreaterThanOrEqual(1);
    const finalY = parseY(flushWrites[flushWrites.length - 1].value);
    expect(finalY).toBe(200);

    setItemSpy.mockRestore();
  });

  it("flush em visibilitychange também grava a posição final pendente", async () => {
    const Panel = await loadPanel();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<Panel tournamentId={TOURNAMENT_ID} isAdmin />);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalled();
    });
    await act(async () => { await Promise.resolve(); });

    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance", "Date"],
    });

    setScrollY(50);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);
    setScrollY(777);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(20);

    setItemSpy.mockClear();
    document.dispatchEvent(new Event("visibilitychange"));

    const writes = getAuditWrites(setItemSpy);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(parseY(writes[writes.length - 1].value)).toBe(777);

    // E o sessionStorage final reflete y=777.
    const stored = sessionStorage.getItem(storageKey(TOURNAMENT_ID));
    expect(stored).not.toBeNull();
    expect(parseY(stored!)).toBe(777);

    setItemSpy.mockRestore();
  });
});
