const fs = require("fs");
const path = require("path");
const { hashOf, isCached, writeCachedFile } = require("./audio-cache");

const VOICE_SETTINGS = {
  stability: 0.7,
  similarity_boost: 0.8,
  speed: 0.9,
};

// 실제 ElevenLabs 호출. 테스트에서는 같은 형태의 mock 함수로 바꿔 넣습니다.
async function requestElevenLabsTts({ apiKey, voiceId, modelId, text, voiceSettings }) {
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required.");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function getTtsKey({ text, voiceId, modelId }) {
  return hashOf({
    type: "tts",
    version: 1,
    text,
    voiceId,
    modelId,
    voiceSettings: VOICE_SETTINGS,
  });
}

// 텍스트·화자·모델·음성 설정이 같은 검증된 파일이 있으면 재사용하고, 없으면 생성합니다.
async function ensureTtsFile({ filePath, text, voiceId, config, ttsClient }) {
  const fileName = path.basename(filePath);
  const modelId = config.modelId;
  const key = getTtsKey({ text, voiceId, modelId });

  if (isCached(filePath, key)) {
    console.log(`Reused cached TTS: ${fileName}`);
    return { path: filePath, key, status: "reused" };
  }

  console.log(`Generating TTS: ${fileName} | Voice: ${voiceId}`);

  const client = ttsClient || requestElevenLabsTts;

  await writeCachedFile(
    filePath,
    key,
    { type: "tts", voiceId, modelId, text },
    async tmpPath => {
      let buffer;

      try {
        buffer = await client({
          apiKey: config.elevenLabsApiKey,
          voiceId,
          modelId,
          text,
          voiceSettings: VOICE_SETTINGS,
        });
      } catch (error) {
        throw new Error(`TTS failed: ${fileName}: ${error.message}`);
      }

      fs.writeFileSync(tmpPath, buffer);
    }
  );

  console.log(`Generated TTS: ${fileName}`);

  return { path: filePath, key, status: "generated" };
}

module.exports = { ensureTtsFile, requestElevenLabsTts, getTtsKey };
