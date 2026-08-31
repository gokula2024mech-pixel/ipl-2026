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

async function listFolders(parentId) {
  const result = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    spaces: "drive",
    corpora: "user",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: "files(id,name,mimeType,parents,webViewLink,owners(displayName,emailAddress))",
    orderBy: "name",
  });

  return result.data.files || [];
}

async function main() {
  console.log("==============================================");
  console.log("FINDING REAL IPL 2026 STRUCTURE");
  console.log("==============================================");

  // Find all folders named ipl 2026
  const result = await drive.files.list({
    q: "name = 'ipl 2026' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    spaces: "drive",
    corpora: "user",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields:
      "files(id,name,mimeType,parents,webViewLink,owners(displayName,emailAddress))",
    orderBy: "modifiedTime desc",
  });

  const folders = result.data.files || [];

  console.log("");
  console.log(`FOUND ${folders.length} IPL 2026 FOLDER(S)`);
  console.log("");

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];

    console.log(`IPL FOLDER ${i + 1}`);
    console.log("----------------------------------------------");
    console.log("NAME:", folder.name);
    console.log("ID:", folder.id);
    console.log("PARENT:", folder.parents || []);
    console.log(
      "OWNER:",
      folder.owners?.map(o => o.emailAddress || o.displayName).join(", ") ||
        "Unknown"
    );
    console.log("LINK:", folder.webViewLink || "N/A");

    const children = await listFolders(folder.id);

    console.log("CHILD FOLDERS:");

    if (children.length === 0) {
      console.log("  NO FOLDERS");
    } else {
      children.forEach(child => {
        console.log(`  - ${child.name}`);
        console.log(`    ID: ${child.id}`);
      });
    }

    const hasPhase1 = children.some(
      child => child.name.toLowerCase() === "phase 1"
    );

    const hasTemplates = children.some(
      child => child.name.toLowerCase() === "templates" ||
               child.name.toLowerCase() === "templates"
    );

    console.log("");
    console.log("HAS PHASE 1:", hasPhase1 ? "YES" : "NO");
    console.log("HAS TEMPLATES:", hasTemplates ? "YES" : "NO");
    console.log("");

    if (hasPhase1) {
      const phase1 = children.find(
        child => child.name.toLowerCase() === "phase 1"
      );

      console.log(">>> THIS LOOKS LIKE THE CORRECT IPL 2026 ROOT <<<");
      console.log("ROOT ID:", folder.id);
      console.log("PHASE 1 ID:", phase1.id);
      console.log("");

      const departments = await listFolders(phase1.id);

      console.log("PHASE 1 DEPARTMENTS:");

      if (departments.length === 0) {
        console.log("  NO DEPARTMENTS FOUND");
      } else {
        departments.forEach(dept => {
          console.log(`  - ${dept.name}`);
          console.log(`    ID: ${dept.id}`);
        });
      }

      console.log("");
    }
  }

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