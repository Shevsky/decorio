import { decorate, emplace } from '~/internal';

/** @internal */
type State = {
  calls: Map<Array<unknown>, unknown>;
};

/** @internal */
const storages = new WeakMap<Function, Map<object, State>>();

/**
 * 🚨 Clears the cache for the given function (original or patched).
 * If the function was decorated with `@cached`, its per-instance
 * caches will be emptied, forcing subsequent calls to re-run logic.
 *
 * @param target the method to invalidate
 */
cached.invalidate = (target: Function): void => {
  const storage = storages.get(target);

  if (storage) {
    storage.clear();
  }
};

/**
 * 🎯 Decorator `@cached` caches every unique (args -> result) pair
 * on a per-instance basis. Subsequent calls with the same arguments
 * return the cached result (instant for sync, same Promise for async).
 *
 * A static `cached.invalidate(fn)` method allows clearing the cache
 * for a given method/field so that subsequent calls re-invoke the original.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   @cached sum(a: number, b: number): number {
 *     return a + b;
 *   }
 * }
 *
 * const e = new Example();
 * e.sum(1, 2); // computes 3
 * e.sum(1, 2); // returns 3 from cache
 *
 * // flush the cache for this method
 * cached.invalidate(e.sum);
 * ```
 */
export function cached<A extends Array<unknown>, R>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R>
): (...args: A) => R;
export function cached<A extends Array<unknown>, R>(
  value: unknown,
  context: ClassFieldDecoratorContext<object, (...args: A) => R>
): (originalFn: (...args: A) => R) => (...args: A) => R;
export function cached<A extends Array<unknown>, R>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R> | ClassFieldDecoratorContext<object, (...args: A) => R>
): unknown {
  const apply = (originalFn: (...args: A) => R): ((...args: A) => R) => {
    const storage = new Map<object, State>();

    const patchedFn = function (this: object, ...args: A): R {
      // Retrieve or initialize the state object for this instance
      const state = emplace(
        storage,
        this,
        (): State => ({
          calls: new Map()
        })
      );

      // 🔄 Check for an existing entry with identical args
      for (const [callArgs, callResult] of state.calls.entries()) {
        if (callArgs.length === args.length && callArgs.every((arg, index) => arg === args[index])) {
          return callResult as R;
        }
      }

      // 🚀 No cache hit: invoke the original function
      const result = originalFn.apply(this, args);

      // 🗄️ Store the fresh result in the cache
      state.calls.set(args, result);

      // 🕸️ If it's a Promise, remove from cache on rejection
      if (result instanceof Promise) {
        void result.catch(() => state.calls.delete(args));
      }

      return result;
    };

    // 🌐 Register both original and patched function in global storages
    storages.set(originalFn, storage);
    storages.set(patchedFn, storage);

    return patchedFn;
  };

  return decorate(value, context, apply);
}
