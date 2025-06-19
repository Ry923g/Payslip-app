const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabaseクライアントの初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- LINE認証の開始 ---
router.get('/', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.lineAuthState = state; // セッションに保存

    const redirectUri = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${process.env.LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(process.env.LINE_CALLBACK_URL)}&state=${state}&scope=profile openid`;
    console.log('LINE Auth URL:', redirectUri);
    res.redirect(redirectUri);
});

// --- LINE認証のコールバック ---
router.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;

    if (error) {
        console.error('LINE認証エラー:', error);
        return res.status(400).send(`LINE認証エラー: ${error}`);
    }

    if (!code) {
        return res.status(400).send('LINE認証コードがありません');
    }

    // === state検証 ===
    const stateFromSession = req.session.lineAuthState;
    if (!state || !stateFromSession || state !== stateFromSession) {
        req.session.lineAuthState = null;
        return res.status(403).send('state値が一致しません（CSRF等の可能性）');
    }
    req.session.lineAuthState = null;
    // === state検証ここまで ===

    try {
        // LINE APIからアクセストークンを取得
        const tokenResponse = await axios.post(
            'https://api.line.me/oauth2/v2.1/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.LINE_CALLBACK_URL,
                client_id: process.env.LINE_CHANNEL_ID,
                client_secret: process.env.LINE_CHANNEL_SECRET
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        // LINE APIからユーザープロフィールを取得
        const profileResponse = await axios.get('https://api.line.me/v2/profile', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const userId = profileResponse.data.userId; // LINEユーザーID

        // --- Supabase連携 ---
        const { data: employees, error: dbError } = await supabase
            .from('employees')
            .select('*')
            .eq('line_user_id', userId);

        if (dbError) {
            console.error('Supabase query error:', dbError);
            return res.status(500).send('従業員情報取得時にDBエラーが発生しました');
        }

        if (employees && employees.length > 0) {
            // 登録済みユーザー
            req.session.userId = userId; // セッションに保存
            // 必要なら従業員DB上のIDなども保存
            console.log(`ユーザー ${userId} は登録済みです。セッションID: ${req.session.id}`);
            res.redirect(`/select?userId=${userId}`);
        } else {
            // 未登録ユーザー
            req.session.userId = userId;
            console.log(`ユーザー ${userId} は未登録です。`);
            res.redirect(`/register?userId=${userId}`);
        }
    } catch (err) {
        console.error('ログイン時のエラー:', err.response?.data || err);
        res.status(500).send('ログイン処理中にエラーが発生しました');
    }
});

// --- ログアウト処理 ---
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('セッション削除エラー:', err);
            return res.status(500).send('ログアウトエラーが発生しました');
        }
        // クッキー削除
        res.clearCookie('connect.sid', {
            path: '/',
            // domain: '.your-domain.com', // 必要なら
            // secure: process.env.NODE_ENV === 'production',
            // httpOnly: true,
            // sameSite: 'lax'
        });
        console.log('セッションが破棄されました');
        res.redirect('/');
    });
});

module.exports = router;