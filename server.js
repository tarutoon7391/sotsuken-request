// 起動エントリ。設定を読み、Express アプリを組み立てて待ち受ける
require('dotenv').config();
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');

const config = loadConfig(process.env);
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`修正要望サイトを起動しました: http://localhost:${config.port}`);
  console.log(`対象リポジトリ: ${config.targetRepo}  日次制限: ${config.dailyLimit === 0 ? '無制限' : config.dailyLimit + '件'}`);
});
