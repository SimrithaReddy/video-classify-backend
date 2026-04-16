import type { NextFunction, Request, Response } from "express";
import User from "../models/User";
import { verifyToken } from "../utils/jwt";

export default async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.userId).select("-passwordHash");
    if (!user) {
      res.status(401).json({ message: "Invalid token user" });
      return;
    }

    req.user = {
      id: user._id.toString(),
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      name: user.name,
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}
