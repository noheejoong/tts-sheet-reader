# Transcript MP3 Generator

Generate shadowing MP3 files from Google Sheet sentences using ElevenLabs TTS.

## Features

* Read sentences from Google Sheet
* Generate sentence-level TTS MP3 files
* Generate group-level TTS MP3 files
* Create shadowing playlist files
* Create weekly practice folders automatically

## Processing Flow

The program performs the following steps:

1. Read sentences from Google Sheet
2. Generate sentence-level TTS files
3. Generate group-level TTS files
4. Create sentence-level playlist files
5. Create group-level playlist files
6. Create weekly practice folders

## Prerequisites

Please install the following before running the program:

* Node.js (v18 or later recommended)
* FFmpeg
* ElevenLabs API Key
* Google Service Account JSON file

## Installation

Clone the repository and install dependencies.

```bash
git clone https://github.com/noheejoong/tts-sheet-reader.git
cd tts-sheet-reader
npm ci
```

Or download the repository as a ZIP file from GitHub and extract it.

## Configuration

### 1. Create `.env`

Copy `.env.example` and create your own `.env` file.

```bash
copy .env.example .env
```

Fill in the required values.

### 2. Add `service-account.json`

Place `service-account.json` in the project root directory.

> This file is not included in the repository for security reasons.

### 3. Share Google Sheet

Open your Google Sheet and share it with the `client_email` inside `service-account.json`.

The service account needs at least Viewer permission.

## Environment Variables

| Variable                 | Description                                        |
| ------------------------ | -------------------------------------------------- |
| SPREADSHEET_ID           | Google Spreadsheet ID                              |
| SHEET_NAME               | Sheet name to read                                 |
| RANGE                    | Cell range (e.g. A1:A89)                           |
| ELEVENLABS_API_KEY       | ElevenLabs API Key                                 |
| ELEVENLABS_VOICE_IDS     | Comma-separated Voice IDs                          |
| ELEVENLABS_MODEL_ID      | ElevenLabs Model ID                                |
| ENABLE_SENTENCE_LEVEL    | Generate sentence-level files (default: false)     |
| REPEAT_COUNT             | Sentence repeat count                              |
| DEFAULT_SENTENCE_PAUSE   | Default pause between sentences                    |
| PAUSE_SECONDS            | Pause length                                       |
| GROUP_SIZE               | Number of sentences per group                      |
| GROUP_REVIEW_MODES       | Group review modes (full,short)                    |
| GROUP_FULL_REPEAT_COUNT  | Full review repeat count                           |
| GROUP_FULL_REPEAT_PAUSE  | Full review pause                                  |
| GROUP_SHORT_REPEAT_COUNT | Short review repeat count                          |
| GROUP_SHORT_REPEAT_PAUSE | Short review pause                                 |
| AUDIO_SPEED              | Audio playback speed                               |
| OUTPUT_SPEED_FOLDER      | Create speed-specific output folder                |
| GOOGLE_DRIVE_DIR         | Google Drive directory for weekly practice folders |

## Run

```bash
npm start
```

or

```bash
node src/main.js
```

### Options

| Option | Description |
| --- | --- |
| `--dry-run` | Read the sheet and show the plan (TTS new/reuse counts, characters to generate, output paths, weekly folder, Drive target). No TTS call, no file or voice-map change. |
| `--output-dir <dir>` | Put all outputs and `voice-map.json` under `<dir>` (for verification). |
| `--max-groups <n>` | Process only the first `n` complete groups (for verification). |
| `--no-drive` | Skip copying to Google Drive. |

```bash
npm start -- --dry-run
```

## Project Structure

```text
src/                  # source code (entry point: src/main.js)
test/                 # tests (mock TTS, temporary folders)
.env                  # settings (project root)
service-account.json  # Google service account (project root)
voice-map.json        # generated local group voice assignments (ignored by Git)
```

## Output Folders

The following folders are generated during execution:

```text
output/{sheet-key}/                       # sentence-level TTS (ENABLE_SENTENCE_LEVEL=true)
group_output/{sheet-key}/                 # group-level TTS
training_playlist[_{speed}x]/{sheet-key}/ # repeated/paused playlist files
weekly-practice/{YYYY-Www}/Day N/
```

`{sheet-key}` is `sheet_{12-char hash of spreadsheet ID + sheet ID}`.
It does not include the sheet name, so renaming a sheet keeps its cache and voices,
and sheets with the same name or row numbers never share files.
Each sheet folder has a `sheet-info.json` with the current sheet name.

Each MP3 has a `*.mp3.meta.json` file next to it. A file is reused only when
its metadata matches the current text, voice, model and processing settings,
and the file's size and SHA-256 match the metadata. If regeneration fails,
the previous file and metadata are kept.
Files without metadata (for example, files from older versions) are never reused.

## Test

Runs with mock TTS and temporary folders. No paid API is called.

```bash
npm test
```

## Troubleshooting

### No sentences found

Please verify:

* SPREADSHEET_ID
* SHEET_NAME
* RANGE

### Google Sheet Permission Error

Make sure the Google Sheet is shared with the service account email.

### ElevenLabs API Error

Please verify:

* ELEVENLABS_API_KEY
* ELEVENLABS_VOICE_IDS
* ELEVENLABS_MODEL_ID

### FFmpeg Error

Check whether FFmpeg is installed correctly.

```bash
ffmpeg -version
```

## Notes

* `.env` is not included in this repository.
* `service-account.json` is not included in this repository.
* Generated MP3 files are ignored by Git.
* `voice-map.json` is generated automatically and stays local to preserve your voice assignments.
* Each user should use their own ElevenLabs API Key.

## License

For internal use only.
