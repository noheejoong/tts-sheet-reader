const path = require("path");
const { ensureShadowingFile } = require("./shadowing-audio");
const { pad3, getSheetKey } = require("./utils");

function validateSettings(config) {
  if (!Number.isInteger(config.groupSize) || config.groupSize < 1) {
    throw new Error("GROUP_SIZE must be a positive integer.");
  }

  if (!(config.audioSpeed > 0)) {
    throw new Error("AUDIO_SPEED must be greater than 0.");
  }

  for (const mode of config.groupReviewModes) {
    const setting = config.reviewModeSettings[mode];

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

function getPlaylistGroupFileName(groupIndex, groupFile, mode, groupSize) {
  const firstNo = pad3(groupFile.firstRowNumber);
  const lastNo = pad3(groupFile.lastRowNumber);

  let orderNumber;

  if (mode === "full") {
    // 기존 흐름 유지: 001,002,003,004_group_full...
    orderNumber = (groupIndex + 1) * (groupSize + 1);
  } else {
    // short 버전은 뒤쪽에 모음
    orderNumber = 900 + groupIndex + 1;
  }

  return `${pad3(orderNumber)}_group_${mode}_${firstNo}_${lastNo}.mp3`;
}

// 가공 대상 계산 (파일을 변경하지 않음). 실제 실행과 dry-run이 함께 사용합니다.
// groupFiles: [{ firstRowNumber, lastRowNumber, path, key }]
function getGroupPlaylistTargets(groupFiles, { config, sheetInfo }) {
  validateSettings(config);

  const outputDir = path.join(config.dirs.playlist, getSheetKey(sheetInfo));
  const sorted = [...groupFiles].sort((a, b) => a.firstRowNumber - b.firstRowNumber);

  return sorted.flatMap((groupFile, index) =>
    config.groupReviewModes.map(mode => {
      const setting = config.reviewModeSettings[mode];

      return {
        sourcePath: groupFile.path,
        sourceKey: groupFile.key,
        outputPath: path.join(
          outputDir,
          getPlaylistGroupFileName(index, groupFile, mode, config.groupSize)
        ),
        repeatCount: setting.repeatCount,
        repeatPause: setting.repeatPause,
        audioSpeed: config.audioSpeed,
      };
    })
  );
}

// groupFiles: generateAllGroupTts()가 반환한 이번 실행의 그룹 원본 목록
// 반환값: 이번 실행의 그룹 플레이리스트 파일 목록
async function createGroupShadowingFiles(groupFiles, { config, sheetInfo }) {
  const targets = getGroupPlaylistTargets(groupFiles, { config, sheetInfo });

  if (targets.length === 0) {
    console.log("No group raw mp3 files found.");
    return [];
  }

  const results = [];

  for (const target of targets) {
    results.push(await ensureShadowingFile(target));
  }

  console.log("Group shadowing completed.");

  return results;
}

module.exports = { createGroupShadowingFiles, getGroupPlaylistTargets };

if (require.main === module) {
  console.log(
    "This file is designed to be called from main.js with files from generate-group-tts.js."
  );
}
