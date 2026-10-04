const path = require("path");
const { getVoiceIdForGroup } = require("./voice-manager");
const { ensureTtsFile } = require("./tts");
const {
  sleep,
  getSheetKey,
  getGroupRangeName,
  splitIntoGroups,
} = require("./utils");

// 파일 이름에는 시트명을 넣지 않습니다. 시트 구분은 상위 폴더(안정 키)가 담당합니다.
function getGroupFileName(group) {
  return `${getGroupRangeName(group)}_group_raw.mp3`;
}

function buildGroupText(group) {
  return group
    .map(item => item.sentence)
    .join("\n");
}

function validateSettings(config) {
  if (!Number.isInteger(config.groupSize) || config.groupSize < 1) {
    throw new Error("GROUP_SIZE must be a positive integer.");
  }
}

// 생성 대상 계산 (파일을 변경하지 않음). 실제 실행과 dry-run이 함께 사용합니다.
function getGroupTtsTargets(items, { config, sheetInfo }) {
  validateSettings(config);

  const outputDir = path.join(config.dirs.groupRaw, getSheetKey(sheetInfo));
  const split = splitIntoGroups(items, config.groupSize, config.maxGroups);

  const targets = split.groups.map(group => ({
    group,
    filePath: path.join(outputDir, getGroupFileName(group)),
    text: buildGroupText(group),
    firstRowNumber: group[0].rowNumber,
    lastRowNumber: group[group.length - 1].rowNumber,
  }));

  return { targets, ...split };
}

// 이번 실행에서 사용할 그룹 원본 목록을 반환합니다.
async function generateAllGroupTts(items, { config, sheetInfo, ttsClient }) {
  const { targets, incompleteItems } = getGroupTtsTargets(items, { config, sheetInfo });
  const results = [];

  if (incompleteItems.length > 0) {
    console.log(
      `Skipped incomplete group TTS: ${incompleteItems.map(item => item.rowNumber).join(", ")}`
    );
  }

  for (const target of targets) {
    const voiceId = getVoiceIdForGroup(target.group, { config, sheetInfo });

    const result = await ensureTtsFile({
      filePath: target.filePath,
      text: target.text,
      voiceId,
      config,
      ttsClient,
    });

    results.push({
      ...result,
      firstRowNumber: target.firstRowNumber,
      lastRowNumber: target.lastRowNumber,
    });

    if (result.status === "generated") {
      await sleep(config.requestDelayMs);
    }
  }

  return results;
}

module.exports = { generateAllGroupTts, getGroupTtsTargets };

if (require.main === module) {
  console.log(
    "This file is designed to be called from main.js with items from read-sheet.js."
  );
}
