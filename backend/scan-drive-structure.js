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

const ROOT_ID = "1lTwvXI6mTkuCewRUnw0p_jVeGQ1RVX31";

async function getChildren(parentId) {
  const result = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType,parents)",
    orderBy: "name",
    pageSize: 1000,
  });

  return result.data.files || [];
}

async function scanFolder(folderId, level = 0) {
  const files = await getChildren(folderId);

  for (const file of files) {
    const indent = "  ".repeat(level);

    if (file.mimeType === "application/vnd.google-apps.folder") {
      console.log(`${indent}📁 ${file.name}`);
      console.log(`${indent}   ID: ${file.id}`);

      await scanFolder(file.id, level + 1);
    } else {
      console.log(`${indent}📄 ${file.name}`);
      console.log(`${indent}   ID: ${file.id}`);
    }
  }
}

async function main() {
  console.log("==============================================");
  console.log("IPL 2026 GOOGLE DRIVE FULL STRUCTURE");
  console.log("==============================================");
  console.log("");

  console.log("ROOT FOLDER");
  console.log(`ID: ${ROOT_ID}`);
  console.log("");

  await scanFolder(ROOT_ID);

  console.log("");
  console.log("==============================================");
  console.log("DRIVE STRUCTURE SCAN COMPLETED");
  console.log("==============================================");
}

main().catch((error) => {
  console.log("");
  console.log("==============================================");
  console.log("SCAN FAILED");
  console.log("==============================================");
  console.log(error.message);
});