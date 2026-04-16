import express from "express";
import {
  assignVideoViewers,
  listTenantUsers,
  removeTenantUser,
  updateUserRole,
} from "../controllers/adminController";
import authMiddleware from "../middleware/auth";
import allowRoles from "../middleware/rbac";

const router = express.Router();

router.use(authMiddleware, allowRoles("admin"));
router.get("/users", listTenantUsers);
router.patch("/users/:userId/role", updateUserRole);
router.delete("/users/:userId", removeTenantUser);
router.patch("/videos/:videoId/viewers", assignVideoViewers);

export default router;
