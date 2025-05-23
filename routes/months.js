const express = require('express');
const getAvailableMonths = require('../utils/getAvailableMonths');
const router = express.Router();

router.get('/', (req, res) => {
  try {
    const months = getAvailableMonths();
    res.json(months);
  } catch (error) {
    console.error('月一覧の取得エラー:', error);
    res.status(500).send('月一覧の取得に失敗しました');
  }
});

module.exports = router;