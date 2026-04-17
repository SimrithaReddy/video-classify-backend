import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import env from "../config/env";
import { verifyToken } from "../utils/jwt";

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || env.frontendOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Socket origin not allowed"));
      },
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.on("auth:join", (token: string) => {
      try {
        const payload = verifyToken(token);
        socket.join(payload.tenantId);
        socket.emit("auth:joined", { tenantId: payload.tenantId });
      } catch {
        socket.emit("auth:error", { message: "Socket auth failed" });
      }
    });
  });

  return io;
}
