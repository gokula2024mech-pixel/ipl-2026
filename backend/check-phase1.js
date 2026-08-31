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

async function main() {
  console.log("==============================================");
  console.log("IPL 2026 - PHASE 1 CHECK");
  console.log("==============================================");
  console.log("");

  // 1. Find phase 1 inside the root folder
  console.log("Searching for phase 1...");

  const phaseResult = await drive.files.list({
    q: `'${ROOT_ID}' in parents and name = 'phase 1' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name,mimeType,parents)",
    pageSize: 100,
  });

  const phaseFolders = phaseResult.data.files || [];

  console.log(`Found ${phaseFolders.length} phase 1 folder(s).`);
  console.log("");

  if (phaseFolders.length === 0) {
    console.log("❌ phase 1 folder was not found.");
    return;
  }

  const phase1 = phaseFolders[0];

  console.log("PHASE 1 FOUND");
  console.log("----------------------------------------------");
  console.log("Name:", phase1.name);
  console.log("ID:", phase1.id);
  console.log("Type:", phase1.mimeType);
  console.log("");

  // 2. Get departments inside phase 1
  console.log("Reading departments...");
  console.log("");

  const departmentResult = await drive.files.list({
    q: `'${phase1.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name,mimeType,parents)",
    orderBy: "name",
    pageSize: 100,
  });

  const departments = departmentResult.data.files || [];

  console.log(`FOUND ${departments.length} DEPARTMENT FOLDERS`);
  console.log("");

  if (departments.length === 0) {
    console.log("❌ No department folders found inside phase 1.");
    return;
  }

  for (const department of departments) {
    console.log("----------------------------------------------");
    console.log("📁", department.name);
    console.log("ID:", department.id);
  }

  console.log("");
  console.log("==============================================");
  console.log("PHASE 1 CHECK COMPLETED");
  console.log("==============================================");
}

main().catch((error) => {
  console.log("");
  console.log("==============================================");
  console.log("❌ CHECK FAILED");
  console.log("==============================================");
  console.log("Error:", error.message);
  console.log("==============================================");
});