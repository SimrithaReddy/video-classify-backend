import http from "http";
import app from "./app";
import env from "./config/env";
import { connectDb } from "./config/db";
import { initSocket } from "./socket";

async function bootstrap(): Promise<void> {
  try {
    await connectDb();
    const server = http.createServer(app);
    const io = initSocket(server);
    app.set("io", io);
    server.listen(env.port, () => {
      console.log(`Backend listening on port ${env.port}`);
    });
  } catch (error) {
    console.error("Bootstrap failed", error);
    process.exit(1);
  }
}



void bootstrap();
