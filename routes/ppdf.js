const express = require('express');
const fs = require('fs');
const path = require('path');
const pdf = require('html-pdf'); // PDF生成ライブラリが必要
const router = express.Router();
const { processPayslipData } = require('../utils/helpers');
const displayNames = require('../data/display-names.json');

// ✨ /pdf PDFダウンロード ✨
router.get('/pdf', (req, res) => {
  const userId = req.query.userId;
  const selectedMonth = req.query.month;

  if (!userId || !selectedMonth) {
    return res.status(400).send('必要なクエリパラメータが不足しています');
  }

  const payslipPath = path.join(__dirname, '../data', 'payslips.json');
  const employeesCsvPath = path.join(__dirname, '../data', 'employees.csv');
  const templatePath = path.join(__dirname, '../templates', 'payslip.html');

  // ① 従業員データを先に読む
  if (!fs.existsSync(employeesCsvPath)) {
    return res.status(500).send('従業員データが存在しません');
  }
  const employeeLines = fs.readFileSync(employeesCsvPath, 'utf8').split('\n').slice(1);
  const validUserIds = employeeLines.map(line => line.split(',')[0]?.trim()).filter(Boolean);

  // ② userIdが存在するかチェック
  if (!validUserIds.includes(userId)) {
    return res.status(403).send('❌ このユーザーは登録されていません');
  }

  // ③ 給与データを読む
  fs.readFile(payslipPath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('給与データの読み込みに失敗しました');

    const payslips = JSON.parse(data);
    const userData = payslips[userId];
    if (!userData) return res.status(404).send('ユーザーが見つかりません');

    const payslip = Array.isArray(userData) ? userData.find(p => p.month === selectedMonth) : userData;
    if (!payslip) return res.status(404).send('該当月の給与明細が見つかりません');

    // 支給・控除データ
    const allowanceRows = [];
    const deductionRows = [];
    let totalAllowance = 0;
    let totalDeduction = 0;

    for (const key in payslip) {
      if (key.startsWith('allowance_') && Number(payslip[key])) {
        allowanceRows.push(`<tr><th>${displayNames[key] || key}</th><td>¥${Number(payslip[key]).toLocaleString()}</td></tr>`);
        totalAllowance += Number(payslip[key]);
      }
      if (key.startsWith('deduction_') && Number(payslip[key])) {
        deductionRows.push(`<tr><th>${displayNames[key] || key}</th><td>¥${Number(payslip[key]).toLocaleString()}</td></tr>`);
        totalDeduction += Number(payslip[key]);
      }
    }

    // HTMLテンプレート埋め込み
    let template = fs.readFileSync(templatePath, 'utf8');
    template = template
      .replace(/{{name}}/g, payslip.name)
      .replace(/{{month}}/g, payslip.month)
      .replace(/{{daysWorked}}/g, payslip.daysWorked || '')
      .replace(/{{workHours}}/g, payslip.workHours || '')
      .replace(/{{overtimeH}}/g, payslip.overtimeH || '')
      .replace(/{{netPay}}/g, Number(payslip.netPay).toLocaleString())
      .replace(/{{allowanceHtml}}/g, allowanceRows.join(''))
      .replace(/{{deductionHtml}}/g, deductionRows.join(''))
      .replace(/{{totalAllowance}}/g, totalAllowance.toLocaleString())
      .replace(/{{totalDeduction}}/g, totalDeduction.toLocaleString())
      .replace('{{downloadButton}}', ''); // PDF版ではボタン非表示

    // PDF生成して返す
    pdf.create(template).toStream((err, stream) => {
      if (err) return res.status(500).send('PDF生成エラー');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=payslip.pdf');
      stream.pipe(res);
    });
  });
});

module.exports = router;