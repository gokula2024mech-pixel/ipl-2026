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
  console.log("FINDING ACCESSIBLE MECHANICAL ENGINEERING");
  console.log("==============================================");

  const response = await drive.files.list({
    q: "name = 'Mechanical Engineering' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: "files(id,name,mimeType,parents,driveId,webViewLink)",
    orderBy: "createdTime",
  });

  console.log("");
  console.log(`FOUND ${response.data.files.length} FOLDER(S)`);
  console.log("");

  response.data.files.forEach((folder, index) => {
    console.log(`FOLDER ${index + 1}`);
    console.log("----------------------------------------------");
    console.log("NAME:", folder.name);
    console.log("ID:", folder.id);
    console.log("PARENT ID:", folder.parents || []);
    console.log("DRIVE ID:", folder.driveId || "My Drive");
    console.log("LINK:", folder.webViewLink || "N/A");
    console.log("");
  });

  console.log("==============================================");
  console.log("SEARCH COMPLETED");
  console.log("==============================================");
}

main().catch(error => {
  console.log("");
  console.log("==============================================");
  console.log("SEARCH FAILED");
  console.log("==============================================");
  console.log(error.message);
});