const fs = require('fs');
const path = require('path');

const payslipPath = path.join(__dirname, '../data/payslips.json');

function getAvailableMonths() {
  if (!fs.existsSync(payslipPath)) {
    throw new Error('給与データが存在しません');
  }

  const payslips = JSON.parse(fs.readFileSync(payslipPath, 'utf8'));
  const months = new Set();

  for (const userId in payslips) {
    const userPayslips = payslips[userId];
    userPayslips.forEach(payslip => {
      months.add(payslip.month);
    });
  }

  return Array.from(months).sort();
}

module.exports = getAvailableMonths;