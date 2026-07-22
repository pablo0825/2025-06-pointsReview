import type { Response } from "express";

import {
  cleanupTemporaryUploads,
  type ApplicationUploadRequest,
} from "../middlewares/applicationUpload.middleware";
import { ApplicationSubmissionService } from "../services/applicationSubmission.service";

export async function submitApplication(
  req: ApplicationUploadRequest,
  res: Response,
) {
  try {
    if (!req.applicationPayload || !req.applicationFiles) {
      throw new Error("Application upload middleware did not provide input");
    }
    const result = await ApplicationSubmissionService.submitApplication(
      req.applicationPayload,
      req.applicationFiles,
    );
    res.status(201).json({
      data: {
        ...result,
        submittedAt: result.submittedAt.toISOString(),
      },
    });
  } finally {
    await cleanupTemporaryUploads(req);
  }
}
