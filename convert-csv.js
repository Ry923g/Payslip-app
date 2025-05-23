const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const readline = require('readline');
const csv = require('csv-parser');

const results = {};
const displayNames = {};

const csvPath = path.join(__dirname, 'data', 'Sample.csv');

// グローバルに headerKeys を定義
let headerKeys = [];

// ファイルストリーム（Shift_JIS）
const rawStream = fs.createReadStream(csvPath).pipe(iconv.decodeStream('Shift_JIS'));

// まず1行目と2行目だけ読み取って、表示名とキー名を取得
const lines = [];
const rl = readline.createInterface({ input: rawStream });
rl.on('line', (line) => {
  lines.push(line);
  if (lines.length === 2) rl.close(); // 最初の2行だけで十分
});

rl.on('close', () => {
  const labels = lines[0].split(',');
  const keys = lines[1].split(',');

  headerKeys = keys.map(k => k.trim()); // ← ✅ 修正ポイント！

  keys.forEach((key, i) => {
    if (key && labels[i]) {
      displayNames[key.trim()] = labels[i].trim();
    }
  });

  // データ部分を再読み込み（2行スキップして、headerKeysを使用）
  const dataStream = fs.createReadStream(csvPath)
    .pipe(iconv.decodeStream('Shift_JIS'))
    .pipe(csv({ skipLines: 2, headers: headerKeys }));

  dataStream.on('data', (row) => {
    // 柔軟に userId カラム名を特定（スペースや大文字対応）
    const userIdKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'userid');
    const userId = row[userIdKey]?.trim();

    if (!userId) {
      console.log('⚠️ userId が取得できなかった行:', row);
      return;
    }

    console.log('👤 登録 userId:', userId); // ← デバッグログ

    if (!results[userId]) {
      results[userId] = [];
    }

    const payslip = {};
    for (const key in row) {
      let value = row[key];
      if (!value) continue;

      // カンマ付き数値を数値に変換
      if (!isNaN(value.replace?.(/,/g, ''))) {
        value = Number(value.replace(/,/g, ''));
      }

      payslip[key.trim()] = value;
    }

    results[userId].push(payslip);
  });

  dataStream.on('end', () => {
    fs.writeFileSync(path.join(__dirname, 'data', 'payslips.json'), JSON.stringify(results, null, 2), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'data', 'display-names.json'), JSON.stringify(displayNames, null, 2), 'utf8');
    console.log('✅ payslips.json と display-names.json を生成しました！');
  });
});
