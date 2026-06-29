const fs = require("fs");
const path = require("path");

const VOICE_MAP_FILE = path.join(__dirname, "voice-map.json");

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>| ]/g, "_");
}

function getVoiceIds() {
  const voiceIdsText =
    process.env.ELEVENLABS_VOICE_IDS ||
    process.env.ELEVENLABS_VOICE_ID;

  if (!voiceIdsText) {
    throw new Error("ELEVENLABS_VOICE_IDS or ELEVENLABS_VOICE_ID is required.");
  }

  return voiceIdsText
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function loadVoiceMap() {
  if (!fs.existsSync(VOICE_MAP_FILE)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(VOICE_MAP_FILE, "utf8"));
}

function saveVoiceMap(voiceMap) {
  fs.writeFileSync(
    VOICE_MAP_FILE,
    JSON.stringify(voiceMap, null, 2),
    "utf8"
  );
}

function getRandomVoiceId(voiceIds) {
  const index = Math.floor(Math.random() * voiceIds.length);
  return voiceIds[index];
}

function getGroupKey(group) {
  const sheetName = sanitizeFileName(process.env.SHEET_NAME);

  const firstNo = String(group[0].rowNumber).padStart(3, "0");
  const lastNo = String(group[group.length - 1].rowNumber).padStart(3, "0");

  return `${sheetName}_${firstNo}_${lastNo}`;
}

function getVoiceIdForGroup(group) {
  const voiceIds = getVoiceIds();
  const voiceMap = loadVoiceMap();

  const groupKey = getGroupKey(group);

  if (!voiceMap[groupKey]) {
    voiceMap[groupKey] = getRandomVoiceId(voiceIds);
    saveVoiceMap(voiceMap);
  }

  return voiceMap[groupKey];
}

module.exports = {
  getVoiceIdForGroup,
};