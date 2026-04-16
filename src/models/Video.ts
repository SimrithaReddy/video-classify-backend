import { HydratedDocument, model, Schema, Types } from "mongoose";
import type { IVideo, PlaybackVariants } from "../types/domain";

export type VideoDocument = HydratedDocument<IVideo>;

const playbackVariantsSchema = new Schema<PlaybackVariants>(
  {
    original: { type: String },
    hd720: { type: String },
    sd480: { type: String },
  },
  { _id: false }
);

const videoSchema = new Schema<IVideo>(
  {
    tenantId: { type: String, required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "PulseUser", required: true },
    accessScope: {
      type: String,
      enum: ["restricted", "tenant"],
      default: "tenant",
      index: true,
    },
    assignedViewerIds: [{ type: Schema.Types.ObjectId, ref: "PulseUser", default: [] }],//if empty no access for everyone, if userid is present then only user can view 
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    storagePath: { type: String, required: true },
    storageProvider: {
      type: String,
      enum: ["local", "cloudinary"],
      default: "cloudinary",
    },
    cloudinaryPublicId: { type: String },
    cloudinarySecureUrl: { type: String },
    processingStatus: {
      type: String,
      enum: ["uploaded", "processing", "processed", "failed"],
      default: "uploaded",
      index: true,
    },
    processingProgress: { type: Number, default: 0 },
    sensitivityStatus: {
      type: String,
      enum: ["pending", "safe", "flagged"],
      default: "pending", 
      index: true,
    },
    cloudinaryModerationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: false,
      index: true,
    },
    cloudinaryModerationKind: { type: String },
    cloudinaryModerationUpdatedAt: { type: Date },
    category: { type: String, default: "general", index: true },
    durationSeconds: { type: Number, default: 0, index: true },
    playbackVariants: { type: playbackVariantsSchema },
  },
  { timestamps: true }
);

videoSchema.index({ tenantId: 1, fileSize: 1 });
videoSchema.index({ tenantId: 1, createdAt: -1 });
videoSchema.index({ tenantId: 1, assignedViewerIds: 1 });
videoSchema.index({ tenantId: 1, accessScope: 1 });

const Video = model<IVideo>("PulseVideo", videoSchema);

export default Video;
