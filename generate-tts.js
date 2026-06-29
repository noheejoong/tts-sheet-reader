require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { getVoiceIdForGroup } = require("./voice-manager");

const OUTPUT_DIR = path.join(__dirname, "output");

const GROUP_SIZE = Number(process.env.GROUP_SIZE || 3);

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>| ]/g, "_");
}

function getFileName(sheetName, rowNumber) {
  const safeSheetName = sanitizeFileName(sheetName);

  return `${safeSheetName}_${String(rowNumber).padStart(3, "0")}.mp3`;
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function validateSettings() {
  if (!Number.isInteger(GROUP_SIZE) || GROUP_SIZE < 1) {
    throw new Error("GROUP_SIZE must be a positive integer.");
  }
}

async function generateTts(item) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";
  const sheetName = process.env.SHEET_NAME;

  const { rowNumber, sentence, voiceId } = item;

  const fileName = getFileName(sheetName, rowNumber);
  const filePath = path.join(OUTPUT_DIR, fileName);

  if (fs.existsSync(filePath)) {
    console.log(`Skipped existing TTS: ${fileName}`);
    return;
  }

  console.log(
    `Generating TTS: ${fileName} | Voice: ${voiceId}`
  );

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: sentence,
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
      `TTS failed at sheet row ${rowNumber}: ` +
      `${response.status} ${errorText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  fs.writeFileSync(filePath, buffer);

  console.log(`Generated TTS: ${fileName}`);
}

async function generateAllTts(items) {
  validateSettings();
  ensureOutputDir();

  const groups = chunkArray(items, GROUP_SIZE);

  for (const group of groups) {
    if (group.length < GROUP_SIZE) {
      console.log(
        `Skipped incomplete sentence TTS group: ` +
        `${group.map(item => item.rowNumber).join(", ")}`
      );
      continue;
    }

    const voiceId = getVoiceIdForGroup(group);

    for (const item of group) {
      await generateTts({
        ...item,
        voiceId,
      });

      await sleep(1000);
    }
  }
}

module.exports = { generateAllTts };