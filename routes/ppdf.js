const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { chromium } = require('playwright');
const router = express.Router();
const displayNames = require('../data/display-names.json');

const SUPABASE_URL = 'https://wfzvnajgtagcmbjnffmk.supabase.co';
const SUPABASE_API_KEY = process.env.SUPABASE_ANON_KEY;

router.get('/pdf', async (req, res) => {
  console.log('---------- /pdf route called! ----------');
  const uuid = req.query.u;
  const selectedMonth = req.query.month;

  if (!uuid || !selectedMonth) {
    return res.status(400).send('必要なクエリパラメータが不足しています');
  }

  const templatePath = path.join(__dirname, '../templates', 'payslip.html');

  // --- 従業員（uuid→line_user_id）取得 & 所有者チェック ---
  let employee;
  try {
    const empRes = await fetch(
      `${SUPABASE_URL}/rest/v1/employees?uuid=eq.${uuid}&select=line_user_id,name`,
      { headers: { apikey: SUPABASE_API_KEY } }
    );
    if (!empRes.ok) throw new Error('従業員データが取得できません');
    const employees = await empRes.json();
    employee = employees[0];
    if (!employee) return res.status(403).send('❌ このユーザーは登録されていません');
  } catch (err) {
    return res.status(500).send('従業員データ取得エラー');
  }

  // --- セッションのuserId(line_user_id)と一致するか確認（所有者チェック） ---
  const loggedInLineUserId = req.session.userId;
  if (!loggedInLineUserId || employee.line_user_id !== loggedInLineUserId) {
    return res.status(403).send('❌ 他人の給与明細はダウンロードできません');
  }

  // --- Supabaseから給与明細取得（employee_uuid + monthで） ---
  let payslip;
  try {
    const salRes = await fetch(
      `${SUPABASE_URL}/rest/v1/salaries?employee_uuid=eq.${uuid}&month=eq.${encodeURIComponent(selectedMonth)}`,
      { headers: { apikey: SUPABASE_API_KEY } }
    );
    if (!salRes.ok) throw new Error('給与データ取得失敗');
    const salaries = await salRes.json();
    payslip = salaries[0];
    if (!payslip) return res.status(404).send('該当月の給与明細が見つかりません');
  } catch (err) {
    return res.status(500).send('給与データの取得に失敗しました');
  }

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
    .replace('{{downloadButton}}', '');

  // PDF生成して返す（playwright）
  try {
    console.log('playwright起動前');
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    console.log('newPage作成後');
    await page.setContent(template, { waitUntil: 'networkidle0' });
    console.log('setContent完了');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });
    console.log('PDF生成完了:', pdfBuffer.length);

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=payslip.pdf');
    res.end(pdfBuffer);

  } catch (err) {
    console.error('PDF生成エラー:', err);
    res.status(500).send('PDF生成エラー');
  }
});

module.exports = router;