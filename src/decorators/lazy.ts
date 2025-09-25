/**
 * 🎯 Decorator `@lazy` evaluates the original getter once per instance on the
 * first access and then keeps returning the same value on subsequent reads,
 * without re-running the getter.
 *
 * Works with public and private getters.
 *
 * ⚠️ If the getter throws on first access, the error is NOT CACHED (the next
 * read will try to compute again).
 *
 * Usage:
 * ```typescript
 * class User {
 *   #seed = Math.random();
 *
 *   @lazy get checksum(): string {
 *     // expensive work...
 *     return hash(this.#seed);
 *   }
 * }
 *
 * const u = new User();
 * u.checksum; // computed once
 * u.checksum; // served from cache
 * ```
 */
export function lazy<R>(getter: () => R, _: ClassGetterDecoratorContext<object, R>): () => R {
  const cache = new WeakMap();

  return function (this: object) {
    if (cache.has(this)) {
      return cache.get(this);
    }

    const result = getter.call(this);

    cache.set(this, result);

    return result;
  };
}
