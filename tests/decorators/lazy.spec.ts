import { lazy } from 'decorio';

describe('@lazy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  class Example {
    publicValue: number;
    #privateValue: number;

    readonly publicSimpleSpy = vi.fn();
    readonly privateSimpleSpy = vi.fn();
    readonly publicDependentSpy = vi.fn();
    readonly privateDependent1Spy = vi.fn();
    readonly privateDependent2Spy = vi.fn();

    constructor(value: number) {
      this.publicValue = value;
      this.#privateValue = value;
    }

    updateValue(value: number): void {
      this.publicValue = value;
      this.#privateValue = value;
    }

    @lazy get publicSimple(): string {
      this.publicSimpleSpy();

      return 'public';
    }

    @lazy get #privateSimple(): string {
      this.privateSimpleSpy();

      return 'private';
    }

    @lazy get publicDependent(): number {
      this.publicDependentSpy();

      return this.publicValue * 2;
    }

    @lazy get #privateDependent1(): number {
      this.privateDependent1Spy();

      return this.publicValue * 3;
    }

    @lazy get #privateDependent2(): number {
      this.privateDependent2Spy();

      return this.#privateValue * 4;
    }

    getPrivateSimple(): string {
      return this.#privateSimple;
    }

    getPrivateDependent1(): number {
      return this.#privateDependent1;
    }

    getPrivateDependent2(): number {
      return this.#privateDependent2;
    }
  }

  test('should work with public getters', () => {
    const e = new Example(100);

    expect(e.publicSimpleSpy).not.toBeCalled();
    expect(e.publicDependentSpy).not.toBeCalled();

    expect(e.publicSimple).toBe('public');
    expect(e.publicDependent).toBe(200);

    expect(e.publicSimpleSpy).toHaveBeenCalledTimes(1);
    expect(e.publicDependentSpy).toHaveBeenCalledTimes(1);

    expect(e.publicSimple).toBe('public');
    expect(e.publicDependent).toBe(200);

    expect(e.publicSimpleSpy).toHaveBeenCalledTimes(1);
    expect(e.publicDependentSpy).toHaveBeenCalledTimes(1);
  });

  test('should work with private getters', () => {
    const e = new Example(100);

    expect(e.privateSimpleSpy).not.toBeCalled();
    expect(e.privateDependent1Spy).not.toBeCalled();
    expect(e.privateDependent2Spy).not.toBeCalled();

    expect(e.getPrivateSimple()).toBe('private');
    expect(e.getPrivateDependent1()).toBe(300);
    expect(e.getPrivateDependent2()).toBe(400);

    expect(e.privateSimpleSpy).toHaveBeenCalledTimes(1);
    expect(e.privateDependent1Spy).toHaveBeenCalledTimes(1);
    expect(e.privateDependent2Spy).toHaveBeenCalledTimes(1);

    expect(e.getPrivateSimple()).toBe('private');
    expect(e.getPrivateDependent1()).toBe(300);
    expect(e.getPrivateDependent2()).toBe(400);

    expect(e.privateSimpleSpy).toHaveBeenCalledTimes(1);
    expect(e.privateDependent1Spy).toHaveBeenCalledTimes(1);
    expect(e.privateDependent2Spy).toHaveBeenCalledTimes(1);
  });

  test('caches per instance (no cross-instance bleed)', () => {
    const e1 = new Example(2);
    const e2 = new Example(3);

    expect(e1.publicDependent).toBe(4);
    expect(e2.publicDependent).toBe(6);

    expect(e1.publicDependentSpy).toHaveBeenCalledTimes(1);
    expect(e2.publicDependentSpy).toHaveBeenCalledTimes(1);

    expect(e1.publicDependent).toBe(4);
    expect(e2.publicDependent).toBe(6);

    expect(e1.publicDependentSpy).toHaveBeenCalledTimes(1);
    expect(e2.publicDependentSpy).toHaveBeenCalledTimes(1);
  });

  test('cached value does not change after state mutation', () => {
    const e = new Example(5);
    expect(e.publicDependent).toBe(10);
    expect(e.publicDependentSpy).toHaveBeenCalledTimes(1);

    e.updateValue(999);

    expect(e.publicDependent).toBe(10);
    expect(e.publicDependentSpy).toHaveBeenCalledTimes(1);

    const e2 = new Example(5);
    expect(e2.getPrivateDependent2()).toBe(20);

    e.updateValue(999);

    expect(e2.getPrivateDependent2()).toBe(20);
    expect(e2.privateDependent2Spy).toHaveBeenCalledTimes(1);
  });

  test('caches falsy values correctly', () => {
    class FalsyExample {
      spy = vi.fn();

      @lazy get zero() {
        this.spy();

        return 0;
      }

      @lazy get nope() {
        this.spy();

        return false;
      }

      @lazy get undef() {
        this.spy();

        return undefined;
      }

      @lazy get nan() {
        this.spy();

        return NaN;
      }
    }

    const e = new FalsyExample();

    expect(e.zero).toBe(0);
    expect(e.zero).toBe(0);

    expect(e.nope).toBe(false);
    expect(e.nope).toBe(false);

    expect(e.undef).toBeUndefined();
    expect(e.undef).toBeUndefined();

    expect(Number.isNaN(e.nan)).toBe(true);
    expect(Number.isNaN(e.nan)).toBe(true);

    expect(e.spy).toHaveBeenCalledTimes(4);
  });

  test('does not cache failed first computation', () => {
    class ThrowOnceExample {
      count = 0;

      @lazy get value() {
        this.count++;

        if (this.count === 1) {
          throw new Error('boom');
        }

        return 42;
      }
    }

    const e = new ThrowOnceExample();

    expect(() => e.value).toThrowError('boom');
    expect(e.count).toBe(1);

    expect(e.value).toBe(42);
    expect(e.count).toBe(2);

    expect(e.value).toBe(42);
    expect(e.count).toBe(2);
  });

  test('works with inheritance and caches per receiver instance', () => {
    class Base {
      spy = vi.fn();

      @lazy get computed() {
        this.spy();

        return 'base';
      }
    }

    class Child extends Base {}

    const a = new Child();
    const b = new Child();

    expect(a.computed).toBe('base');
    expect(b.computed).toBe('base');

    expect(a.spy).toHaveBeenCalledTimes(1);
    expect(b.spy).toHaveBeenCalledTimes(1);

    expect(a.computed).toBe('base');
    expect(b.computed).toBe('base');
    expect(a.spy).toHaveBeenCalledTimes(1);
    expect(b.spy).toHaveBeenCalledTimes(1);
  });
});
