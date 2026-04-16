import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import User from "../models/User";
import { signUserToken } from "../utils/jwt";
import type { UserDocument } from "../models/User";
import type { UserRole } from "../types/domain";

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  tenantId?: string;
  role?: UserRole;
}

interface LoginBody {
  email?: string;
  password?: string;
}

function sanitizeUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
  };
}

export async function register(
  req: Request<{}, {}, RegisterBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, password, tenantId, role } = req.body;
    if (!name || !email || !password || !tenantId) {
      res.status(400).json({ message: "name, email, password and tenantId are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ message: "Email already exists" });
      return;
    }

    const existingTenantAdmin = await User.findOne({ tenantId, role: 'admin' });
    if (existingTenantAdmin) {
      res.status(409).json({ message: "Admin already exists for this tenant" });
      return;
    }


    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      tenantId,
      role: role || "viewer",
    });

    const token = signUserToken(user);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request<{}, {}, LoginBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }
    console.log(User)

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = signUserToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
}
