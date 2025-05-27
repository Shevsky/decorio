import { decorate, emplace } from '~/internal';

/** @internal */
type State = {
  args: Array<unknown> | null;
  result: unknown;
};

/**
 * 🎯 Decorator ensures a method is only executed once per unique argument list.
 * Subsequent calls with the same arguments return the cached result.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   @once compute(x: number): number {
 *     console.log('Computing', x);
 *
 *     return x * 2;
 *   }
 * }
 *
 * const e = new Example();
 * e.compute(3); // logs 'Computing 3', returns 6
 * e.compute(3); // returns cached 6, no log
 * ```
 */
export function once<A extends Array<unknown>, R>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R>
): (...args: A) => R;
export function once<A extends Array<unknown>, R>(
  value: unknown,
  context: ClassFieldDecoratorContext<object, (...args: A) => R>
): (originalFn: (...args: A) => R) => (...args: A) => R;
export function once<A extends Array<unknown>, R>(
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
          args: null,
          result: null
        })
      );

      // 🔍 If we have previous args, compare lengths and each value
      if (state.args && state.args.length === args.length && state.args.every((latestArg, index) => latestArg === args[index])) {
        // ↩️ Return cached result
        return state.result as R;
      }

      // 🚀 No cache hit: invoke the original function
      const result = originalFn.apply(this, args);

      // 🗄️ Store new arguments and result
      storage.set(this, { args, result });

      // 🕸️ If result is a Promise, clear cache on rejection
      if (result instanceof Promise) {
        void result.catch(() => {
          if (storage.get(this)?.args === args) {
            storage.delete(this);
          }
        });
      }

      return result;
    };
  };

  return decorate(value, context, apply);
}
