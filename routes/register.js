const express = require('express');
const router = express.Router();
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true }); // CSRF対策ミドルウェア

// Supabaseクライアントの初期化
// ※ 本番では、app.jsなどで初期化したシングルトンインスタンスをimportするのがより良い設計です。
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL; // 環境変数から取得
const supabaseKey = process.env.SUPABASE_ANON_KEY; // 環境変数から取得
const supabase = createClient(supabaseUrl, supabaseKey);

// GET /register - 登録フォーム表示 または 登録済み判定
// CSRF対策を適用
router.get('/', csrfProtection, async (req, res) => {
    const userId = req.query.userId; // LINE認証から渡されるuserIdを想定

    // userIdがない場合はエラー
    if (!userId) {
        // セッションにもuserIdがないか確認するなどの考慮も必要ですが、ここではシンプルにします
        return res.status(400).send('ユーザーIDが取得できませんでした。ログインからやり直してください。');
    }

    // ※ LINE認証コールバックでセッションにuserIdを保存している場合、ここは不要かもしれません。
    //    ただし、CSRF対策のため、GETリクエスト時にuserIdをセッションに保存しておくのは安全です。
    req.session.userId = userId;

    try {
        // ① Supabaseで従業員が登録済みかチェック
        //    employeesテーブルに、line_user_idが一致するレコードがあるか検索します。
        const { data, error } = await supabase
            .from('employees')
            .select('line_user_id')
            .eq('line_user_id', userId) // LINEユーザーIDで検索
            .single(); // 1件だけ取得（存在すれば）

        if (error && error.code !== 'PGRST116') { // PGRST116は「レコードが見つかりませんでした」のエラーコード
             console.error('Supabase登録チェックエラー:', error);
             return res.status(500).send('データベースエラーが発生しました。');
        }

        // ② 登録済みの場合 -> 給与明細選択画面へリダイレクト
        if (data) { // dataが存在すれば登録済み
            console.log(`ユーザー ${userId} は登録済みです。選択画面へリダイレクトします。`);
            // セッションにユーザーIDが保存されている前提で、クエリパラメータは不要かもしれません
            res.redirect('/select'); // あるいは `/select?userId=${userId}`
        }
        // ③ 未登録の場合 -> 登録フォームを表示
        else {
            console.log(`ユーザー ${userId} は未登録です。登録フォームを表示します。`);
            // CSRFトークンを生成し、登録フォームテンプレート（register.ejs）に渡してレンダリング
            res.render('register', {
                csrfToken: req.csrfToken(), // CSRFトークン
                userId: userId // フォームに埋め込むなど
            });
        }

    } catch (err) {
        console.error('登録チェック処理中のエラー:', err);
        res.status(500).send('サーバーエラーが発生しました。');
    }
});

// POST /register - 新規従業員登録処理
// CSRF対策を適用（トークン検証はcsurfミドルウェアが自動で行います）

router.post('/', csrfProtection, async (req, res) => { // async を追加してください
        // フォームから送信されたデータとセッションからuserIdを取得

    console.log('POST body:', req.body); // ここで値を確認テスト

        const userId = req.session.userId; // セッションに保存されているuserIdを使用
    const { name, shop } = req.body; // フォームのname, shopフィールドを想定

    // バリデーションチェック（名前、所属、ユーザーIDが必須）
    // userIdはセッションから来ますが、念のため存在チェックは残すか、セッションミドルウェアで制御
    if (!name || !shop || !userId) { // userIdのチェックも維持
        // エラーメッセージ付きでフォームを再表示するか、エラーページにリダイレクト
        // 現在はテキストを返していますが、CSRF対策されたテンプレート表示が望ましい [1, 4, 5]
        return res.status(400).send('登録情報が不足しています'); // 仮のエラー応答
    }

    try {
        // ★ ここからSupabaseへのデータ登録処理を追加/置き換え ★

        // 1. Supabaseで既に登録されていないかチェック [2, 3]
        // employees テーブルの line_user_id カラムで検索
        const { data: existingEmployee, error: checkError } = await supabase
            .from('employees') // テーブル名を指定
            .select('line_user_id') // 存在チェックだけならカラムは最小限でOK
            .eq('line_user_id', userId) // LINEユーザーIDで検索
            .single(); // 1件だけ取得を期待

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116は「行が見つかりません」のエラーコード [情報源にはない一般的なSupabaseエラーコード]
            // 行が見つからない以外のエラーの場合はログ出力してエラー応答
            console.error('Supabase登録済みチェックエラー:', checkError);
            return res.status(500).send('登録済みチェック中にエラーが発生しました。');
        }

        if (existingEmployee) {
            // すでに登録済みの場合はエラー応答またはリダイレクト [6-9]
            return res.status(400).send(`
                ⚠️ 登録エラー
                このユーザーはすでに登録されています。
                <a href="/">トップページに戻る</a>
            `); // 仮のエラー応答
        }

        // 2. 未登録であれば、Supabaseに従業員情報を挿入 [2, 3]
        // テーブル名: 'employees', カラム: 'line_user_id', 'name', 'shop' を想定 [10, 11]
        const { data: newEmployee, error: insertError } = await supabase
            .from('employees') // テーブル名を指定
            .insert([
                { line_user_id: userId, name: name, shop: shop } // DBのカラム名に合わせて指定
            ])
            .select(); // 挿入したデータを返す（任意）

        if (insertError) {
            console.error('Supabase登録エラー:', insertError);
            return res.status(500).send('従業員情報の登録に失敗しました。');
        }

        console.log('Supabase登録成功:', newEmployee); // 登録成功ログ

        // ★ Supabase登録処理ここまで ★

        // CSVファイルへの追記処理 (古いコード) は削除してください [12-14]
        // 例: fs.appendFileSync(...) や fs.writeFileSync(...) の部分

        // 登録完了画面へリダイレクト [6, 15-17]
        res.redirect('/register/success');

    } catch (err) {
        // 予期せぬエラーが発生した場合
        console.error('登録処理全体のエラー:', err);
        res.status(500).send('サーバー内部エラーが発生しました。');
    }
});

  
// 登録成功画面 (これはCSV版と同じロジックでOK)
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