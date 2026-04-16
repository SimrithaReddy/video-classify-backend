import type { JwtPayload } from "jsonwebtoken";
import type { Types } from "mongoose";

export type UserRole = "viewer" | "editor" | "admin";
export type StorageProvider = "local" | "cloudinary";
export type ProcessingStatus = "uploaded" | "processing" | "processed" | "failed";
export type SensitivityStatus = "pending" | "safe" | "flagged";
export type CloudinaryModerationStatus = "pending" | "approved" | "rejected";

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
  name: string;
}

export interface AuthTokenPayload extends JwtPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
}

export interface PlaybackVariants {
  original?: string;
  hd720?: string;
  sd480?: string;
}

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  role: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IVideo {
  tenantId: string;
  ownerId: Types.ObjectId;
  accessScope: "restricted" | "tenant";
  assignedViewerIds: Types.ObjectId[];
  title: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  storageProvider: StorageProvider;
  cloudinaryPublicId?: string;
  cloudinarySecureUrl?: string;
  processingStatus: ProcessingStatus;
  processingProgress: number;
  sensitivityStatus: SensitivityStatus;
  cloudinaryModerationStatus?: CloudinaryModerationStatus;
  cloudinaryModerationKind?: string;
  cloudinaryModerationUpdatedAt?: Date;
  category: string;
  durationSeconds: number;
  playbackVariants?: PlaybackVariants;
  createdAt?: Date;
  updatedAt?: Date;
}
