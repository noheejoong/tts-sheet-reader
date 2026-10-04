const path = require("path");
const { getVoiceIdForGroup } = require("./voice-manager");
const { ensureTtsFile } = require("./tts");
const {
  pad3,
  sleep,
  getSheetKey,
  splitIntoGroups,
} = require("./utils");

// 파일 이름에는 시트명을 넣지 않습니다. 시트 구분은 상위 폴더(안정 키)가 담당합니다.
function getFileName(rowNumber) {
  return `sentence_${pad3(rowNumber)}.mp3`;
}

function validateSettings(config) {
  if (!Number.isInteger(config.groupSize) || config.groupSize < 1) {
    throw new Error("GROUP_SIZE must be a positive integer.");
  }
}

// 생성 대상 계산 (파일을 변경하지 않음). 실제 실행과 dry-run이 함께 사용합니다.
function getSentenceTtsTargets(items, { config, sheetInfo }) {
  validateSettings(config);

  const outputDir = path.join(config.dirs.sentenceRaw, getSheetKey(sheetInfo));
  const split = splitIntoGroups(items, config.groupSize, config.maxGroups);

  // 같은 그룹의 문장은 같은 화자를 사용하므로 group을 함께 전달합니다.
  const targets = split.groups.flatMap(group =>
    group.map(item => ({
      group,
      rowNumber: item.rowNumber,
      filePath: path.join(outputDir, getFileName(item.rowNumber)),
      text: item.sentence,
    }))
  );

  return { targets, ...split };
}

// 이번 실행에서 사용할 문장 원본 목록을 반환합니다.
async function generateAllTts(items, { config, sheetInfo, ttsClient }) {
  const { targets, incompleteItems } = getSentenceTtsTargets(items, { config, sheetInfo });
  const results = [];

  if (incompleteItems.length > 0) {
    console.log(
      `Skipped incomplete sentence TTS group: ` +
      `${incompleteItems.map(item => item.rowNumber).join(", ")}`
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

    results.push({ ...result, rowNumber: target.rowNumber });

    if (result.status === "generated") {
      await sleep(config.requestDelayMs);
    }
  }

  return results;
}

module.exports = { generateAllTts, getSentenceTtsTargets };
