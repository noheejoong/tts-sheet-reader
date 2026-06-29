require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const INPUT_DIR = path.join(__dirname, "output");

const AUDIO_SPEED = Number(process.env.AUDIO_SPEED || 1.0);

const OUTPUT_SPEED_FOLDER =
  String(process.env.OUTPUT_SPEED_FOLDER || "false")
    .toLowerCase() === "true";

const REPEAT_COUNT = Number(process.env.REPEAT_COUNT || 2);

const DEFAULT_SENTENCE_PAUSE = Number(
  process.env.DEFAULT_SENTENCE_PAUSE || 2
);

const GROUP_SIZE = Number(process.env.GROUP_SIZE || 3);

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>| ]/g, "_");
}

function getTrainingPlaylistDir() {
  const baseName = "training_playlist";

  if (!OUTPUT_SPEED_FOLDER) {
    return path.join(__dirname, baseName);
  }

  return path.join(
    __dirname,
    `${baseName}_${AUDIO_SPEED.toFixed(1)}x`
  );
}

const OUTPUT_DIR = getTrainingPlaylistDir();

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }
}

function validateSettings() {
  if (!Number.isInteger(REPEAT_COUNT) || REPEAT_COUNT < 1) {
    throw new Error("REPEAT_COUNT must be a positive integer.");
  }

  if (
    Number.isNaN(DEFAULT_SENTENCE_PAUSE) ||
    DEFAULT_SENTENCE_PAUSE < 0
  ) {
    throw new Error(
      "DEFAULT_SENTENCE_PAUSE must be a non-negative number."
    );
  }

  if (AUDIO_SPEED <= 0) {
    throw new Error("AUDIO_SPEED must be greater than 0.");
  }

  // if(PAUSE_SECONDS) {
  //   for (const pause of PAUSE_SECONDS) {
  //     if (Number.isNaN(pause) || pause < 0) {
  //       throw new Error(
  //         "PAUSE_SECONDS must contain valid non-negative numbers."
  //       );
  //     }
  //   }
  // }
}

function extractRowNumber(fileName) {
  const match = fileName.match(/_(\d+)\.mp3$/);

  return match ? Number(match[1]) : null;
}

function getSourceFiles() {
  const sheetName = process.env.SHEET_NAME;
  const safeSheetName = sanitizeFileName(sheetName);

  return fs
    .readdirSync(INPUT_DIR)
    .filter(file => file.toLowerCase().endsWith(".mp3"))
    .filter(file => file.startsWith(`${safeSheetName}_`))
    .map(file => ({
      file,
      rowNumber: extractRowNumber(file),
    }))
    .filter(item => item.rowNumber !== null)
    .sort((a, b) => a.rowNumber - b.rowNumber);
}

function getPlaylistOrder(index) {
  const groupIndex = Math.floor(index / GROUP_SIZE);
  const positionInGroup = index % GROUP_SIZE;

  return (
    groupIndex * (GROUP_SIZE + 1) +
    positionInGroup +
    1
  );
}

function getPlaylistSentenceFileName(orderNumber, rowNumber) {
  return (
    `${String(orderNumber).padStart(3, "0")}` +
    `_sentence_` +
    `${String(rowNumber).padStart(3, "0")}.mp3`
  );
}

function createFilterComplex(repeatCount) {
  const parts = [];

  for (let i = 0; i < repeatCount; i++) {
    parts.push("[0:a]");
    parts.push(`[${i + 1}:a]`);
  }

  return (
    `${parts.join("")}` +
    `concat=n=${repeatCount * 2}:v=0:a=1[temp];` +
    `[temp]atempo=${AUDIO_SPEED}[out]`
  );
}

function buildFfmpegArgs(inputPath, outputPath) {
  const args = [
    "-y",
    "-i", inputPath,
  ];

  for (let i = 0; i < REPEAT_COUNT; i++) {
    args.push(
      "-f", "lavfi",
      "-t", String(DEFAULT_SENTENCE_PAUSE),
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"
    );
  }
  
  args.push(
    "-filter_complex", createFilterComplex(REPEAT_COUNT),
    "-map", "[out]",
    outputPath
  );

  return args;
}

function createShadowingFiles() {
  validateSettings();
  ensureOutputDir();

  const sourceFiles = getSourceFiles();

  if (sourceFiles.length === 0) {
    console.log("No source mp3 files found.");
    return;
  }

  sourceFiles.forEach((item, index) => {
    const orderNumber = getPlaylistOrder(index);

    const outputFileName = getPlaylistSentenceFileName(
      orderNumber,
      item.rowNumber
    );

    const inputPath = path.join(INPUT_DIR, item.file);

    const outputPath = path.join(
      OUTPUT_DIR,
      outputFileName
    );

    if (fs.existsSync(outputPath)) {
      console.log(
        `Skipped existing sentence file: ${outputFileName}`
      );
      return;
    }

    console.log(
      `Creating sentence shadowing file: ${outputFileName}`
    );

    execFileSync(
      "ffmpeg",
      buildFfmpegArgs(inputPath, outputPath)
    );
  });

  console.log("Sentence shadowing completed.");
}

module.exports = { createShadowingFiles };

if (require.main === module) {
  try {
    createShadowingFiles();

    console.log("Postprocess completed.");
  } catch (error) {
    console.error("Postprocess failed:");
    console.error(error.message);
  }
}