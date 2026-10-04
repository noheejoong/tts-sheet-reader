const fs = require("fs");
const path = require("path");
const { loadConfig, PROJECT_ROOT } = require("./config");

require("dotenv").config({ path: path.join(PROJECT_ROOT, ".env") });
const { readSheet } = require("./read-sheet");
const { generateAllGroupTts } = require("./generate-group-tts");
const { createGroupShadowingFiles } = require("./create-group-shadowing");
const { createWeeklyPracticeFolders } = require("./create-weekly-practice");
const { getSheetKey } = require("./utils");

// 사용법:
//   node src/main.js                 실제 실행 (npm start)
//   node src/main.js --dry-run           실행 계획만 표시 (TTS 호출·파일 변경 없음)
//   --output-dir <폴더>              모든 산출물과 voice-map을 이 폴더 아래에 둠 (검증용)
//   --max-groups <n>                 완성된 그룹 중 앞에서 n개만 처리 (검증용)
//   --no-drive                       Google Drive 복사를 하지 않음
function parseArgs(argv) {
  const options = { dryRun: false, outputDir: null, maxGroups: null, noDrive: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-drive") {
      options.noDrive = true;
    } else if (arg === "--output-dir") {
      options.outputDir = argv[++i];
    } else if (arg === "--max-groups") {
      options.maxGroups = Number(argv[++i]);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.outputDir === undefined) {
    throw new Error("--output-dir requires a folder path.");
  }

  if (options.maxGroups !== null && !(Number.isInteger(options.maxGroups) && options.maxGroups > 0)) {
    throw new Error("--max-groups must be a positive integer.");
  }

  return options;
}

function buildConfig(options) {
  const baseDir = options.outputDir ? path.resolve(options.outputDir) : PROJECT_ROOT;
  const config = loadConfig(process.env, baseDir);

  config.maxGroups = options.maxGroups;

  if (options.noDrive) {
    config.googleDriveDir = undefined;
  }

  return config;
}

// 폴더 이름(시트 키)만으로는 어떤 시트인지 알기 어려워 현재 시트명을 함께 기록합니다.
function writeSheetInfo(dir, sheetInfo) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "sheet-info.json"),
    JSON.stringify({ ...sheetInfo, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

// 시트 읽기 이후의 전체 흐름입니다. 테스트에서는 ttsClient와 now를 바꿔 넣습니다.
async function runPipeline({ config, sheetInfo, items, ttsClient, now }) {
  const context = { config, sheetInfo, ttsClient };
  const playlistFiles = [];
  const sheetKey = getSheetKey(sheetInfo);

  writeSheetInfo(path.join(config.dirs.groupRaw, sheetKey), sheetInfo);
  writeSheetInfo(path.join(config.dirs.playlist, sheetKey), sheetInfo);

  let step = 2;

  // 문장 단위 생성 기능은 ENABLE_SENTENCE_LEVEL=true일 때만 실행합니다.
  if (config.enableSentenceLevel) {
    console.log(`${step}. Generating sentence-level files...`);

    // 필요할 때만 관련 모듈을 불러옵니다.
    const { generateAllTts } = require("./generate-tts");
    const { createShadowingFiles } = require("./postprocess-ffmpeg");

    writeSheetInfo(path.join(config.dirs.sentenceRaw, sheetKey), sheetInfo);

    const sentenceFiles = await generateAllTts(items, context);
    playlistFiles.push(...await createShadowingFiles(sentenceFiles, context));

    step++;
  } else {
    console.log(
      "Sentence-level generation is disabled. " +
      "Set ENABLE_SENTENCE_LEVEL=true to enable it."
    );
  }

  console.log(`${step}. Generating group-level TTS files...`);
  const groupFiles = await generateAllGroupTts(items, context);
  step++;

  console.log(`${step}. Creating group-level playlist files...`);
  const groupPlaylistFiles = await createGroupShadowingFiles(groupFiles, context);
  playlistFiles.push(...groupPlaylistFiles);
  step++;

  console.log(`${step}. Creating weekly practice folders...`);
  const weeklyDir = createWeeklyPracticeFolders({ playlistFiles, config, now });

  return { groupFiles, playlistFiles, weeklyDir };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const config = buildConfig(options);

    console.log("1. Reading sentences from G-Sheet...");
    const { sheetInfo, items, blankRowCount } = await readSheet(config);

    console.log(`Total valid sentences: ${items.length}`);

    if (items.length === 0) {
      console.log("No sentences found.");
      return;
    }

    if (options.dryRun) {
      const { planPipeline, printPlan } = require("./dry-run");
      printPlan(planPipeline({ config, sheetInfo, items, blankRowCount }));
      return;
    }

    await runPipeline({ config, sheetInfo, items });

    console.log("All done.");
  } catch (error) {
    console.error("Error occurred:");
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { runPipeline };

if (require.main === module) {
  main();
}
