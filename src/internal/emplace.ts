/** @internal */
export function emplace<K, V>(target: Map<K, V>, key: K, factory: () => V): V {
  if (target.has(key)) {
    return target.get(key)!;
  } else {
    const value = factory();

    target.set(key, value);

    return value;
  }
}
