import { decorate } from '~/internal';

class TimeoutExceededError extends Error {
  constructor(timeoutMs: number) {
    super();

    this.name = 'TimeoutExceededError';
    this.message = `timeout ${timeoutMs}ms exceeded`;
  }
}

type TimeoutDecorator = {
  <A extends Array<unknown>, R extends Promise<unknown>>(
    value: unknown,
    context: ClassMethodDecoratorContext<object, (...args: A) => R>
  ): (...args: A) => R;
  <A extends Array<unknown>, R extends Promise<unknown>>(
    value: unknown,
    context: ClassFieldDecoratorContext<object, (...args: A) => R>
  ): (originalFn: (...args: A) => R) => (...args: A) => R;
};

/**
 * 🎯 Global AbortSignal for the currently running decorated invocation.
 * ❗️ Only set during the actual original method call, otherwise undefined.
 */
timeout.signal = undefined as AbortSignal | undefined;

/**
 * 🎯 Decorator `@timeout` enforces a maximum execution time for an async method.
 * If the method does not complete within the specified number of milliseconds,
 * it will be aborted via an `AbortSignal`.
 *
 * Decorator exposes a static property `timeout.signal` that the method can read at runtime.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   @timeout(500) async fetchData(id: string): Promise<Data> {
 *     const { signal } = timeout;
 *
 *     return fetch(`/api/data/${id}`, { signal }).then((r) => r.json());
 *   }
 * }
 *
 * const e = new Example();
 * try {
 *   const data = await e.fetchData("123");
 *   console.log('Got data:', data);
 * } catch (e) {
 *   console.error(e.message); // If over 500 ms: "timeout 500ms exceeded"
 * }
 * ```
 */
export function timeout(timeoutMs: number): TimeoutDecorator {
  return <A extends Array<unknown>, R extends Promise<unknown>>(
    value: unknown,
    context: ClassMethodDecoratorContext<object, (...args: A) => R> | ClassFieldDecoratorContext<object, (...args: A) => R>
  ) => {
    const apply = (originalFn: (...args: A) => R): ((...args: A) => R) => {
      return function (this: object, ...args: A) {
        // ✨ Create a fresh AbortController for this run
        const controller = new AbortController();
        const id = setTimeout(() => {
          controller.abort(new TimeoutExceededError(timeoutMs));
        }, timeoutMs);

        let result: R;

        try {
          // Expose the signal globally during the actual original method execution
          timeout.signal = controller.signal;

          result = originalFn.apply(this, args);
        } finally {
          // 🧹 Always clear the global signal right after invocation
          timeout.signal = undefined;
        }

        void result.finally(() => {
          clearTimeout(id);
        });

        return result;
      } as (...args: A) => R;
    };

    return decorate(value, context, apply);
  };
}
