const path = require("path");
const { execFileSync } = require("child_process");
const { hashOf, isCached, writeCachedFile } = require("./audio-cache");

// (원본 + 무음)을 repeatCount번 이어 붙인 뒤 전체에 속도를 적용합니다.
function createFilterComplex(repeatCount, audioSpeed) {
  const parts = [];

  for (let i = 0; i < repeatCount; i++) {
    parts.push("[0:a]");
    parts.push(`[${i + 1}:a]`);
  }

  return (
    `${parts.join("")}` +
    `concat=n=${repeatCount * 2}:v=0:a=1[temp];` +
    `[temp]atempo=${audioSpeed}[out]`
  );
}

function buildFfmpegArgs(inputPath, outputPath, repeatCount, repeatPause, audioSpeed) {
  const args = [
    "-y",
    "-v", "error",
    "-i", inputPath,
  ];

  for (let i = 0; i < repeatCount; i++) {
    args.push(
      "-f", "lavfi",
      "-t", String(repeatPause),
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"
    );
  }

  args.push(
    "-filter_complex", createFilterComplex(repeatCount, audioSpeed),
    "-map", "[out]",
    "-f", "mp3",
    outputPath
  );

  return args;
}

function getShadowingKey({ sourceKey, repeatCount, repeatPause, audioSpeed }) {
  return hashOf({
    type: "shadowing",
    version: 1,
    sourceKey,
    repeatCount,
    repeatPause,
    audioSpeed,
  });
}

// 원본 음성의 캐시 키와 가공 설정이 같은 검증된 파일이 있으면 재사용합니다.
async function ensureShadowingFile({
  sourcePath,
  sourceKey,
  outputPath,
  repeatCount,
  repeatPause,
  audioSpeed,
}) {
  const fileName = path.basename(outputPath);
  const key = getShadowingKey({ sourceKey, repeatCount, repeatPause, audioSpeed });

  if (isCached(outputPath, key)) {
    console.log(`Reused cached file: ${fileName}`);
    return { fileName, path: outputPath, key, status: "reused" };
  }

  console.log(
    `Creating file: ${fileName} ` +
    `(repeat=${repeatCount}, pause=${repeatPause}s, speed=${audioSpeed})`
  );

  await writeCachedFile(
    outputPath,
    key,
    { type: "shadowing", sourceKey, repeatCount, repeatPause, audioSpeed },
    tmpPath => {
      try {
        execFileSync(
          "ffmpeg",
          buildFfmpegArgs(sourcePath, tmpPath, repeatCount, repeatPause, audioSpeed),
          { stdio: ["ignore", "ignore", "pipe"] }
        );
      } catch (error) {
        const detail = error.stderr ? error.stderr.toString().trim() : error.message;
        throw new Error(`FFmpeg failed: ${fileName}: ${detail}`);
      }
    }
  );

  return { fileName, path: outputPath, key, status: "generated" };
}

module.exports = { ensureShadowingFile, getShadowingKey };
