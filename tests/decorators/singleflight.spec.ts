import { wait, singleflight } from 'decorio';

describe('singleflight', () => {
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

    @singleflight async method(input?: unknown): Promise<string> {
      return this.#internal(input);
    }

    @singleflight arrow = async (input?: unknown): Promise<string> => {
      return this.#internal(input);
    };

    async #internal(input?: unknown): Promise<string> {
      this.internalSpy(input);

      await wait(1000);

      if (typeof input === 'string' && input.startsWith('err')) {
        throw new Error(`fail ${String(input)}`);
      }

      return `ok ${String(input)}`;
    }
  }

  class TSTestExample {
    // @ts-expect-error sync methods are not allowed
    @singleflight syncMethod(): void {}

    // @ts-expect-error sync arrow functions are not allowed
    @singleflight syncArrow = () => void 0;
  }

  const methods = ['method', 'arrow'] as const;

  test('should share in-flight promise for identical arguments', async () => {
    for (const method of methods) {
      const e = new Example();

      // First call triggers internal execution
      const result1 = e[method]('foo');
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'foo');
      await vi.advanceTimersByTimeAsync(500);

      // Second call with same argument returns the same promise
      const result2 = e[method]('foo');
      expect(result2).toBe(result1);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'foo');
      await vi.advanceTimersByTimeAsync(500);

      // Await resolution of the shared promise
      await expect(result1).resolves.toBe('ok foo');

      // Third call after resolution should trigger a new invocation
      const result3 = e[method]('foo');
      expect(result3).not.toBe(result2);
      expect(e.internalSpy).toHaveBeenCalledTimes(2);
      expect(e.internalSpy).toHaveBeenNthCalledWith(2, 'foo');
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result3).resolves.toBe('ok foo');
    }
  });

  test('should not dedupe calls with different arguments', async () => {
    for (const method of methods) {
      const e = new Example();

      // Call with 'foo'
      const result1 = e[method]('foo');
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'foo');
      await vi.advanceTimersByTimeAsync(500);

      // Call with 'bar' starts a new invocation
      const result2 = e[method]('bar');
      expect(result2).not.toBe(result1);
      expect(e.internalSpy).toHaveBeenCalledTimes(2);
      expect(e.internalSpy).toHaveBeenNthCalledWith(2, 'bar');
      await vi.advanceTimersByTimeAsync(500);

      // Call with 'baz' again new invocation
      const result3 = e[method]('baz');
      expect(result3).not.toBe(result2);
      expect(e.internalSpy).toHaveBeenCalledTimes(3);
      expect(e.internalSpy).toHaveBeenNthCalledWith(3, 'baz');

      // A new instance should have separate state
      const eButNew = new Example();
      const result4 = eButNew[method]('bar');
      expect(result4).not.toBe(result2);
      expect(e.internalSpy).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(500);
      await expect(result2).resolves.toBe('ok bar');
      await vi.advanceTimersByTimeAsync(500);
      await expect(result3).resolves.toBe('ok baz');
      await expect(result4).resolves.toBe('ok bar');
    }
  });

  test('should handle calls with no arguments', async () => {
    for (const method of methods) {
      const e = new Example();

      // Call without arguments twice
      const result1 = e[method]();
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      const result2 = e[method]();
      // Same promise returned
      expect(result1).toBe(result2);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      await expect(result1).resolves.toBe('ok undefined');
    }
  });

  test('should propagate errors for identical calls', async () => {
    for (const method of methods) {
      const e = new Example();

      // First error call
      const result1 = e[method]('err1');
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'err1');
      await vi.advanceTimersByTimeAsync(500);

      // Second call with same 'err1' reuses the promise
      const result2 = e[method]('err1');
      expect(result2).toBe(result1);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'err1');
      await vi.runAllTimersAsync();
      await expect(result1).rejects.toThrow('fail err1');
      await expect(result2).rejects.toThrow('fail err1');
    }
  });

  test('should work with private methods and arrow fields', async () => {
    class PrivateExample {
      readonly internalSpy = vi.fn();

      method(input?: unknown): Promise<string> {
        return this.#method(input);
      }

      arrow(input?: unknown): Promise<string> {
        return this.#arrow(input);
      }

      @singleflight async #method(input?: unknown): Promise<string> {
        return this.#internal(input);
      }

      @singleflight #arrow = async (input?: unknown): Promise<string> => {
        return this.#internal(input);
      };

      async #internal(input?: unknown): Promise<string> {
        this.internalSpy(input);

        await wait(1000);

        if (typeof input === 'string' && input.startsWith('err')) {
          throw new Error(`fail ${String(input)}`);
        }

        return `ok ${String(input)}`;
      }
    }

    for (const method of methods) {
      const e = new PrivateExample();

      // First call triggers invocation
      const result1 = e[method]('foo');
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'foo');
      await vi.advanceTimersByTimeAsync(500);

      // Second call reuses promise
      const result2 = e[method]('foo');
      expect(result2).toBe(result1);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'foo');
      await vi.advanceTimersByTimeAsync(500);
      await expect(result1).resolves.toBe('ok foo');

      // Third call creates new invocation
      const result3 = e[method]('foo');
      expect(result3).not.toBe(result2);
      expect(e.internalSpy).toHaveBeenCalledTimes(2);
      expect(e.internalSpy).toHaveBeenNthCalledWith(2, 'foo');
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result3).resolves.toBe('ok foo');
    }
  });

  test('should preserve behavior in subclasses', async () => {
    class SubClassExample extends Example {}

    for (const method of methods) {
      const e = new SubClassExample();

      const result1 = e[method]('foo');
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'foo');
      await vi.advanceTimersByTimeAsync(500);

      const result2 = e[method]('foo');
      expect(result2).toBe(result1);
      expect(e.internalSpy).toHaveBeenCalledTimes(1);
      expect(e.internalSpy).toHaveBeenNthCalledWith(1, 'foo');
      await vi.advanceTimersByTimeAsync(500);
      await expect(result1).resolves.toBe('ok foo');

      const result3 = e[method]('foo');
      expect(result3).not.toBe(result2);
      expect(e.internalSpy).toHaveBeenCalledTimes(2);
      expect(e.internalSpy).toHaveBeenNthCalledWith(2, 'foo');
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result3).resolves.toBe('ok foo');
    }
  });
});
