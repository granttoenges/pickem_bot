export function parseQuotaInput(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  if (!/^\d+$/.test(value.trim())) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 20 ? parsed : undefined;
}

export function isValidQuotaInput(value: string): boolean {
  return parseQuotaInput(value) !== undefined;
}
