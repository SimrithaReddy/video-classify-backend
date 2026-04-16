import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const env = {
  port: Number(process.env.PORT || 5000),
  backendUrl: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/video_app",
  jwtSecret: process.env.JWT_SECRET || "",
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads"),
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  googleKey: process.env.GOOGLE_CLOUD_API_KEY || "",
};

export default env;
