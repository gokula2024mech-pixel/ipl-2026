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
  console.log("CHECKING SIR'S IPL 2026 PERMISSIONS");
  console.log("==============================================");

  try {
    const folder = await drive.files.get({
      fileId: FOLDER_ID,
      fields: [
        "id",
        "name",
        "mimeType",
        "parents",
        "owners(displayName,emailAddress)",
        "permissions(id,type,emailAddress,displayName,role)",
        "permissionIds",
        "webViewLink",
        "shared",
      ].join(","),
      supportsAllDrives: true,
    });

    console.log("");
    console.log("FOLDER");
    console.log("----------------------------------------------");

    console.log("NAME:", folder.data.name);
    console.log("ID:", folder.data.id);
    console.log("TYPE:", folder.data.mimeType);
    console.log("PARENT:", folder.data.parents || []);
    console.log("SHARED:", folder.data.shared);
    console.log("LINK:", folder.data.webViewLink || "N/A");

    console.log("");
    console.log("OWNER");
    console.log("----------------------------------------------");

    if (folder.data.owners) {
      folder.data.owners.forEach(owner => {
        console.log(
          `${owner.displayName} <${owner.emailAddress}>`
        );
      });
    }

    console.log("");
    console.log("PERMISSIONS");
    console.log("----------------------------------------------");

    if (!folder.data.permissions || folder.data.permissions.length === 0) {
      console.log("NO PERMISSIONS RETURNED");
    } else {
      folder.data.permissions.forEach((permission, index) => {
        console.log("");
        console.log(`PERMISSION ${index + 1}`);
        console.log("ID:", permission.id);
        console.log("TYPE:", permission.type);
        console.log("EMAIL:", permission.emailAddress || "N/A");
        console.log("NAME:", permission.displayName || "N/A");
        console.log("ROLE:", permission.role);
      });
    }

    console.log("");
    console.log("PERMISSION IDS");
    console.log("----------------------------------------------");
    console.log(folder.data.permissionIds || []);

    console.log("");
    console.log("==============================================");
    console.log("CHECK COMPLETED");
    console.log("==============================================");

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