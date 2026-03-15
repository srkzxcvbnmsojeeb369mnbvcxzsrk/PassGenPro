const { google } = require('googleapis');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { userId, name, email, picture, device } = JSON.parse(event.body);

    // Google Sheets auth
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;

    // আগে সব data পড়ো
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:A',
    });

    const rows = response.data.values || [];
    const now = new Date().toLocaleString('en-BD', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });

    // User আছে কিনা check করো
    let userRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === userId) {
        userRowIndex = i + 1; // 1-indexed
        break;
      }
    }

    if (userRowIndex === -1) {
      // নতুন user — append করো
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Sheet1!A:G',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[userId, name, email, picture, now, now, device || 'Unknown']]
        }
      });
    } else {
      // পুরানো user — Last Seen আর device update করো
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Sheet1!B${userRowIndex}:D${userRowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[name, email, picture]] }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Sheet1!F${userRowIndex}:G${userRowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[now, device || 'Unknown']] }
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error('Sheets error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
