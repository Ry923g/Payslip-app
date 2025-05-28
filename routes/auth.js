const express = require('express');
const axios = require('axios');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Supabaseクライアントの初期化
// 環境変数からURLとAnonキーを読み込む
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// URLまたはキーが未設定の場合はエラーにするか、起動前に確認が必要
if (!supabaseUrl || !supabaseKey) {
    // ここでエラーを発生させるか、適切なハンドリングを行う
    // エラーログに出る場合は、ここで落ちている可能性が高い
    console.error("FATAL ERROR: SUPABASE_URL or SUPABASE_ANON_KEY is not set.");
    // process.exit(1); // 強制終了も検討
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// --- LINE認証 ---
router.get('/', (req, res) => {
  const redirectUri = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${process.env.LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(process.env.LINE_CALLBACK_URL)}&state=12345&scope=profile openid`;
  res.redirect(redirectUri);
});

router.get('/callback/', async (req, res) => {
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

    req.session.regenerate(async (err) => {
      if (err) return res.status(500).send('セッションエラーが発生しました');
      req.session.userId = userId;

      // Supabaseで従業員テーブルを検索
      const { data: employees, error } = await supabase
        .from('Employees')
        .select('*')
        .eq('line_user_id', userId);
      if (error) {
        return res.status(500).send('DBエラー');
      }
      if (employees.length > 0) {
        // 登録済みユーザー
        res.redirect(`/select?userId=${userId}`);
      } else {
        // 未登録ユーザー
        res.redirect(`/register?userId=${userId}`);
      }
    });
  } catch (err) {
    console.error('ログイン時のエラー:', err.response?.data || err);
    res.send('ログインエラーが発生しました');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send('ログアウトエラーが発生しました');
    res.clearCookie('connect.sid', { path: '/' });
    res.redirect('/');
  });
});

module.exports = router;