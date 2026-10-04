const path = require("path");

// 소스는 src/에 있고, 설정·데이터·출력 폴더는 프로젝트 루트에 있습니다.
const PROJECT_ROOT = path.join(__dirname, "..");

function splitList(text) {
  return String(text || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function getPlaylistDir(baseDir, audioSpeed, outputSpeedFolder) {
  const baseName = "training_playlist";

  if (!outputSpeedFolder) {
    return path.join(baseDir, baseName);
  }

  return path.join(baseDir, `${baseName}_${audioSpeed.toFixed(1)}x`);
}

// 환경변수를 한곳에서 읽습니다. 테스트에서는 env와 baseDir을 바꿔 넣습니다.
function loadConfig(env = process.env, baseDir = PROJECT_ROOT) {
  const audioSpeed = Number(env.AUDIO_SPEED || 1.0);

  const outputSpeedFolder =
    String(env.OUTPUT_SPEED_FOLDER || "false").toLowerCase() === "true";

  return {
    spreadsheetId: env.SPREADSHEET_ID,
    sheetName: env.SHEET_NAME,
    range: env.RANGE || "A:A",

    elevenLabsApiKey: env.ELEVENLABS_API_KEY,
    voiceIds: splitList(env.ELEVENLABS_VOICE_IDS || env.ELEVENLABS_VOICE_ID),
    modelId: env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
    requestDelayMs: 1000,

    // 검증용: 완성된 그룹 중 앞에서 n개만 처리 (main.js의 --max-groups)
    maxGroups: null,

    enableSentenceLevel: env.ENABLE_SENTENCE_LEVEL === "true",

    groupSize: Number(env.GROUP_SIZE || 3),
    repeatCount: Number(env.REPEAT_COUNT || 2),
    sentencePause: Number(env.DEFAULT_SENTENCE_PAUSE || 2),

    groupReviewModes: splitList(env.GROUP_REVIEW_MODES || "full,short"),
    reviewModeSettings: {
      full: {
        repeatCount: Number(env.GROUP_FULL_REPEAT_COUNT || 10),
        repeatPause: Number(env.GROUP_FULL_REPEAT_PAUSE || 5),
      },
      short: {
        repeatCount: Number(env.GROUP_SHORT_REPEAT_COUNT || 4),
        repeatPause: Number(env.GROUP_SHORT_REPEAT_PAUSE || 5),
      },
    },

    audioSpeed,
    outputSpeedFolder,

    googleDriveDir: env.GOOGLE_DRIVE_DIR,

    dirs: {
      sentenceRaw: path.join(baseDir, "output"),
      groupRaw: path.join(baseDir, "group_output"),
      playlist: getPlaylistDir(baseDir, audioSpeed, outputSpeedFolder),
      weekly: path.join(baseDir, "weekly-practice"),
    },

    voiceMapFile: path.join(baseDir, "voice-map.json"),
  };
}

module.exports = { loadConfig, PROJECT_ROOT };
