import { wait, debounced } from 'decorio';

describe('@debounced', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  class Example {
    readonly internalSpy = vi.fn();
    readonly signalSpy = vi.fn();

    @debounced(500) async method(input?: unknown): Promise<string> {
      // Call the private helper, passing the current debounced.signal
      const { signal } = debounced;

      return this.#internal(input, signal);
    }

    @debounced(500) arrow = async (input?: unknown): Promise<string> => {
      // Same logic for arrow‐field
      const { signal } = debounced;

      return this.#internal(input, signal);
    };

    // Private helper that simulates work and optionally listens to abort
    async #internal(input?: unknown, signal?: AbortSignal): Promise<string> {
      this.internalSpy(input);

      if (signal) {
        signal.addEventListener('abort', () => this.signalSpy());
      }

      await wait(1000);

      if (signal && signal.aborted) {
        throw new Error('Aborted');
      }

      if (typeof input === 'string' && input.startsWith('err')) {
        throw new Error(`fail ${String(input)}`);
      }

      return `ok ${String(input)}`;
    }
  }

  // This class exists purely to assert TypeScript typings:
  // 1️⃣ Decorating a void-returning sync method or async method is allowed
  // 2️⃣ Decorating a sync method returning a non-void value should produce a TS error
  class TSTestExample {
    @debounced(1) syncMethodVoid(): void {}

    @debounced(1) syncArrowVoid = () => void 0;

    // @ts-expect-error sync methods returning a non-void value are disallowed
    @debounced(1) syncMethodNumber(): number {
      return 5;
    }

    // @ts-expect-error sync methods returning a non-void value are disallowed
    @debounced(1) syncArrowNumber = () => 5;

    @debounced(1) async asyncMethodVoid(): Promise<void> {}

    @debounced(1) asyncArrowVoid = async () => void 0;

    @debounced(1) async asyncMethodNumber(): Promise<number> {
      return 5;
    }

    @debounced(1) asyncArrowNumber = async () => 5;
  }

  const methods = ['method', 'arrow'] as const;

  test('executes only the last call after the debounce delay', async () => {
    for (const method of methods) {
      const e = new Example();

      // Schedule three calls in quick succession
      const result1 = e[method]('a');
      const result2 = e[method]('b');
      const result3 = e[method]('c');

      // Advance time by 400ms: still within debounce window ➡️ no invocation yet
      await vi.advanceTimersByTimeAsync(400);
      expect(e.internalSpy).toHaveBeenCalledTimes(0);

      // Advance by another 100ms ➡️ total 500ms ➡️ the last call ('c') fires once
      await vi.advanceTimersByTimeAsync(100);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);

      // Let the internal async work finish
      await vi.runAllTimersAsync();

      // All three promises resolve to the result of the 'c' call
      await expect(result1).resolves.toBe('ok c');
      await expect(result2).resolves.toBe('ok c');
      await expect(result3).resolves.toBe('ok c');
    }
  });

  test('debounced.signal aborts previous pending invocation', async () => {
    for (const method of methods) {
      const e = new Example();

      // First call kicks off after 500ms
      const result1 = e[method]('a');
      await vi.advanceTimersByTimeAsync(500);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);

      // Second call resets debounce and aborts the previous in-flight controller
      const result2 = e[method]('b');
      // The signalSpy should fire once when the first controller.abort() happens
      expect(e.signalSpy).toHaveBeenCalledTimes(1);

      // Advance another 500ms ➡️ second call fires
      await vi.advanceTimersByTimeAsync(500);
      expect(e.internalSpy).toHaveBeenCalledTimes(2);

      // Finish pending async work
      await vi.runAllTimersAsync();
      // No further aborts should happen
      expect(e.signalSpy).toHaveBeenCalledTimes(1);

      // Both promises resolve to the 'b' result
      await expect(result1).resolves.toBe('ok b');
      await expect(result2).resolves.toBe('ok b');
    }
  });

  test('resets debounce timer when a new call arrives', async () => {
    for (const method of methods) {
      const e = new Example();

      // First call at t=0
      const result1 = e[method]('x');
      await vi.advanceTimersByTimeAsync(300);

      // Second call at t=300ms resets the timer
      const result2 = e[method]('y');

      // Move to t=600ms: first timer would have fired at t=500 but was cleared
      await vi.advanceTimersByTimeAsync(300);
      expect(e.internalSpy).toHaveBeenCalledTimes(0);

      // Move to t=800ms: now the second timer (from t=300ms) fires
      await vi.advanceTimersByTimeAsync(200);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);

      await vi.runAllTimersAsync();

      // Both promises get the 'y' result
      await expect(result1).resolves.toBe('ok y');
      await expect(result2).resolves.toBe('ok y');
    }
  });

  test('correctly collapses and propagates errors', async () => {
    for (const method of methods) {
      const e = new Example();

      // Two calls that both start with 'err' ➡️ only the last should run
      const result1 = e[method]('err1');
      const result2 = e[method]('err2');

      // After 500ms, only the second call fires
      await vi.advanceTimersByTimeAsync(500);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenCalledWith('err2');

      // Finish pending async work
      await vi.runAllTimersAsync();

      // Both promises reject with the same last error
      await expect(result1).rejects.toThrow('fail err2');
      await expect(result2).rejects.toThrow('fail err2');
    }
  });

  test('each instance maintains its own debounce state', async () => {
    for (const method of methods) {
      const e1 = new Example();
      const e2 = new Example();

      // Two independent instances, same timing
      const result1 = e1[method]('foo');
      const result2 = e2[method]('bar');

      await vi.advanceTimersByTimeAsync(500);

      // Each instance should fire exactly once with its own argument
      expect(e1.internalSpy).toHaveBeenCalledTimes(1);
      expect(e1.internalSpy).toHaveBeenCalledWith('foo');
      expect(e2.internalSpy).toHaveBeenCalledTimes(1);
      expect(e2.internalSpy).toHaveBeenCalledWith('bar');

      await vi.runAllTimersAsync();

      await expect(result1).resolves.toBe('ok foo');
      await expect(result2).resolves.toBe('ok bar');
    }
  });

  test('handles calls with no arguments (undefined input)', async () => {
    for (const method of methods) {
      const e = new Example();

      // Call twice without arguments
      const p1 = e[method]();
      const p2 = e[method]();

      await vi.advanceTimersByTimeAsync(500);
      await vi.runAllTimersAsync();

      // Both should resolve to 'ok undefined'
      await expect(p1).resolves.toBe('ok undefined');
      await expect(p2).resolves.toBe('ok undefined');
    }
  });

  test('allows new debounce cycle after previous completion', async () => {
    for (const method of methods) {
      const e = new Example();

      // First batch
      const p1 = e[method]('first');
      await vi.advanceTimersByTimeAsync(500);
      await vi.runAllTimersAsync();
      await expect(p1).resolves.toBe('ok first');

      // After the first finishes, we can start a brand-new cycle
      const p2 = e[method]('second');
      await vi.advanceTimersByTimeAsync(500);
      await vi.runAllTimersAsync();
      await expect(p2).resolves.toBe('ok second');
    }
  });

  test('works with private methods and private arrow fields', async () => {
    class PrivateExample {
      @debounced(100) async #method(value: string) {
        return value;
      }

      @debounced(100) #arrow = async (value: string) => value;

      method(value: string) {
        return this.#method(value);
      }

      arrow = (value: string) => {
        return this.#arrow(value);
      };
    }

    const e = new PrivateExample();
    const rM = e.method('A');
    const rA = e.arrow('B');

    // Advance past debounce window + async work
    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTimersAsync();

    // Each returns its own correct value
    await expect(rM).resolves.toBe('A');
    await expect(rA).resolves.toBe('B');
  });
});
