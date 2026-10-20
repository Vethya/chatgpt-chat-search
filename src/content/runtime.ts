export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
