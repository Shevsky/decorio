import { timeout, wait } from 'decorio';

describe('@timeout', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  class Example {
    readonly abortSpy = vi.fn();

    @timeout(500) async fastTask(): Promise<string> {
      const { signal } = timeout;
      signal?.addEventListener('abort', () => this.abortSpy());

      await wait(300, signal);

      return 'done';
    }

    @timeout(500) async slowTask(): Promise<string> {
      const { signal } = timeout;

      signal?.addEventListener('abort', () => this.abortSpy());

      await wait(1000, signal);

      return 'too slow';
    }

    @timeout(400) async echo(input: string): Promise<string> {
      const { signal } = timeout;

      await wait(100, signal);

      return `echo: ${input}`;
    }
  }

  test('resolves if method finishes before timeout', async () => {
    const e = new Example();
    const p = e.fastTask();
    // fastTask waits 300ms, timeout at 500ms
    await vi.advanceTimersByTimeAsync(300);
    await expect(p).resolves.toBe('done');
    expect(e.abortSpy).not.toHaveBeenCalled();
  });

  test('rejects if method exceeds timeout and triggers abort', async () => {
    const e = new Example();
    const p = e.slowTask();
    // advance to just before timeout
    await vi.advanceTimersByTimeAsync(500);
    // now timeout triggers
    await expect(p).rejects.toThrow('timeout 500ms exceeded');
    expect(e.abortSpy).toHaveBeenCalledTimes(1);
  });

  test('passes arguments correctly', async () => {
    const e = new Example();
    const p = e.echo('hello');
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe('echo: hello');
  });

  test('per-instance isolation of timers', async () => {
    const e1 = new Example();
    const e2 = new Example();

    const p1 = e1.fastTask();
    const p2 = e2.slowTask();

    // after 300ms, e1 should complete
    await vi.advanceTimersByTimeAsync(300);
    await expect(p1).resolves.toBe('done');
    expect(e1.abortSpy).not.toHaveBeenCalled();

    // e2 still pending, not aborted yet
    expect(e2.abortSpy).not.toHaveBeenCalled();

    // after total 500ms, e2 should be aborted
    await vi.advanceTimersByTimeAsync(200);
    await expect(p2).rejects.toThrow('timeout 500ms exceeded');
    expect(e2.abortSpy).toHaveBeenCalledTimes(1);
  });

  test('handles rejection from inner logic gracefully', async () => {
    class FailExample {
      @timeout(500) async willThrow(): Promise<void> {
        const { signal } = timeout;
        await wait(100, signal);

        throw new Error('inner error');
      }
    }

    const f = new FailExample();
    const p = f.willThrow();
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).rejects.toThrow('inner error');
  });
});
