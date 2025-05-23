const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/', (req, res) => {
  const redirectUri = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${process.env.LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(process.env.LINE_CALLBACK_URL)}&state=12345&scope=profile openid`;
  res.redirect(redirectUri);
});

router.get('/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const qs = require('querystring');
    const tokenRes = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      qs.stringify({
        grant_type: 'authorization_code',
        code: code,
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

    // セッションIDを再生成
    req.session.regenerate((err) => {
      if (err) {
        console.error('セッション再生成エラー:', err);
        return res.status(500).send('セッションエラーが発生しました');
      }

      // ユーザー情報をセッションに保存
      req.session.userId = userId;

      // 登録チェック
      const employeesCsvPath = require('path').join(__dirname, '../data', 'employees.csv');
      const fs = require('fs');
      let isRegistered = false;
      if (fs.existsSync(employeesCsvPath)) {
        const csvData = fs.readFileSync(employeesCsvPath, 'utf8');
        const lines = csvData.split('\n').slice(1); // ヘッダー除く
        for (const line of lines) {
          const [existingUserId] = line.split(',');
          if (existingUserId.trim() === userId) {
            isRegistered = true;
            break;
          }
        }
      }

      // 登録状況に応じてリダイレクト
      if (isRegistered) {
        res.redirect(`/select?userId=${userId}`); // 登録済み → 給与明細選択へ
      } else {
        res.redirect(`/register?userId=${userId}`); // 未登録 → 登録画面へ
      }
    });

  } catch (err) {
    console.error('ログイン時のエラー:', err.response?.data || err);
    res.send('ログインエラーが発生しました');
  }
});

// ログアウト処理
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('セッション削除エラー:', err);
      return res.status(500).send('ログアウトエラーが発生しました');
    }

    // クライアント側のCookieも削除
    res.clearCookie('connect.sid', {
      path: '/', // Cookieのパスを指定
    });

    res.redirect('/'); // ログアウト後にトップページへリダイレクト
  });
});
module.exports = router;