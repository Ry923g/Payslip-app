require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const csrf = require('csurf'); // CSRF対策用
const cookieParser = require('cookie-parser'); // Cookie操作用


// 各ルートをインポート
const authRoutes = require('./routes/auth.js');
const registerRoutes = require('./routes/register.js');
const selectRoutes = require('./routes/select.js');
const payslipRoutes = require('./routes/payslip.js');
const ppdfRoutes = require('./routes/ppdf.js');
const monthsRoutes = require('./routes/months.js');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル提供
app.use(express.static('public'));
// テンプレートエンジンの指定
app.set('view engine', 'ejs');
// テンプレートファイルの場所（通常は'views'ディレクトリ）
app.set('views', path.join(__dirname, 'views'));

// セッションの設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-key', // 環境変数から取得
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,          // JavaScriptからCookieにアクセスできない
    secure: process.env.NODE_ENV === 'production', // HTTPSのみで送信（本番環境で有効化）
    maxAge: 1000 * 60 * 30   // セッションの有効期限を30分に設定
  }
}));

// 必須ミドルウェア
app.use(cookieParser());
app.use(express.urlencoded({ extended: true })); // フォームデータを処理するため

// CSRF保護ミドルウェア
const csrfProtection = csrf({ cookie: true });

// ルート定義
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use('/auth', authRoutes);
app.use('/register', registerRoutes);
app.use('/select', selectRoutes);
app.use('/payslip', payslipRoutes);
app.use('/ppdf', ppdfRoutes);
app.use('/months', monthsRoutes);

// Webhookエンドポイント
app.post('/callback', express.json(), (req, res) => {
  console.log("✅ Webhook受信:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// CSRF保護が必要なルート
app.get('/form', csrfProtection, (req, res) => {
  res.send(`
    <form action="/process" method="POST">
      <input type="hidden" name="_csrf" value="${req.csrfToken()}">
      <button type="submit">送信</button>
    </form>
  `);
});

app.post('/process', csrfProtection, (req, res) => {
  res.send('フォーム送信が成功しました！');
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`サーバーが http://localhost:${PORT} で起動しました`);
});