// GitHub OAuth ログインと collaborator 確認。セッションには login 名と確認時刻だけを持つ
const crypto = require('node:crypto');
const { exchangeOAuthCode } = require('./github');

const RECHECK_MS = 10 * 60 * 1000; // collaborator かどうかは 10 分ごとに再確認する

function createAuth(config, github) {
  // GitHub の認可画面へ飛ばす
  function login(req, res) {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    const params = new URLSearchParams({
      client_id: config.oauth.clientId,
      redirect_uri: config.oauth.callbackUrl,
      state,
      // スコープは付けない（公開プロフィールだけ読めれば十分）
      allow_signup: 'false',
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  }

  // GitHub から戻ってきたら code をユーザー情報に換え、collaborator を確認する
  async function callback(req, res, next) {
    try {
      const { code, state } = req.query;
      if (!code || !state || state !== req.session.oauthState) {
        return res.status(400).render('error', { title: 'ログイン失敗', message: 'ログインの状態が一致しません。もう一度やり直してください。' });
      }
      delete req.session.oauthState;
      const user = await exchangeOAuthCode(config.oauth, code);
      await establishSession(req, user);
      if (!req.session.user) return res.redirect('/forbidden');
      res.redirect('/');
    } catch (e) {
      next(e);
    }
  }

  async function establishSession(req, user) {
    const ok = await github.isCollaborator(user.login);
    if (!ok) {
      // collaborator でなければログイン情報を残さない（session 自体は空のまま保持する）
      delete req.session.user;
      delete req.session.csrf;
      return;
    }
    req.session.user = { login: user.login, name: user.name, avatar: user.avatar, checkedAt: Date.now() };
    req.session.csrf = crypto.randomBytes(16).toString('hex');
  }

  function logout(req, res) {
    req.session = null;
    res.redirect('/login');
  }

  // ログイン必須のミドルウェア。一定時間ごとに collaborator を再確認する
  async function requireLogin(req, res, next) {
    try {
      // 開発用の疑似ログイン（本番では config.devFakeLogin は常に空）
      if (!req.session.user && config.devFakeLogin) {
        await establishSession(req, { login: config.devFakeLogin, name: config.devFakeLogin, avatar: '' });
      }
      const user = req.session.user;
      if (!user) return res.redirect(config.devFakeLogin ? '/forbidden' : '/login');
      if (Date.now() - user.checkedAt > RECHECK_MS) {
        const ok = await github.isCollaborator(user.login);
        if (!ok) {
          req.session = null;
          return res.redirect('/forbidden');
        }
        user.checkedAt = Date.now();
        req.session.user = user;
      }
      res.locals.user = user;
      res.locals.csrf = req.session.csrf;
      next();
    } catch (e) {
      next(e);
    }
  }

  // POST の CSRF 確認（フォームの hidden と Cookie セッションの値を比べる）
  function requireCsrf(req, res, next) {
    if (!req.session.csrf || req.body._csrf !== req.session.csrf) {
      return res.status(403).render('error', { title: '送信エラー', message: 'フォームの有効期限が切れました。もう一度開いて送信してください。' });
    }
    next();
  }

  return { login, callback, logout, requireLogin, requireCsrf };
}

module.exports = { createAuth };
