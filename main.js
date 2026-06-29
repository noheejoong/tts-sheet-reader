require("dotenv").config();

const { readSentencesFromSheet } = require("./read-sheet");
const { generateAllTts } = require("./generate-tts");
const { generateAllGroupTts } = require("./generate-group-tts");
const { createShadowingFiles } = require("./postprocess-ffmpeg");
const { createGroupShadowingFiles } = require("./create-group-shadowing");
const { createWeeklyPracticeFolders } = require("./create-weekly-practice");

async function main() {
  try {
    console.log("1. Reading sentences from G-Sheet...");
    const items = await readSentencesFromSheet();

    console.log(`Total valid sentences: ${items.length}`);

    if (items.length === 0) {
      console.log("No sentences found.");
      return;
    }

    console.log("2. Generating sentence-level TTS files...");
    await generateAllTts(items);

    console.log("3. Generating group-level TTS files...");
    await generateAllGroupTts(items);

    console.log("4. Creating sentence-level playlist files...");
    createShadowingFiles();

    console.log("5. Creating group-level playlist files...");
    createGroupShadowingFiles();

    
    console.log("6. Creating weekly practice folders...");
    createWeeklyPracticeFolders();  

    console.log("All done.");
  } catch (error) {
    console.error("Error occurred:");
    console.error(error.message);
  }
}

main();