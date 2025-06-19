# 1. まずPlaywright入りのLinuxイメージを用意（公式が用意してくれてる！）
FROM mcr.microsoft.com/playwright:v1.53.1-jammy

# 2. 作業ディレクトリを作成
WORKDIR /app

# 3. プロジェクトの中身を全部コピー
COPY . .

# 4. npm installで依存パッケージを入れる
RUN npm install

# 5. アプリの起動コマンド
CMD ["node", "app.js"]