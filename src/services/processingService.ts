import type { Server } from "socket.io";
import Video, { type VideoDocument } from "../models/Video";
import { probeDurationSeconds } from "./ffmpegProbeService";
import { classifyVideoSensitivity } from "./nsfwClassificationService";
import { buildPlaybackVariants } from "./videoTransformService";
import type { SensitivityStatus } from "../types/domain";
import { getErrorMessage } from "../utils/errors";
import env from "../config/env";
import OpenAI from "openai";



export function classifySensitivityFallback(video: Pick<VideoDocument, "title" | "fileSize" | "originalName">): Extract<SensitivityStatus, "safe" | "flagged"> {
  const input = `${video.title}-${video.fileSize}-${video.originalName}`.toLowerCase();
  const keywords = ["violence", "blood", "nsfw", "weapon", "graphic"];
  const hasSensitiveWord = keywords.some((word) => input.includes(word));
  if (hasSensitiveWord || video.fileSize % 7 === 0) {
    return "flagged";
  }

  return "safe";
}

export async function classifySensitivity(
  video: Pick<VideoDocument, "title" | "fileSize" | "originalName" | "cloudinarySecureUrl" | "storagePath">
): Promise<Extract<SensitivityStatus, "safe" | "flagged">> {
  const mediaUrl = video.cloudinarySecureUrl || video.storagePath;
  try {

    const nsfwResult = await classifyVideoSensitivity(mediaUrl);
    if (nsfwResult.status === "flagged") {
      return "flagged";
    }
    return "safe";

  } catch (error) {
    throw error instanceof Error ? error : new Error("Sensitivity analysis failed");
  }
}

async function emitProgress(
  io: Server,
  tenantId: string,
  videoId: string,
  progress: number,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const updated = await Video.findByIdAndUpdate(videoId, { processingProgress: progress }, { new: true });
  if (!updated) {
    return;
  }

  io.to(tenantId).emit("video:progress", {
    videoId: updated._id.toString(),
    progress: updated.processingProgress,
    status: updated.processingStatus,
    sensitivityStatus: updated.sensitivityStatus,
    ...extra,
  });
}

export async function runProcessingPipeline(videoId: string, io: Server): Promise<void> {
  const video = await Video.findById(videoId);
  if (!video) {
    return;
  }

  await Video.findByIdAndUpdate(videoId, {
    processingStatus: "processing",
    processingProgress: 0,
  });
  io.to(video.tenantId).emit("video:progress", {
    videoId,
    progress: 0,
    status: "processing",
    sensitivityStatus: video.sensitivityStatus,
    step: "start",
  });

  try {
    await emitProgress(io, video.tenantId, videoId, 12, { step: "probe" });

    if (video.cloudinarySecureUrl) {
      try {
        const probedSeconds = await probeDurationSeconds(video.cloudinarySecureUrl);
        if (probedSeconds > 0) {
          await Video.findByIdAndUpdate(videoId, { durationSeconds: probedSeconds });
        }
      } catch {
        // Keep the Cloudinary-reported duration if probing fails.
      }
    }

    await emitProgress(io, video.tenantId, videoId, 38, { step: "sensitivity" });

    const latest = await Video.findById(videoId);
    const sensitivity = await classifySensitivity(latest || video);
    await Video.findByIdAndUpdate(videoId, { sensitivityStatus: sensitivity });

    await emitProgress(io, video.tenantId, videoId, 62, { step: "transcode_variants" });

    const variants = buildPlaybackVariants(video.cloudinaryPublicId);
    if (variants) {
      await Video.findByIdAndUpdate(videoId, { playbackVariants: variants });
    }

    await emitProgress(io, video.tenantId, videoId, 88, { step: "finalize" });

    await Video.findByIdAndUpdate(videoId, {
      processingStatus: "processed",
      processingProgress: 100,
    });

    const finalVideo = await Video.findById(videoId);
    if (!finalVideo) {
      return;
    }

    io.to(finalVideo.tenantId).emit("video:completed", {
      videoId: finalVideo._id.toString(),
      status: finalVideo.processingStatus,
      progress: finalVideo.processingProgress,
      sensitivityStatus: finalVideo.sensitivityStatus,
      step: "done",
    });
  } catch (error) {
    await Video.findByIdAndUpdate(videoId, { processingStatus: "failed", processingProgress: 0 });
    io.to(video.tenantId).emit("video:failed", {
      videoId,
      message: getErrorMessage(error) || "Processing failed",
    });
  }
}
