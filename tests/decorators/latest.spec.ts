import { latest, wait } from 'decorio';

describe('latest', () => {
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

    @latest async method(input?: string): Promise<string> {
      // Pass the current signal to internal
      const { signal } = latest;

      return this.#internal(input, signal);
    }

    @latest arrow = async (input?: string): Promise<string> => {
      // Same logic for arrow‐field
      const { signal } = latest;

      return this.#internal(input, signal);
    };

    async #internal(input?: string, signal?: AbortSignal): Promise<string> {
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

  class TSTestExample {
    // @ts-expect-error sync methods are not allowed
    @latest syncMethod(): void {}

    // @ts-expect-error sync arrow functions are not allowed
    @latest syncArrow = () => void 0;

    @latest async asyncMethod() {}

    @latest asyncArrow = async () => {};
  }

  const variants = ['method', 'arrow'] as const;

  test('invokes immediately and cancels previous calls', async () => {
    for (const name of variants) {
      const e = new Example();

      // First call starts immediately
      const p1 = e[name]('a');
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenLastCalledWith('a');

      await vi.advanceTimersByTimeAsync(500);

      // Second call aborts first and starts new immediately
      const p2 = e[name]('b');
      expect(e.internalSpy).toHaveBeenCalledTimes(2);
      expect(e.internalSpy).toHaveBeenLastCalledWith('b');

      // The first call's signal is aborted
      expect(e.signalSpy).toHaveBeenCalledTimes(1);

      // Advance timers to let internal finish
      await vi.advanceTimersByTimeAsync(1000);
      await expect(p1).resolves.toBe('ok b');
      await expect(p2).resolves.toBe('ok b');

      // Reset spies for next iteration
      e.internalSpy.mockClear();
      e.signalSpy.mockClear();
    }
  });

  test('ignores arguments when aborting', async () => {
    for (const name of variants) {
      const e = new Example();

      // Call with 'x'
      const p1 = e[name]('x');
      expect(e.internalSpy).toHaveBeenCalledWith('x');

      // Call with 'y' also aborts previous 'x' invocation
      const p2 = e[name]('y');
      expect(e.internalSpy).toHaveBeenCalledWith('y');
      expect(e.signalSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      await expect(p1).resolves.toBe('ok y');
      await expect(p2).resolves.toBe('ok y');

      e.internalSpy.mockClear();
      e.signalSpy.mockClear();
    }
  });

  test('per-instance isolation: one instance does not cancel another', async () => {
    for (const name of variants) {
      const e1 = new Example();
      const e2 = new Example();

      const p1 = e1[name]('i1');
      const p2 = e2[name]('i2');

      // Each instance starts its own call
      expect(e1.internalSpy).toHaveBeenCalledTimes(1);
      expect(e2.internalSpy).toHaveBeenCalledTimes(1);

      // No cross-abort between instances
      expect(e1.signalSpy).toHaveBeenCalledTimes(0);
      expect(e2.signalSpy).toHaveBeenCalledTimes(0);

      await vi.advanceTimersByTimeAsync(1000);
      await expect(p1).resolves.toBe('ok i1');
      await expect(p2).resolves.toBe('ok i2');

      e1.internalSpy.mockClear();
      e2.internalSpy.mockClear();
    }
  });

  test('works with private methods', async () => {
    class PrivateExample extends Example {
      private(input: string) {
        return this.#private(input);
      }

      @latest async #private(input: string): Promise<string> {
        this.internalSpy(input);

        return input.repeat(2);
      }
    }

    const e = new PrivateExample();

    const p1 = e.private('z');
    const p2 = e.private('x');
    expect(e.internalSpy).toHaveBeenCalledTimes(2);
    await expect(p1).resolves.toBe('xx');
    await expect(p2).resolves.toBe('xx');
  });

  test('inherits behavior in subclasses', async () => {
    class Base {
      @latest async double(n: number): Promise<number> {
        return n * 2;
      }
    }

    class Sub extends Base {}

    const s = new Sub();
    const p1 = s.double(4);
    const p2 = s.double(5);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p1).resolves.toBe(10);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p2).resolves.toBe(10);
  });
});
