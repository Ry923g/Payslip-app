const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { processPayslipData } = require('../utils/helpers');
const displayNames = require('../data/display-names.json');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

router.get('/', async (req, res) => {
  const userId = req.query.userId;
  const selectedMonth = decodeURIComponent(req.query.month);
  
  // ここでリクエスト値をログ出力
  console.log('userId:', userId, 'selectedMonth:', selectedMonth);
  
  if (!userId || !selectedMonth) {
    return res.status(400).send('必要なクエリパラメータが不足しています');
  }

  // --- Supabaseで従業員チェック ---
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('*')
    .eq('line_user_id', userId)
    .maybeSingle();
  if (employeeError) return res.status(500).send('従業員データ取得エラー');
  if (!employee) return res.status(403).send('❌ このユーザーは登録されていません');

  // --- Supabaseで給与明細取得 ---
 console.log('★クエリ直前 userId:', userId, 'selectedMonth:', selectedMonth);

const { data: payslips, error: payslipError } = await supabase
  .from('salaries')
  .select('*')
  .eq('line_user_id', userId)
  .like('month', `%${selectedMonth}%`);  // ←ここだけ変更

console.log('★LIKE検索 payslips:', payslips, 'payslipError:', payslipError);
if (payslipError){
  console.error(payslipError);
  return res.status(500).send('給与データ取得エラー');
}
if (!payslip) return res.status(404).send('該当月の給与明細が見つかりません');

  // --- テンプレート部分は今まで通り ---
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

module.exports = router;