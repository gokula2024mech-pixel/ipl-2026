require('dotenv').config();

const { google } = require('googleapis');

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({
  version: 'v3',
  auth
});

const ROOT_ID = '1dWIKn-jEu8-BCZrpw8YAUTeKvoJy2R5H';
const TEMPLATES_FOLDER_NAME = 'templetes';

async function main() {
  console.log('==============================================');
  console.log('CHECKING DYNAMIC TEMPLATE FOLDER');
  console.log('==============================================');
  console.log('');

  try {
    // Find the templates folder inside OUR IPL 2026 root
    const folderResult = await drive.files.list({
      q: `'${ROOT_ID}' in parents and name = '${TEMPLATES_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name,mimeType,parents)',
      pageSize: 100
    });

    const folders = folderResult.data.files || [];

    if (folders.length === 0) {
      console.log('TEMPLATES FOLDER NOT FOUND');
      return;
    }

    const folder = folders[0];

    console.log('TEMPLATES FOLDER FOUND');
    console.log('----------------------------------------------');
    console.log('NAME:', folder.name);
    console.log('ID:', folder.id);
    console.log('');

    // List all files inside
    const filesResult = await drive.files.list({
      q: `'${folder.id}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
      orderBy: 'name',
      pageSize: 1000
    });

    const files = filesResult.data.files || [];

    console.log('TEMPLATE FILES');
    console.log('----------------------------------------------');

    if (files.length === 0) {
      console.log('NO TEMPLATE FILES FOUND');
    } else {
      files.forEach((file, index) => {
        console.log('');
        console.log(`${index + 1}. ${file.name}`);
        console.log(`   ID: ${file.id}`);
        console.log(`   TYPE: ${file.mimeType}`);
        console.log(`   SIZE: ${file.size || 'N/A'}`);
        console.log(`   MODIFIED: ${file.modifiedTime}`);
      });
    }

    console.log('');
    console.log('==============================================');
    console.log('TEMPLATE CHECK COMPLETED');
    console.log('==============================================');

  } catch (error) {
    console.log('');
    console.log('==============================================');
    console.log('CHECK FAILED');
    console.log('==============================================');
    console.log(error.message);
  }
}

main();