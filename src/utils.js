const crypto = require("crypto");

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>| ]/g, "_");
}

function pad3(number) {
  return String(number).padStart(3, "0");
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// 스프레드시트 ID + 시트 ID(gid)만으로 만든 안정적인 키입니다.
// 시트 이름이 바뀌어도 키가 같으므로 캐시와 화자 배정이 유지됩니다.
// 예: "sheet_1a2b3c4d5e6f"
function getSheetKey(sheetInfo) {
  const idHash = sha256(
    `${sheetInfo.spreadsheetId}#${sheetInfo.sheetId}`
  ).slice(0, 12);

  return `sheet_${idHash}`;
}

function getGroupRangeName(group) {
  const firstNo = pad3(group[0].rowNumber);
  const lastNo = pad3(group[group.length - 1].rowNumber);

  return `${firstNo}_${lastNo}`;
}

// GROUP_SIZE 단위로 나눈 뒤, 완성된 그룹만 사용합니다(마지막 불완전 그룹은 제외).
// maxGroups가 있으면 완성된 그룹 중 앞에서부터 그 개수만 사용합니다(검증용).
function splitIntoGroups(items, groupSize, maxGroups = null) {
  const chunks = chunkArray(items, groupSize);
  const complete = chunks.filter(group => group.length === groupSize);
  const incomplete = chunks.filter(group => group.length < groupSize);

  const groups = maxGroups ? complete.slice(0, maxGroups) : complete;
  const limited = complete.slice(groups.length);

  return {
    groups,
    incompleteItems: incomplete.flat(),
    limitedItems: limited.flat(),
  };
}

module.exports = {
  sanitizeFileName,
  pad3,
  chunkArray,
  sleep,
  sha256,
  getSheetKey,
  getGroupRangeName,
  splitIntoGroups,
};
