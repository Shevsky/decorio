import { mutex, wait } from 'decorio';

describe('mutex', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  class Example {
    invocationCount = 0;

    @mutex async task(id: string): Promise<string> {
      this.invocationCount++;

      await wait(100);

      return `done ${id}`;
    }
  }

  test('reuses the first result for concurrent calls regardless of args', async () => {
    const e = new Example();

    // Two calls in quick succession with different args
    const p1 = e.task('a');
    const p2 = e.task('b');

    // Only the first invocation is executed
    expect(e.invocationCount).toBe(1);
    // Both calls return the same Promise
    expect(p2).toBe(p1);

    // Fast-forward 100ms to resolve
    await vi.advanceTimersByTimeAsync(100);

    // The promise resolves with the first call's result
    await expect(p1).resolves.toBe('done a');
    await expect(p2).resolves.toBe('done a');
  });

  test('invokes again after the first Promise settles', async () => {
    const e = new Example();

    // First batch
    const p1 = e.task('x');
    await vi.advanceTimersByTimeAsync(100);
    await expect(p1).resolves.toBe('done x');
    expect(e.invocationCount).toBe(1);

    // After settlement, a new call triggers a fresh invocation
    const p2 = e.task('y');
    expect(e.invocationCount).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p2).resolves.toBe('done y');
  });

  test('isolates calls between different instances', async () => {
    const e1 = new Example();
    const e2 = new Example();

    const p1 = e1.task('1');
    const p2 = e2.task('2');

    // Each instance runs independently
    expect(e1.invocationCount).toBe(1);
    expect(e2.invocationCount).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    await expect(p1).resolves.toBe('done 1');
    await expect(p2).resolves.toBe('done 2');
  });

  test('shares the same promise object for multiple calls', () => {
    const e = new Example();
    const p1 = e.task('foo');
    const p2 = e.task('foo');
    expect(p2).toBe(p1);
  });

  test('handles rejections and allows retry after failure', async () => {
    class RejectExample {
      count = 0;

      @mutex async fail(flag: boolean): Promise<void> {
        this.count++;

        await wait(50);

        if (flag) {
          throw new Error('failed');
        }
      }
    }

    const e = new RejectExample();

    // First call rejects
    const r1 = e.fail(true);
    const r2 = e.fail(true);
    expect(e.count).toBe(1);
    await vi.advanceTimersByTimeAsync(50);
    await expect(r1).rejects.toThrow('failed');
    await expect(r2).rejects.toThrow('failed');

    // After rejection, cache is cleared => new invocation
    const r3 = e.fail(true);
    expect(e.count).toBe(2);
    await vi.advanceTimersByTimeAsync(50);
    await expect(r3).rejects.toThrow('failed');
  });
});
