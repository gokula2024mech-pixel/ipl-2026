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

const ROOT_ID = "1dWIKn-jEu8-BCZrpw8YAUteKvoJy2R5H";

async function main() {
  console.log("==============================================");
  console.log("CHECKING SIR'S IPL 2026 FOLDER");
  console.log("==============================================");
  console.log("");
  console.log("ROOT ID:", ROOT_ID);
  console.log("");

  const result = await drive.files.list({
    q: `'${ROOT_ID}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,parents,driveId,webViewLink)",
    orderBy: "folder,name",
    pageSize: 100,
  });

  const files = result.data.files || [];

  console.log(`FOUND ${files.length} ITEMS`);
  console.log("");

  for (const file of files) {
    console.log("NAME:", file.name);
    console.log("ID:", file.id);
    console.log(
      "TYPE:",
      file.mimeType === "application/vnd.google-apps.folder"
        ? "FOLDER"
        : file.mimeType
    );
    console.log("");
  }

  console.log("==============================================");
  console.log("CHECK COMPLETED");
  console.log("==============================================");
}

main().catch((error) => {
  console.log("");
  console.log("==============================================");
  console.log("CHECK FAILED");
  console.log("==============================================");
  console.log(error.message);
});
