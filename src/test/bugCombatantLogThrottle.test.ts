/**
 * Testes do throttle leading+trailing usado para persistir o estado do
 * BugCombatantLogPanel em sessionStorage durante scroll contínuo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThrottledPersister } from "@/lib/bugCombatantLogThrottle";

describe("createThrottledPersister", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // performance.now() referencia o relógio fake.
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Adapter que lê do clock fake do vitest para `now()`.
  const now = () => vi.getMockedSystemTime()!.valueOf();

  it("dispara LEADING imediatamente na 1ª chamada", () => {
    const fn = vi.fn();
    const t = createThrottledPersister(fn, { intervalMs: 250, now });
    t("a");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("colapsa um burst em LEADING + 1 TRAILING com os args mais recentes", () => {
    const fn = vi.fn();
    const t = createThrottledPersister(fn, { intervalMs: 250, now });
    // Burst de 60 chamadas em ~16ms cada (simula scroll a 60fps por ~1s).
    for (let i = 0; i < 60; i++) {
      t(i);
      vi.advanceTimersByTime(16);
      vi.setSystemTime(16 * (i + 1));
    }
    // Avança o tempo restante para o trailing disparar.
    vi.advanceTimersByTime(500);
    vi.setSystemTime(now() + 500);

    // Em ~1s deveriam ter ocorrido bem menos que 60 writes.
    // Com leading+trailing@250ms: ~1 leading + ~3-4 trailings.
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(8);
    // O ÚLTIMO arg sempre vence (estado final = última posição de scroll).
    expect(fn.mock.calls.at(-1)![0]).toBe(59);
  });

  it("flush() força a execução do trailing pendente imediatamente", () => {
    const fn = vi.fn();
    const t = createThrottledPersister(fn, { intervalMs: 250, now });
    t("first");          // leading
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    vi.setSystemTime(50);
    t("second");         // entra no trailing pendente
    expect(fn).toHaveBeenCalledTimes(1);
    t.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("second");
  });

  it("cancel() descarta pendentes e não dispara trailing", () => {
    const fn = vi.fn();
    const t = createThrottledPersister(fn, { intervalMs: 250, now });
    t("a");
    vi.advanceTimersByTime(50); vi.setSystemTime(50);
    t("b");
    t.cancel();
    vi.advanceTimersByTime(1000); vi.setSystemTime(1050);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("após o intervalo, próxima chamada conta como LEADING novamente", () => {
    const fn = vi.fn();
    const t = createThrottledPersister(fn, { intervalMs: 100, now });
    t(1);
    vi.advanceTimersByTime(150); vi.setSystemTime(150);
    t(2);
    vi.advanceTimersByTime(150); vi.setSystemTime(300);
    t(3);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    // Sem trailings agendados (nada pendente).
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("flush() sem nada pendente é no-op", () => {
    const fn = vi.fn();
    const t = createThrottledPersister(fn, { intervalMs: 250, now });
    t.flush();
    expect(fn).not.toHaveBeenCalled();
    t("x");
    expect(fn).toHaveBeenCalledTimes(1);
    t.flush(); // já executou imediatamente como leading
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("callCount reflete execuções reais (não chamadas suprimidas)", () => {
    const fn = vi.fn();
    const t = createThrottledPersister(fn, { intervalMs: 100, now });
    t("a"); t("b"); t("c"); t("d");
    expect(t.callCount).toBe(1); // só leading executou
    vi.advanceTimersByTime(200); vi.setSystemTime(200);
    expect(t.callCount).toBe(2); // trailing disparou com "d"
    expect(fn).toHaveBeenLastCalledWith("d");
  });
});
