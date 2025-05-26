const express = require('express');
const fs = require('fs');
const path = require('path');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });const router = express.Router();
const employeesCsvPath = path.join(__dirname, '../data', 'employees.csv');

// 登録画面を表示
router.get('/', csrfProtection, (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).send('ユーザーIDが取得できませんでした');
  }

  //登録済みチェック
  if (fs.existsSync(employeesCsvPath)) {
    const csvData = fs.readFileSync(employeesCsvPath, 'utf8');
    const lines = csvData.split('\n').slice(1); // 1行目ヘッダー除く

    for (const line of lines) {
      const [existingUserId] = line.split(',');
      if (existingUserId.trim() === userId) {
        return res.redirect(`/select?userId=${userId}`); // 登録済みなら選択画面へ
      }
    }
  }
//
  res.render('register', { csrfToken: req.csrfToken(), userId });

  // 未登録なら register.html を返す
  res.sendFile(path.join(__dirname, '../public', 'register.html'));
});

// 登録処理
router.post('/', csrfProtection, (req, res) => {
  const { name, department, userId } = req.body;

  if (!name || !department || !userId) {
    return res.status(400).send('登録情報が不足しています');
  }
 

  // CSVファイルを読み込んで、すでに登録されてないかチェック
  if (fs.existsSync(employeesCsvPath)) {
    const csvData = fs.readFileSync(employeesCsvPath, 'utf8');
    const lines = csvData.split('\n').slice(1); // 1行目ヘッダーを除く

    for (const line of lines) {
      const [existingUserId] = line.split(',');
      if (existingUserId === userId) {
        return res.status(400).send(`
          <h1>⚠️ 登録エラー</h1>
          <p>このユーザーはすでに登録されています。</p>
          <a href="/">トップページに戻る</a>
        `);
      }
    }
  }

  const newLine = `${userId},${name},${department}\n`;

  if (!fs.existsSync(employeesCsvPath)) {
    const header = 'userId,name,department\n';
    fs.writeFileSync(employeesCsvPath, header + newLine, 'utf8');
  } else {
    fs.appendFileSync(employeesCsvPath, newLine, 'utf8');
  }

  // 登録完了画面へリダイレクト
  res.redirect('/register/success');
});

// 登録成功画面
router.get('/success', (req, res) => {
  res.send(`
    <h1>✅ 登録が完了しました！</h1>
    <p>給与データが登録され次第、給与明細を確認できるようになります。</p>
    <a href="/">トップページに戻る</a>
  `);
});

module.exports = router;