const express = require('express');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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
  const { data: employee, error } = await supabase
    .from('employees')
    .select('line_user_id')
    .eq('uuid', uuid)
    .maybeSingle();

  if (error || !employee) {
    return res.status(404).send(`
      <h1>⚠️ ユーザー情報が見つかりません</h1>
      <a href="/">トップページに戻る</a>
    `);
  }

  // 不正アクセス防止: セッションユーザーとアクセス先ユーザーが一致するかチェック
  const loggedInLineUserId = req.session.userId;
  if (employee.line_user_id !== loggedInLineUserId) {
    return res.status(403).send(`
      <h1>⚠️ アクセス権限エラー</h1>
      <p>他のユーザーの給与明細にはアクセスできません。</p>
      <a href="/">トップページに戻る</a>
    `);
  }

  // Supabaseから給与データ取得
  const { data: payslips, error: payslipError } = await supabase
    .from('salaries')
    .select('month')
    .eq('employee_uuid', uuid);

  if (payslipError) {
    console.error('給与データの取得エラー:', payslipError);
    return res.status(500).send(`
      <h1>⚠️ サーバーエラー</h1>
      <p>給与データの取得に失敗しました。</p>
      <a href="/">トップページに戻る</a>
    `);
  }

  if (!payslips || payslips.length === 0) {
    return res.status(404).send(`
      <h1>⚠️ 給与データが見つかりません</h1>
      <p>まだ給与データが登録されていない可能性があります。</p>
      <a href="/">トップページに戻る</a>
    `);
  }

  // 重複除去（月リスト）
  const months = [...new Set(payslips.map(p => p.month))];
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

module.exports = router;