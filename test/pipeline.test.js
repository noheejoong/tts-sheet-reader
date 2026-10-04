// 실제 ElevenLabs / Google API를 호출하지 않는 통합 테스트입니다.
// TTS는 ffmpeg로 짧은 MP3를 만드는 mock으로 대체하고, 모든 경로는 임시 폴더를 사용합니다.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const { loadConfig } = require("../src/config");
const { runPipeline } = require("../src/main");
const { ensureShadowingFile } = require("../src/shadowing-audio");
const { getSheetKey } = require("../src/utils");
const { planPipeline } = require("../src/dry-run");
const { readMeta } = require("../src/audio-cache");

const SHEET_A = { spreadsheetId: "spreadsheet-A", sheetId: 0, sheetName: "Week 1" };
// 시트명과 행 번호가 같지만 다른 스프레드시트
const SHEET_B = { spreadsheetId: "spreadsheet-B", sheetId: 0, sheetName: "Week 1" };

const WEEK_1 = new Date(2026, 8, 21, 12); // 2026-W39
const WEEK_2 = new Date(2026, 8, 28, 12); // 2026-W40

function makeTempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tts-sheet-reader-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function makeConfig(root, overrides = {}) {
  const env = {
    SPREADSHEET_ID: "unused",
    SHEET_NAME: "unused",
    ELEVENLABS_API_KEY: "test-key",
    ELEVENLABS_VOICE_IDS: "voice-1,voice-2",
    ELEVENLABS_MODEL_ID: "test-model",
    GROUP_SIZE: "5",
    REPEAT_COUNT: "2",
    DEFAULT_SENTENCE_PAUSE: "0.1",
    GROUP_REVIEW_MODES: "full,short",
    GROUP_FULL_REPEAT_COUNT: "2",
    GROUP_FULL_REPEAT_PAUSE: "0.1",
    GROUP_SHORT_REPEAT_COUNT: "1",
    GROUP_SHORT_REPEAT_PAUSE: "0.1",
    AUDIO_SPEED: "1.0",
    OUTPUT_SPEED_FOLDER: "true",
    ...overrides,
  };

  const config = loadConfig(env, root);
  config.requestDelayMs = 0;
  config.googleDriveDir = path.join(root, "drive"); // 실제 Drive 대신 임시 폴더
  return config;
}

// 문장 5개 + 빈 행 1개 구조: 001-005, 007-011, ...
function makeItems(groupCount, label) {
  const items = [];

  for (let g = 0; g < groupCount; g++) {
    for (let i = 0; i < 5; i++) {
      const rowNumber = g * 6 + i + 1;
      items.push({ rowNumber, sentence: `${label} sentence ${rowNumber}` });
    }
  }

  return items;
}

function createMockTts(root) {
  const calls = [];

  const client = async ({ text, voiceId }) => {
    calls.push({ text, voiceId });

    const hash = crypto.createHash("sha256").update(`${voiceId}|${text}`).digest();
    const frequency = 200 + (hash.readUInt16BE(0) % 1500);
    const outPath = path.join(root, `mock-${process.pid}-${calls.length}.mp3`);

    execFileSync("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-t", "0.3",
      "-i", `sine=frequency=${frequency}:sample_rate=44100`,
      "-ac", "1",
      outPath,
    ]);

    const buffer = fs.readFileSync(outPath);
    fs.rmSync(outPath);
    return buffer;
  };

  return { client, calls };
}

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function duration(filePath) {
  return Number(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath,
    ]).toString()
  );
}

function listTmpFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { recursive: true }).filter(file => file.endsWith(".tmp"));
}

function statuses(files) {
  return Object.fromEntries(files.map(file => [path.basename(file.path), file.status]));
}

async function run(config, sheetInfo, items, tts, now = WEEK_1) {
  return runPipeline({ config, sheetInfo, items, ttsClient: tts.client, now });
}

test("같은 행 번호를 가진 서로 다른 시트가 충돌하지 않는다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);

  const resultA = await run(config, SHEET_A, makeItems(3, "A"), tts);
  const resultB = await run(config, SHEET_B, makeItems(3, "B"), tts);

  // B는 A의 파일을 재사용하지 않고 새로 생성해야 합니다.
  assert.equal(tts.calls.length, 6);
  assert.notEqual(getSheetKey(SHEET_A), getSheetKey(SHEET_B));

  resultB.groupFiles.forEach((fileB, i) => {
    const fileA = resultA.groupFiles[i];
    assert.notEqual(path.dirname(fileA.path), path.dirname(fileB.path));
    assert.ok(fs.existsSync(fileA.path), "A 원본이 남아 있어야 함");
  });

  // 주간 폴더는 이번 실행(B)의 파일로 구성됩니다.
  const day1 = path.join(resultB.weeklyDir, "Day 1");
  const fullB = resultB.playlistFiles.find(f => f.fileName === "006_group_full_001_005.mp3");
  const fullA = resultA.playlistFiles.find(f => f.fileName === "006_group_full_001_005.mp3");

  assert.equal(fileHash(path.join(day1, fullB.fileName)), fileHash(fullB.path));
  assert.notEqual(fileHash(fullA.path), fileHash(fullB.path));
});

test("문장을 수정하면 해당 그룹의 TTS와 가공 파일만 갱신된다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);
  const items = makeItems(3, "A");

  await run(config, SHEET_A, items, tts);
  tts.calls.length = 0;

  const edited = items.map(item =>
    item.rowNumber === 8 ? { ...item, sentence: "A sentence 8 edited" } : item
  );
  const result = await run(config, SHEET_A, edited, tts);

  assert.equal(tts.calls.length, 1);
  assert.match(tts.calls[0].text, /edited/);

  assert.deepEqual(statuses(result.groupFiles), {
    "001_005_group_raw.mp3": "reused",
    "007_011_group_raw.mp3": "generated",
    "013_017_group_raw.mp3": "reused",
  });

  assert.deepEqual(statuses(result.playlistFiles), {
    "006_group_full_001_005.mp3": "reused",
    "901_group_short_001_005.mp3": "reused",
    "012_group_full_007_011.mp3": "generated",
    "902_group_short_007_011.mp3": "generated",
    "018_group_full_013_017.mp3": "reused",
    "903_group_short_013_017.mp3": "reused",
  });
});

test("반복·무음·속도만 바꾸면 TTS 호출 없이 재가공한다", async t => {
  const root = makeTempRoot(t);
  const tts = createMockTts(root);
  const items = makeItems(2, "A");

  // 같은 출력 폴더에서 비교하기 위해 속도별 폴더를 끕니다.
  const base = { OUTPUT_SPEED_FOLDER: "false" };
  const first = await run(makeConfig(root, base), SHEET_A, items, tts);
  const firstDuration = duration(first.playlistFiles[0].path);
  tts.calls.length = 0;

  const changed = makeConfig(root, {
    ...base,
    GROUP_FULL_REPEAT_COUNT: "3",
    GROUP_SHORT_REPEAT_PAUSE: "0.3",
    AUDIO_SPEED: "0.8",
  });
  const second = await run(changed, SHEET_A, items, tts);

  assert.equal(tts.calls.length, 0);
  assert.ok(second.groupFiles.every(file => file.status === "reused"));
  assert.ok(second.playlistFiles.every(file => file.status === "generated"));
  assert.equal(first.playlistFiles[0].path, second.playlistFiles[0].path);
  assert.ok(duration(second.playlistFiles[0].path) > firstDuration);
});

test("동일 조건으로 재실행하면 모든 캐시를 재사용한다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);
  const items = makeItems(2, "A");

  const first = await run(config, SHEET_A, items, tts);
  const mtimes = first.playlistFiles.map(file => fs.statSync(file.path).mtimeMs);
  tts.calls.length = 0;

  const second = await run(config, SHEET_A, items, tts);

  assert.equal(tts.calls.length, 0);
  assert.ok(second.groupFiles.every(file => file.status === "reused"));
  assert.ok(second.playlistFiles.every(file => file.status === "reused"));
  assert.deepEqual(second.playlistFiles.map(file => fs.statSync(file.path).mtimeMs), mtimes);
});

test("속도별 폴더 설정에 맞는 경로가 주간 폴더의 원본이 된다", async t => {
  const root = makeTempRoot(t);
  const tts = createMockTts(root);
  const items = makeItems(2, "A");
  const sheetKey = getSheetKey(SHEET_A);

  // 이전 버전의 하드코딩 경로에 오래된 파일을 둡니다. 사용되면 안 됩니다.
  const legacyDir = path.join(root, "training_playlist_1.0x");
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, "006_group_full_001_005.mp3"), "stale");

  const cases = [
    [{ OUTPUT_SPEED_FOLDER: "true", AUDIO_SPEED: "0.8" }, "training_playlist_0.8x"],
    [{ OUTPUT_SPEED_FOLDER: "false", AUDIO_SPEED: "0.8" }, "training_playlist"],
    [{ OUTPUT_SPEED_FOLDER: "true", AUDIO_SPEED: "1.0" }, "training_playlist_1.0x"],
  ];

  for (const [overrides, expectedDir] of cases) {
    const result = await run(makeConfig(root, overrides), SHEET_A, items, tts);
    const expected = path.join(root, expectedDir, sheetKey, "006_group_full_001_005.mp3");
    const weeklyFile = path.join(result.weeklyDir, "Day 1", "006_group_full_001_005.mp3");

    assert.ok(result.playlistFiles.some(file => file.path === expected), expectedDir);
    assert.equal(fileHash(weeklyFile), fileHash(expected), expectedDir);
  }

  // 이전 파일은 삭제되지 않고 그대로 남아 있어야 합니다.
  assert.equal(fs.readFileSync(path.join(legacyDir, "006_group_full_001_005.mp3"), "utf8"), "stale");
  // 원본 TTS는 한 번만 생성됩니다.
  assert.equal(tts.calls.length, 2);
});

test("생성 실패 후 재실행하면 불완전한 파일을 재사용하지 않는다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);
  const items = makeItems(3, "A");
  const rawDir = path.join(root, "group_output", getSheetKey(SHEET_A));

  // 1) 두 번째 TTS 호출이 실패하는 경우
  let callCount = 0;
  const flaky = {
    client: async args => {
      callCount++;
      if (callCount === 2) throw new Error("network down");
      return tts.client(args);
    },
  };

  await assert.rejects(run(config, SHEET_A, items, flaky), /network down/);
  assert.deepEqual(listTmpFiles(rawDir), []);
  assert.ok(!fs.existsSync(path.join(rawDir, "007_011_group_raw.mp3")));

  tts.calls.length = 0;
  let result = await run(config, SHEET_A, items, tts);
  assert.equal(tts.calls.length, 2);
  assert.equal(statuses(result.groupFiles)["001_005_group_raw.mp3"], "reused");

  // 2) TTS가 MP3가 아닌 응답을 준 경우: 최종 파일을 만들지 않습니다.
  const garbageTts = { client: async () => Buffer.from("not an mp3") };
  const otherItems = makeItems(1, "other");
  await assert.rejects(run(config, SHEET_B, otherItems, garbageTts), /Invalid MP3/);
  const otherRaw = path.join(root, "group_output", getSheetKey(SHEET_B), "001_005_group_raw.mp3");
  assert.ok(!fs.existsSync(otherRaw));

  // 3) 중단으로 메타데이터 없이 남은 파일은 캐시로 인정하지 않습니다.
  const raw1 = path.join(rawDir, "001_005_group_raw.mp3");
  fs.writeFileSync(raw1, "partial");
  fs.rmSync(`${raw1}.meta.json`);

  // 4) 메타데이터는 있지만 잘린 파일도 재생성합니다.
  const raw3 = path.join(rawDir, "013_017_group_raw.mp3");
  fs.truncateSync(raw3, Math.floor(fs.statSync(raw3).size / 2));

  // 5) 메타데이터 없이 남은 가공 파일도 재생성합니다.
  const playlist = path.join(root, "training_playlist_1.0x", getSheetKey(SHEET_A), "902_group_short_007_011.mp3");
  fs.rmSync(`${playlist}.meta.json`);

  tts.calls.length = 0;
  result = await run(config, SHEET_A, items, tts);

  assert.equal(tts.calls.length, 2);
  assert.deepEqual(statuses(result.groupFiles), {
    "001_005_group_raw.mp3": "generated",
    "007_011_group_raw.mp3": "reused",
    "013_017_group_raw.mp3": "generated",
  });
  assert.equal(statuses(result.playlistFiles)["902_group_short_007_011.mp3"], "generated");

  // 6) FFmpeg 가공이 실패하면 출력도 임시 파일도 남지 않습니다.
  const brokenSource = path.join(root, "broken.mp3");
  fs.writeFileSync(brokenSource, "broken");
  const brokenOutput = path.join(root, "broken-out", "001.mp3");

  await assert.rejects(
    ensureShadowingFile({
      sourcePath: brokenSource,
      sourceKey: "x",
      outputPath: brokenOutput,
      repeatCount: 1,
      repeatPause: 0.1,
      audioSpeed: 1,
    }),
    /FFmpeg failed/
  );
  assert.ok(!fs.existsSync(brokenOutput));
  assert.deepEqual(listTmpFiles(path.dirname(brokenOutput)), []);
});

test("이번 주 신규 학습과 지난주 복습의 출처가 유지된다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);
  fs.mkdirSync(config.googleDriveDir);

  // 지난주: 시트 A, 이번 주: 시트 B (각 15그룹, 90행)
  const lastWeek = await run(config, SHEET_A, makeItems(15, "A"), tts, WEEK_1);
  const thisWeek = await run(config, SHEET_B, makeItems(15, "B"), tts, WEEK_2);

  assert.equal(path.basename(lastWeek.weeklyDir), "2026-W39");
  assert.equal(path.basename(thisWeek.weeklyDir), "2026-W40");

  const byName = files => Object.fromEntries(files.map(file => [file.fileName, file.path]));
  const aFiles = byName(lastWeek.playlistFiles);
  const bFiles = byName(thisWeek.playlistFiles);
  const dayFiles = day => fs.readdirSync(path.join(thisWeek.weeklyDir, `Day ${day}`)).sort();
  const dayHash = (day, name) => fileHash(path.join(thisWeek.weeklyDir, `Day ${day}`, name));

  // Day 1: 이번 주 full 3개 + 지난주(A) Day 5 그룹의 short 3개
  assert.deepEqual(dayFiles(1), [
    "006_group_full_001_005.mp3",
    "012_group_full_007_011.mp3",
    "018_group_full_013_017.mp3",
    "913_group_short_073_077.mp3",
    "914_group_short_079_083.mp3",
    "915_group_short_085_089.mp3",
  ]);
  assert.equal(dayHash(1, "006_group_full_001_005.mp3"), fileHash(bFiles["006_group_full_001_005.mp3"]));
  assert.equal(dayHash(1, "913_group_short_073_077.mp3"), fileHash(aFiles["913_group_short_073_077.mp3"]));
  assert.notEqual(dayHash(1, "913_group_short_073_077.mp3"), fileHash(bFiles["913_group_short_073_077.mp3"]));

  // Day 2: 이번 주 full + 이번 주 Day 1 그룹의 short
  assert.deepEqual(dayFiles(2), [
    "024_group_full_019_023.mp3",
    "030_group_full_025_029.mp3",
    "036_group_full_031_035.mp3",
    "901_group_short_001_005.mp3",
    "902_group_short_007_011.mp3",
    "903_group_short_013_017.mp3",
  ]);
  assert.equal(dayHash(2, "901_group_short_001_005.mp3"), fileHash(bFiles["901_group_short_001_005.mp3"]));

  // Day 6: 이번 주 short 15개 전체
  const day6 = dayFiles(6);
  assert.equal(day6.length, 15);
  day6.forEach(name => assert.equal(dayHash(6, name), fileHash(bFiles[name])));

  // Drive 복사는 임시 폴더로만 수행됩니다.
  assert.ok(fs.existsSync(path.join(config.googleDriveDir, "2026-W40", "Day 1")));
});

test("기존 화자 배정(시트명 기준 키)을 이어받는다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);

  fs.writeFileSync(
    config.voiceMapFile,
    JSON.stringify({ "Week_1_001_005": "voice-legacy" })
  );

  await run(config, SHEET_A, makeItems(1, "A"), tts);

  assert.equal(tts.calls[0].voiceId, "voice-legacy");

  const voiceMap = JSON.parse(fs.readFileSync(config.voiceMapFile, "utf8"));
  assert.equal(voiceMap["Week_1_001_005"], "voice-legacy");
  assert.equal(voiceMap[`${getSheetKey(SHEET_A)}_001_005`], "voice-legacy");
});

test("문장 단위 생성(선택 기능)도 캐시와 주간 폴더 전달이 동작한다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root, { ENABLE_SENTENCE_LEVEL: "true" });
  const tts = createMockTts(root);
  const items = makeItems(1, "A");

  const first = await run(config, SHEET_A, items, tts);

  // 문장 5개 + 그룹 1개
  assert.equal(tts.calls.length, 6);
  assert.deepEqual(
    fs.readdirSync(path.join(first.weeklyDir, "Day 1")).sort(),
    [
      "001_sentence_001.mp3",
      "002_sentence_002.mp3",
      "003_sentence_003.mp3",
      "004_sentence_004.mp3",
      "005_sentence_005.mp3",
      "006_group_full_001_005.mp3",
    ]
  );

  tts.calls.length = 0;
  const second = await run(config, SHEET_A, items, tts);

  assert.equal(tts.calls.length, 0);
  assert.ok(second.playlistFiles.every(file => file.status === "reused"));
});

// 파일 트리 스냅샷: 경로, 크기, 수정 시각
function snapshot(dir) {
  if (!fs.existsSync(dir)) return {};

  const result = {};

  for (const rel of fs.readdirSync(dir, { recursive: true })) {
    const stat = fs.statSync(path.join(dir, rel));
    result[rel] = stat.isDirectory() ? "dir" : `${stat.size}:${stat.mtimeMs}`;
  }

  return result;
}

test("시트명만 바뀌면 같은 캐시와 화자를 사용한다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);
  const items = makeItems(3, "A");

  const first = await run(config, SHEET_A, items, tts);
  const voicesBefore = tts.calls.map(call => call.voiceId);
  const voiceMapBefore = fs.readFileSync(config.voiceMapFile, "utf8");
  tts.calls.length = 0;

  const renamed = { ...SHEET_A, sheetName: "Week 1 (renamed)" };
  assert.equal(getSheetKey(renamed), getSheetKey(SHEET_A));

  const second = await run(config, renamed, items, tts);

  assert.equal(tts.calls.length, 0);
  assert.ok(second.groupFiles.every(file => file.status === "reused"));
  assert.ok(second.playlistFiles.every(file => file.status === "reused"));
  assert.deepEqual(second.groupFiles.map(f => f.path), first.groupFiles.map(f => f.path));

  // 화자 재배정 없음: voice-map이 그대로입니다.
  assert.equal(fs.readFileSync(config.voiceMapFile, "utf8"), voiceMapBefore);

  // 표시용 시트명은 새 이름으로 기록됩니다.
  const info = JSON.parse(
    fs.readFileSync(path.join(root, "group_output", getSheetKey(SHEET_A), "sheet-info.json"), "utf8")
  );
  assert.equal(info.sheetName, "Week 1 (renamed)");

  // 문장을 바꾸면 이름 변경 후에도 기존 화자로 새로 생성합니다.
  const edited = items.map(item =>
    item.rowNumber === 1 ? { ...item, sentence: "changed" } : item
  );
  await run(config, renamed, edited, tts);
  assert.equal(tts.calls.length, 1);
  assert.equal(tts.calls[0].voiceId, voicesBefore[0]);
});

test("재생성이 실패해도 이전 정상 캐시가 보존되고, 새 입력에 이전 음성을 쓰지 않는다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);
  const items = makeItems(2, "A");

  await run(config, SHEET_A, items, tts);

  const raw1 = path.join(root, "group_output", getSheetKey(SHEET_A), "001_005_group_raw.mp3");
  const originalHash = fileHash(raw1);
  const originalMeta = readMeta(raw1);

  const edited = items.map(item =>
    item.rowNumber === 1 ? { ...item, sentence: "new text" } : item
  );

  // 1) TTS 호출 실패
  const failing = { client: async () => { throw new Error("quota exceeded"); } };
  await assert.rejects(run(config, SHEET_A, edited, failing), /quota exceeded/);

  // 2) MP3가 아닌 응답
  const garbage = { client: async () => Buffer.from("<html>error</html>") };
  await assert.rejects(run(config, SHEET_A, edited, garbage), /Invalid MP3/);

  // 이전 파일과 메타가 그대로이고 임시 파일도 남지 않습니다.
  assert.equal(fileHash(raw1), originalHash);
  assert.deepEqual(readMeta(raw1), originalMeta);
  assert.deepEqual(listTmpFiles(root), []);

  // 원래 입력으로 돌아가면 이전 캐시를 그대로 재사용합니다.
  tts.calls.length = 0;
  const restored = await run(config, SHEET_A, items, tts);
  assert.equal(tts.calls.length, 0);
  assert.ok(restored.playlistFiles.every(file => file.status === "reused"));

  // 3) 파일은 교체됐지만 메타 교체 전에 중단된 상황: 해시 불일치로 감지합니다.
  fs.writeFileSync(raw1, await tts.client({ text: "other", voiceId: "voice-x" }));
  tts.calls.length = 0;
  const afterCrash = await run(config, SHEET_A, items, tts);
  assert.equal(tts.calls.length, 1);
  assert.equal(statuses(afterCrash.groupFiles)["001_005_group_raw.mp3"], "generated");
});

test("dry-run은 TTS를 호출하지 않고 파일·voice-map·캐시를 변경하지 않는다", async t => {
  const root = makeTempRoot(t);
  const config = makeConfig(root);
  const tts = createMockTts(root);
  const items = makeItems(3, "A").concat({ rowNumber: 19, sentence: "leftover" });

  // 빈 폴더에서 dry-run: 아무 폴더도 만들지 않습니다.
  let plan = planPipeline({ config, sheetInfo: SHEET_A, items, now: WEEK_1 });
  assert.deepEqual(snapshot(root), {});
  assert.equal(plan.sentences.groups, 3);
  assert.deepEqual(plan.sentences.excludedIncomplete, [19]);
  assert.equal(plan.tts.group.generate, 3);
  assert.equal(plan.tts.group.voices.new, 3);
  assert.equal(
    plan.tts.group.generateChars,
    makeItems(3, "A").reduce((sum, item) => sum + item.sentence.length, 0) + 3 * 4 // 줄바꿈
  );
  assert.equal(plan.processing.generate, 6);

  // 실제 실행 후 dry-run: 모두 재사용으로 표시되고 아무것도 바뀌지 않습니다.
  await run(config, SHEET_A, items, tts, WEEK_1);
  tts.calls.length = 0;

  const before = snapshot(root);
  const voiceMapBefore = fs.readFileSync(config.voiceMapFile, "utf8");

  plan = planPipeline({ config, sheetInfo: SHEET_A, items, now: WEEK_1 });
  assert.equal(plan.tts.group.reuse, 3);
  assert.equal(plan.tts.group.generateChars, 0);
  assert.equal(plan.processing.reuse, 6);
  assert.equal(plan.weekly.existsAndWillBeReset, true);

  // 문장 수정 + 설정 변경 계획
  const edited = items.map(item =>
    item.rowNumber === 1 ? { ...item, sentence: "edited" } : item
  );
  const changed = makeConfig(root, { GROUP_SHORT_REPEAT_COUNT: "3" });
  plan = planPipeline({ config: changed, sheetInfo: SHEET_A, items: edited, now: WEEK_2 });
  assert.equal(plan.tts.group.generate, 1);
  assert.equal(plan.tts.group.voices.assigned, 3);
  // full: 수정된 그룹 1개만 신규, short: 설정 변경으로 3개 모두 신규
  assert.equal(plan.processing.generate, 4);
  // 지난주(W39) Day 6 폴더가 존재하므로 복습 출처로 표시
  assert.equal(plan.weekly.previousWeekFound, true);

  // 새 시트는 화자 미배정 → 신규
  plan = planPipeline({ config, sheetInfo: SHEET_B, items, now: WEEK_1 });
  assert.equal(plan.tts.group.generate, 3);

  // --max-groups
  plan = planPipeline({ config: { ...config, maxGroups: 1 }, sheetInfo: SHEET_A, items, now: WEEK_1 });
  assert.equal(plan.sentences.groups, 1);
  assert.equal(plan.sentences.excludedByLimit.length, 10);

  assert.equal(tts.calls.length, 0);
  assert.deepEqual(snapshot(root), before);
  assert.equal(fs.readFileSync(config.voiceMapFile, "utf8"), voiceMapBefore);
});
