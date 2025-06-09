const express = require('express');
const axios = require('axios');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js'); // Supabaseクライアントをインポート

// Supabaseクライアントの初期化
// Render本番環境では環境変数から、ローカル開発では.envから読み込む
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- LINE認証の開始 ---
router.get('/', (req, res) => {
    const redirectUri = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${process.env.LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(process.env.LINE_CALLBACK_URL)}&state=12345&scope=profile openid`;
    console.log('LINE Auth URL:', redirectUri); // ログで確認
    res.redirect(redirectUri);
});

// --- LINE認証のコールバック ---
router.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state; // stateパラメータも必要ならチェック
    const error = req.query.error; // エラーの場合も考慮

    if (error) {
        console.error('LINE認証エラー:', error);
        return res.status(400).send(`LINE認証エラー: ${error}`);
    }

    if (!code) {
        return res.status(400).send('LINE認証コードがありません');
    }

    // if (state !== '12345') { // stateの検証 (CSRF対策)
    //     console.error('Invalid state parameter');
    //     return res.status(400).send('不正なリクエストです');
    // }

    try {
        // LINE APIからアクセストークンを取得
        const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.LINE_CALLBACK_URL,
            client_id: process.env.LINE_CHANNEL_ID,
            client_secret: process.env.LINE_CHANNEL_SECRET
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const accessToken = tokenResponse.data.access_token;

        // LINE APIからユーザープロフィールを取得
        const profileResponse = await axios.get('https://api.line.me/v2/profile', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const userId = profileResponse.data.userId; // LINEユーザーID

        // --- ここからSupabase連携 ---
        // Supabaseでemployeesテーブルを検索
        const { data: employees, error: dbError } = await supabase
            .from('employees')
            .select('*')
            .eq('line_user_id', userId); // LINEユーザーIDで検索

        if (dbError) {
            console.error('Supabase query error:', dbError);
            return res.status(500).send('従業員情報取得時にDBエラーが発生しました');
        }

        if (employees.length > 0) {
            // 登録済みユーザー
            req.session.userId = userId; // LINEユーザーIDをセッションに保存
            // 必要なら、employeesから取得した従業員DB上のIDなどもセッションに保存
            console.log(`ユーザー ${userId} は登録済みです。セッションID: ${req.session.id}`);
            res.redirect(`/select?userId=${userId}`); 
        } else {
            // 未登録ユーザー
            req.session.userId = userId; // 未登録でもuserIdはセッションに保存
            console.log(`ユーザー ${userId} は未登録です。`);
            res.redirect(`/register?userId=${userId}`); // /register?userId=${userId} から変更
        }

    } catch (err) {
        console.error('ログイン時のエラー:', err.response?.data || err);
        // エラー詳細をユーザーに見せたくない場合は汎用的なメッセージにする
        res.status(500).send('ログイン処理中にエラーが発生しました');
    }
});

// --- ログアウト処理 ---
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('セッション削除エラー:', err); // ログは詳細に
      return res.status(500).send('ログアウトエラーが発生しました'); // ユーザーへの表示は汎用に
    }
    // クライアント側のCookieも削除
    res.clearCookie('connect.sid', {
      path: '/', // Cookieのパスを指定 (Expressのデフォルトと合わせる)
      // domain: '.your-domain.com', // 必要ならドメインも指定 (本番用)
      // secure: process.env.NODE_ENV === 'production', // HTTPSでのみ送信
      // httpOnly: true, // JavaScriptからのアクセス禁止 (Express Sessionのデフォルト)
      // sameSite: 'lax' // または 'strict' (Express Sessionのデフォルト)
    });
    console.log('セッションが破棄されました');
    res.redirect('/'); // ログアウト後にトップページへリダイレクト
  });
});


module.exports = router; // routerをエクスポート