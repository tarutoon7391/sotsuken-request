// 環境変数の読み込みと検証。秘密情報はここでしか触らず、ビューには渡さない

function loadConfig(env) {
  const missing = [];
  const need = (key) => {
    if (!env[key]) missing.push(key);
    return env[key] || '';
  };

  const isProduction = env.NODE_ENV === 'production';
  const targetRepo = need('TARGET_REPO');
  const [owner, repo] = targetRepo.split('/');
  const config = {
    isProduction,
    port: Number(env.PORT) || 3100,
    targetRepo,
    owner,
    repo,
    githubToken: need('GITHUB_TOKEN'),
    oauth: {
      clientId: need('GITHUB_CLIENT_ID'),
      clientSecret: need('GITHUB_CLIENT_SECRET'),
      callbackUrl: need('OAUTH_CALLBACK_URL'),
    },
    sessionSecret: need('SESSION_SECRET'),
    dailyLimit: Math.max(0, Number(env.DAILY_LIMIT) || 0),
    // 開発中だけ使う疑似ログイン。本番では必ず無効
    devFakeLogin: isProduction ? '' : (env.DEV_FAKE_LOGIN || ''),
  };

  if (!owner || !repo) missing.push('TARGET_REPO（owner/repo の形式）');
  if (missing.length) {
    // 疑似ログイン時は OAuth の設定が無くても起動できるようにする
    const fatal = missing.filter((k) => !(config.devFakeLogin && k.startsWith('GITHUB_CLIENT')) && !(config.devFakeLogin && k === 'OAUTH_CALLBACK_URL'));
    if (fatal.length) {
      throw new Error(`環境変数が足りません: ${fatal.join(', ')}（.env.example を参照）`);
    }
  }
  return config;
}

module.exports = { loadConfig };
