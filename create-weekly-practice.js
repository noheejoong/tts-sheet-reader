const fs = require("fs");
const path = require("path");
require("dotenv").config();

const SOURCE_DIR = path.join(__dirname, "training_playlist_1.0x");
const WEEKLY_DIR = path.join(__dirname, "weekly-practice");
const FILES_PER_DAY = 18;
const GOOGLE_DRIVE_DIR = process.env.GOOGLE_DRIVE_DIR;

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

function getPreviousYearWeekFolderName() {
  const date = new Date();
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

function copySentenceFilesForDay(files, day, dayDir) {
  if (day > 5) return;

  const start = (day - 1) * FILES_PER_DAY + 1;
  const end = day * FILES_PER_DAY;

  files.forEach(file => {
    const sentenceNo = getSentenceNo(file);

    if (sentenceNo >= start && sentenceNo <= end) {
      copyFile(path.join(SOURCE_DIR, file), path.join(dayDir, file));
    }
  });
}

function copyGroupFullFilesForDay(files, day, dayDir) {
  if (day > 5) return;

  files.forEach(file => {
    const info = getGroupInfo(file);
    if (!info) return;
    if (info.type !== "full") return;

    const groupDay = getDayBySentenceNo(info.startNo);

    if (groupDay === day) {
      copyFile(path.join(SOURCE_DIR, file), path.join(dayDir, file));
    }
  });
}

function copyPreviousWeekDay5GroupShortToDay1(dayDir) {
  const previousWeekDay6Dir = path.join(
    WEEKLY_DIR,
    getPreviousYearWeekFolderName(),
    "Day 6"
  );

  if (!fs.existsSync(previousWeekDay6Dir)) {
    console.log(`Previous week Day 6 folder not found: ${previousWeekDay6Dir}`);
    return;
  }

  const files = fs.readdirSync(previousWeekDay6Dir);

  files.forEach(file => {
    const info = getGroupInfo(file);
    if (!info) return;
    if (info.type !== "short") return;

    const groupDay = getDayBySentenceNo(info.startNo);

    if (groupDay === 5) {
      copyFile(path.join(previousWeekDay6Dir, file), path.join(dayDir, file));
    }
  });
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

function copyGroupShortFilesForReview(files, day, dayDir) {
  files.forEach(file => {
    const info = getGroupInfo(file);
    if (!info) return;
    if (info.type !== "short") return;

    const groupDay = getDayBySentenceNo(info.startNo);

    if (shouldCopyGroupShortForReview(day, groupDay)) {
      copyFile(path.join(SOURCE_DIR, file), path.join(dayDir, file));
    }
  });
}

function copyWeekFolderToGoogleDrive(yearWeekDir) {
  if (!GOOGLE_DRIVE_DIR) {
    console.log("GOOGLE_DRIVE_DIR is not configured.");
    return;
  }

  if (!fs.existsSync(GOOGLE_DRIVE_DIR)) {
    console.log(`Google Drive folder not found: ${GOOGLE_DRIVE_DIR}`);
    return;
  }

  const targetDir = path.join(GOOGLE_DRIVE_DIR, path.basename(yearWeekDir));

  fs.cpSync(yearWeekDir, targetDir, {
    recursive: true,
    force: true,
  });

  console.log(`Copied to Google Drive: ${targetDir}`);
}

function createWeeklyPracticeFolders() {
  const yearWeekDir = path.join(WEEKLY_DIR, getYearWeekFolderName());

  resetDir(yearWeekDir);

  const files = fs.readdirSync(SOURCE_DIR);

  console.log("SOURCE_DIR:", SOURCE_DIR);

  for (let day = 1; day <= 6; day++) {
    const dayDir = path.join(yearWeekDir, `Day ${day}`);
    ensureDir(dayDir);

    console.log(`Creating Day ${day}...`);

    // Step 1: sentence files for the same day
    copySentenceFilesForDay(files, day, dayDir);

    // Step 2: group_full files for the same day
    copyGroupFullFilesForDay(files, day, dayDir);

    // Step 3-1: Day 1 uses previous week's Day 5 group_short
    if (day === 1) {
      copyPreviousWeekDay5GroupShortToDay1(dayDir);
    }

    // Step 3-2: Day 2~6 use current week's group_short review files
    copyGroupShortFilesForReview(files, day, dayDir);
  }

  console.log("Weekly practice folders created.");

  copyWeekFolderToGoogleDrive(yearWeekDir);
}

module.exports = { createWeeklyPracticeFolders };

if (require.main === module) {
  try {
    console.log("Creating weekly practice folders...");
    createWeeklyPracticeFolders();
    console.log("Done.");
  } catch (err) {
    console.error(err);
  }
}