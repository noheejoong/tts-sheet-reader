const path = require("path");
const { ensureShadowingFile } = require("./shadowing-audio");
const { pad3, getSheetKey } = require("./utils");

function validateSettings(config) {
  if (!Number.isInteger(config.repeatCount) || config.repeatCount < 1) {
    throw new Error("REPEAT_COUNT must be a positive integer.");
  }

  if (
    Number.isNaN(config.sentencePause) ||
    config.sentencePause < 0
  ) {
    throw new Error(
      "DEFAULT_SENTENCE_PAUSE must be a non-negative number."
    );
  }

  if (!(config.audioSpeed > 0)) {
    throw new Error("AUDIO_SPEED must be greater than 0.");
  }
}

function getPlaylistOrder(index, groupSize) {
  const groupIndex = Math.floor(index / groupSize);
  const positionInGroup = index % groupSize;

  return (
    groupIndex * (groupSize + 1) +
    positionInGroup +
    1
  );
}

function getPlaylistSentenceFileName(orderNumber, rowNumber) {
  return `${pad3(orderNumber)}_sentence_${pad3(rowNumber)}.mp3`;
}

// 가공 대상 계산 (파일을 변경하지 않음). 실제 실행과 dry-run이 함께 사용합니다.
// sentenceFiles: [{ rowNumber, path, key }]
function getSentencePlaylistTargets(sentenceFiles, { config, sheetInfo }) {
  validateSettings(config);

  const outputDir = path.join(config.dirs.playlist, getSheetKey(sheetInfo));
  const sorted = [...sentenceFiles].sort((a, b) => a.rowNumber - b.rowNumber);

  return sorted.map((item, index) => ({
    sourcePath: item.path,
    sourceKey: item.key,
    outputPath: path.join(
      outputDir,
      getPlaylistSentenceFileName(getPlaylistOrder(index, config.groupSize), item.rowNumber)
    ),
    repeatCount: config.repeatCount,
    repeatPause: config.sentencePause,
    audioSpeed: config.audioSpeed,
  }));
}

// sentenceFiles: generateAllTts()가 반환한 이번 실행의 문장 원본 목록
// 반환값: 이번 실행의 문장 플레이리스트 파일 목록
async function createShadowingFiles(sentenceFiles, { config, sheetInfo }) {
  const targets = getSentencePlaylistTargets(sentenceFiles, { config, sheetInfo });

  if (targets.length === 0) {
    console.log("No source mp3 files found.");
    return [];
  }

  const results = [];

  for (const target of targets) {
    results.push(await ensureShadowingFile(target));
  }

  console.log("Sentence shadowing completed.");

  return results;
}

module.exports = { createShadowingFiles, getSentencePlaylistTargets };

if (require.main === module) {
  console.log(
    "This file is designed to be called from main.js with files from generate-tts.js."
  );
}
