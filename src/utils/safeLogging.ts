interface SafeErrorSummary {
  errorName: string;
  errorCode?: string;
}

export function getSafeErrorSummary(error: unknown): SafeErrorSummary {
  const errorName = error instanceof Error ? error.name : typeof error;
  const maybeErrorCode = (error as { code?: unknown } | null)?.code;

  return {
    errorName,
    ...(typeof maybeErrorCode === "string"
      ? { errorCode: maybeErrorCode }
      : {}),
  };
}
