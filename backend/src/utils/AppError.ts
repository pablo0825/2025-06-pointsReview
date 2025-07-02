export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;

  constructor(statusCode: number, status: string, message: string) {
    super(message);

    this.statusCode = statusCode;
    this.status = status;
    this.isOperational = true;

    // 修正原型鏈（重要）
    Object.setPrototypeOf(this, new.target.prototype);

    // 方便除錯
    Error.captureStackTrace(this);
  }
}
