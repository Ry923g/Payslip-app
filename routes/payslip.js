const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { processPayslipData } = require('../utils/helpers');
const displayNames = require('../data/display-names.json');

// 給与明細の表示
router.get('/', (req, res) => {
    const userId = req.query.userId;
    const selectedMonth = decodeURIComponent(req.query.month);

  if (!userId || !selectedMonth) {
    return res.status(400).send('必要なクエリパラメータが不足しています');
  }

  const payslipPath = path.join(__dirname, '../data', 'payslips.json');
  const employeesCsvPath = path.join(__dirname, '../data', 'employees.csv');

  if (!fs.existsSync(employeesCsvPath)) {
    return res.status(500).send('従業員データが存在しません');
  }

  const employeeLines = fs.readFileSync(employeesCsvPath, 'utf8').split('\n').slice(1);
  const validUserIds = employeeLines.map(line => line.split(',')[0]?.trim()).filter(Boolean);

  if (!validUserIds.includes(userId)) {
    return res.status(403).send('❌ このユーザーは登録されていません');
  }

  fs.readFile(payslipPath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('給与データの読み込みに失敗しました');

    const payslips = JSON.parse(data);
    const userData = payslips[userId];
    const payslip = Array.isArray(userData) ? userData.find(p => p.month === selectedMonth) : userData;

    if (!payslip) return res.status(404).send('該当月の給与明細が見つかりません');

    const { allowanceRows, deductionRows, totalAllowance, totalDeduction } = processPayslipData(payslip, displayNames);

    let template = fs.readFileSync(path.join(__dirname, '../templates', 'payslip.html'), 'utf8');
        template = template
  .replace(/{{name}}/g, payslip.name)
  .replace(/{{month}}/g, payslip.month)
  .replace(/{{daysWorked}}/g, payslip.daysWorked)
  .replace(/{{workHours}}/g, payslip.workHours)
  .replace(/{{overtimeH}}/g, payslip.overtimeH)
  .replace(/{{netPay}}/g, Number(payslip.netPay).toLocaleString())
  .replace(/{{allowanceHtml}}/g, allowanceRows.join(''))
  .replace(/{{deductionHtml}}/g, deductionRows.join(''))
  .replace(/{{totalAllowance}}/g, totalAllowance.toLocaleString())
  .replace(/{{totalDeduction}}/g, totalDeduction.toLocaleString())
  .replace('{{downloadButton}}', `<div class="download-button"><a href="/ppdf/pdf?userId=${userId}&month=${selectedMonth}" target="_blank">📄 PDFとしてダウンロード</a></div>`);

    res.send(template);
  });
});

module.exports = router;

