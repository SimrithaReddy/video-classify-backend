import { v2 as cloudinary } from "cloudinary";
import env from "../config/env";
import type { PlaybackVariants } from "../types/domain";

let configured = false;

function ensureCloudinaryConfig() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    return null;
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env.cloudinaryCloudName,
      api_key: env.cloudinaryApiKey,
      api_secret: env.cloudinaryApiSecret,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

export function buildPlaybackVariants(publicId?: string): PlaybackVariants | null {
  const client = ensureCloudinaryConfig();
  if (!client || !publicId) {
    return null;
  }

  const base = { resource_type: "video", secure: true } as const;

  return {
    original: client.url(publicId, { ...base }),
    hd720: client.url(publicId, {
      ...base,
      transformation: [{ width: 1280, crop: "limit" }, { quality: "auto:good", fetch_format: "auto" }],
    }),
    sd480: client.url(publicId, {
      ...base,
      transformation: [{ width: 854, crop: "limit" }, { quality: "auto:eco", fetch_format: "auto" }],
    }),
  };
}
