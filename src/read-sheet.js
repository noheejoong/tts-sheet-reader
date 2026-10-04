const path = require("path");
const { google } = require("googleapis");
const { PROJECT_ROOT } = require("./config");

function extractStartRow(range) {
  const match = range.match(/A(\d+):/i);
  return match ? Number(match[1]) : 1;
}

// 시트 이름으로 시트 고유 ID(gid)를 찾습니다. 출력 폴더 구분에 사용합니다.
async function getSheetInfo(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });

  const sheet = (response.data.sheets || []).find(
    item => item.properties.title === sheetName
  );

  if (!sheet) {
    // 탭 이름이 바뀐 경우(예: "(완료)" 추가)를 쉽게 알 수 있도록 비슷한 이름을 보여줍니다.
    const normalize = text => text.replace(/\s+/g, "").toLowerCase();
    const similar = (response.data.sheets || [])
      .map(item => item.properties.title)
      .filter(title => normalize(title).includes(normalize(sheetName)));

    throw new Error(
      `Sheet not found: "${sheetName}"` +
      (similar.length > 0 ? `. Similar sheets: ${similar.map(t => `"${t}"`).join(", ")}` : "")
    );
  }

  return {
    spreadsheetId,
    sheetId: sheet.properties.sheetId,
    sheetName,
  };
}

async function readSheet(config) {
  const { spreadsheetId, sheetName, range } = config;

  if (!spreadsheetId || !sheetName) {
    throw new Error("SPREADSHEET_ID and SHEET_NAME are required.");
  }

  const startRow = extractStartRow(range);

  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(PROJECT_ROOT, "service-account.json"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const sheetInfo = await getSheetInfo(sheets, spreadsheetId, sheetName);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${range}`,
  });

  const rows = response.data.values || [];

  const items = rows
    .map((row, index) => {
      const sentence = row[0] ? row[0].toString().trim() : "";

      return {
        rowNumber: startRow + index,
        sentence,
      };
    })
    // 빈 줄 무시
    .filter(item => item.sentence !== "");

  return { sheetInfo, items, blankRowCount: rows.length - items.length };
}

module.exports = { readSheet };
