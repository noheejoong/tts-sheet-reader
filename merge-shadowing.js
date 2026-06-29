const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

require("dotenv").config();

const AUDIO_SPEED = Number(process.env.AUDIO_SPEED || 1.0);

const OUTPUT_SPEED_FOLDER =
  String(process.env.OUTPUT_SPEED_FOLDER || "false")
    .toLowerCase() === "true";

function getShadowingDir() {
  if (!OUTPUT_SPEED_FOLDER) {
    return path.join(__dirname, "shadowing");
  }

  return path.join(
    __dirname,
    `shadowing_${AUDIO_SPEED.toFixed(1)}x`
  );
}

const SHADOWING_DIR = getShadowingDir();

function getMergedDir() {
  if (!OUTPUT_SPEED_FOLDER) {
    return path.join(__dirname, "merged");
  }

  return path.join(
    __dirname,
    `merged_${AUDIO_SPEED.toFixed(1)}x`
  );
}

const MERGED_DIR = getMergedDir();

const BATCH_SIZE = Number(process.env.MERGE_BATCH_SIZE || 30);

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>| ]/g, "_");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function mergeShadowingFiles() {
  ensureDir(MERGED_DIR);

  const sheetName = process.env.SHEET_NAME;
  const safeSheetName = sanitizeFileName(sheetName);

  const files = fs
    .readdirSync(SHADOWING_DIR)
    .filter(file => file.toLowerCase().endsWith(".mp3"))
    .filter(file => file.startsWith(`${safeSheetName}_`))
    .sort();

  if (files.length === 0) {
    console.log("No shadowing files found to merge.");
    return;
  }

  const batches = chunkArray(files, BATCH_SIZE);

  batches.forEach((batch, batchIndex) => {
    const firstFile = batch[0];
    const lastFile = batch[batch.length - 1];

    const firstNo = firstFile.match(/_(\d+)_shadowing\.mp3$/)?.[1] || String(batchIndex * BATCH_SIZE + 1).padStart(3, "0");
    const lastNo = lastFile.match(/_(\d+)_shadowing\.mp3$/)?.[1] || String((batchIndex + 1) * BATCH_SIZE).padStart(3, "0");

    const listFile = path.join(
      __dirname,
      `merge-list-${safeSheetName}-${firstNo}-${lastNo}.txt`
    );

    const outputFile = path.join(
      MERGED_DIR,
      `${safeSheetName}_${firstNo}_${lastNo}.mp3`
    );

    const listText = batch
      .map(file => `file '${path.join(SHADOWING_DIR, file).replace(/\\/g, "/")}'`)
      .join("\n");

    fs.writeFileSync(listFile, listText, "utf8");

    execFileSync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      outputFile,
    ]);

    console.log(`Merged: ${outputFile}`);
  });
}

module.exports = { mergeShadowingFiles };

if (require.main === module) {
  try {
    mergeShadowingFiles();
  } catch (error) {
    console.error(error.message);
  }
}