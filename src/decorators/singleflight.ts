import { decorate, emplace } from '~/internal';

/** @internal */
type State = {
  calls: Map<Array<unknown>, unknown>;
};

/**
 * 🎯 Decorator that ensures only a single in-flight invocation per argument list.
 * Subsequent calls with the same arguments return the same Promise until it settles.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   @singleflight async fetchData(id: string): Promise<Data> { ... }
 * }
 *
 * const e = new Example();
 * const p1 = e.fetchData('foo');
 * const p2 = e.fetchData('foo'); // returns same Promise as p1
 * ```
 */
export function singleflight<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R>
): (...args: A) => R;
export function singleflight<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassFieldDecoratorContext<object, (...args: A) => R>
): (originalFn: (...args: A) => R) => (...args: A) => R;
export function singleflight<A extends Array<unknown>, R extends Promise<unknown>>(
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
          calls: new Map()
        })
      );

      // 🔍 Look for an existing, in-flight call with identical arguments
      for (const [callArgs, callResult] of state.calls.entries()) {
        if (callArgs.length === args.length && callArgs.every((arg, index) => arg === args[index])) {
          // ↩️ Return the cached Promise if still pending
          return callResult as R;
        }
      }

      // 🚀 No existing call found: invoke the original function
      const result = originalFn.apply(this, args);

      // 📦 Cache this Promise under the argument list
      state.calls.set(args, result);

      // 🧹 Once the Promise settles, remove it from cache
      void result.finally(() => state.calls.delete(args));

      return result;
    };
  };

  return decorate(value, context, apply);
}
