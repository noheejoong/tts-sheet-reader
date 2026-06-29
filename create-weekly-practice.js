const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(__dirname, "training_playlist_1.0x");
const WEEKLY_DIR = path.join(__dirname, "weekly-practice");

const FILES_PER_DAY = 18;

require("dotenv").config();

const GOOGLE_DRIVE_DIR =
  process.env.GOOGLE_DRIVE_DIR;


function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getYearWeekFolderName() {
  const now = new Date();

  const oneJan = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - oneJan) / 86400000) + 1;
  const weekNo = Math.ceil((dayOfYear + oneJan.getDay()) / 7);

  return `${now.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function getSentenceNo(fileName) {
  const match = fileName.match(/sentence_(\d{3})\.mp3$/);
  return match ? Number(match[1]) : null;
}

function getGroupShortStartNo(fileName) {
  const match = fileName.match(/group_short_(\d{3})_(\d{3})\.mp3$/);
  return match ? Number(match[1]) : null;
}

function getDayBySentenceNo(sentenceNo) {
  return Math.ceil(sentenceNo / FILES_PER_DAY);
}

function getPreviousYearWeekFolderName() {
  const now = new Date();
  now.setDate(now.getDate() - 7);

  const oneJan = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - oneJan) / 86400000) + 1;
  const weekNo = Math.ceil((dayOfYear + oneJan.getDay()) / 7);

  return `${now.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function shouldCopyCurrentWeekGroupShort(day, groupDay) {
  // Day 2~5: previous day only
  if (day >= 2 && day <= 5) {
    return groupDay === day - 1;
  }

  // Day 6: Day 1~5 group_short
  if (day === 6) {
    return groupDay >= 1 && groupDay <= 5;
  }

  return false;
}

function copyPreviousWeekDay5GroupShortToDay1(dayDir) {
  const previousWeekDir = path.join(
    WEEKLY_DIR,
    getPreviousYearWeekFolderName()
  );

  const previousWeekDay6Dir = path.join(previousWeekDir, "Day 6");

  if (!fs.existsSync(previousWeekDay6Dir)) {
    console.log(`Previous week Day 6 folder not found: ${previousWeekDay6Dir}`);
    return;
  }

  const files = fs
    .readdirSync(previousWeekDay6Dir)
    .filter(file => {
      if (!file.includes("_group_short_")) return false;

      const startNo = getGroupShortStartNo(file);
      if (startNo === null) return false;

      const groupDay = getDayBySentenceNo(startNo);

      // Previous week's Day 5 group_short
      return groupDay === 5;
    });

  files.forEach(file => {
    copyFile(
      path.join(previousWeekDay6Dir, file),
      path.join(dayDir, file)
    );
  });
}

function copyWeekFolderToGoogleDrive(yearWeekDir) {
  if (!fs.existsSync(GOOGLE_DRIVE_DIR)) {
    console.log(
      `Google Drive folder not found: ${GOOGLE_DRIVE_DIR}`
    );
    return;
  }

  const targetDir = path.join(
    GOOGLE_DRIVE_DIR,
    path.basename(yearWeekDir)
  );

  fs.cpSync(yearWeekDir, targetDir, {
    recursive: true,
    force: true,
  });

  console.log(
    `Copied to Google Drive: ${targetDir}`
  );
}

function createWeeklyPracticeFolders() {
  const yearWeekDir = path.join(WEEKLY_DIR, getYearWeekFolderName());
  ensureDir(yearWeekDir);

  const files = fs.readdirSync(SOURCE_DIR);
  console.log("SOURCE_DIR:", SOURCE_DIR);
  console.log("Files found:", files);


  const sentenceFiles = files.filter(file => file.includes("_sentence_"));
  const groupShortFiles = files.filter(file => file.includes("_group_short_"));

  console.log("Sentence files:", sentenceFiles);
  console.log("Group short files:", groupShortFiles);
  for (let day = 1; day <= 6; day++) {
    const dayDir = path.join(yearWeekDir, `Day ${day}`);
    ensureDir(dayDir);

    // Day 1: include previous week's Day 5 group_short files
    if (day === 1) {
      copyPreviousWeekDay5GroupShortToDay1(dayDir);
    }

    // Day 1~5: sentence files
    if (day <= 5) {
      const start = (day - 1) * FILES_PER_DAY + 1;
      const end = day * FILES_PER_DAY;

      sentenceFiles.forEach(file => {
        const sentenceNo = getSentenceNo(file);

        if (sentenceNo !== null && sentenceNo >= start && sentenceNo <= end) {
          copyFile(
            path.join(SOURCE_DIR, file),
            path.join(dayDir, file)
          );
        }
      });
    }

    // Day 2~6: previous days' group short files
    const reviewDay = day - 1;

    groupShortFiles.forEach(file => {
      const startNo = getGroupShortStartNo(file);

      if (startNo === null) return;

      const groupDay = getDayBySentenceNo(startNo);

      if (shouldCopyCurrentWeekGroupShort(day, groupDay)) {
        copyFile(
          path.join(SOURCE_DIR, file),
          path.join(dayDir, file)
        );
      }
    });
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