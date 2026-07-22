import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { ApiError } from "../errors/apiError";
import { FileValidator, type ValidatedSignature } from "../files/fileValidator";
import {
  advisorApproveBodySchema,
  type AdvisorApproveBody,
} from "../schemas/advisorApplication.schema";

const temporaryRoot = path.join(os.tmpdir(), "points-review-signatures");
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        await mkdir(temporaryRoot, { recursive: true });
        callback(null, temporaryRoot);
      } catch (error) {
        callback(error as Error, temporaryRoot);
      }
    },
    filename: (_req, _file, callback) =>
      callback(null, `${Date.now()}-${crypto.randomUUID()}.upload`),
  }),
  limits: { files: 1, fileSize: 1024 * 1024, fields: 1, parts: 3 },
}).single("signature");

export interface AdvisorSignatureUploadRequest extends Request {
  advisorApprovePayload?: AdvisorApproveBody;
  validatedSignature?: ValidatedSignature;
}

export async function cleanupTemporarySignature(req: Request): Promise<void> {
  if (req.file?.path) await rm(req.file.path, { force: true });
}

function uploadError(error: multer.MulterError): ApiError {
  if (error.code === "LIMIT_FILE_SIZE") {
    return new ApiError(400, "file_too_large", "簽名檔案不得超過 1 MB。");
  }
  if (error.code === "LIMIT_UNEXPECTED_FILE") {
    return new ApiError(422, "validation_failed", "簽名檔案欄位不正確。");
  }
  return new ApiError(422, "validation_failed", "multipart request 不正確。");
}

export function parseAdvisorSignatureUpload(
  req: AdvisorSignatureUploadRequest,
  res: Response,
  next: NextFunction,
): void {
  upload(req, res, async (error) => {
    try {
      if (error) {
        throw error instanceof multer.MulterError ? uploadError(error) : error;
      }
      if (!req.file) {
        throw new ApiError(400, "file_missing", "缺少簽名檔案。");
      }
      if (typeof req.body.payload !== "string") {
        throw new ApiError(422, "validation_failed", "簽核資料不正確。", [
          { path: "payload", message: "payload 必須是 JSON 字串。" },
        ]);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(req.body.payload);
      } catch {
        throw new ApiError(422, "validation_failed", "簽核資料不正確。", [
          { path: "payload", message: "payload 不是合法 JSON。" },
        ]);
      }
      req.advisorApprovePayload = advisorApproveBodySchema.parse(payload);
      req.validatedSignature = await FileValidator.validateSignature(req.file);
      next();
    } catch (caught) {
      await cleanupTemporarySignature(req);
      next(caught);
    }
  });
}
