require("dotenv").config();

const { google } = require("googleapis");

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

async function main() {
  console.log("==============================================");
  console.log("CHECKING GOOGLE OAUTH ACCOUNT");
  console.log("==============================================");

  try {
    const accessTokenResponse = await auth.getAccessToken();

    const accessToken = accessTokenResponse.token;

    if (!accessToken) {
      throw new Error("Could not obtain access token");
    }

    const tokenInfo = await auth.getTokenInfo(accessToken);

    console.log("");
    console.log("OAUTH TOKEN INFORMATION");
    console.log("----------------------------------------------");

    console.log("EMAIL:", tokenInfo.email || "NOT PROVIDED");
    console.log("USER ID:", tokenInfo.user_id || "NOT PROVIDED");
    console.log("AUDIENCE:", tokenInfo.audience || "NOT PROVIDED");
    console.log("ISSUED TO:", tokenInfo.issued_to || "NOT PROVIDED");
    console.log("SCOPE:", tokenInfo.scope || "NOT PROVIDED");
    console.log("EXPIRES IN:", tokenInfo.expires_in || "NOT PROVIDED");

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