import jwt from "jsonwebtoken";
import type { Types } from "mongoose";
import env from "../config/env";
import type { AuthTokenPayload, UserRole } from "../types/domain";

interface TokenUser {
  _id: Types.ObjectId | string;
  tenantId: string;
  role: UserRole;
}

export function signUserToken(user: TokenUser): string {
  return jwt.sign(
    { userId: user._id.toString(), tenantId: user.tenantId, role: user.role },
    env.jwtSecret,
    { expiresIn: "8h" }
  );
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
