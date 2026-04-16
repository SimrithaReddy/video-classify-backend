import ffmpeg = require("ffmpeg-static");
import ffprobeInstaller from "ffprobe-static";
import fluentFfmpeg from "fluent-ffmpeg";

if (ffmpeg) {
  fluentFfmpeg.setFfmpegPath(ffmpeg);
}
if (ffprobeInstaller?.path) {
  fluentFfmpeg.setFfprobePath(ffprobeInstaller.path);
}

export function probeDurationSeconds(mediaUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    fluentFfmpeg.ffprobe(mediaUrl, (error, metadata) => {
      if (error) {
        reject(error);
        return;
      }

      const duration = metadata?.format?.duration;
      resolve(typeof duration === "number" ? Math.round(duration) : 0);
    });
  });
}
