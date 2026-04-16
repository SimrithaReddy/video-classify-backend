import type { NextFunction, Request, Response } from "express";
import type { Server } from "socket.io";
import Video from "../models/Video";
import {
  extractModerationSnapshot,
  verifyCloudinaryNotificationSignature,
} from "../services/cloudinaryService";

interface CloudinaryWebhookBody {
  public_id?: string;
  moderation_status?: string;
  moderation?: Array<{ kind?: string; status?: string }>;
}

function asRawBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }

  return "";
}

export async function handleCloudinaryWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawBody = asRawBody(req.body);
    if (!rawBody) {
      res.status(400).json({ message: "Webhook body is required" });
      return;
    }

    const signature = String(req.header("X-Cld-Signature") || "");
    const timestampHeader = String(req.header("X-Cld-Timestamp") || "");
    const timestamp = Number(timestampHeader);

    if (!signature || !Number.isFinite(timestamp)) {
      res.status(401).json({ message: "Missing Cloudinary signature headers" });
      return;
    }

    if (!verifyCloudinaryNotificationSignature(rawBody, timestamp, signature)) {
      res.status(401).json({ message: "Invalid Cloudinary webhook signature" });
      return;
    }

    const payload = JSON.parse(rawBody) as CloudinaryWebhookBody;
    if (!payload.public_id) {
      res.status(200).json({ ok: true });
      return;
    }

    const moderationSnapshot = extractModerationSnapshot(
      payload.moderation_status
        ? [{ status: payload.moderation_status }]
        : payload.moderation
    );

    if (!moderationSnapshot) {
      res.status(200).json({ ok: true });
      return;
    }

    const video = await Video.findOneAndUpdate(
      { cloudinaryPublicId: payload.public_id },
      {
        cloudinaryModerationStatus: moderationSnapshot.status,
        cloudinaryModerationKind: moderationSnapshot.kind,
        cloudinaryModerationUpdatedAt: new Date(),
      },
      { new: true }
    );

    if (video) {
      const io = req.app.get("io") as Server;
      io.to(video.tenantId).emit("video:moderation", {
        videoId: video._id.toString(),
        moderationStatus: video.cloudinaryModerationStatus,
        moderationKind: video.cloudinaryModerationKind,
        moderationUpdatedAt: video.cloudinaryModerationUpdatedAt,
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
}
