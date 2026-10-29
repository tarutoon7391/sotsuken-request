// Express アプリの組み立て
const path = require('node:path');
const express = require('express');
const cookieSession = require('cookie-session');
const { createGitHubClient } = require('./github');
const { createAuth } = require('./auth');
const { createRoutes } = require('./routes');

function createApp(config, deps = {}) {
  const app = express();
  // テストでは deps.github に疑似クライアントを渡せる
  const github = deps.github || createGitHubClient(config);
  const auth = createAuth(config, github);

  // Railway はリバースプロキシ越しなので、Secure Cookie を使うために信頼する
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');

  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(
    cookieSession({
      name: 'sotsuken_request',
      keys: [config.sessionSecret],
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
    }),
  );
  // ビューに共通で渡す値
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.csrf = req.session.csrf || '';
    res.locals.targetRepo = config.targetRepo;
    next();
  });

  app.use(createRoutes(config, github, auth));

  app.use((req, res) => {
    res.status(404).render('error', { title: 'ページがありません', message: 'お探しのページは見つかりませんでした。' });
  });
  // エラーはログに出し、画面には要点だけ出す（トークン等は含めない）
  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).render('error', { title: 'エラー', message: err.message || 'エラーが発生しました。' });
  });

  return app;
}

module.exports = { createApp };
