const express = require('express');
const router = express.Router();
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true }); // CSRF対策ミドルウェア

// Supabaseクライアントの初期化
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET /register - 登録フォーム表示 または 登録済み判定
router.get('/', csrfProtection, async (req, res) => {
    // LINE認証時にセッションへuserId(line_user_id)を保存済み前提
    const lineUserId = req.session.userId;

    if (!lineUserId) {
        return res.status(400).send('ユーザー情報が取得できませんでした。ログインからやり直してください。');
    }

    try {
        // Supabase: 既登録チェック
        const { data, error } = await supabase
            .from('employees')
            .select('uuid')
            .eq('line_user_id', lineUserId)
            .maybeSingle();

        if (error) {
            console.error('Supabase登録チェックエラー:', error);
            return res.status(500).send('データベースエラーが発生しました。');
        }

        // 登録済みなら給与明細画面へリダイレクト（uuid付きに変更！）
        if (data && data.uuid) {
            console.log(`ユーザー ${lineUserId} は登録済み（uuid: ${data.uuid}）。選択画面へリダイレクトします。`);
            return res.redirect(`/select?u=${data.uuid}`);
        }

        // 未登録ならフォームを表示
        res.render('register', {
            csrfToken: req.csrfToken(),
            lineUserId // フォームに埋め込む用（hidden等）
        });

    } catch (err) {
        console.error('登録チェック処理中のエラー:', err);
        res.status(500).send('サーバーエラーが発生しました。');
    }
});

// POST /register - 新規従業員登録
router.post('/', csrfProtection, async (req, res) => {
    // フォームから取得
    const { name, shop, lineUserId } = req.body;

    if (!name || !shop || !lineUserId) {
        return res.status(400).send('登録情報が不足しています');
    }

    try {
        // 登録済みチェック
        const { data: existing, error: checkError } = await supabase
            .from('employees')
            .select('uuid')
            .eq('line_user_id', lineUserId)
            .maybeSingle();

        if (checkError) {
            console.error('Supabase登録済みチェックエラー:', checkError);
            return res.status(500).send('登録済みチェック中にエラーが発生しました。');
        }

        if (existing && existing.uuid) {
            // すでに登録済みの場合
            return res.status(400).send(`
                ⚠️ このユーザーはすでに登録されています。
                <a href="/">トップページに戻る</a>
            `);
        }

        // 未登録ならinsert（uuidはDB自動生成）
        const { data: inserted, error: insertError } = await supabase
            .from('employees')
            .insert([
                { line_user_id: lineUserId, name, shop }
            ])
            .select('uuid');

        if (insertError) {
            console.error('Supabase登録エラー:', insertError);
            return res.status(500).send('従業員情報の登録に失敗しました。');
        }

        // セッションにもuuidを保存
        if (inserted && inserted[0] && inserted[0].uuid) {
            req.session.userUuid = inserted[0].uuid;
        }

        // 登録完了画面へリダイレクト
        res.redirect('/register/success');

    } catch (err) {
        console.error('登録処理全体のエラー:', err);
        res.status(500).send('サーバー内部エラーが発生しました。');
    }
});

// 登録成功画面
router.get('/success', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>登録完了</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
            <h1>✅ 登録が完了しました！</h1>
            <p>給与データが登録され次第、給与明細を確認できるようになります。</p>
            <p><a href="/">トップページに戻る</a></p>
        </body>
        </html>
    `);
});

module.exports = router;