import { bound } from 'decorio';

describe('@bound', () => {
  class Example {
    value: string;

    constructor(value: string) {
      this.value = value;
    }

    @bound get(): string {
      this.#test();

      return this.value;
    }

    #test(): void {}
  }

  test('binds method to its instance regardless of invocation context', () => {
    const foo = new Example('foo');
    const bar = new Example('bar');

    // Direct invocation
    expect(foo.get()).toBe('foo');
    expect(bar.get()).toBe('bar');

    // Extracted references should still bind to original instance
    const fooGet = foo.get;
    const barGet = bar.get;

    expect(fooGet()).toBe('foo');
    expect(barGet()).toBe('bar');
  });

  test('maintains the same bound function reference per instance', () => {
    const e = new Example('x');

    // The function object is stable on the instance
    expect(e.get).toBe(e.get);
  });

  test('distinct instances have independent bound methods', () => {
    const a = new Example('x');
    const b = new Example('y');

    // Different instances => different bound function references
    expect(a.get).not.toBe(b.get);
  });

  test('cannot override binding using bind, call, or apply', () => {
    const e = new Example('val');

    // Bind attempts on a bound method do not change its `this`
    expect(e.get.call({ value: 'other' })).toBe('val');
    expect(e.get.apply({ value: 'other' })).toBe('val');
    expect(e.get.bind({ value: 'other' })()).toBe('val');
  });

  test('throws error when applied to a private method', () => {
    // Decorating a private method should error at class evaluation time
    expect(() => {
      class Bad {
        @bound #hidden(): void {}
      }

      // Force creation of class to trigger decorator
      new Bad();
    }).toThrow();
  });

  test('inherits bound behavior in subclasses', () => {
    class Base {
      prefix = 'x';

      @bound show(): string {
        return this.prefix;
      }
    }
    class Sub extends Base {
      prefix = 'y';
    }

    const sub = new Sub();

    // Extracted reference should reflect subclass property
    const fn = sub.show;
    expect(fn()).toBe('y');
  });
});
