import { decorate, emplace, resolvers } from '~/internal';

/** @internal */
type State = {
  pending: number;
  tail: Promise<void> | null;
};

/**
 * 🎯 Decorator `@mutex` ensures that an async method never runs concurrently.
 *
 * Every invocation of the decorated method is executed strictly one at a time.
 * If the method is called again while a previous call is still running,
 * the new call will wait in a queue until all earlier calls have finished.
 *
 * Unlike `@singleflight`, this decorator:
 * - Does NOT return the same Promise for concurrent calls;
 * - Runs every invocation independently with its own arguments and result;
 * - Guarantees that each call will eventually execute - queued behind previously scheduled ones.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   @mutex async save(data: string): Promise<void> { ... }
 * }
 *
 * const e = new Example();
 * e.save('A'); // runs immediately
 * e.save('B'); // waits until A finishes
 * e.save('C'); // waits until B finishes
 * // start A → end A → start B → end B → start C → end C
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
          pending: 0,
          tail: null
        })
      );

      ++state.pending;

      const { promise, resolve, reject } = resolvers<Awaited<R>>();

      const finalize = () => {
        if (!--state.pending) {
          state.tail = null;
        }
      };

      const execute = () => {
        try {
          return originalFn.apply(this, args).then(resolve).catch(reject).finally(finalize);
        } catch (error) {
          finalize();
          reject(error);
        }
      };

      state.tail = state.tail ? state.tail.then(execute) : execute();

      return promise;
    };
  };

  return decorate(value, context, apply);
}
