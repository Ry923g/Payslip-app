const express = require('express');
const fs = require('fs');
const path = require('path');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });
const router = express.Router();

const payslipPath = path.join(__dirname, '../data', 'payslips.json');

router.get('/', csrfProtection, (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).send(`
      <h1>⚠️ エラー</h1>
      <p>ユーザーIDが指定されていません。</p>
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
    const userPayslips = payslips[userId];

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
        <input type="hidden" name="userId" value="${userId}" />
        <select name="month">
          ${options}
        </select>
        <button type="submit">表示</button>
      </form>
    `);
  });
});

module.exports = router;