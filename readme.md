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
git clone <repository-url>
cd <repository-name>
npm install
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
node main.js
```

## Output Folders

The following folders are generated during execution:

```text
output/
group_output/
training_playlist_1.0x/
weekly-practice/
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
* Each user should use their own ElevenLabs API Key.

## License

For internal use only.
