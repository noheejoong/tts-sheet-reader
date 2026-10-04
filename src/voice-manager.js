const fs = require("fs");
const {
  sanitizeFileName,
  getSheetKey,
  getGroupRangeName,
} = require("./utils");

function loadVoiceMap(voiceMapFile) {
  if (!fs.existsSync(voiceMapFile)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(voiceMapFile, "utf8"));
}

function saveVoiceMap(voiceMapFile, voiceMap) {
  fs.writeFileSync(
    voiceMapFile,
    JSON.stringify(voiceMap, null, 2),
    "utf8"
  );
}

function getRandomVoiceId(voiceIds) {
  const index = Math.floor(Math.random() * voiceIds.length);
  return voiceIds[index];
}

function getVoiceKeys(group, sheetInfo) {
  const rangeName = getGroupRangeName(group);

  return {
    // 안정 키: 스프레드시트 ID + 시트 ID 기반 (시트 이름 변경과 무관)
    groupKey: `${getSheetKey(sheetInfo)}_${rangeName}`,
    // 이전 버전 키: 시트명 + 행 범위
    legacyKey: `${sanitizeFileName(sheetInfo.sheetName)}_${rangeName}`,
  };
}

// 읽기 전용 조회. dry-run에서 사용하며 voice-map을 변경하지 않습니다.
// 반환: { voiceId, source: "assigned" | "legacy" | null }
function lookupVoiceId(group, { config, sheetInfo }) {
  const voiceMap = loadVoiceMap(config.voiceMapFile);
  const { groupKey, legacyKey } = getVoiceKeys(group, sheetInfo);

  if (voiceMap[groupKey]) {
    return { voiceId: voiceMap[groupKey], source: "assigned" };
  }

  if (voiceMap[legacyKey]) {
    return { voiceId: voiceMap[legacyKey], source: "legacy" };
  }

  return { voiceId: null, source: null };
}

function getVoiceIdForGroup(group, { config, sheetInfo }) {
  if (config.voiceIds.length === 0) {
    throw new Error("ELEVENLABS_VOICE_IDS or ELEVENLABS_VOICE_ID is required.");
  }

  const { groupKey } = getVoiceKeys(group, sheetInfo);
  const found = lookupVoiceId(group, { config, sheetInfo });

  if (found.source === "assigned") {
    return found.voiceId;
  }

  // 이전 버전에서 배정된 화자가 있으면 그대로 이어서 사용합니다.
  const voiceMap = loadVoiceMap(config.voiceMapFile);
  voiceMap[groupKey] = found.voiceId || getRandomVoiceId(config.voiceIds);
  saveVoiceMap(config.voiceMapFile, voiceMap);

  return voiceMap[groupKey];
}

module.exports = {
  getVoiceIdForGroup,
  lookupVoiceId,
};
