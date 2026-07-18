export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export type EmailProviderErrorCode =
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_network_error"
  | "provider_unavailable"
  | "provider_authentication_failed"
  | "provider_configuration_error"
  | "recipient_rejected";

export class EmailProviderError extends Error {
  readonly safeCode: EmailProviderErrorCode;
  readonly retryable: boolean;

  constructor(safeCode: EmailProviderErrorCode, retryable: boolean) {
    super(safeCode);
    this.name = "EmailProviderError";
    this.safeCode = safeCode;
    this.retryable = retryable;
  }
}

export function isEmailProviderError(
  error: unknown,
): error is EmailProviderError {
  return error instanceof EmailProviderError;
}
