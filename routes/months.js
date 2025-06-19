const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

router.get('/', async (req, res) => {
  const uuid = req.query.u;
  if (!uuid) return res.status(400).send('uuidが必要です');

  // 1. uuid→従業員取得
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('line_user_id')
    .eq('uuid', uuid)
    .maybeSingle();

  if (employeeError) return res.status(500).send('従業員情報取得エラー');
  if (!employee) return res.status(404).send('ユーザーが見つかりません');

  // 2. 所有者チェック
  const sessionLineUserId = req.session.userId;
  if (!sessionLineUserId || employee.line_user_id !== sessionLineUserId) {
    return res.status(403).send('他人の月一覧は取得できません');
  }

  // 3. salariesテーブルからこのuuidの給与データを取得
  const { data: payslips, error: payslipError } = await supabase
    .from('salaries')
    .select('month')
    .eq('employee_uuid', uuid);

  if (payslipError) return res.status(500).send('給与データ取得エラー');

  // 4. 月一覧をユニーク化して返す
  const months = [...new Set((payslips || []).map(p => p.month))];
  res.json(months);
});

module.exports = router;