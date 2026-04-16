import express from "express";
import {
  deleteVideo,
  getVideo,
  listCategories,
  listVideos,
  streamVideo,
  uploadVideo,
} from "../controllers/videoController";
import authMiddleware from "../middleware/auth";
import allowRoles from "../middleware/rbac";
import { uploadMiddleware } from "../services/storageService";

const router = express.Router();

router.use(authMiddleware);
router.get("/", listVideos);
router.get("/meta/categories", listCategories);
router.get("/:videoId/stream", streamVideo);
router.get("/:videoId", getVideo);
router.delete("/:videoId", allowRoles("editor", "admin"), deleteVideo);
router.post("/", allowRoles("editor", "admin"), uploadMiddleware.single("video"), uploadVideo);

export default router;
