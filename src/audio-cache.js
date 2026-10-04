const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { sha256 } = require("./utils");

// 캐시 키: 결과물에 영향을 주는 값들을 JSON으로 묶어 해시합니다.
function hashOf(value) {
  return sha256(JSON.stringify(value));
}

function getMetaPath(filePath) {
  return `${filePath}.meta.json`;
}

function readMeta(filePath) {
  try {
    return JSON.parse(fs.readFileSync(getMetaPath(filePath), "utf8"));
  } catch {
    return null;
  }
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function isValidMp3(filePath) {
  try {
    const output = execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_name:format=duration",
        "-of", "json",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const info = JSON.parse(output.toString());

    return (
      info.streams?.[0]?.codec_name === "mp3" &&
      Number(info.format?.duration) > 0
    );
  } catch {
    return false;
  }
}

// 다음을 모두 만족할 때만 캐시로 인정합니다. (읽기 전용)
// - 메타데이터의 캐시 키가 기대값과 같음
// - 파일 크기와 내용 해시가 메타데이터와 같음 (파일/메타 교체 중단 감지)
// - 실제로 재생 가능한 MP3
// 메타데이터가 없는 파일(이전 버전 산출물, 중단된 작업)은 캐시로 인정하지 않습니다.
function isCached(filePath, key) {
  const meta = readMeta(filePath);

  if (!meta || meta.key !== key || !meta.sha256) {
    return false;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== meta.size) {
    return false;
  }

  if (fileSha256(filePath) !== meta.sha256) {
    return false;
  }

  return isValidMp3(filePath);
}

// produce(tmpPath)가 임시 파일을 만들면, 검증 후 최종 파일로 옮기고 메타데이터를 남깁니다.
// - 생성·검증이 실패하면 기존 파일과 메타데이터는 그대로 남습니다.
// - 파일 교체 후 메타데이터 교체 전에 중단되면, 기존 메타의 해시와 새 파일이 달라
//   다음 실행에서 불일치로 감지되어 다시 생성됩니다.
async function writeCachedFile(filePath, key, details, produce) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const metaPath = getMetaPath(filePath);
  const metaTmpPath = `${metaPath}.${process.pid}.tmp`;

  try {
    await produce(tmpPath);

    if (!isValidMp3(tmpPath)) {
      throw new Error(`Invalid MP3 produced: ${path.basename(filePath)}`);
    }

    const meta = {
      key,
      size: fs.statSync(tmpPath).size,
      sha256: fileSha256(tmpPath),
      createdAt: new Date().toISOString(),
      ...details,
    };

    fs.writeFileSync(metaTmpPath, JSON.stringify(meta, null, 2), "utf8");

    fs.renameSync(tmpPath, filePath);
    fs.renameSync(metaTmpPath, metaPath);
  } finally {
    fs.rmSync(tmpPath, { force: true });
    fs.rmSync(metaTmpPath, { force: true });
  }
}

module.exports = {
  hashOf,
  readMeta,
  isValidMp3,
  isCached,
  writeCachedFile,
};
