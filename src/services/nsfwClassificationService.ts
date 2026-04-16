import fs from "fs/promises";
import path from "path";
import jpeg from "jpeg-js";
import * as tf from "@tensorflow/tfjs";
import * as nsfwjs from "nsfwjs";
import ffmpeg = require("ffmpeg-static");
import ffprobeInstaller from "ffprobe-static";
import fluentFfmpeg from "fluent-ffmpeg";
import env from "../config/env";
import type { SensitivityStatus } from "../types/domain";
import { VideoIntelligenceServiceClient } from '@google-cloud/video-intelligence';


if (ffmpeg) {
  fluentFfmpeg.setFfmpegPath(ffmpeg);
}
if (ffprobeInstaller?.path) {
  fluentFfmpeg.setFfprobePath(ffprobeInstaller.path);
}

const FRAME_COUNT = 4;
const PORN_THRESHOLD = 0.65;
const HENTAI_THRESHOLD = 0.65;
const SEXY_THRESHOLD = 0.9;

type NsfwPrediction = {
  className: string;
  probability: number;
};

type FrameSummary = Record<string, number>;

interface ClassificationResult {
  status: Extract<SensitivityStatus, "safe" | "flagged">;
  framesAnalyzed: number;
  frameSummaries: FrameSummary[];
}

let modelPromise: Promise<nsfwjs.NSFWJS> | null = null;

async function getModel(): Promise<nsfwjs.NSFWJS> {
  if (!modelPromise) {
    tf.enableProdMode();
    modelPromise = (async () => {
      await tf.ready();
      return nsfwjs.load("MobileNetV2");
    })();
  }

  return modelPromise;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function extractSampleFrames(
  mediaUrl: string,
  targetDir: string,
  frameCount = FRAME_COUNT
): Promise<string[]> {
  await ensureDir(targetDir);

  return new Promise((resolve, reject) => {
    fluentFfmpeg(mediaUrl)
      .outputOptions(["-qscale:v 2"])
      .on("end", async () => {
        try {
          const entries = await fs.readdir(targetDir);
          const frames = entries
            .filter((name) => name.toLowerCase().endsWith(".jpg"))
            .sort()
            .map((name) => path.join(targetDir, name));
          resolve(frames);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", reject)
      .screenshots({
        count: frameCount,
        folder: targetDir,
        filename: "frame-%i.jpg",
        size: "320x?",
      });
  });
}

function jpegBufferToTensor(buffer: Buffer): tf.Tensor3D {
  const image = jpeg.decode(buffer, { useTArray: true });
  const numChannels = 3;
  const numPixels = image.width * image.height;
  const values = new Int32Array(numPixels * numChannels);

  for (let src = 0, dest = 0; src < image.data.length; src += 4) {
    values[dest++] = image.data[src];
    values[dest++] = image.data[src + 1];
    values[dest++] = image.data[src + 2];
  }

  return tf.tensor3d(values, [image.height, image.width, numChannels], "int32");
}

function summarizePredictions(predictions: NsfwPrediction[]): FrameSummary {
  return predictions.reduce<FrameSummary>((summary, prediction) => {
    summary[prediction.className] = Math.max(summary[prediction.className] || 0, prediction.probability || 0);
    return summary;
  }, {});
}

function isFrameFlagged(summary: FrameSummary): boolean {
  return (
    (summary.Porn || 0) >= PORN_THRESHOLD ||
    (summary.Hentai || 0) >= HENTAI_THRESHOLD ||
    (summary.Sexy || 0) >= SEXY_THRESHOLD
  );
}

export async function classifyVideoSensitivity(mediaUrl: string): Promise<ClassificationResult> {
  if (!mediaUrl) {
    throw new Error("A media URL is required for NSFW classification");
  }

  const model = await getModel();
  const tempRoot = path.resolve(env.uploadDir, "nsfw-frames");
  const targetDir = path.join(tempRoot, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  try {
    const framePaths = await extractSampleFrames(mediaUrl, targetDir);
    if (!framePaths.length) {
      throw new Error("No frames were extracted for NSFW classification");
    }

    const frameSummaries: FrameSummary[] = [];
    for (const framePath of framePaths) {
      const frameBuffer = await fs.readFile(framePath);
      const imageTensor = jpegBufferToTensor(frameBuffer);
      try {
        const predictions = (await model.classify(imageTensor)) as NsfwPrediction[];
        frameSummaries.push(summarizePredictions(predictions));
      } finally {
        imageTensor.dispose();
      }
    }

    return {
      status: frameSummaries.some(isFrameFlagged) ? "flagged" : "safe",
      framesAnalyzed: frameSummaries.length,
      frameSummaries,
    };
  } finally {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
  }
}





