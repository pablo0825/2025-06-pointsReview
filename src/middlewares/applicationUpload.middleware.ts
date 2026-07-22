import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import { ApiError } from "../errors/apiError";
import {
  createApplicationSubmissionSchema,
  type CreateApplicationSubmission,
} from "../schemas/applicationSubmission.schema";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const temporaryRoot = path.join(os.tmpdir(), "points-review-uploads");

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
    filename: (_req, _file, callback) => {
      callback(null, `${Date.now()}-${crypto.randomUUID()}.upload`);
    },
  }),
  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE,
    fields: 1,
    parts: MAX_FILES + 2,
    fieldSize: 1024 * 1024,
  },
}).any();

export interface ApplicationUploadRequest extends Request {
  applicationPayload?: CreateApplicationSubmission;
  applicationFiles?: Map<string, Express.Multer.File>;
}

export async function cleanupTemporaryUploads(req: Request): Promise<void> {
  const files = Array.isArray(req.files) ? req.files : [];
  await Promise.all(files.map((file) => rm(file.path, { force: true })));
}

function mapMulterError(error: multer.MulterError): ApiError {
  if (error.code === "LIMIT_FILE_SIZE") {
    return new ApiError(400, "file_too_large", "每個附件不得超過 5 MB。");
  }
  if (error.code === "LIMIT_FILE_COUNT") {
    return new ApiError(400, "too_many_files", "每筆申請最多 10 個附件。");
  }
  return new ApiError(422, "validation_failed", "multipart request 不正確。");
}

export function parseApplicationUpload(
  req: ApplicationUploadRequest,
  res: Response,
  next: NextFunction,
): void {
  upload(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        throw uploadError instanceof multer.MulterError
          ? mapMulterError(uploadError)
          : uploadError;
      }
      if (typeof req.body.payload !== "string") {
        throw new ApiError(422, "validation_failed", "送件資料不正確。", [
          { path: "payload", message: "payload 必須是 JSON 字串。" },
        ]);
      }
      let json: unknown;
      try {
        json = JSON.parse(req.body.payload);
      } catch {
        throw new ApiError(422, "validation_failed", "送件資料不正確。", [
          { path: "payload", message: "payload 不是合法 JSON。" },
        ]);
      }
      req.applicationPayload = createApplicationSubmissionSchema.parse(json);

      const files = Array.isArray(req.files) ? req.files : [];
      const fileMap = new Map<string, Express.Multer.File>();
      for (const file of files) {
        const match = /^attachments\[([A-Za-z0-9_-]+)\]$/.exec(file.fieldname);
        if (!match || fileMap.has(match[1])) {
          throw new ApiError(422, "validation_failed", "附件欄位不正確。", [
            { path: file.fieldname, message: "附件欄位名稱無效或重複。" },
          ]);
        }
        fileMap.set(match[1], file);
      }
      req.applicationFiles = fileMap;
      next();
    } catch (error) {
      await cleanupTemporaryUploads(req);
      next(error);
    }
  });
}
