// dry-run: TTS 호출, 파일 쓰기, voice-map 변경 없이 실행 계획만 계산합니다.
// 실제 실행과 같은 대상 계산 함수를 사용하므로 결과가 실제 실행과 일치합니다.
const fs = require("fs");
const path = require("path");
const { lookupVoiceId } = require("./voice-manager");
const { getTtsKey } = require("./tts");
const { getShadowingKey } = require("./shadowing-audio");
const { isCached } = require("./audio-cache");
const { getSheetKey } = require("./utils");
const { getGroupTtsTargets } = require("./generate-group-tts");
const { getSentenceTtsTargets } = require("./generate-tts");
const { getGroupPlaylistTargets } = require("./create-group-shadowing");
const { getSentencePlaylistTargets } = require("./postprocess-ffmpeg");
const { planWeeklyPractice } = require("./create-weekly-practice");

function planTts(targets, context) {
  return targets.map(target => {
    const { voiceId, source } = lookupVoiceId(target.group, context);

    // 화자가 아직 배정되지 않았다면 키를 알 수 없으므로 신규 생성 대상입니다.
    const key = voiceId
      ? getTtsKey({ text: target.text, voiceId, modelId: context.config.modelId })
      : null;

    const reuse = key ? isCached(target.filePath, key) : false;

    return {
      ...target,
      path: target.filePath,
      key,
      voiceSource: source || "new",
      status: reuse ? "reuse" : "generate",
    };
  });
}

function planShadowing(targets) {
  return targets.map(target => {
    const key = target.sourceKey ? getShadowingKey(target) : null;
    const reuse = key ? isCached(target.outputPath, key) : false;

    return {
      fileName: path.basename(target.outputPath),
      path: target.outputPath,
      status: reuse ? "reuse" : "generate",
    };
  });
}

function summarizeTts(planned) {
  const generate = planned.filter(item => item.status === "generate");

  return {
    total: planned.length,
    generate: generate.length,
    reuse: planned.length - generate.length,
    generateChars: generate.reduce((sum, item) => sum + item.text.length, 0),
    voices: {
      assigned: planned.filter(item => item.voiceSource === "assigned").length,
      legacy: planned.filter(item => item.voiceSource === "legacy").length,
      new: planned.filter(item => item.voiceSource === "new").length,
    },
  };
}

function planPipeline({ config, sheetInfo, items, blankRowCount = 0, now = new Date() }) {
  const context = { config, sheetInfo };
  const sheetKey = getSheetKey(sheetInfo);

  const groupTts = getGroupTtsTargets(items, context);
  const groupRaw = planTts(groupTts.targets, context);

  const groupPlaylist = planShadowing(getGroupPlaylistTargets(groupRaw, context));

  let sentenceRaw = [];
  let sentencePlaylist = [];

  if (config.enableSentenceLevel) {
    const sentenceTts = getSentenceTtsTargets(items, context);
    sentenceRaw = planTts(sentenceTts.targets, context);
    sentencePlaylist = planShadowing(getSentencePlaylistTargets(sentenceRaw, context));
  }

  const playlistFiles = [...sentencePlaylist, ...groupPlaylist];
  const weekly = planWeeklyPractice({ playlistFiles, config, now });

  return {
    sheet: { ...sheetInfo, sheetKey },
    sentences: {
      valid: items.length,
      blankRows: blankRowCount,
      groups: groupTts.groups.length,
      excludedIncomplete: groupTts.incompleteItems.map(item => item.rowNumber),
      excludedByLimit: groupTts.limitedItems.map(item => item.rowNumber),
    },
    tts: {
      group: summarizeTts(groupRaw),
      sentence: config.enableSentenceLevel ? summarizeTts(sentenceRaw) : null,
    },
    processing: {
      total: playlistFiles.length,
      generate: playlistFiles.filter(file => file.status === "generate").length,
      reuse: playlistFiles.filter(file => file.status === "reuse").length,
    },
    dirs: {
      groupRaw: path.join(config.dirs.groupRaw, sheetKey),
      sentenceRaw: config.enableSentenceLevel
        ? path.join(config.dirs.sentenceRaw, sheetKey)
        : null,
      playlist: path.join(config.dirs.playlist, sheetKey),
      voiceMapFile: config.voiceMapFile,
    },
    weekly: {
      ...weekly,
      existsAndWillBeReset: fs.existsSync(weekly.yearWeekDir),
    },
  };
}

function maskId(id) {
  const text = String(id || "");
  return text.length <= 8 ? "****" : `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function formatRows(rows) {
  return rows.length === 0 ? "없음" : `${rows.length}개 (행 ${rows.join(", ")})`;
}

function printTts(label, summary) {
  console.log(`  ${label}: 신규 생성 ${summary.generate} / 재사용 ${summary.reuse} (총 ${summary.total})`);
  console.log(`    신규 생성 대상 문자 수: ${summary.generateChars}자 (줄바꿈 포함)`);
  console.log(
    `    화자: 배정됨 ${summary.voices.assigned} / 이전 배정 이어받기 ${summary.voices.legacy}` +
    ` / 신규 랜덤 배정 ${summary.voices.new}`
  );
}

function printPlan(plan) {
  const { sheet, sentences, tts, processing, dirs, weekly } = plan;

  console.log("");
  console.log("===== DRY RUN (TTS 호출·파일 변경 없음) =====");
  console.log(`시트: ${sheet.sheetName} (gid ${sheet.sheetId}, spreadsheet ${maskId(sheet.spreadsheetId)})`);
  console.log(`시트 키: ${sheet.sheetKey}`);
  console.log("");
  console.log(`읽은 문장: ${sentences.valid}개 (빈 행 ${sentences.blankRows}개 제외)`);
  console.log(`그룹: ${sentences.groups}개`);
  console.log(`제외 문장(불완전 그룹): ${formatRows(sentences.excludedIncomplete)}`);

  if (sentences.excludedByLimit.length > 0) {
    console.log(`제외 문장(--max-groups): ${sentences.excludedByLimit.length}개`);
  }

  console.log("");
  console.log("TTS:");
  printTts("그룹", tts.group);

  if (tts.sentence) {
    printTts("문장", tts.sentence);
  } else {
    console.log("  문장: 비활성 (ENABLE_SENTENCE_LEVEL=false)");
  }

  console.log("");
  console.log(`가공(FFmpeg): 신규 ${processing.generate} / 재사용 ${processing.reuse} (총 ${processing.total})`);
  console.log("");
  console.log("출력 경로:");
  console.log(`  그룹 원본: ${dirs.groupRaw}`);
  if (dirs.sentenceRaw) console.log(`  문장 원본: ${dirs.sentenceRaw}`);
  console.log(`  플레이리스트: ${dirs.playlist}`);
  console.log(`  voice-map: ${dirs.voiceMapFile}`);
  console.log("");
  console.log(`주간 폴더: ${weekly.yearWeekDir}`);

  if (weekly.existsAndWillBeReset) {
    console.log("  ⚠ 이미 존재하며 실제 실행 시 초기화 후 다시 구성됩니다.");
  }

  console.log(
    `  지난주 Day 6: ${weekly.previousWeekFound ? "있음" : "없음"} (${weekly.previousWeekDay6Dir})`
  );

  for (const { day, files } of weekly.days) {
    const previous = files.filter(file => !file.src.startsWith(dirs.playlist)).length;
    const note = previous > 0 ? ` (지난주 복습 ${previous}개 포함)` : "";
    console.log(`  Day ${day}: ${files.length}개${note}`);
  }

  console.log("");

  if (!weekly.drive.configured) {
    console.log("Drive 반영: 하지 않음 (미설정 또는 --no-drive)");
  } else if (!weekly.drive.available) {
    console.log(`Drive 반영: 대상 폴더 없음 → 건너뜀 (${weekly.drive.targetDir})`);
  } else {
    console.log(`Drive 반영 대상: ${weekly.drive.targetDir}`);
  }

  console.log("==============================================");
}

module.exports = { planPipeline, printPlan };
