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

const IPL_ROOT_ID = "1lTwvXI6mTkuCewRUnw0p_jVeGQ1RVX31";

async function main() {
  console.log("==============================================");
  console.log("SEARCHING SIR'S IPL 2026 FOLDER");
  console.log("==============================================");

  console.log("");
  console.log("ROOT ID:");
  console.log(IPL_ROOT_ID);

  const response = await drive.files.list({
    q: `'${IPL_ROOT_ID}' in parents and trashed = false`,
    spaces: "drive",
    fields: "files(id,name,mimeType,parents,owners(displayName,emailAddress),webViewLink)",
    orderBy: "name",
  });

  const files = response.data.files || [];

  console.log("");
  console.log("CHILD ITEMS");
  console.log("----------------------------------------------");

  if (files.length === 0) {
    console.log("NO CHILD ITEMS FOUND");
  } else {
    files.forEach((file, index) => {
      console.log("");
      console.log(`${index + 1}. ${file.name}`);
      console.log("   ID:", file.id);
      console.log("   TYPE:", file.mimeType);
      console.log("   PARENT:", file.parents);
      console.log(
        "   OWNER:",
        file.owners?.map(o => o.emailAddress).join(", ")
      );
      console.log("   LINK:", file.webViewLink || "N/A");
    });
  }

  console.log("");
  console.log("----------------------------------------------");
  console.log(`TOTAL ITEMS: ${files.length}`);
  console.log("----------------------------------------------");

  console.log("");
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