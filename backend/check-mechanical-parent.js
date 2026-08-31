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

const MECHANICAL_ID = "1mXY0HS_aZu1pD7nAfSYRnO0FJhA4BE-0";

async function main() {
  console.log("==============================================");
  console.log("CHECKING MECHANICAL ENGINEERING PARENT");
  console.log("==============================================");

  // Get Mechanical Engineering details
  const mechanical = await drive.files.get({
    fileId: MECHANICAL_ID,
    fields: "id,name,mimeType,parents,webViewLink",
  });

  console.log("");
  console.log("MECHANICAL ENGINEERING");
  console.log("----------------------------------------------");
  console.log("NAME:", mechanical.data.name);
  console.log("ID:", mechanical.data.id);
  console.log("PARENT ID:", mechanical.data.parents || []);

  const parentId = mechanical.data.parents?.[0];

  if (!parentId) {
    console.log("No parent found.");
    return;
  }

  // Get parent details
  const parent = await drive.files.get({
    fileId: parentId,
    fields: "id,name,mimeType,parents,webViewLink",
  });

  console.log("");
  console.log("PARENT FOLDER");
  console.log("----------------------------------------------");
  console.log("NAME:", parent.data.name);
  console.log("ID:", parent.data.id);
  console.log("PARENT ID:", parent.data.parents || []);
  console.log("LINK:", parent.data.webViewLink || "N/A");

  // List siblings inside parent
  const children = await drive.files.list({
    q: `'${parentId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType)",
    orderBy: "name",
  });

  console.log("");
  console.log("PARENT CONTENT");
  console.log("----------------------------------------------");

  if (children.data.files.length === 0) {
    console.log("NO ITEMS FOUND");
  } else {
    children.data.files.forEach((item, index) => {
      console.log(
        `${index + 1}. ${item.name} | ${item.mimeType} | ${item.id}`
      );
    });
  }

  console.log("");
  console.log("==============================================");
  console.log("CHECK COMPLETED");
  console.log("==============================================");
}

main().catch(error => {
  console.log("");
  console.log("==============================================");
  console.log("CHECK FAILED");
  console.log("==============================================");
  console.log(error.message);
});