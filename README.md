# 💅 decorio — First-class ECMAScript decorators

A toolkit of decorators built on the Stage 3 ECMAScript Decorators proposal. These follow the TC39 spec (not the old typescript "legacy" decorators): https://github.com/tc39/proposal-decorators.

## 📦 Install

```bash
npm install decorio
# or
yarn add decorio
```

## 🗄️ Caching decorators

### `@once`

Run a method **only once** for each unique set of arguments. Any further calls with the same inputs just return the cached result: no extra executions.

```typescript
import { once } from 'decorio';

class Example {
  @once compute(x: number): number {
    console.log('Computing', x);

    return x * 2;
  }
}

const e = new Example();
e.compute(3); // logs 'Computing 3', returns 6
e.compute(3); // returns 6 from cache, no log
```

### `@cached`

Cache all (args ➡️ result) pairs per instance. Use `cached.invalidate(fn)` to clear the cache for a specific method.

```typescript
import { cached } from 'decorio';

class Example {
  @cached sum(a: number, b: number): number {
    return a + b;
  }
}

const e = new Example();
e.sum(1, 2); // computes 3
e.sum(1, 2); // returns 3 from cache

// flush the cache for this method
cached.invalidate(e.sum);
```

## 🔗 Binding decorators

### `@bound`

Ensure a method always calls with the right `this`. Even if you extract the function reference, it stays bound to its instance.

```typescript
import { bound } from 'decorio';

class Example {
  message = 'Hello';

  @bound greet() {
    console.log(this.message);
  }
}

const e = new Example();
const greet = e.greet;
greet(); // always logs 'Hello'
```

## ⚙️ Concurrency decorators

### `@singleflight`

Prevent duplicate in-flight calls **per argument list**. If you call it again with the same args before it finishes, you get the same pending Promise.

```typescript
import { singleflight } from 'decorio';

class Example {
  @singleflight async fetchData(id: string): Promise<Data> { ... }
}

const e = new Example();
const p1 = e.fetchData('foo');
const p2 = e.fetchData('foo'); // p2 === p1
```

### `@debounced(delayMs)`

Debounce a method: wait for `delayMs` ms of "silence", then run only the last invocation. Every returned `Promise` resolves (or rejects) with that final run.

```typescript
import { debounced } from 'decorio';

class Searcher {
  @debounced(300) async search(query: string): Promise<Array<string>> { ... }
}

const s = new Searcher();
s.search('a');
s.search('ab');
s.search('abc'); // only this one actually fires, after 300 ms
```

You can also cancel earlier runs by passing the built-in `AbortSignal`:

```typescript
import { debounced } from 'decorio';

class Fetcher {
  @debounced(500) async fetchData(id: string): Promise<object> {
    const { signal } = debounced;

    // Pass the signal to fetch so that prior calls get aborted
    return fetch(`/api/data/${id}`, { signal }).then((r) => r.json());
  }
}

const f = new Fetcher();
f.fetchData('foo');
f.fetchData('bar');
```

### `@latest`

Like a zero-delay debounce, but it fires instantly on each call and aborts any prior in-flight run. It always keeps the latest call and ignores arguments when deciding what to cancel.

```typescript
import { latest } from 'decorio';

class Example {
  @latest async fetchData(id: string): Promise<Data> {
    const { signal } = latest;

    return fetch(`/api/data/${id}`, { signal }).then((r) => r.json());
  }
}

const e = new Example();
e.fetchData('1'); // starts immediately
e.fetchData('2'); // aborts '1' and starts '2' immediately
```

### `@mutex`

Enforce **one** active invocation at a time, ignoring all arguments. While it’s running, every call returns that same `Promise`. Once it finishes, the next call can go through. If you need argument-based deduplication instead, use `@singleflight`.

```typescript
import { mutex } from 'decorio';

class Example {
  @mutex async reload(): Promise<void> { ... }
}

const e = new Example();
e.reload();
e.reload(); // returns the same Promise, no extra request
```

## 🧶 Getting started with Stage 3 Decorators

To use these in typescript instead of "legacy" decorators, configure your toolchain:

### Typescript (`tsc`)

Make sure `"experimentalDecorators": false` (the default) in your tsconfig.json.

### Vite + esbuild

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    // disable esbuild's legacy-decorator transform so that Stage 3 decorator calls remain intact
    supported: {
      decorators: false,
    },
  },
});
```

### SWC

Enable decorators in your `.swcrc`:

```json5
// .swcrc
// https://swc.rs/docs/configuration/compilation#jsctransformdecoratorversion
{
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true
    },
    "transform": {
      "decoratorVersion": "2022-03"
    }
  }
}
```

If you use `@vitejs/plugin-react-swc`, you can also mutate via:

```javascript
// https://github.com/vitejs/vite-plugin-react-swc/releases/tag/v3.8.0
react({
  useAtYourOwnRisk_mutateSwcOptions(options) {
    options.jsc.parser.decorators = true;
    options.jsc.transform.decoratorVersion = '2022-03';
  },
});
```