// Restauração robusta de scroll vertical após hidratação keyset.
//
// Por que precisa de mais cuidado que um `window.scrollTo`?
// - A lista é virtualizada (`useWindowVirtualizer`). No 1º paint após hidratar
//   do sessionStorage, o `totalSize` do virtualizador ainda é uma estimativa
//   (count * estimateSize). Antes de cada item ser medido (measureElement), o
//   `document.scrollingElement.scrollHeight` pode ser menor que o `targetY`,
//   fazendo `scrollTo` ser silenciosamente clampado para o topo.
// - Se isso acontecer, o usuário "salta" de volta para o topo após o refresh —
//   exatamente o oposto do que a persistência keyset deveria garantir.
//
// Estratégia:
// - Tenta posicionar com `scrollTo`, depois mede `window.scrollY`.
// - Se a diferença for maior que `tolerance`, agenda nova tentativa via rAF
//   (com backoff de microtask). Repete até `maxAttempts` ou `timeoutMs`.
// - Cada tentativa só prossegue se o scrollHeight cresceu (sinal de que o
//   virtualizer mediu mais itens) — caso contrário aguarda o próximo frame.
// - Devolve `{ ok, finalY, attempts, reason? }` para telemetria/testes.

export interface RestoreScrollOptions {
  targetY: number;
  /** Máximo de tentativas. Default: 30 (~500ms a 60fps). */
  maxAttempts?: number;
  /** Timeout absoluto em ms. Default: 1500. */
  timeoutMs?: number;
  /** Diferença aceitável entre `scrollY` e `targetY`. Default: 4px. */
  tolerance?: number;
}

export interface RestoreScrollResult {
  ok: boolean;
  finalY: number;
  attempts: number;
  reason?:
    | "target_zero"
    | "no_window"
    | "clamped_height"
    | "timed_out"
    | "max_attempts";
}

interface ScrollAdapter {
  now(): number;
  getScrollHeight(): number;
  getViewportHeight(): number;
  getScrollY(): number;
  scrollTo(y: number): void;
  schedule(cb: () => void): void;
}

const defaultAdapter: ScrollAdapter = {
  now: () =>
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  getScrollHeight: () =>
    document.scrollingElement?.scrollHeight ??
    document.documentElement.scrollHeight ??
    0,
  getViewportHeight: () => window.innerHeight ?? 0,
  getScrollY: () =>
    window.scrollY ?? document.scrollingElement?.scrollTop ?? 0,
  scrollTo: (y: number) => window.scrollTo({ top: y, behavior: "auto" }),
  schedule: (cb: () => void) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => cb());
    } else {
      setTimeout(cb, 16);
    }
  },
};

/**
 * Tenta restaurar o scroll para `targetY`, tolerando crescimento progressivo
 * do conteúdo (virtualizador medindo itens). Retorna o resultado final.
 *
 * Uso assíncrono — resolve quando converge ou esgota tentativas/timeout.
 */
export function restoreScrollY(
  options: RestoreScrollOptions,
  adapter: ScrollAdapter = defaultAdapter,
): Promise<RestoreScrollResult> {
  const targetY = Math.max(0, Math.floor(options.targetY));
  const maxAttempts = options.maxAttempts ?? 30;
  const timeoutMs = options.timeoutMs ?? 1500;
  const tolerance = Math.max(0, options.tolerance ?? 4);

  if (targetY <= 0) {
    return Promise.resolve({
      ok: true,
      finalY: adapter.getScrollY(),
      attempts: 0,
      reason: "target_zero",
    });
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve({
      ok: false,
      finalY: 0,
      attempts: 0,
      reason: "no_window",
    });
  }

  const startedAt = adapter.now();
  let attempts = 0;
  let lastScrollHeight = -1;

  return new Promise<RestoreScrollResult>((resolve) => {
    const tick = () => {
      attempts++;
      const elapsed = adapter.now() - startedAt;

      // 1) Verifica se o conteúdo já tem altura suficiente para caber o alvo.
      const scrollHeight = adapter.getScrollHeight();
      const viewport = adapter.getViewportHeight();
      const maxReachable = Math.max(0, scrollHeight - viewport);

      if (scrollHeight === lastScrollHeight && scrollHeight - viewport < targetY) {
        // Altura estabilizou abaixo do alvo: não conseguiremos chegar.
        if (attempts >= maxAttempts || elapsed >= timeoutMs) {
          // Posiciona no máximo possível para evitar saltar ao topo.
          adapter.scrollTo(maxReachable);
          return resolve({
            ok: false,
            finalY: adapter.getScrollY(),
            attempts,
            reason: "clamped_height",
          });
        }
      }
      lastScrollHeight = scrollHeight;

      // 2) Posiciona (clampa para o máximo alcançável evitando overshoot).
      const desired = Math.min(targetY, maxReachable);
      adapter.scrollTo(desired);

      // 3) Mede e decide.
      const actual = adapter.getScrollY();
      if (Math.abs(actual - targetY) <= tolerance) {
        return resolve({ ok: true, finalY: actual, attempts });
      }

      if (attempts >= maxAttempts) {
        return resolve({
          ok: false,
          finalY: actual,
          attempts,
          reason: "max_attempts",
        });
      }
      if (elapsed >= timeoutMs) {
        return resolve({
          ok: false,
          finalY: actual,
          attempts,
          reason: "timed_out",
        });
      }
      adapter.schedule(tick);
    };

    adapter.schedule(tick);
  });
}

/** Exposto para tests injetarem um adapter determinístico. */
export type { ScrollAdapter };
