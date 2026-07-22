import path from "node:path";
import { open, readFile } from "node:fs/promises";

import { ApiError } from "../errors/apiError";
import { filetypemime } from "magic-bytes.js";
import { imageSize } from "image-size";

const allowedFiles = {
  "application/pdf": new Set([".pdf"]),
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
} as const;

export interface ValidatedUpload {
  temporaryPath: string;
  originalFilename: string;
  mimeType: keyof typeof allowedFiles;
  extension: ".pdf" | ".jpg" | ".png";
  fileSize: number;
  clientFileKey: string;
}

export interface ValidatedSignature {
  temporaryPath: string;
  fileSize: number;
  width: number;
  height: number;
}

function fileTypeError(): ApiError {
  return new ApiError(
    400,
    "file_type_not_allowed",
    "只允許 PDF、JPEG 或 PNG 檔案。",
  );
}

export async function validateUpload(
  file: Express.Multer.File,
  clientFileKey: string,
): Promise<ValidatedUpload> {
  const extension = path.extname(file.originalname).toLowerCase();
  const declared = file.mimetype as keyof typeof allowedFiles;
  const allowedExtensions = allowedFiles[declared];
  if (!allowedExtensions?.has(extension)) throw fileTypeError();

  const handle = await open(file.path, "r");
  let detectedMimeTypes: string[];
  try {
    const header = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    detectedMimeTypes = filetypemime(header.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
  if (!detectedMimeTypes.includes(declared)) throw fileTypeError();

  const normalizedExtension =
    declared === "application/pdf"
      ? ".pdf"
      : declared === "image/png"
        ? ".png"
        : ".jpg";
  return {
    temporaryPath: file.path,
    originalFilename: path.basename(file.originalname).slice(0, 255),
    mimeType: declared,
    extension: normalizedExtension,
    fileSize: file.size,
    clientFileKey,
  };
}

export async function validateSignature(
  file: Express.Multer.File,
): Promise<ValidatedSignature> {
  const content = await readFile(file.path);
  if (
    file.mimetype !== "image/png" ||
    !filetypemime(content.subarray(0, 8192)).includes("image/png")
  ) {
    throw new ApiError(400, "file_type_not_allowed", "簽名檔案必須是 PNG。");
  }
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(content);
  } catch {
    throw new ApiError(400, "file_type_not_allowed", "簽名 PNG 無法解析。");
  }
  if (
    dimensions.type !== "png" ||
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width > 1600 ||
    dimensions.height > 800
  ) {
    throw new ApiError(
      422,
      "validation_failed",
      "簽名圖片尺寸不得超過 1600 x 800 pixels。",
      [{ path: "signature", message: "簽名圖片尺寸不符合規則。" }],
    );
  }
  return {
    temporaryPath: file.path,
    fileSize: file.size,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export const FileValidator = { validateUpload, validateSignature };
