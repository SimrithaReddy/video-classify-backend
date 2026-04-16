import crypto from "crypto";
import fs from "fs";
import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import type { Server } from "socket.io";
import User from "../models/User";
import Video from "../models/Video";
import {
  deleteCloudinaryVideo,
  uploadVideoBuffer,
} from "../services/cloudinaryService";
import { runProcessingPipeline } from "../services/processingService";
import type { IVideo, PlaybackVariants, ProcessingStatus, SensitivityStatus } from "../types/domain";
import { AppError } from "../utils/errors";

interface UploadBody {
  title?: string;
  category?: string;
}

interface VideoParams {
  videoId: string;
}

interface VideoListQuery {
  sensitivityStatus?: SensitivityStatus;
  processingStatus?: ProcessingStatus;
  category?: string;
  fromDate?: string;
  toDate?: string;
  minFileSize?: string;
  maxFileSize?: string;
  minDuration?: string;
  maxDuration?: string;
  q?: string;
}

interface StreamQuery {
  quality?: string;
}

async function getAdminOwnerIds(tenantId: string) {
  const admins = await User.find({ tenantId, role: "admin" }).select("_id");
  return admins.map((admin) => admin._id);
}

async function buildVideoAccessFilter(user: NonNullable<Request["user"]>) {
  if (user.role === "admin") {
    return {};
  }

  const userObjectId = new Types.ObjectId(user.id);
  const adminOwnerIds = await getAdminOwnerIds(user.tenantId);
  const adminAssignedFilter = {
    ownerId: { $in: adminOwnerIds },
    assignedViewerIds: userObjectId,
  };
  const adminAllowedViewerFilter = {
    ownerId: { $in: adminOwnerIds },
    $or: [{ accessScope: "tenant" }, { assignedViewerIds: userObjectId }],
  };

  if (user.role === "editor") {
    return {
      $or: [{ ownerId: userObjectId }, adminAssignedFilter],
    };
  }

  return adminAllowedViewerFilter;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPlaybackVariants(video: IVideo & { playbackVariants?: PlaybackVariants | { toObject?: () => PlaybackVariants } }): PlaybackVariants {
  if (!video.playbackVariants) {
    return {};
  }

  if (typeof (video.playbackVariants as { toObject?: () => PlaybackVariants }).toObject === "function") {
    return (video.playbackVariants as { toObject: () => PlaybackVariants }).toObject();
  }

  return video.playbackVariants as PlaybackVariants;
}

export async function uploadVideo(
  req: Request<{}, {}, UploadBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ message: "Video file is required" });
      return;
    }

    const cloudinaryUpload = await uploadVideoBuffer({
      buffer: req.file.buffer,
      tenantId: req.user!.tenantId,
      originalName: req.file.originalname,
    });


    const io = req.app.get("io") as Server;
    const video = await Video.create({
      tenantId: req.user!.tenantId,
      ownerId: req.user!.id,
      title: req.body.title || req.file.originalname,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      storagePath: cloudinaryUpload.secure_url,
      storageProvider: "cloudinary",
      cloudinarySecureUrl: cloudinaryUpload.secure_url,
      category: (req.body.category || "general").trim() || "general",
      durationSeconds: Math.round(cloudinaryUpload.duration || 0),
    });

    io.to(req.user!.tenantId).emit("video:created", {
      videoId: video._id.toString(),
      title: video.title,
      status: video.processingStatus,
    });

    runProcessingPipeline(video._id.toString(), io).catch(async () => {
      await Video.findByIdAndUpdate(video._id, { processingStatus: "failed" });
    });

    res.status(201).json(video);
  } catch (error) {
    next(error);
  }
}

export async function listVideos(
  req: Request<{}, {}, {}, VideoListQuery>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      sensitivityStatus,
      processingStatus,
      category,
      fromDate,
      toDate,
      minFileSize,
      maxFileSize,
      minDuration,
      maxDuration,
      q,
    } = req.query;

    const accessFilter = await buildVideoAccessFilter(req.user!);
    const query: Record<string, unknown> = { tenantId: req.user!.tenantId, ...accessFilter };
    const andFilters: Record<string, unknown>[] = [];
    if (sensitivityStatus) query.sensitivityStatus = sensitivityStatus;
    if (processingStatus) query.processingStatus = processingStatus;
    if (category) query.category = category;
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) (query.createdAt as Record<string, Date>).$gte = new Date(fromDate);
      if (toDate) (query.createdAt as Record<string, Date>).$lte = new Date(toDate);
    }
    if (minFileSize || maxFileSize) {
      query.fileSize = {};
      console.log(minFileSize, maxFileSize, "inFileSize,maxFileSize>>>>>>>>>>>");
      if (minFileSize) (query.fileSize as Record<string, number>).$gte = Number(minFileSize);
      if (maxFileSize) (query.fileSize as Record<string, number>).$lte = Number(maxFileSize);
    }
    if (minDuration || maxDuration) {
      query.durationSeconds = {};
      if (minDuration) (query.durationSeconds as Record<string, number>).$gte = Number(minDuration);
      if (maxDuration) (query.durationSeconds as Record<string, number>).$lte = Number(maxDuration);
    }
    if (q && String(q).trim()) {
      const safe = escapeRegex(String(q).trim());
      andFilters.push({
        $or: [
          { title: new RegExp(safe, "i") },
          { category: new RegExp(safe, "i") },
          { originalName: new RegExp(safe, "i") },
        ],
      });
    }

    if (andFilters.length) {
      query.$and = andFilters;
    }

    console.log(query);
    const videos = await Video.find(query).sort({ createdAt: -1 });
    res.json(videos);
  } catch (error) {
    next(error);
  }
}

export async function listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessFilter = await buildVideoAccessFilter(req.user!);
    const categories = await Video.distinct("category", { tenantId: req.user!.tenantId, ...accessFilter });
    categories.sort((a, b) => String(a).localeCompare(String(b)));
    res.json(categories);
  } catch (error) {
    next(error);
  }
}

export async function getVideo(
  req: Request<VideoParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const accessFilter = await buildVideoAccessFilter(req.user!);
    const video = await Video.findOne({
      _id: req.params.videoId,
      tenantId: req.user!.tenantId,
      ...accessFilter,
    });
    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    res.json(video);
  } catch (error) {
    next(error);
  }
}

export async function deleteVideo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const video = await Video.findOne({
      _id: req.params.videoId,
      tenantId: req.user!.tenantId,
    });

    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    const isAdmin = req.user!.role === "admin";
    const isOwner = video.ownerId.toString() === req.user!.id;
    if (!isAdmin && !isOwner) {
      throw new AppError("You can only delete videos you uploaded", 403);
    }

    if (video.storageProvider === "cloudinary" && video.cloudinaryPublicId) {
      await deleteCloudinaryVideo(video.cloudinaryPublicId);
    }

    if (video.storageProvider === "local" && video.storagePath && fs.existsSync(video.storagePath)) {
      fs.unlinkSync(video.storagePath);
    }

    await video.deleteOne();

    const io = req.app.get("io") as Server;
    io.to(req.user!.tenantId).emit("video:deleted", {
      videoId: video._id.toString(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function streamVideo(
  req: Request<VideoParams, {}, {}, StreamQuery>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const accessFilter = await buildVideoAccessFilter(req.user!);
    const video = await Video.findOne({
      _id: req.params.videoId,
      tenantId: req.user!.tenantId,
      ...accessFilter,
    });
    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }
    if (video.processingStatus !== "processed") {
      res.status(409).json({ message: "Video is not yet ready for streaming" });
      return;
    }

    if (video.storageProvider === "cloudinary" && video.cloudinarySecureUrl) {
      const quality = String(req.query.quality || "720").toLowerCase();
      const variants = getPlaybackVariants(video);

      let redirectUrl = video.cloudinarySecureUrl;
      if (quality === "original" || quality === "orig") {
        redirectUrl = variants.original || video.cloudinarySecureUrl;
      } else if (quality === "480" || quality === "sd") {
        redirectUrl = variants.sd480 || variants.hd720 || video.cloudinarySecureUrl;
      } else {
        redirectUrl = variants.hd720 || variants.original || video.cloudinarySecureUrl;
      }

      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.set("Accept-Ranges", "bytes");
      res.set("CDN-Cache-Control", "public, max-age=31536000");
      res.redirect(302, redirectUrl);
      return;
    }

    if (/^https?:\/\//i.test(video.storagePath)) {
      res.set("Cache-Control", "public, max-age=86400");
      res.redirect(video.storagePath);
      return;
    }

    const stat = fs.statSync(video.storagePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const etag = `W/"${crypto.createHash("sha1").update(`${stat.mtimeMs}-${fileSize}`).digest("hex")}"`;

    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader("ETag", etag);
    res.set("Accept-Ranges", "bytes");
    res.set("Cache-Control", "private, max-age=3600");

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": video.mimeType,
      });
      fs.createReadStream(video.storagePath).pipe(res);
      return;
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = Number.parseInt(parts[0], 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": video.mimeType,
      ETag: etag,
    });

    fs.createReadStream(video.storagePath, { start, end }).pipe(res);
  } catch (error) {
    next(error);
  }
}
