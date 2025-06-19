const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { processPayslipData } = require('../utils/helpers');
const displayNames = require('../data/display-names.json');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

router.get('/', async (req, res) => {
  const uuid = req.query.u;
  const selectedMonth = decodeURIComponent(req.query.month);

  // ログ出力
  console.log('uuid:', uuid, 'selectedMonth:', selectedMonth);

  if (!uuid || !selectedMonth) {
    return res.status(400).send('必要なクエリパラメータが不足しています');
  }

  // --- uuidから従業員を取得 ---
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('line_user_id, name')
    .eq('uuid', uuid)
    .maybeSingle();

  if (employeeError) return res.status(500).send('従業員データ取得エラー');
  if (!employee) return res.status(403).send('❌ このユーザーは登録されていません');

  // --- セッションのline_user_idと一致するかを確認（所有者チェック） ---
  const loggedInLineUserId = req.session.userId;
  if (employee.line_user_id !== loggedInLineUserId) {
    return res.status(403).send('❌ 他人の給与明細にはアクセスできません');
  }

  // --- Supabaseから給与明細取得(uuidと月で絞る) ---
  const { data: payslips, error } = await supabase
    .from('salaries')
    .select('*')
    .eq('employee_uuid', uuid)
    .eq('month', selectedMonth);

  if (error) {
    console.error(error);
    return res.status(500).send('給与データ取得エラー');
  }
  if (!payslips || payslips.length === 0) {
    return res.status(404).send('該当月の給与明細が見つかりません');
  }

  const payslip = payslips[0];

  // --- テンプレート部分 ---
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
    .replace('{{downloadButton}}', `<div class="download-button"><a href="/ppdf/pdf?u=${uuid}&month=${selectedMonth}" target="_blank">📄 PDFとしてダウンロード</a></div>`);

  res.send(template);
});

module.exports = router;