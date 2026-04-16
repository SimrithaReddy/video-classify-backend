import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import User from "../models/User";
import Video from "../models/Video";
import type { UserRole } from "../types/domain";

interface UpdateRoleBody {
  role?: UserRole;
}

interface UserParams {
  userId: string;
}

interface VideoParams {
  videoId: string;
}

interface AssignViewersBody {
  viewerIds?: string[];
  accessScope?: "restricted" | "tenant";
}

export async function listTenantUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await User.find({ email: { $ne: req.user!.email }, tenantId: req.user!.tenantId, role: { $ne: "admin" } }).select("-passwordHash");
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
}

export async function updateUserRole(
  req: Request<UserParams, {}, UpdateRoleBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { role } = req.body;
    if (!role || !["viewer", "editor", "admin"].includes(role)) {
      res.status(400).json({ message: "Invalid role" });
      return;
    }

    console.log(req.user);
    console.log(req.params);
    console.log(req.params);

    const user = await User.findOneAndUpdate(
      { _id: req.params.userId },
      { role },
      { returnDocument: "after" }
    ).select("-passwordHash");

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function assignVideoViewers(
  req: Request<VideoParams, {}, AssignViewersBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const viewerIds = req.body.viewerIds;
    const accessScope = req.body.accessScope || "restricted";

    if (!["restricted", "tenant"].includes(accessScope)) {
      res.status(400).json({ message: "accessScope must be either restricted or tenant" });
      return;
    }
    if (!Array.isArray(viewerIds)) {
      res.status(400).json({ message: "viewerIds must be an array" });
      return;
    }

    const uniqueViewerIds = [...new Set(viewerIds.filter((id) => Types.ObjectId.isValid(id)))];
    if (uniqueViewerIds.length !== viewerIds.length) {
      res.status(400).json({ message: "viewerIds contains invalid user ids" });
      return;
    }

    const viewers = await User.find({
      _id: { $in: uniqueViewerIds },
      tenantId: req.user!.tenantId,
    }).select("_id");

    if (viewers.length !== uniqueViewerIds.length) {
      res.status(400).json({ message: "All assigned users must exist in the same tenant" });
      return;
    }

    const assignedViewerIds = viewers.map((viewer) => viewer._id);
    const video = await Video.findOneAndUpdate(
      { _id: req.params.videoId, tenantId: req.user!.tenantId },
      { assignedViewerIds, accessScope },
      { returnDocument: "after" }
    );

    if (!video) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    res.json(video);
  } catch (error) {
    next(error);
  }
}

export async function removeTenantUser(
  req: Request<UserParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.params.userId === req.user!.id) {
      res.status(400).json({ message: "You cannot delete your own admin account" });
      return;
    }

    const user = await User.findOneAndDelete({ _id: req.params.userId, tenantId: req.user!.tenantId }).select(
      "-passwordHash"
    );
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    await Video.updateMany(
      { tenantId: req.user!.tenantId },
      {
        $pull: { assignedViewerIds: user._id },
      }
    );
    await Video.deleteMany({ tenantId: req.user!.tenantId, ownerId: user._id });

    res.json({ message: "User removed", user });
  } catch (error) {
    next(error);
  }
}
