/**
 * Validate that a value is a non-empty trimmed string.
 * Used for required text fields in request body validation.
 */
export function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Parse a route param (e.g. req.params.id) to a positive integer.
 * Accepts string, string[], or undefined to match Express 5 Request.params typing.
 * Returns NaN if the value is not a valid positive integer.
 */
export function parsePositiveInt(value: string | string[] | undefined): number {
  if (value === undefined || value === null) return NaN;
  const str = Array.isArray(value) ? value[0] : value;
  if (typeof str !== "string" || str.trim() === "") return NaN;
  const n = Number(str);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return NaN;
  return n;
}
