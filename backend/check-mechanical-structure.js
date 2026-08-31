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

const MECHANICAL_ID =
  "1mXY0HS_aZu1pD7nAfsYRn0OFJhA4BE-0";

async function getFolders(parentId) {
  const response = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    spaces: "drive",
    corpora: "user",
    fields: "files(id,name,mimeType,parents,webViewLink)",
    orderBy: "name",
  });

  return response.data.files || [];
}

async function main() {
  console.log("==============================================");
  console.log("MECHANICAL ENGINEERING STRUCTURE");
  console.log("==============================================");

  console.log("");
  console.log("MECHANICAL ENGINEERING");
  console.log("ID:", MECHANICAL_ID);

  const categories = await getFolders(MECHANICAL_ID);

  console.log("");
  console.log("CATEGORY FOLDERS");
  console.log("----------------------------------------------");

  if (categories.length === 0) {
    console.log("NO CATEGORY FOLDERS FOUND");
    return;
  }

  for (const category of categories) {
    console.log("");
    console.log("📁", category.name);
    console.log("ID:", category.id);

    const patentTypes = await getFolders(category.id);

    if (patentTypes.length === 0) {
      console.log("   └── NO PATENT FOLDERS");
      continue;
    }

    for (const patent of patentTypes) {
      console.log("   ├──", patent.name);
      console.log("   │   ID:", patent.id);

      const teamFolders = await getFolders(patent.id);

      if (teamFolders.length === 0) {
        console.log("   │   └── NO TEAM FOLDERS");
      } else {
        for (const team of teamFolders) {
          console.log("   │       └──", team.name);
          console.log("   │           ID:", team.id);
        }
      }
    }
  }

  console.log("");
  console.log("==============================================");
  console.log("STRUCTURE CHECK COMPLETED");
  console.log("==============================================");
}

main().catch((error) => {
  console.log("");
  console.log("==============================================");
  console.log("CHECK FAILED");
  console.log("==============================================");
  console.log(error.message);
});