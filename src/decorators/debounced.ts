import { decorate, emplace } from '~/internal';

/** @internal */
type State = {
  callIndex: number;
  resolvers: Array<[(value: any) => void, (error: unknown) => void]>;
  timeout: number | null;
  controller: AbortController | null;
};

type DebouncedDecorator = {
  <A extends Array<unknown>, R extends Promise<unknown> | void>(
    value: unknown,
    context: ClassMethodDecoratorContext<object, (...args: A) => R>
  ): (...args: A) => R;
  <A extends Array<unknown>, R extends Promise<unknown> | void>(
    value: unknown,
    context: ClassFieldDecoratorContext<object, (...args: A) => R>
  ): (originalFn: (...args: A) => R) => (...args: A) => R;
};

/**
 * 🎯 Global AbortSignal for the currently running decorated invocation.
 * ❗️ Only set during the actual original method call, otherwise undefined.
 */
debounced.signal = undefined as AbortSignal | undefined;

/**
 * 🎯 Creates a decorator that debounces method calls by `delayMs` milliseconds.
 *
 * Each burst of calls within the delay window collapses into a single invocation.
 * All returned Promises resolve (or reject) with the result of that single, last call.
 *
 * ⚠️ Ignores all arguments when deciding what to cancel: every new call, regardless of its parameters,
 * will abort whatever was running before.
 *
 * Usage:
 * ```typescript
 * class Searcher {
 *   @debounced(300) async search(query: string): Promise<Array<string>> { ... }
 * }
 *
 * const s = new Searcher();
 * s.search('a');
 * s.search('ab');
 * s.search('abc'); // only this one triggers after 300ms
 * ```
 *
 * Usage with debounced.signal:
 * ```typescript
 * class Fetcher {
 *   @debounced(500) async fetchData(id: string): Promise<object> {
 *     const { signal } = debounced;
 *
 *     // Pass the signal to fetch so that prior calls get aborted
 *     return fetch(`/api/data/${id}`, { signal }).then((r) => r.json());
 *   }
 * }
 *
 * const f = new Fetcher();
 * f.fetchData('foo');
 * f.fetchData('bar');
 * ```
 *
 * @param delayMs how long to wait (ms) after the last call before executing
 */
export function debounced(delayMs: number): DebouncedDecorator {
  return <A extends Array<unknown>, R extends Promise<unknown> | void>(
    value: unknown,
    context: ClassMethodDecoratorContext<object, (...args: A) => R> | ClassFieldDecoratorContext<object, (...args: A) => R>
  ) => {
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
            timeout: null,
            controller: null
          })
        );

        // 🌪️ If a timer is already pending, clear it (reset debounce)
        if (state.timeout !== null) {
          clearTimeout(state.timeout);
          state.timeout = null;
        }

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

          // ⏱️ Schedule the actual invocation after delay
          state.timeout = setTimeout(() => {
            // ✨ Create a fresh AbortController for this run
            const controller = new AbortController();
            state.controller = controller;

            Promise.resolve()
              .then(() => {
                try {
                  // Expose the signal globally during the actual original method execution
                  debounced.signal = controller.signal;

                  return originalFn.apply(this, args);
                } finally {
                  // 🧹 Always clear the global signal right after invocation
                  debounced.signal = undefined;
                }
              })
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
          }, delayMs);
        });
      } as (...args: A) => R;
    };

    return decorate(value, context, apply);
  };
}
