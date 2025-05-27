const express = require('express');
const axios = require('axios');
const router = express.Router();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// --- LINE認証 ---
router.get('/', (req, res) => {
  const redirectUri = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${process.env.LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(process.env.LINE_CALLBACK_URL)}&state=12345&scope=profile openid`;
  res.redirect(redirectUri);
});

router.get('/callback/line', async (req, res) => {
  const code = req.query.code;
  try {
    const qs = require('querystring');
    const tokenRes = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINE_CALLBACK_URL,
        client_id: process.env.LINE_CHANNEL_ID,
        client_secret: process.env.LINE_CHANNEL_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenRes.data.access_token;
    const profileRes = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = profileRes.data;
    const userId = profile.userId;

    req.session.regenerate((err) => {
      if (err) return res.status(500).send('セッションエラーが発生しました');
      req.session.userId = userId;
      const employeesCsvPath = path.join(__dirname, '../data', 'employees.csv');
      let isRegistered = false;
      if (fs.existsSync(employeesCsvPath)) {
        const csvData = fs.readFileSync(employeesCsvPath, 'utf8');
        const lines = csvData.split('\n').slice(1);
        for (const line of lines) {
          const [existingUserId] = line.split(',');
          if (existingUserId.trim() === userId) {
            isRegistered = true;
            break;
          }
        }
      }
      if (isRegistered) {
        res.redirect(`/select?userId=${userId}`);
      } else {
        res.redirect(`/register?userId=${userId}`);
      }
    });
  } catch (err) {
    console.error('ログイン時のエラー:', err.response?.data || err);
    res.send('ログインエラーが発生しました');
  }
});

// --- Google認証 ---
let client_id, client_secret, redirect_uri;
if (process.env.GOOGLE_CLIENT_ID) {
  client_id = process.env.GOOGLE_CLIENT_ID;
  client_secret = process.env.GOOGLE_CLIENT_SECRET;
  redirect_uri = process.env.GOOGLE_REDIRECT_URI;
} else {
  const credentials = require('../credentials.json');
  client_id = credentials.web.client_id;
  client_secret = credentials.web.client_secret;
  redirect_uri = credentials.web.redirect_uris[0];
}
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

router.get('/google', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

router.get('/callback/google', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync('tokens.json', JSON.stringify(tokens));
    res.send('Google認証完了！APIアクセスの準備ができました。');
  } catch (err) {
    res.status(500).send('Google認証失敗: ' + err.message);
  }
});

router.get('/drive/list', async (req, res) => {
  const tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));
  oAuth2Client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  const result = await drive.files.list({ pageSize: 10 });
  res.json(result.data.files);
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send('ログアウトエラーが発生しました');
    res.clearCookie('connect.sid', { path: '/' });
    res.redirect('/');
  });
});

module.exports = router;