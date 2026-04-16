import multer, { type FileFilterCallback } from "multer";
import { AppError } from "../utils/errors";

const allowedMimeTypes = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
const maxVideoUploadSizeBytes = 70 * 1024 * 1024;

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxVideoUploadSizeBytes,
  },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      cb(new AppError("Only video files are supported. Please upload a valid video file.", 400));
      return;
    }

    cb(null, true);
  },
});
