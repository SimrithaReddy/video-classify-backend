import { HydratedDocument, model, Schema } from "mongoose";
import type { IUser } from "../types/domain";

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ["viewer", "editor", "admin"],
      default: "viewer",
    }
  },
  { timestamps: true }
);

const User = model<IUser>("PulseUser", userSchema);

export default User;
