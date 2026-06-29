const { google } = require("googleapis");

function extractStartRow(range) {
  const match = range.match(/A(\d+):/i);
  return match ? Number(match[1]) : 1;
}

async function readSentencesFromSheet() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME;
  const range = process.env.RANGE || "A:A";

  const startRow = extractStartRow(range);

  const auth = new google.auth.GoogleAuth({
    keyFile: "./service-account.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${range}`,
  });

  const rows = response.data.values || [];

  return rows
    .map((row, index) => {
      const sentence = row[0] ? row[0].toString().trim() : "";

      return {
        rowNumber: startRow + index,
        sentence,
      };
    })
    // 빈 줄 무시
    .filter(item => item.sentence !== "");
}

module.exports = { readSentencesFromSheet };