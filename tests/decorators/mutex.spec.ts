import { mutex, wait } from 'decorio';

describe('@mutex', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  class Example {
    invocations = 0;

    @mutex async task(id: string): Promise<string> {
      this.invocations++;

      await wait(100);

      return `done ${id}`;
    }
  }

  test('serializes concurrent calls and runs them one by one', async () => {
    const e = new Example();

    const p1 = e.task('a');
    const p2 = e.task('b');

    // After two calls — only the first one has actually started
    expect(e.invocations).toBe(1);

    // Promises must be different
    expect(p2).not.toBe(p1);

    // Fast-forward 100ms — first call completes
    await vi.advanceTimersByTimeAsync(100);
    await expect(p1).resolves.toBe('done a');

    // After the first finishes, the second one starts
    expect(e.invocations).toBe(2);

    // Another 100ms — second completes
    await vi.advanceTimersByTimeAsync(100);
    await expect(p2).resolves.toBe('done b');
  });

  test('invokes again after the first Promise settles', async () => {
    const e = new Example();

    // First call
    const p1 = e.task('x');
    expect(e.invocations).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    await expect(p1).resolves.toBe('done x');

    // After completion, next call starts immediately
    const p2 = e.task('y');
    expect(e.invocations).toBe(2);

    // Another call made instantly should not start yet — it goes to the queue
    const p3 = e.task('z');
    expect(e.invocations).toBe(2);

    await vi.advanceTimersByTimeAsync(100);
    await expect(p2).resolves.toBe('done y');

    // Third call starts only after second finishes
    expect(e.invocations).toBe(3);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p3).resolves.toBe('done z');
  });

  test('isolates calls between different instances', async () => {
    const e1 = new Example();
    const e2 = new Example();

    const p1 = e1.task('1');
    const p2 = e2.task('2');

    // Each instance maintains its own mutex — both may run in parallel
    expect(e1.invocations).toBe(1);
    expect(e2.invocations).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    await expect(p1).resolves.toBe('done 1');
    await expect(p2).resolves.toBe('done 2');
  });

  test('returns different promise objects for concurrent calls', () => {
    const e = new Example();

    const p1 = e.task('foo');
    const p2 = e.task('foo');

    // In the queue-based implementation each call has its own Promise
    expect(p2).not.toBe(p1);
  });

  test('queues rejections and allows retry after failure', async () => {
    class RejectExample {
      invocations = 0;

      @mutex async fail(): Promise<void> {
        this.invocations++;

        await wait(50);

        throw new Error('failed');
      }
    }

    const e = new RejectExample();

    // Two calls — both will be executed one after another, and both fail
    const r1 = e.fail();
    const r2 = e.fail();

    // After scheduling both — only the first one has started
    expect(e.invocations).toBe(1);

    // First finishes with rejection, then second starts
    await vi.advanceTimersByTimeAsync(50);
    await expect(r1).rejects.toThrow('failed');

    // Second has now begun
    expect(e.invocations).toBe(2);

    // After 50ms second also fails
    await vi.advanceTimersByTimeAsync(50);
    await expect(r2).rejects.toThrow('failed');

    // New attempts should still work normally
    const r3 = e.fail();
    expect(e.invocations).toBe(3);
    await vi.advanceTimersByTimeAsync(50);
    await expect(r3).rejects.toThrow('failed');
  });

  test('runs many queued calls strictly one by one', async () => {
    class OrderExample {
      events: string[] = [];

      @mutex async task(id: number): Promise<number> {
        this.events.push(`start-${id}`);

        await wait(100);

        this.events.push(`end-${id}`);

        return id;
      }
    }

    const e = new OrderExample();

    // Fire 10 calls at once
    const promises = Array.from({ length: 10 }, (_, i) => e.task(i));

    // Immediately after calls — only the first has started
    expect(e.events).toEqual(['start-0']);

    // Step through all queued executions
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    await expect(Promise.all(promises)).resolves.toEqual(Array.from({ length: 10 }, (_, i) => i));

    // Start/end sequence must be strictly ordered
    const expectedEvents: string[] = [];
    for (let i = 0; i < 10; i++) {
      expectedEvents.push(`start-${i}`, `end-${i}`);
    }

    expect(e.events).toEqual(expectedEvents);
  });

  test('queues calls that arrive while previous one is still running', async () => {
    const e = new Example();

    const p1 = e.task('a');
    expect(e.invocations).toBe(1);

    // After 50ms the first has not finished yet
    await vi.advanceTimersByTimeAsync(50);

    const p2 = e.task('b');
    // Second should still be queued — not started yet
    expect(e.invocations).toBe(1);
    expect(p2).not.toBe(p1);

    // Fast-forward first completion
    await vi.advanceTimersByTimeAsync(50);
    await expect(p1).resolves.toBe('done a');

    // After first completes, second begins
    expect(e.invocations).toBe(2);

    // Second finishes after another 100ms
    await vi.advanceTimersByTimeAsync(100);
    await expect(p2).resolves.toBe('done b');
  });

  test('executes a long queue with mixed resolve/reject sequentially', async () => {
    class MixedExample {
      calls: Array<{ id: number; ok: boolean }> = [];

      @mutex async task(id: number, fail: boolean): Promise<string> {
        this.calls.push({ id, ok: !fail });

        await wait(50);

        if (fail) {
          throw new Error(`boom-${id}`);
        }

        return `ok-${id}`;
      }
    }

    const e = new MixedExample();

    const pattern = [
      { id: 0, fail: false },
      { id: 1, fail: true },
      { id: 2, fail: false },
      { id: 3, fail: true },
      { id: 4, fail: false }
    ];

    const promises = pattern.map(({ id, fail }) => e.task(id, fail));

    // Immediately after calls — only the first has started
    expect(e.calls).toEqual([{ id: 0, ok: true }]);

    // Run through all queued calls
    for (let i = 0; i < pattern.length; i++) {
      await vi.advanceTimersByTimeAsync(50);
    }

    // Verify results
    await expect(promises[0]).resolves.toBe('ok-0');
    await expect(promises[1]).rejects.toThrow('boom-1');
    await expect(promises[2]).resolves.toBe('ok-2');
    await expect(promises[3]).rejects.toThrow('boom-3');
    await expect(promises[4]).resolves.toBe('ok-4');

    // Check correct sequential execution order
    expect(e.calls).toEqual([
      { id: 0, ok: true },
      { id: 1, ok: false },
      { id: 2, ok: true },
      { id: 3, ok: false },
      { id: 4, ok: true }
    ]);
  });

  test('separates queues per method on the same instance', async () => {
    class MultiExample {
      log: string[] = [];

      @mutex async a(id: string): Promise<void> {
        this.log.push(`a-start-${id}`);

        await wait(50);

        this.log.push(`a-end-${id}`);
      }

      @mutex async b(id: string): Promise<void> {
        this.log.push(`b-start-${id}`);

        await wait(50);

        this.log.push(`b-end-${id}`);
      }
    }

    const e = new MultiExample();

    const p1 = e.a('1');
    const p2 = e.a('2');
    const p3 = e.b('3');
    const p4 = e.b('4');

    // Each method has its own independent queue
    expect(e.log).toContain('a-start-1');
    expect(e.log).toContain('b-start-3');

    // 4 calls * 50ms = 4 steps total to finish all
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(50);
    }

    await Promise.allSettled([p1, p2, p3, p4]);

    // Order inside each method must be strictly sequential
    const aEvents = e.log.filter((x) => x.startsWith('a-'));
    const bEvents = e.log.filter((x) => x.startsWith('b-'));

    expect(aEvents).toEqual(['a-start-1', 'a-end-1', 'a-start-2', 'a-end-2']);
    expect(bEvents).toEqual(['b-start-3', 'b-end-3', 'b-start-4', 'b-end-4']);
  });

  test('handles synchronous exceptions by rejecting the returned promise', async () => {
    class SyncErrorExample {
      invocations = 0;

      // intentionally NOT async — to capture a real sync throw
      @mutex failSync(): Promise<void> {
        this.invocations++;

        throw new Error('sync boom');
      }
    }

    const e = new SyncErrorExample();

    // First call: should not throw synchronously — Promise must reject instead
    const p1 = e.failSync();
    expect(e.invocations).toBe(1);
    await expect(p1).rejects.toThrow('sync boom');

    // Second call: should also queue and reject correctly
    const p2 = e.failSync();
    expect(e.invocations).toBe(2);
    await expect(p2).rejects.toThrow('sync boom');

    // Third call — still must work consistently
    const p3 = e.failSync();
    expect(e.invocations).toBe(3);
    await expect(p3).rejects.toThrow('sync boom');
  });
});
