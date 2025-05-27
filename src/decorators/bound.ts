/**
 * 🎯 Binds a class method to its instance, ensuring `this` always refers to the instance
 * whenever the method is called (even if extracted). Works only on public instance methods.
 *
 * Usage:
 * ```typescript
 * class Example {
 *   message = 'Hello';
 *
 *   @bound greet() {
 *     console.log(this.message);
 *   }
 * }
 *
 * const e = new Example();
 * const greet = e.greet;
 * greet(); // always logs 'Hello'
 * ```
 */
export function bound<A extends Array<unknown>, R>(_: unknown, context: ClassMethodDecoratorContext<object, (...args: A) => R>): void {
  // 🚫 Reject private methods immediately
  if (context.private) {
    throw new TypeError(`Cannot apply @bound to private method ${String(context.name)}`);
  }

  const { name, addInitializer } = context;

  // 📌 Schedule a binding step to run in the instance constructor
  addInitializer(function (this: object) {
    this[name] = this[name].bind(this);
  });
}
