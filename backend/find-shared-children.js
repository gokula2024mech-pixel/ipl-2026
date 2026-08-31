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

async function searchByName(name) {
  console.log("");
  console.log(`SEARCHING FOR: ${name}`);
  console.log("----------------------------------------------");

  const response = await drive.files.list({
    q: `name = '${name}' and trashed = false`,
    spaces: "drive",
    corpora: "user",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 100,
    fields:
      "files(id,name,mimeType,parents,owners(displayName,emailAddress),driveId,shared,webViewLink)",
  });

  const files = response.data.files || [];

  if (files.length === 0) {
    console.log("NOT FOUND");
    return;
  }

  files.forEach((file, index) => {
    console.log("");
    console.log(`${index + 1}. ${file.name}`);
    console.log("   ID:", file.id);
    console.log("   TYPE:", file.mimeType);
    console.log("   PARENTS:", file.parents || []);
    console.log("   DRIVE ID:", file.driveId || "NONE");
    console.log("   SHARED:", file.shared || false);
    console.log(
      "   OWNER:",
      file.owners
        ? file.owners.map(o => o.emailAddress).join(", ")
        : "NOT AVAILABLE"
    );
    console.log("   LINK:", file.webViewLink || "N/A");
  });
}

async function main() {
  console.log("==============================================");
  console.log("IPL 2026 SHARED FOLDER DIAGNOSTIC");
  console.log("==============================================");

  console.log("");
  console.log("SIR'S ROOT ID:");
  console.log(ROOT_ID);

  console.log("");
  console.log("STEP 1 - DIRECT CHILD QUERY");
  console.log("----------------------------------------------");

  const direct = await drive.files.list({
    q: `'${ROOT_ID}' in parents and trashed = false`,
    spaces: "drive",
    corpora: "user",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1000,
    fields:
      "files(id,name,mimeType,parents,owners(displayName,emailAddress),driveId,shared,webViewLink)",
  });

  console.log("DIRECT CHILDREN:", direct.data.files?.length || 0);

  (direct.data.files || []).forEach(file => {
    console.log(" -", file.name, "|", file.id);
  });

  console.log("");
  console.log("STEP 2 - GLOBAL NAME SEARCH");

  await searchByName("Phase 1");
  await searchByName("Templates");
  await searchByName("phase 2");
  await searchByName("phase3");

  console.log("");
  console.log("==============================================");
  console.log("DIAGNOSTIC COMPLETED");
  console.log("==============================================");
}

main().catch(error => {
  console.log("");
  console.log("==============================================");
  console.log("DIAGNOSTIC FAILED");
  console.log("==============================================");
  console.log(error.message);

  if (error.response?.data) {
    console.log(JSON.stringify(error.response.data, null, 2));
  }
});