/** @internal */
export function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);

    const handleAbort = () => {
      clearTimeout(id);
      reject(signal?.reason);
    };

    signal?.addEventListener('abort', handleAbort);
  });
}
