import { cached } from 'decorio';

describe('@cached', () => {
  class Example {
    readonly syncSpy = vi.fn();
    readonly asyncSpy = vi.fn();

    @cached syncMethod(a: number, b: number): number {
      this.syncSpy(a, b);

      return a + b;
    }

    @cached arrowField = (x: string): string => {
      this.syncSpy(x);

      return x.toUpperCase();
    };

    @cached async asyncMethod(a: number): Promise<number> {
      this.asyncSpy(a);

      return a * 10;
    }
  }

  test('should cache sync method results for identical arguments', () => {
    const e = new Example();

    const r1 = e.syncMethod(1, 2);
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r1).toBe(3);

    const r2 = e.syncMethod(1, 2);
    // spy not called again, result is cached
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r2).toBe(3);
  });

  test('should compute new sync result for different arguments', () => {
    const e = new Example();

    const r1 = e.syncMethod(2, 3);
    const r2 = e.syncMethod(3, 4);

    expect(e.syncSpy).toHaveBeenCalledTimes(2);
    expect(r1).toBe(5);
    expect(r2).toBe(7);

    const r3 = e.syncMethod(2, 3);
    const r4 = e.syncMethod(3, 4);

    expect(e.syncSpy).toHaveBeenCalledTimes(2);
    expect(r3).toBe(r1);
    expect(r4).toBe(r2);
  });

  test('should cache arrow field results', () => {
    const e = new Example();

    const r1 = e.arrowField('hi');
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r1).toBe('HI');

    const r2 = e.arrowField('hi');
    expect(e.syncSpy).toHaveBeenCalledTimes(1);
    expect(r2).toBe('HI');
  });

  test('should cache in-flight promise for async methods', async () => {
    const e = new Example();

    const p1 = e.asyncMethod(5);
    expect(e.asyncSpy).toHaveBeenCalledTimes(1);

    const p2 = e.asyncMethod(5);
    // same promise returned
    expect(e.asyncSpy).toHaveBeenCalledTimes(1);
    expect(p2).toBe(p1);

    await expect(p1).resolves.toBe(50);
    await expect(p2).resolves.toBe(50);
  });

  test('should cache per-instance separately', () => {
    const e1 = new Example();
    const e2 = new Example();

    e1.syncMethod(1, 1);
    e1.syncMethod(1, 1);
    e2.syncMethod(1, 1);

    expect(e1.syncSpy).toHaveBeenCalledTimes(1);
    expect(e2.syncSpy).toHaveBeenCalledTimes(1);
  });

  test('should clear cache on promise rejection', async () => {
    class RejectExample extends Example {
      @cached async fail(shouldThrow: boolean): Promise<string> {
        this.asyncSpy(shouldThrow);

        if (shouldThrow) {
          throw new Error('error');
        }

        return 'ok';
      }
    }

    const e = new RejectExample();

    // first call rejects
    await expect(e.fail(true)).rejects.toThrow('error');
    expect(e.asyncSpy).toHaveBeenCalledTimes(1);

    // cache cleared on rejection, calling again invokes original
    await expect(e.fail(true)).rejects.toThrow('error');
    expect(e.asyncSpy).toHaveBeenCalledTimes(2);
  });

  test('should invalidate cache via static invalidate method', () => {
    const e = new Example();

    e.syncMethod(2, 3);
    e.syncMethod(2, 3);
    expect(e.syncSpy).toHaveBeenCalledTimes(1);

    // Invalidate cache for this method
    cached.invalidate(e.syncMethod);

    e.syncMethod(2, 3);
    expect(e.syncSpy).toHaveBeenCalledTimes(2);
  });

  test('should invalidate arrow field cache via static invalidate', () => {
    const e = new Example();

    e.arrowField('test');
    e.arrowField('test');

    expect(e.syncSpy).toHaveBeenCalledTimes(1);

    cached.invalidate(e.arrowField);

    e.arrowField('test');
    expect(e.syncSpy).toHaveBeenCalledTimes(2);
  });

  test('invalidating one function does not affect other cached functions', () => {
    class MultiExample {
      spy = vi.fn();

      @cached fn1(n: number): number {
        this.spy('fn1', n);

        return n;
      }

      @cached fn2(n: number): number {
        this.spy('fn2', n);

        return n * 2;
      }
    }

    const m = new MultiExample();

    m.fn1(1);
    m.fn1(1);
    m.fn2(1);
    m.fn2(1);

    expect(m.spy).toHaveBeenCalledTimes(2); // one for fn1, one for fn2

    // Invalidate only fn1
    cached.invalidate(m.fn1);

    m.fn1(1);
    m.fn2(1);

    expect(m.spy).toHaveBeenCalledTimes(3);
    expect(m.spy).toHaveBeenCalledWith('fn1', 1);
  });

  test('works correctly with private methods', () => {
    class PrivateExample extends Example {
      @cached #private(x: string): string {
        this.syncSpy(x);

        return x + x;
      }

      private(x: string): string {
        return this.#private(x);
      }
    }

    const p = new PrivateExample();
    expect(p.private('a')).toBe('aa');
    expect(p.private('a')).toBe('aa');
    // spy called only once for identical args
    expect(p.syncSpy).toHaveBeenCalledTimes(1);
  });
});
