import { decorate, emplace } from '~/internal';

/** @internal */
type State = {
  call: Promise<unknown> | null;
};

/**
 * 🎯 Decorator `@mutex` ensures that at most one invocation of an async
 * method is in flight at any time. While the decorated method is still
 * running, all subsequent calls - regardless of their arguments - will
 * return the same Promise as the first call, until it settles.
 *
 * ⚠️ Arguments are ignored when determining whether to reuse the in-flight
 * call: every new invocation during the active period will simply
 * reuse that single Promise.
 *
 * If you need to dedupe calls by their arguments, consider using
 * `@singleflight` instead.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   @mutex async reload(): Promise<void> { ... }
 * }
 *
 * const e = new Example();
 * e.reload(); // fires immediately
 * e.reload(); // returns same Promise, does not re-fetch
 * ```
 */
export function mutex<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R>
): (...args: A) => R;
export function mutex<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassFieldDecoratorContext<object, (...args: A) => R>
): (originalFn: (...args: A) => R) => (...args: A) => R;
export function mutex<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R> | ClassFieldDecoratorContext<object, (...args: A) => R>
): unknown {
  const apply = (originalFn: (...args: A) => R): ((...args: A) => R) => {
    const storage = new Map<object, State>();

    return function (this: object, ...args: A): R {
      // Retrieve or initialize the state object for this instance
      const state = emplace(
        storage,
        this,
        (): State => ({
          call: null
        })
      );

      if (state.call) {
        return state.call as R;
      }

      // 🚀 No existing call found: invoke the original function
      const result = originalFn.apply(this, args);

      // 📦 Cache this Promise
      state.call = result;

      return result.finally(() => {
        state.call = null;
      }) as R;
    };
  };

  return decorate(value, context, apply);
}
