export function indexById<T>(items: readonly T[], getId: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(getId(item), item);
  }
  return map;
}

export function indexByKey<T, K extends keyof T>(
  items: readonly T[],
  key: K,
): Map<T[K], T> {
  const map = new Map<T[K], T>();
  for (const item of items) {
    map.set(item[key], item);
  }
  return map;
}
