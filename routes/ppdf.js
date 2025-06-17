const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const router = express.Router();
const displayNames = require('../data/display-names.json');

const SUPABASE_URL = 'https://wfzvnajgtagcmbjnffmk.supabase.co';
const SUPABASE_API_KEY = process.env.SUPABASE_ANON_KEY; // .envに設定必須！

// ✨ /pdf PDFダウンロード ✨
router.get('/pdf', async (req, res) => {
  const userId = req.query.userId;
  const selectedMonth = req.query.month;

  if (!userId || !selectedMonth) {
    return res.status(400).send('必要なクエリパラメータが不足しています');
  }

  const templatePath = path.join(__dirname, '../templates', 'payslip.html');

  // Supabaseから従業員IDリスト取得
  let validUserIds = [];
  try {
    const empRes = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=line_user_id`, {
      headers: { apikey: SUPABASE_API_KEY }
    });
    if (!empRes.ok) throw new Error('従業員データが取得できません');
    const employees = await empRes.json();
    validUserIds = employees.map(e => e.line_user_id);
  } catch (err) {
    return res.status(500).send('従業員データ取得エラー');
  }

  // userIdが存在するかチェック
  if (!validUserIds.includes(userId)) {
    return res.status(403).send('❌ このユーザーは登録されていません');
  }

  // Supabaseから給与明細取得
  let payslip;
  try {
    const salRes = await fetch(
      `${SUPABASE_URL}/rest/v1/salaries?line_user_id=eq.${userId}&month=eq.${encodeURIComponent(selectedMonth)}`,
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
    .replace('{{downloadButton}}', ''); // PDF版ではボタン非表示

  // PDF生成して返す（puppeteer）
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(template, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=payslip.pdf');
    res.end(pdfBuffer);

  } catch (err) {
    res.status(500).send('PDF生成エラー');
  }
});

module.exports = router;