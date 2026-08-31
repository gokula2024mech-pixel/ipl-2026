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

async function listChildren(parentId, level = 0) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,parents)',
    orderBy: 'folder,name',
    pageSize: 1000
  });

  const files = res.data.files || [];

  for (const file of files) {
    const indent = '  '.repeat(level);

    const icon =
      file.mimeType === 'application/vnd.google-apps.folder'
        ? '📁'
        : '📄';

    console.log(`${indent}${icon} ${file.name}`);
    console.log(`${indent}   ID: ${file.id}`);

    if (file.mimeType === 'application/vnd.google-apps.folder') {
      await listChildren(file.id, level + 1);
    }
  }
}

async function main() {
  console.log('==============================================');
  console.log('VERIFYING MY IPL 2026 DRIVE STRUCTURE');
  console.log('==============================================');
  console.log('');
  console.log('ROOT ID:');
  console.log(ROOT_ID);
  console.log('');
  console.log('MY DRIVE → ipl 2026');
  console.log('----------------------------------------------');

  try {
    const root = await drive.files.get({
      fileId: ROOT_ID,
      fields: 'id,name,mimeType,parents,trashed,owners'
    });

    console.log(`📁 ${root.data.name}`);
    console.log(`ID: ${root.data.id}`);
    console.log(`TYPE: ${root.data.mimeType}`);
    console.log('');

    await listChildren(ROOT_ID);

    console.log('');
    console.log('==============================================');
    console.log('VERIFICATION COMPLETED');
    console.log('==============================================');

  } catch (error) {
    console.log('');
    console.log('==============================================');
    console.log('VERIFICATION FAILED');
    console.log('==============================================');
    console.log(error.message);
  }
}

main();