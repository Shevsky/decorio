/** @internal */
export function decorate<A extends Array<unknown>, R>(
  value: unknown,
  context: ClassMethodDecoratorContext<object, (...args: A) => R> | ClassFieldDecoratorContext<object, (...args: A) => R>,
  apply: (originalFn: (...args: A) => R) => (...args: A) => R
) {
  // Dispatch based on decorator kind
  switch (context.kind) {
    case 'field': {
      // For arrow-function fields, we return an initializer
      return function (originalFn: (...args: A) => R) {
        return apply(originalFn);
      };
    }
    case 'method': {
      // For class methods, value is the original function
      return apply(value as (...args: A) => R);
    }
  }
}
