require("dotenv").config();

const { google } = require("googleapis");

async function main() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    const drive = google.drive({
        version: "v3",
        auth
    });

    const ROOT_ID =
        "1lTwvXI6mTkuCewRUnw0p_jVeGQ1RVX31";

    async function getChildren(parentId, level = 0) {

        const response = await drive.files.list({
            q: `'${parentId}' in parents and trashed=false`,
            fields: "files(id,name,mimeType)",
            orderBy: "name"
        });

        for (const file of response.data.files) {

            const indent = "  ".repeat(level);

            const isFolder =
                file.mimeType ===
                "application/vnd.google-apps.folder";

            console.log(
                `${indent}${isFolder ? "📁" : "📄"} ${file.name}`
            );

            console.log(
                `${indent}   ID: ${file.id}`
            );

            if (isFolder) {
                await getChildren(file.id, level + 1);
            }
        }
    }

    console.log("\n==========================================");
    console.log("IPL 2026 GOOGLE DRIVE STRUCTURE");
    console.log("==========================================");

    console.log("\n📁 ipl 2026");
    console.log("   ID:", ROOT_ID);

    await getChildren(ROOT_ID);

    console.log("\n==========================================");
    console.log("STRUCTURE CHECK COMPLETED");
    console.log("==========================================");
}

main().catch(error => {
    console.log("\n==========================================");
    console.log("FAILED");
    console.log("==========================================");
    console.log(error.message);
});