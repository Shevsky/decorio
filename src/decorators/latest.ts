import { decorate, emplace } from '~/internal';

/** @internal */
type State = {
  callIndex: number;
  resolvers: Array<[(value: any) => void, (error: unknown) => void]>;
  controller: AbortController | null;
};

/**
 * 🎯 Global AbortSignal for the currently running decorated invocation.
 * ❗️ Only set during the actual original method call, otherwise undefined.
 */
latest.signal = undefined as AbortSignal | undefined;

/**
 * 🎯 Decorator `@latest` ensures that an async method runs *immediately* on each invocation,
 * but automatically cancels any prior in-flight invocation (via `AbortSignal`) if it's still pending.
 *
 * Think of it as `@debounced(0)` - it collapses overlapping calls - but it
 * executes synchronously (no deferral).
 *
 * ⚠️ Ignores all arguments when deciding what to cancel: every new call, regardless of its parameters,
 * will abort whatever was running before.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   @latest async fetchData(id: string): Promise<Data> {
 *     const { signal } = latest;
 *
 *     return fetch(`/api/data/${id}`, { signal }).then((r) => r.json());
 *   }
 * }
 *
 * const e = new Example();
 * e.fetchData('1'); // fires immediately
 * e.fetchData('2'); // aborts the '1' request and fires '2' immediately
 * ```
 */
export function latest<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R>
): (...args: A) => R;
export function latest<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassFieldDecoratorContext<object, (...args: A) => R>
): (originalFn: (...args: A) => R) => (...args: A) => R;
export function latest<A extends Array<unknown>, R extends Promise<unknown>>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R> | ClassFieldDecoratorContext<object, (...args: A) => R>
): unknown {
  const apply = (originalFn: (...args: A) => R): ((...args: A) => R) => {
    const storage = new Map<object, State>();

    return function (this: object, ...args: A) {
      // Retrieve or initialize the state object for this instance
      const state = emplace(
        storage,
        this,
        (): State => ({
          callIndex: -1,
          resolvers: [],
          controller: null
        })
      );

      // ⛔ If there is an in-flight invocation, abort it
      if (state.controller !== null) {
        state.controller.abort();
        state.controller = null;
      }

      // 🔢 Increment the call index to identify the latest call
      const callIndex = ++state.callIndex;

      return new Promise((resolve: (value: Awaited<R>) => void, reject: (error: unknown) => void) => {
        // 📥 Queue up the resolve/reject callbacks
        state.resolvers.push([resolve, reject]);

        // ✨ Create a fresh AbortController for this run
        const controller = new AbortController();
        state.controller = controller;

        let result: R;

        try {
          // Expose the signal globally during the actual original method execution
          latest.signal = controller.signal;

          result = originalFn.apply(this, args);
        } finally {
          // 🧹 Always clear the global signal right after invocation
          latest.signal = undefined;
        }

        result
          .then((value) => {
            // 🚧 If a newer call has happened, ignore this result
            if (state.callIndex > callIndex) {
              return;
            }

            // 📤 Capture the pending resolvers and clear state
            const resolvers = [...state.resolvers];
            storage.delete(this);

            // ✅ Resolve all queued Promises with the obtained value
            for (const [resolve] of resolvers) {
              resolve(value as Awaited<R>);
            }
          })
          .catch((error) => {
            // 🚧 Ignore errors if a newer call is pending
            if (state.callIndex > callIndex) {
              return;
            }

            // 📤 Capture queued rejects and clear state
            const resolvers = [...state.resolvers];
            storage.delete(this);

            // ❌ Reject all queued Promises with the caught error
            for (const [, reject] of resolvers) {
              reject(error);
            }
          });
      });
    } as (...args: A) => R;
  };

  return decorate(value, context, apply);
}
