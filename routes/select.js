const express = require('express');
const fs = require('fs');
const path = require('path');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabaseクライアントの初期化（必要に応じて共通化）
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const payslipPath = path.join(__dirname, '../data', 'payslips.json');

router.get('/', csrfProtection, async (req, res) => {
  const uuid = req.query.u;

  if (!uuid) {
    return res.status(400).send(`
      <h1>⚠️ エラー</h1>
      <p>ユーザーID（uuid）が指定されていません。</p>
      <a href="/">トップページに戻る</a>
    `);
  }

  // DBでuuid→line_user_idを取得
  const { data: employees, error } = await supabase
    .from('employees')
    .select('line_user_id')
    .eq('uuid', uuid);

  if (error || !employees || employees.length === 0) {
    return res.status(404).send(`
      <h1>⚠️ ユーザー情報が見つかりません</h1>
      <a href="/">トップページに戻る</a>
    `);
  }

  const payslipKey = uuid; // payslips.jsonがuuid基準で管理されている場合
  const loggedInLineUserId = req.session.userId;

  // 不正アクセス防止: セッションユーザーとアクセス先ユーザーが一致するかチェック
  if (employees[0].line_user_id !== loggedInLineUserId) {
    return res.status(403).send(`
      <h1>⚠️ アクセス権限エラー</h1>
      <p>他のユーザーの給与明細にはアクセスできません。</p>
      <a href="/">トップページに戻る</a>
    `);
  }

  fs.readFile(payslipPath, 'utf8', (err, data) => {
    if (err) {
      console.error('給与データの読み込みエラー:', err);
      return res.status(500).send(`
        <h1>⚠️ サーバーエラー</h1>
        <p>給与データの読み込みに失敗しました。</p>
        <a href="/">トップページに戻る</a>
      `);
    }

    const payslips = JSON.parse(data);
    const userPayslips = payslips[payslipKey];

    if (!userPayslips) {
      return res.status(404).send(`
        <h1>⚠️ 給与データが見つかりません</h1>
        <p>まだ給与データが登録されていない可能性があります。</p>
        <a href="/">トップページに戻る</a>
      `);
    }

    const months = [...new Set(userPayslips.map(p => p.month))];
    const options = months.map(m => `<option value="${m}">${m}</option>`).join('');

    res.send(`
      <h1>給与明細の月を選択</h1>
      <form action="/payslip" method="GET">
        <input type="hidden" name="u" value="${uuid}" />
        <select name="month">
          ${options}
        </select>
        <button type="submit">表示</button>
      </form>
    `);
  });
});

module.exports = router;