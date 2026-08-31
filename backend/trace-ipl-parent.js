require("dotenv").config();

const { google } = require("googleapis");

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({
  version: "v3",
  auth,
});

// Mechanical Engineering folder ID found earlier
const MECHANICAL_ID = "1mXY0HS_aZu1pD7nAfSYRnO0FJhA4BE-0";

async function getFolder(id) {
  const result = await drive.files.get({
    fileId: id,
    fields: "id,name,mimeType,parents,driveId,webViewLink",
  });

  return result.data;
}

async function main() {
  console.log("==============================================");
  console.log("TRACING ACTUAL IPL 2026 FOLDER");
  console.log("==============================================");

  let currentId = MECHANICAL_ID;
  let level = 0;

  while (currentId && level < 10) {
    console.log("");
    console.log(`LEVEL ${level}`);
    console.log("----------------------------------------------");

    try {
      const folder = await getFolder(currentId);

      console.log("NAME:", folder.name);
      console.log("ID:", folder.id);
      console.log("TYPE:", folder.mimeType);
      console.log("PARENTS:", folder.parents || []);
      console.log("DRIVE ID:", folder.driveId || "My Drive");

      if (!folder.parents || folder.parents.length === 0) {
        console.log("");
        console.log(">>> REACHED TOP LEVEL <<<");
        break;
      }

      currentId = folder.parents[0];
      level++;

    } catch (error) {
      console.log("ERROR:", error.message);
      break;
    }
  }

  console.log("");
  console.log("==============================================");
  console.log("TRACE COMPLETED");
  console.log("==============================================");
}

main().catch(error => {
  console.log("FAILED:", error.message);
});