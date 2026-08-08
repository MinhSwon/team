export function createExclusiveAction() {
  let pending = false;

  return async function run<T>(
    action: () => Promise<T>,
  ): Promise<T | undefined> {
    if (pending) return undefined;
    pending = true;
    try {
      return await action();
    } finally {
      pending = false;
    }
  };
}

export function applyServerCount<T extends object, K extends PropertyKey>(
  counts: T,
  key: K,
  count: number,
): T & Record<K, number> {
  return { ...counts, [key]: count } as T & Record<K, number>;
}

export function mergeCommentsById<T extends { id: string }>(
  props: readonly T[],
  local: readonly T[],
): T[] {
  const seen = new Set<string>();
  return [...props, ...local].filter((comment) => {
    if (seen.has(comment.id)) return false;
    seen.add(comment.id);
    return true;
  });
}
