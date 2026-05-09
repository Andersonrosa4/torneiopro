// Throttle "leading + trailing" para persistência em sessionStorage.
//
// Por que não rAF puro?
// - rAF coalesce a ~60Hz; em rolagem contínua isso ainda dispara ~60 writes/s
//   com `JSON.stringify(rows)` (centenas de objetos). Custa CPU e fragmenta
//   o GC. Em produção, um intervalo de ~250ms cobre o caso de uso (retomar
//   posição após refresh) sem desperdiçar trabalho.
//
// Garantias do throttle implementado:
// - Leading: a 1ª chamada executa imediatamente (estado fresco logo no início).
// - Trailing: se chegaram chamadas durante o intervalo, agenda 1 execução final
//   no fim — garante que a ÚLTIMA posição de scroll é persistida.
// - `flush()`: força execução imediata da última chamada pendente (use em
//   `visibilitychange`/`pagehide` para não perder estado se a aba fechar).
// - `cancel()`: descarta pendentes (cleanup de efeito).

export interface ThrottleHandle<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;
  flush: () => void;
  cancel: () => void;
  /** Para diagnóstico/testes: total de execuções reais do underlying fn. */
  readonly callCount: number;
}

export interface ThrottleOptions {
  intervalMs?: number;
  /** Injetável para testes determinísticos. */
  now?: () => number;
}

const realNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export function createThrottledPersister<T extends (...args: any[]) => void>(
  fn: T,
  options: ThrottleOptions = {},
): ThrottleHandle<T> {
  const interval = Math.max(0, options.intervalMs ?? 250);
  const now = options.now ?? realNow;

  let lastCallAt = -Infinity;
  let pendingArgs: Parameters<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let callCount = 0;

  const invoke = (args: Parameters<T>) => {
    lastCallAt = now();
    callCount++;
    pendingArgs = null;
    fn(...args);
  };

  const scheduleTrailing = (delay: number) => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      // Pode ter sido cancelado/flushado nesse meio tempo.
      if (pendingArgs) invoke(pendingArgs);
    }, Math.max(0, delay));
  };

  const throttled = ((...args: Parameters<T>) => {
    const elapsed = now() - lastCallAt;
    pendingArgs = args; // sempre guarda os args mais recentes (trailing)
    if (elapsed >= interval) {
      // Leading: dispara agora.
      invoke(args);
    } else {
      // Dentro do intervalo: agenda trailing para o fim da janela.
      scheduleTrailing(interval - elapsed);
    }
  }) as ThrottleHandle<T>;

  throttled.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingArgs) invoke(pendingArgs);
  };

  throttled.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
  };

  Object.defineProperty(throttled, "callCount", {
    get: () => callCount,
  });

  return throttled;
}
