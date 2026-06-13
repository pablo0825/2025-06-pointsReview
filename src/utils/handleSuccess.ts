// utils/handleSuccess.ts
import { Response } from "express";

export function handleSuccess<T>(
  res: Response,
  httpStatusCode: number,
  status: string,
  message: string,
  data: T,
  results?: number
) {
  res
    .status(httpStatusCode)
    .json({ status, message, data, ...(results !== undefined && { results }) });
}
