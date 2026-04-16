import path from "path";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import env from "../config/env";
import { AppError } from "../utils/errors";

let configured = false;

function ensureCloudinaryConfig() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new AppError("Cloudinary configuration is missing", 500);
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

function sanitizeBaseName(fileName: string): string {
  return path
    .parse(fileName)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function formatCloudinaryError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : "Unknown Cloudinary error";
  if (/self-signed certificate in certificate chain/i.test(rawMessage)) {
    return [
      "Cloudinary upload failed: TLS validation failed while connecting to Cloudinary.",
      "This machine appears to be using a proxy or antivirus certificate that Node does not trust.",
      "Configure Node with the correct CA certificate or disable HTTPS inspection for Cloudinary.",
    ].join(" ");
  }

  return `Cloudinary upload failed: ${rawMessage}`;
}

interface UploadVideoBufferInput {
  buffer: Buffer;
  tenantId: string;
  originalName: string;
}



export async function deleteCloudinaryVideo(publicId: string): Promise<void> {
  const client = ensureCloudinaryConfig();

  try {
    await client.uploader.destroy(publicId, {
      resource_type: "video",
      invalidate: true,
    });
  } catch (error) {
    throw new AppError(formatCloudinaryError(error), 502);
  }
}

export async function uploadVideoBuffer({
  buffer,
  tenantId,
  originalName,
}: UploadVideoBufferInput): Promise<UploadApiResponse> {
  const client = ensureCloudinaryConfig();
  const baseName = sanitizeBaseName(originalName) || "video";
  const publicId = `${tenantId}-${Date.now()}-${baseName}`;

  return new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream(
      {
        folder: `pulse/${tenantId}`,
        public_id: publicId,
        resource_type: "video",
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          const uploadError = new AppError(
            formatCloudinaryError(error), 
            (error as { http_code?: number })?.http_code || 502
          );
          reject(uploadError);
          return;
        }
        // Result will initially show moderation status: "pending"
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}
