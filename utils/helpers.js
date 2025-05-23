function processPayslipData(payslip, displayNames) {
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
  
    return { allowanceRows, deductionRows, totalAllowance, totalDeduction };
  }
  
  module.exports = { processPayslipData };