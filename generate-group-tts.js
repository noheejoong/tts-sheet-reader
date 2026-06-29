require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { getVoiceIdForGroup } = require("./voice-manager");

const GROUP_OUTPUT_DIR = path.join(__dirname, "group_output");

const GROUP_SIZE = Number(process.env.GROUP_SIZE || 3);

function ensureGroupOutputDir() {
  if (!fs.existsSync(GROUP_OUTPUT_DIR)) {
    fs.mkdirSync(GROUP_OUTPUT_DIR);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>| ]/g, "_");
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function getGroupFileName(group) {
  const sheetName = process.env.SHEET_NAME;
  const safeSheetName = sanitizeFileName(sheetName);

  const firstNo = String(group[0].rowNumber).padStart(3, "0");
  const lastNo = String(group[group.length - 1].rowNumber).padStart(3, "0");

  return `${safeSheetName}_${firstNo}_${lastNo}_group_raw.mp3`;
}

function buildGroupText(group) {
  return group
    .map(item => item.sentence)
    .join("\n");
}

function validateSettings() {
  if (!Number.isInteger(GROUP_SIZE) || GROUP_SIZE < 1) {
    throw new Error("GROUP_SIZE must be a positive integer.");
  }
}

async function generateGroupTts(group, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";

  const fileName = getGroupFileName(group);
  const filePath = path.join(GROUP_OUTPUT_DIR, fileName);

  if (fs.existsSync(filePath)) {
    console.log(`Skipped existing group TTS: ${fileName}`);
    return;
  }

  const text = buildGroupText(group);

  console.log(`Generating group TTS: ${fileName} | Voice: ${voiceId}`);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.7,
        similarity_boost: 0.8,
        speed: 0.9,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Group TTS failed: ${fileName}: ${response.status} ${errorText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  fs.writeFileSync(filePath, buffer);

  console.log(`Generated group TTS: ${fileName}`);
}

async function generateAllGroupTts(items) {
  validateSettings();
  ensureGroupOutputDir();

  const groups = chunkArray(items, GROUP_SIZE);

  for (const group of groups) {
    if (group.length < GROUP_SIZE) {
      console.log(
        `Skipped incomplete group TTS: ${group.map(item => item.rowNumber).join(", ")}`
      );
      continue;
    }

    const voiceId = getVoiceIdForGroup(group);

    await generateGroupTts(group, voiceId);

    await sleep(1000);
  }
}

module.exports = { generateAllGroupTts };

if (require.main === module) {
  console.log(
    "This file is designed to be called from main.js with items from read-sheet.js."
  );
}