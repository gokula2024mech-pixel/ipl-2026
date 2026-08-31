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

const FOLDER_ID = "1lTwvXI6mTkuCewRUnw0p_jVeGQ1RVX31";

async function main() {
  console.log("==============================================");
  console.log("CHECKING SIR'S IPL 2026 FOLDER ACCESS");
  console.log("==============================================");

  try {
    const folder = await drive.files.get({
      fileId: FOLDER_ID,
      fields:
        "id,name,mimeType,parents,owners(displayName,emailAddress),shared,sharedWithMeTime,capabilities,driveId,trashed",
      supportsAllDrives: true,
    });

    console.log("");
    console.log("FOLDER INFORMATION");
    console.log("----------------------------------------------");

    console.log("NAME:", folder.data.name);
    console.log("ID:", folder.data.id);
    console.log("TYPE:", folder.data.mimeType);
    console.log("PARENT:", folder.data.parents || []);
    console.log("DRIVE ID:", folder.data.driveId || "NONE");
    console.log("TRASHED:", folder.data.trashed);
    console.log("SHARED:", folder.data.shared);

    console.log(
      "OWNER:",
      folder.data.owners
        ? folder.data.owners
            .map(o => `${o.displayName} <${o.emailAddress}>`)
            .join(", ")
        : "NOT AVAILABLE"
    );

    console.log("");
    console.log("CAPABILITIES");
    console.log("----------------------------------------------");
    console.log(folder.data.capabilities);

    console.log("");
    console.log("==============================================");
    console.log("TRYING TO LIST CHILDREN");
    console.log("==============================================");

    const children = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields:
        "files(id,name,mimeType,parents,owners(displayName,emailAddress),driveId,webViewLink)",
      orderBy: "name",
      pageSize: 1000,
    });

    console.log("");

    if (!children.data.files || children.data.files.length === 0) {
      console.log("NO CHILDREN FOUND");
    } else {
      children.data.files.forEach((file, index) => {
        console.log(`${index + 1}. ${file.name}`);
        console.log("   ID:", file.id);
        console.log("   TYPE:", file.mimeType);
        console.log("   DRIVE ID:", file.driveId || "NONE");
        console.log("");
      });
    }

    console.log("----------------------------------------------");
    console.log(
      "TOTAL CHILDREN:",
      children.data.files ? children.data.files.length : 0
    );
    console.log("----------------------------------------------");

  } catch (error) {
    console.log("");
    console.log("==============================================");
    console.log("CHECK FAILED");
    console.log("==============================================");
    console.log("ERROR:", error.message);

    if (error.response?.data) {
      console.log("");
      console.log("GOOGLE API RESPONSE:");
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
}

main();