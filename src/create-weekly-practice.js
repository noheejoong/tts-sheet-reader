const fs = require("fs");
const path = require("path");

const FILES_PER_DAY = 18;

function resetDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function getYearWeekFolderName(baseDate = new Date()) {
  const oneJan = new Date(baseDate.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((baseDate - oneJan) / 86400000) + 1;
  const weekNo = Math.ceil((dayOfYear + oneJan.getDay()) / 7);

  return `${baseDate.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getPreviousYearWeekFolderName(now) {
  const date = new Date(now);
  date.setDate(date.getDate() - 7);
  return getYearWeekFolderName(date);
}

function getSentenceNo(fileName) {
  const match = fileName.match(/^\d{3}_sentence_(\d{3})\.mp3$/);
  return match ? Number(match[1]) : null;
}

function getGroupInfo(fileName) {
  const match = fileName.match(
    /^\d{3}_group_(full|short)_(\d{3})_(\d{3})\.mp3$/
  );

  if (!match) return null;

  return {
    type: match[1],
    startNo: Number(match[2]),
    endNo: Number(match[3]),
  };
}

function getDayBySentenceNo(sentenceNo) {
  return Math.ceil(sentenceNo / FILES_PER_DAY);
}

// files: 이번 실행에서 만든 플레이리스트 파일 목록 [{ fileName, path }]
// 아래 collect 함수들은 복사할 목록 [{ src, name }]만 계산하고 파일을 변경하지 않습니다.

function collectSentenceFilesForDay(files, day) {
  if (day > 5) return [];

  const start = (day - 1) * FILES_PER_DAY + 1;
  const end = day * FILES_PER_DAY;

  return files
    .filter(file => {
      const sentenceNo = getSentenceNo(file.fileName);
      return sentenceNo >= start && sentenceNo <= end;
    })
    .map(file => ({ src: file.path, name: file.fileName }));
}

function collectGroupFullFilesForDay(files, day) {
  if (day > 5) return [];

  return files
    .filter(file => {
      const info = getGroupInfo(file.fileName);
      if (!info) return false;
      if (info.type !== "full") return false;

      return getDayBySentenceNo(info.startNo) === day;
    })
    .map(file => ({ src: file.path, name: file.fileName }));
}

function getPreviousWeekDay6Dir(weeklyDir, now) {
  return path.join(weeklyDir, getPreviousYearWeekFolderName(now), "Day 6");
}

function collectPreviousWeekDay5GroupShort(previousWeekDay6Dir) {
  if (!fs.existsSync(previousWeekDay6Dir)) {
    return [];
  }

  return fs
    .readdirSync(previousWeekDay6Dir)
    .filter(file => {
      const info = getGroupInfo(file);
      if (!info) return false;
      if (info.type !== "short") return false;

      return getDayBySentenceNo(info.startNo) === 5;
    })
    .map(file => ({ src: path.join(previousWeekDay6Dir, file), name: file }));
}

function shouldCopyGroupShortForReview(day, groupDay) {
  if (day === 1) return false;

  if (day >= 2 && day <= 5) {
    return groupDay === day - 1;
  }

  if (day === 6) {
    return groupDay >= 1 && groupDay <= 6;
  }

  return false;
}

function collectGroupShortFilesForReview(files, day) {
  return files
    .filter(file => {
      const info = getGroupInfo(file.fileName);
      if (!info) return false;
      if (info.type !== "short") return false;

      return shouldCopyGroupShortForReview(day, getDayBySentenceNo(info.startNo));
    })
    .map(file => ({ src: file.path, name: file.fileName }));
}

// 주간 폴더 구성 계획 (파일을 변경하지 않음). 실제 실행과 dry-run이 함께 사용합니다.
function planWeeklyPractice({ playlistFiles, config, now = new Date() }) {
  const weeklyDir = config.dirs.weekly;
  const yearWeekDir = path.join(weeklyDir, getYearWeekFolderName(now));
  const previousWeekDay6Dir = getPreviousWeekDay6Dir(weeklyDir, now);

  const days = [];

  for (let day = 1; day <= 6; day++) {
    const files = [
      // Step 1: sentence files for the same day
      ...collectSentenceFilesForDay(playlistFiles, day),
      // Step 2: group_full files for the same day
      ...collectGroupFullFilesForDay(playlistFiles, day),
      // Step 3-1: Day 1 uses previous week's Day 5 group_short
      ...(day === 1 ? collectPreviousWeekDay5GroupShort(previousWeekDay6Dir) : []),
      // Step 3-2: Day 2~6 use current week's group_short review files
      ...collectGroupShortFilesForReview(playlistFiles, day),
    ];

    days.push({ day, dir: path.join(yearWeekDir, `Day ${day}`), files });
  }

  const driveDir = config.googleDriveDir;

  return {
    yearWeekDir,
    previousWeekDay6Dir,
    previousWeekFound: fs.existsSync(previousWeekDay6Dir),
    days,
    drive: {
      configured: Boolean(driveDir),
      available: Boolean(driveDir) && fs.existsSync(driveDir),
      targetDir: driveDir ? path.join(driveDir, path.basename(yearWeekDir)) : null,
    },
  };
}

function copyWeekFolderToGoogleDrive(googleDriveDir, yearWeekDir) {
  if (!googleDriveDir) {
    console.log("GOOGLE_DRIVE_DIR is not configured.");
    return;
  }

  if (!fs.existsSync(googleDriveDir)) {
    console.log(`Google Drive folder not found: ${googleDriveDir}`);
    return;
  }

  const targetDir = path.join(googleDriveDir, path.basename(yearWeekDir));

  fs.cpSync(yearWeekDir, targetDir, {
    recursive: true,
    force: true,
  });

  console.log(`Copied to Google Drive: ${targetDir}`);
}

// playlistFiles: 이번 실행에서 선택한 시트와 설정으로 만든 파일만 전달받습니다.
// 폴더를 직접 읽지 않으므로 과거 실행 파일이나 다른 시트의 파일이 섞이지 않습니다.
function createWeeklyPracticeFolders({ playlistFiles, config, now = new Date() }) {
  // 이전 주 폴더를 읽는 계획을 먼저 세운 뒤 이번 주 폴더를 초기화합니다.
  const plan = planWeeklyPractice({ playlistFiles, config, now });

  resetDir(plan.yearWeekDir);

  const sourceDirs = [...new Set(playlistFiles.map(file => path.dirname(file.path)))];
  console.log("SOURCE_DIR:", sourceDirs.join(", ") || "(no files)");

  if (!plan.previousWeekFound) {
    console.log(`Previous week Day 6 folder not found: ${plan.previousWeekDay6Dir}`);
  }

  for (const { day, dir, files } of plan.days) {
    console.log(`Creating Day ${day}...`);
    ensureDir(dir);

    for (const file of files) {
      copyFile(file.src, path.join(dir, file.name));
    }
  }

  console.log("Weekly practice folders created.");

  copyWeekFolderToGoogleDrive(config.googleDriveDir, plan.yearWeekDir);

  return plan.yearWeekDir;
}

module.exports = { createWeeklyPracticeFolders, planWeeklyPractice, getYearWeekFolderName };

if (require.main === module) {
  console.log(
    "This file is designed to be called from main.js with the playlist files of the current run."
  );
}
