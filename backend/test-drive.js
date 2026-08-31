require("dotenv").config();

const { google } = require("googleapis");

async function checkPhase1() {
    try {
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

        const PHASE1_ID =
            "11eIoeFpZH4SQCtWEPSMCpw0zAezr5zmn";

        console.log("\n==========================================");
        console.log("REAL PHASE 1 CONTENT");
        console.log("==========================================");

        const response = await drive.files.list({
            q: `'${PHASE1_ID}' in parents and trashed=false`,
            fields: "files(id,name,mimeType)",
            orderBy: "name"
        });

        if (!response.data.files.length) {
            console.log("PHASE 1 IS EMPTY");
        } else {

            for (const file of response.data.files) {

                const type =
                    file.mimeType ===
                    "application/vnd.google-apps.folder"
                        ? "FOLDER"
                        : "FILE";

                console.log("\n" + type);
                console.log("Name:", file.name);
                console.log("ID:", file.id);
                console.log("Type:", file.mimeType);
            }
        }

        console.log("\n==========================================");
        console.log("TEST COMPLETED");
        console.log("==========================================");

    } catch (error) {

        console.log("\n==========================================");
        console.log("FAILED");
        console.log("==========================================");

        console.log(error.message);
    }
}

checkPhase1();