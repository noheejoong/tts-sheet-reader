require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const GROUP_INPUT_DIR = path.join(__dirname, "group_output");

const GROUP_SIZE = Number(process.env.GROUP_SIZE || 3);
const AUDIO_SPEED = Number(process.env.AUDIO_SPEED || 1.0);

const OUTPUT_SPEED_FOLDER =
  String(process.env.OUTPUT_SPEED_FOLDER || "false")
    .toLowerCase() === "true";

const GROUP_REVIEW_MODES = (process.env.GROUP_REVIEW_MODES || "full,short")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const REVIEW_MODE_SETTINGS = {
  full: {
    repeatCount: Number(process.env.GROUP_FULL_REPEAT_COUNT || 10),
    repeatPause: Number(process.env.GROUP_FULL_REPEAT_PAUSE || 5),
  },
  short: {
    repeatCount: Number(process.env.GROUP_SHORT_REPEAT_COUNT || 4),
    repeatPause: Number(process.env.GROUP_SHORT_REPEAT_PAUSE || 5),
  },
};

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>| ]/g, "_");
}

function getTrainingPlaylistDir() {
  const baseName = "training_playlist";

  if (!OUTPUT_SPEED_FOLDER) {
    return path.join(__dirname, baseName);
  }

  return path.join(__dirname, `${baseName}_${AUDIO_SPEED.toFixed(1)}x`);
}

const OUTPUT_DIR = getTrainingPlaylistDir();

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }
}

function validateSettings() {
  if (!Number.isInteger(GROUP_SIZE) || GROUP_SIZE < 1) {
    throw new Error("GROUP_SIZE must be a positive integer.");
  }

  if (Number.isNaN(AUDIO_SPEED) || AUDIO_SPEED <= 0) {
    throw new Error("AUDIO_SPEED must be greater than 0.");
  }

  for (const mode of GROUP_REVIEW_MODES) {
    const setting = REVIEW_MODE_SETTINGS[mode];

    if (!setting) {
      throw new Error(`Unknown GROUP_REVIEW_MODE: ${mode}`);
    }

    if (!Number.isInteger(setting.repeatCount) || setting.repeatCount < 1) {
      throw new Error(`${mode} repeatCount must be a positive integer.`);
    }

    if (Number.isNaN(setting.repeatPause) || setting.repeatPause < 0) {
      throw new Error(`${mode} repeatPause must be a non-negative number.`);
    }
  }
}

function extractGroupInfo(fileName) {
  const match = fileName.match(/_(\d+)_(\d+)_group_raw\.mp3$/);

  if (!match) {
    return null;
  }

  return {
    firstRowNumber: Number(match[1]),
    lastRowNumber: Number(match[2]),
  };
}

function getGroupRawFiles() {
  const sheetName = process.env.SHEET_NAME;
  const safeSheetName = sanitizeFileName(sheetName);

  return fs
    .readdirSync(GROUP_INPUT_DIR)
    .filter(file => file.toLowerCase().endsWith(".mp3"))
    .filter(file => file.startsWith(`${safeSheetName}_`))
    .map(file => {
      const groupInfo = extractGroupInfo(file);

      return {
        file,
        ...groupInfo,
      };
    })
    .filter(item => item.firstRowNumber && item.lastRowNumber)
    .sort((a, b) => a.firstRowNumber - b.firstRowNumber);
}

function getGroupOrderNumber(groupIndex) {
  return (groupIndex + 1) * (GROUP_SIZE + 1);
}

function getPlaylistGroupFileName(groupIndex, groupFile, mode) {
  const firstNo = String(groupFile.firstRowNumber).padStart(3, "0");
  const lastNo = String(groupFile.lastRowNumber).padStart(3, "0");

  let orderNumber;

  if (mode === "full") {
    // 기존 흐름 유지: 001,002,003,004_group_full...
    orderNumber = (groupIndex + 1) * (GROUP_SIZE + 1);
  } else {
    // short 버전은 뒤쪽에 모음
    orderNumber = 900 + groupIndex + 1;
  }

  return (
    `${String(orderNumber).padStart(3, "0")}` +
    `_group_${mode}_` +
    `${firstNo}_${lastNo}.mp3`
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

function buildFfmpegArgs(inputPath, outputPath, repeatCount, repeatPause) {
  const args = [
    "-y",
    "-i", inputPath,
  ];

  for (let i = 0; i < repeatCount; i++) {
    args.push(
      "-f", "lavfi",
      "-t", String(repeatPause),
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"
    );
  }

  args.push(
    "-filter_complex", createFilterComplex(repeatCount),
    "-map", "[out]",
    outputPath
  );

  return args;
}

function createGroupShadowingFiles() {
  validateSettings();
  ensureOutputDir();

  if (!fs.existsSync(GROUP_INPUT_DIR)) {
    console.log("No group_output folder found.");
    return;
  }

  const groupFiles = getGroupRawFiles();

  if (groupFiles.length === 0) {
    console.log("No group raw mp3 files found.");
    return;
  }

  groupFiles.forEach((groupFile, index) => {
    for (const mode of GROUP_REVIEW_MODES) {
      const setting = REVIEW_MODE_SETTINGS[mode];

      const outputFileName = getPlaylistGroupFileName(index, groupFile, mode);
      const inputPath = path.join(GROUP_INPUT_DIR, groupFile.file);
      const outputPath = path.join(OUTPUT_DIR, outputFileName);

      if (fs.existsSync(outputPath)) {
        console.log(`Skipped existing group file: ${outputFileName}`);
        continue;
      }

      console.log(
        `Creating ${mode} group file: ${outputFileName} ` +
        `(repeat=${setting.repeatCount}, pause=${setting.repeatPause}s)`
      );

      execFileSync(
        "ffmpeg",
        buildFfmpegArgs(
          inputPath,
          outputPath,
          setting.repeatCount,
          setting.repeatPause
        )
      );
    }
  });

  console.log("Group shadowing completed.");
}

module.exports = { createGroupShadowingFiles };

if (require.main === module) {
  try {
    createGroupShadowingFiles();
  } catch (error) {
    console.error("Group shadowing failed:");
    console.error(error.message);
  }
}