export class ValidationError extends Error {}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePlaceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim()
    .replace(/\s+/g, " ");
}

export function assertRating(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new ValidationError("Rating must be an integer from 1 to 5");
  }

  return value;
}
