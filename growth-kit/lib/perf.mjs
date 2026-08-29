export function measureExecution(fn) {
  const start = performance.now();
  const res = fn();
  const end = performance.now();
  return {
    result: res,
    durationMs: Number((end - start).toFixed(2))
  };
}
