/**
 * Testes para `restoreScrollY`: validam que a restauração de scroll após
 * hidratação keyset converge mesmo quando o virtualizador ainda está medindo
 * itens (scrollHeight crescendo entre frames) e que NÃO produz "salto ao topo"
 * silencioso quando o `scrollTo` é clampado.
 */
import { describe, it, expect } from "vitest";
import {
  restoreScrollY,
  type ScrollAdapter,
} from "@/lib/bugCombatantLogScrollRestore";

interface FakeWorld {
  scrollHeight: number;
  viewport: number;
  scrollY: number;
  /** Por tick, quanto cresce o scrollHeight (simula virtualizer medindo). */
  growthPerTick: number;
  /** Limite máximo do scrollHeight (para travar em testes de "altura insuficiente"). */
  maxHeight?: number;
  ticks: number;
  scrolls: number[];
}

function makeAdapter(world: FakeWorld): { adapter: ScrollAdapter; flush: () => Promise<void> } {
  const queue: Array<() => void> = [];
  let now = 0;
  const adapter: ScrollAdapter = {
    now: () => now,
    getScrollHeight: () => world.scrollHeight,
    getViewportHeight: () => world.viewport,
    getScrollY: () => world.scrollY,
    scrollTo: (y) => {
      world.scrolls.push(y);
      // Simula clamp do navegador.
      const max = Math.max(0, world.scrollHeight - world.viewport);
      world.scrollY = Math.max(0, Math.min(y, max));
    },
    schedule: (cb) => { queue.push(cb); },
  };
  const flush = async () => {
    // Drena fila simulando rAF: cada tick avança o "tempo" e cresce o conteúdo.
    while (queue.length > 0) {
      const cb = queue.shift()!;
      world.ticks++;
      now += 16;
      const cap = world.maxHeight ?? Number.POSITIVE_INFINITY;
      world.scrollHeight = Math.min(cap, world.scrollHeight + world.growthPerTick);
      cb();
      // microtask flush para o `.then` interno da Promise resolver.
      await Promise.resolve();
    }
  };
  return { adapter, flush };
}

describe("restoreScrollY", () => {
  it("retorna ok=true imediatamente quando targetY=0 (nada a restaurar)", async () => {
    const world: FakeWorld = { scrollHeight: 0, viewport: 800, scrollY: 0, growthPerTick: 0, ticks: 0, scrolls: [] };
    const { adapter, flush } = makeAdapter(world);
    const p = restoreScrollY({ targetY: 0 }, adapter);
    await flush();
    const r = await p;
    expect(r).toMatchObject({ ok: true, attempts: 0, reason: "target_zero" });
    expect(world.scrolls).toEqual([]); // não tentou rolar
  });

  it("converge no 1º tick quando o conteúdo já cabe o alvo", async () => {
    const world: FakeWorld = { scrollHeight: 5000, viewport: 800, scrollY: 0, growthPerTick: 0, ticks: 0, scrolls: [] };
    const { adapter, flush } = makeAdapter(world);
    const p = restoreScrollY({ targetY: 1200 }, adapter);
    await flush();
    const r = await p;
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(world.scrollY).toBe(1200);
  });

  it("aguarda virtualizador crescer e converge sem saltar ao topo", async () => {
    // Inicia com scrollHeight insuficiente (1000), cresce 800 por frame até > targetY+viewport.
    const world: FakeWorld = { scrollHeight: 1000, viewport: 800, scrollY: 0, growthPerTick: 800, ticks: 0, scrolls: [] };
    const { adapter, flush } = makeAdapter(world);
    const p = restoreScrollY({ targetY: 3000 }, adapter);
    await flush();
    const r = await p;
    expect(r.ok).toBe(true);
    expect(world.scrollY).toBe(3000);
    expect(r.attempts).toBeGreaterThan(1);
    // Em nenhum momento o scroll final deve ter ficado em 0 (sem salto ao topo).
    expect(world.scrolls.at(-1)).toBe(3000);
  });

  it("quando a altura estabiliza abaixo do alvo, retorna clamped_height e posiciona no máximo possível", async () => {
    // scrollHeight trava em 1500 (max alcançável = 700) — alvo 3000 é inalcançável.
    const world: FakeWorld = {
      scrollHeight: 1500, viewport: 800, scrollY: 0,
      growthPerTick: 0, maxHeight: 1500, ticks: 0, scrolls: [],
    };
    const { adapter, flush } = makeAdapter(world);
    const p = restoreScrollY({ targetY: 3000, maxAttempts: 5 }, adapter);
    await flush();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("clamped_height");
    // Não saltou ao topo: parou no máximo alcançável (700).
    expect(world.scrollY).toBe(700);
  });

  it("respeita maxAttempts quando o alvo simplesmente não converge", async () => {
    // Conteúdo cresce, mas getScrollY retorna sempre 0 (simula scrollTo ignorado).
    const world: FakeWorld = { scrollHeight: 10000, viewport: 800, scrollY: 0, growthPerTick: 100, ticks: 0, scrolls: [] };
    const adapter: ScrollAdapter = {
      now: () => 0,
      getScrollHeight: () => world.scrollHeight,
      getViewportHeight: () => world.viewport,
      getScrollY: () => 0, // nunca atualiza
      scrollTo: (y) => { world.scrolls.push(y); },
      schedule: (cb) => { queue.push(cb); },
    };
    const queue: Array<() => void> = [];
    const p = restoreScrollY({ targetY: 2000, maxAttempts: 3, timeoutMs: 99999 }, adapter);
    while (queue.length > 0) {
      const cb = queue.shift()!;
      world.scrollHeight += 100;
      cb();
      await Promise.resolve();
    }
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("max_attempts");
    expect(r.attempts).toBe(3);
  });

  it("respeita timeoutMs", async () => {
    const queue: Array<() => void> = [];
    let now = 0;
    const adapter: ScrollAdapter = {
      now: () => now,
      getScrollHeight: () => 10000,
      getViewportHeight: () => 800,
      getScrollY: () => 0,
      scrollTo: () => {},
      schedule: (cb) => { queue.push(cb); },
    };
    const p = restoreScrollY({ targetY: 2000, maxAttempts: 999, timeoutMs: 50 }, adapter);
    while (queue.length > 0) {
      const cb = queue.shift()!;
      now += 30; // cada tick consome 30ms; 2 ticks já passam de 50ms
      cb();
      await Promise.resolve();
    }
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("timed_out");
  });

  it("nunca rola além do máximo alcançável (sem overshoot)", async () => {
    const world: FakeWorld = {
      scrollHeight: 2000, viewport: 800, scrollY: 0,
      growthPerTick: 0, maxHeight: 2000, ticks: 0, scrolls: [],
    };
    const { adapter, flush } = makeAdapter(world);
    const p = restoreScrollY({ targetY: 5000, maxAttempts: 3 }, adapter);
    await flush();
    await p;
    // Nenhuma chamada de scrollTo pediu mais que 1200 (= 2000-800).
    expect(Math.max(...world.scrolls)).toBeLessThanOrEqual(1200);
  });
});
