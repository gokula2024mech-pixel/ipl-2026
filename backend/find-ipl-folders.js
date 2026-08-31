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

async function main() {
  console.log("==============================================");
  console.log("FINDING ALL IPL 2026 FOLDERS");
  console.log("==============================================");
  console.log("");

  const result = await drive.files.list({
    q: "name = 'ipl 2026' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: "files(id,name,mimeType,parents,driveId,webViewLink)",
    orderBy: "createdTime",
    pageSize: 100,
  });

  const folders = result.data.files || [];

  console.log(`FOUND ${folders.length} IPL 2026 FOLDER(S)`);
  console.log("");

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];

    console.log(`FOLDER ${i + 1}`);
    console.log("----------------------------------------------");
    console.log("NAME:", folder.name);
    console.log("ID:", folder.id);
    console.log("PARENT ID:", folder.parents || "NO PARENT");
    console.log("DRIVE ID:", folder.driveId || "My Drive");
    console.log("LINK:", folder.webViewLink || "N/A");
    console.log("");
  }

  console.log("==============================================");
  console.log("SEARCH COMPLETED");
  console.log("==============================================");
}

main().catch((error) => {
  console.log("");
  console.log("==============================================");
  console.log("SEARCH FAILED");
  console.log("==============================================");
  console.log(error.message);
});