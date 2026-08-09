export const MAX_SERIALIZABLE_ATTEMPTS = 3;

function isWriteConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

export async function withSerializableRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = MAX_SERIALIZABLE_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isWriteConflict(error) || attempt === maxAttempts) {
        throw error;
      }
    }
  }
}
