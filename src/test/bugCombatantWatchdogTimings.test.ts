/**
 * Bug Combatant — validação dos timings do watchdog.
 *
 * Cobre:
 *  1. Cooldown padrão de 15s em `runBugCombatant` (segunda chamada
 *     dentro da janela retorna no-op sem invocar o scanner).
 *  2. `force: true` ignora o cooldown.
 *  3. Intervalo periódico padrão de 30s em `startBackgroundWatchdog`.
 *  4. Debounce de realtime (2.5s) — múltiplos eventos disparados em
 *     sequência colapsam em uma única execução com motivo "realtime".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const scanMock = vi.fn();
vi.mock("@/lib/integrityScanner", () => ({
  scanTournamentIntegrity: (...args: any[]) => scanMock(...args),
}));

let realtimeHandler: ((payload: any) => void) | null = null;
const insertMock = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/integrations/supabase/client", () => {
  const channelStub: any = {};
  channelStub.on = vi.fn((_evt: string, _filter: any, cb: any) => {
    realtimeHandler = cb;
    return channelStub;
  });
  channelStub.subscribe = vi.fn(() => channelStub);
  channelStub.unsubscribe = vi.fn();
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "bug_combatant_config") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      cooldown_ms: 15_000,
                      watchdog_interval_ms: 30_000,
                      realtime_debounce_ms: 2_500,
                    },
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (table === "bug_combatant_log") {
          return { insert: (...a: any[]) => insertMock(...a) };
        }
        if (table === "matches") {
          return {
            update: () => ({
              eq: (...a: any[]) => updateMock(...a),
            }),
          };
        }
        return {};
      }),
      channel: vi.fn(() => channelStub),
      removeChannel: vi.fn(),
    },
  };
});

import {
  runBugCombatant,
  startBackgroundWatchdog,
  invalidateBugCombatantConfigCache,
} from "@/lib/bugCombatant";

const TID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.useFakeTimers();
  scanMock.mockReset();
  insertMock.mockClear();
  updateMock.mockClear();
  realtimeHandler = null;
  sessionStorage.clear();
  invalidateBugCombatantConfigCache();
  scanMock.mockResolvedValue({ totalMatches: 0, issues: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Bug Combatant — cooldown de 15s em runBugCombatant", () => {
  it("aborta a segunda chamada quando ocorre dentro de 15s", async () => {
    await runBugCombatant(TID, { reason: "manual" });
    expect(scanMock).toHaveBeenCalledTimes(1);

    // Avança 14.9s (ainda dentro do cooldown)
    await vi.advanceTimersByTimeAsync(14_900);
    const result = await runBugCombatant(TID, { reason: "manual" });
    expect(scanMock).toHaveBeenCalledTimes(1); // não correu de novo
    expect(result).toEqual({ scanned: 0, fixed: 0, remaining: 0, appliedFixes: [] });
  });

  it("permite nova execução após 15s", async () => {
    await runBugCombatant(TID, { reason: "manual" });
    await vi.advanceTimersByTimeAsync(15_100);
    await runBugCombatant(TID, { reason: "manual" });
    expect(scanMock).toHaveBeenCalledTimes(2);
  });

  it("opção force ignora o cooldown", async () => {
    await runBugCombatant(TID, { reason: "manual" });
    await runBugCombatant(TID, { reason: "manual", force: true });
    expect(scanMock).toHaveBeenCalledTimes(2);
  });
});

describe("Bug Combatant — watchdog em background", () => {
  it("dispara scan inicial (~1.5s) e depois a cada 30s", async () => {
    const stop = startBackgroundWatchdog(TID, () => {});

    // Antes do bootstrap
    expect(scanMock).toHaveBeenCalledTimes(0);

    // Bootstrap (1.5s) — scan inicial é forçado, ignora cooldown
    await vi.advanceTimersByTimeAsync(1_600);
    expect(scanMock).toHaveBeenCalledTimes(1);

    // Antes de 30s do periódico → ainda 1 (e cooldown também bloquearia)
    await vi.advanceTimersByTimeAsync(20_000);
    expect(scanMock).toHaveBeenCalledTimes(1);

    // Após 30s do setInterval (e cooldown já expirou)
    await vi.advanceTimersByTimeAsync(15_000);
    expect(scanMock).toHaveBeenCalledTimes(2);

    // Mais 30s → 3ª execução
    await vi.advanceTimersByTimeAsync(30_000);
    expect(scanMock).toHaveBeenCalledTimes(3);

    stop();
  });

  it("colapsa múltiplos eventos realtime em um único scan via debounce de 2.5s", async () => {
    const stop = startBackgroundWatchdog(TID, () => {});

    // Bootstrap inicial
    await vi.advanceTimersByTimeAsync(1_600);
    expect(scanMock).toHaveBeenCalledTimes(1);
    expect(realtimeHandler).toBeTruthy();

    // Burst de 5 eventos realtime em 1s
    realtimeHandler!({});
    await vi.advanceTimersByTimeAsync(200);
    realtimeHandler!({});
    await vi.advanceTimersByTimeAsync(200);
    realtimeHandler!({});
    await vi.advanceTimersByTimeAsync(200);
    realtimeHandler!({});
    await vi.advanceTimersByTimeAsync(200);
    realtimeHandler!({});

    // Antes dos 2.5s desde o último → nenhum scan extra ainda
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scanMock).toHaveBeenCalledTimes(1);

    // Completa o debounce (2.5s desde o último evento)
    await vi.advanceTimersByTimeAsync(600);
    expect(scanMock).toHaveBeenCalledTimes(2);

    // Verifica motivo "realtime" foi propagado para o log
    const lastInsert = insertMock.mock.calls.at(-1)?.[0];
    expect(lastInsert?.reason).toBe("realtime");

    stop();
  });

  it("cleanup cancela o debounce pendente do realtime", async () => {
    const stop = startBackgroundWatchdog(TID, () => {});
    await vi.advanceTimersByTimeAsync(1_600);
    expect(scanMock).toHaveBeenCalledTimes(1);

    realtimeHandler!({});
    await vi.advanceTimersByTimeAsync(1_000);
    stop();

    // Depois do stop, o timer pendente não deve mais executar
    await vi.advanceTimersByTimeAsync(5_000);
    expect(scanMock).toHaveBeenCalledTimes(1);
  });
});
