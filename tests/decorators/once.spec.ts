import { once } from 'decorio';

describe('once', () => {
  class Example {
    readonly syncSpy = vi.fn();
    readonly asyncSpy = vi.fn();

    @once syncMethod(a: number, b: number): number {
      this.syncSpy(a, b);

      return a + b;
    }

    @once
    async asyncMethod(a: number, b: number): Promise<number> {
      this.asyncSpy(a, b);

      return Promise.resolve(String(a + b)).then((v) => Number(v));
    }

    @once syncArrow = (x: string): string => {
      this.syncSpy(x);

      return x.toUpperCase();
    };

    @once
    asyncArrow = async (x: string): Promise<string> => {
      this.asyncSpy(x);

      return Promise.resolve(x.toLowerCase());
    };
  }

  test('caches return value for identical sync calls', () => {
    const e = new Example();

    // First call: original invoked
    const r1 = e.syncMethod(1, 2);
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r1).toBe(3);

    // Second call with same args: cached result, no new invocation
    const r2 = e.syncMethod(1, 2);
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r2).toBe(3);
    expect(r2).toBe(r1);
  });

  test('recomputes for different sync arguments', () => {
    const e = new Example();

    const r1 = e.syncMethod(2, 3);
    expect(e.syncSpy).toHaveBeenCalledTimes(1);

    const r2 = e.syncMethod(3, 4);
    expect(e.syncSpy).toHaveBeenCalledTimes(2);
    expect(r2).toBe(7);
    expect(r2).not.toBe(r1);
  });

  test('caches pending promise and returns same object for async calls', async () => {
    const e = new Example();

    // First async invocation returns a Promise
    const p1 = e.asyncMethod(2, 5);
    expect(e.asyncSpy).toHaveBeenCalledTimes(1);

    // Second call before resolution returns same Promise object
    const p2 = e.asyncMethod(2, 5);
    expect(e.asyncSpy).toHaveBeenCalledTimes(1);
    expect(p2).toBe(p1);

    // Await the promise
    await expect(p1).resolves.toBe(7);
    await expect(p2).resolves.toBe(7);
  });

  test('re-invokes async method for different args', async () => {
    const e = new Example();

    const p1 = e.asyncMethod(1, 1);
    await expect(p1).resolves.toBe(2);
    expect(e.asyncSpy).toHaveBeenCalledTimes(1);

    const p2 = e.asyncMethod(2, 2);
    expect(p2).not.toBe(p1);
    await expect(p2).resolves.toBe(4);
    expect(e.asyncSpy).toHaveBeenCalledTimes(2);
  });

  test('clears cache on promise rejection', async () => {
    class RejectExample extends Example {
      @once async fail(shouldThrow: boolean): Promise<string> {
        this.asyncSpy(shouldThrow);

        if (shouldThrow) {
          throw new Error('oops');
        }

        return 'ok';
      }
    }

    const e = new RejectExample();

    // First call rejects
    await expect(e.fail(true)).rejects.toThrow('oops');
    expect(e.asyncSpy).toHaveBeenCalledTimes(1);

    // After rejection, new call should invoke again
    await expect(e.fail(true)).rejects.toThrow('oops');
    expect(e.asyncSpy).toHaveBeenCalledTimes(2);
  });

  test('cache is per-instance and per-arguments', async () => {
    const e1 = new Example();
    const e2 = new Example();

    // e1 sync
    expect(e1.syncMethod(1, 1)).toBe(2);
    expect(e1.syncSpy).toHaveBeenCalledTimes(1);
    expect(e2.syncMethod(1, 1)).toBe(2);
    expect(e2.syncSpy).toHaveBeenCalledTimes(1);

    // e1 async
    const p1 = e1.asyncMethod(3, 4);
    const p2 = e2.asyncMethod(3, 4);
    await expect(p1).resolves.toBe(7);
    await expect(p2).resolves.toBe(7);
    expect(e1.asyncSpy).toHaveBeenCalledTimes(1);
    expect(e2.asyncSpy).toHaveBeenCalledTimes(1);
  });

  test('handles calls without arguments', () => {
    class NoArgsExample extends Example {
      @once noArgsMethod(): string {
        this.syncSpy();

        return 'hello';
      }
    }
    const e = new NoArgsExample();

    const r1 = e.noArgsMethod();
    const r2 = e.noArgsMethod();
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r1).toBe('hello');
    expect(r2).toBe('hello');
  });

  test('works with arrow-function fields', () => {
    const e = new Example();

    const r1 = e.syncArrow('hi');
    const r2 = e.syncArrow('hi');
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r1).toBe('HI');
    expect(r2).toBe('HI');
  });

  test('works correctly with private methods', async () => {
    class PrivateExample extends Example {
      async asyncPrivate(x: number) {
        return this.#asyncPrivate(x);
      }

      syncPrivate(y: string) {
        return this.#syncPrivate(y);
      }

      @once async #asyncPrivate(x: number): Promise<number> {
        this.asyncSpy();

        return x * 2;
      }

      @once #syncPrivate(y: string): string {
        this.syncSpy();

        return y.repeat(2);
      }
    }

    const inst = new PrivateExample();

    // Async private method: two calls share result
    const p1 = inst.asyncPrivate(3);
    const p2 = inst.asyncPrivate(3);
    expect(inst.asyncSpy).toHaveBeenCalledTimes(1);
    await expect(p1).resolves.toBe(6);
    await expect(p2).resolves.toBe(6);

    // Sync private method: two calls share result
    const s1 = inst.syncPrivate('a');
    const s2 = inst.syncPrivate('a');
    expect(inst.syncSpy).toHaveBeenCalledTimes(1);
    expect(s1).toBe('aa');
    expect(s2).toBe('aa');

    // Different args re-invoke
    const p3 = inst.asyncPrivate(4);
    await expect(p3).resolves.toBe(8);
    const s3 = inst.syncPrivate('b');
    expect(s3).toBe('bb');
  });
});
