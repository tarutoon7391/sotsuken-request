// 画面とフォーム送信の経路
const express = require('express');
const { SCREENS, KINDS } = require('./screens');
const { validateInput, buildIssue } = require('./issueBody');
const { attachStatus } = require('./status');

function createRoutes(config, github, auth) {
  const router = express.Router();

  // 残り件数を計算する（dailyLimit が 0 なら無制限）
  async function quota(login) {
    if (config.dailyLimit === 0) return { limit: 0, used: 0, remaining: Infinity, blocked: false };
    const used = await github.countToday(login);
    const remaining = Math.max(0, config.dailyLimit - used);
    return { limit: config.dailyLimit, used, remaining, blocked: remaining === 0 };
  }

  router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { title: 'ログイン', targetRepo: config.targetRepo });
  });
  router.get('/auth/github', auth.login);
  router.get('/auth/github/callback', auth.callback);
  router.post('/logout', auth.logout);
  router.get('/forbidden', (req, res) => {
    res.status(403).render('error', {
      title: 'アクセスできません',
      message: `このサイトは ${config.targetRepo} の collaborator だけが使えます。リポジトリのオーナーに招待を依頼してください。`,
    });
  });

  // 要望フォーム
  router.get('/', auth.requireLogin, async (req, res, next) => {
    try {
      const q = await quota(res.locals.user.login);
      res.render('form', { title: '修正要望を送る', screens: SCREENS, kinds: KINDS, quota: q, errors: [], input: {}, targetRepo: config.targetRepo });
    } catch (e) {
      next(e);
    }
  });

  // 送信 → Issue 作成
  router.post('/requests', auth.requireLogin, auth.requireCsrf, async (req, res, next) => {
    try {
      const input = {
        kind: String(req.body.kind || ''),
        screen: String(req.body.screen || ''),
        content: String(req.body.content || ''),
        steps: String(req.body.steps || ''),
        expected: String(req.body.expected || ''),
        actual: String(req.body.actual || ''),
      };
      const login = res.locals.user.login;
      const q = await quota(login);
      const errors = validateInput(input);
      if (q.blocked) errors.push(`本日の送信上限（${q.limit}件）に達しました。明日また送ってください。`);
      if (errors.length) {
        return res.status(400).render('form', { title: '修正要望を送る', screens: SCREENS, kinds: KINDS, quota: q, errors, input, targetRepo: config.targetRepo });
      }
      const issue = await github.createIssue(buildIssue(input, login));
      res.redirect(`/requests?created=${issue.number}`);
    } catch (e) {
      next(e);
    }
  });

  // 一覧
  router.get('/requests', auth.requireLogin, async (req, res, next) => {
    try {
      const mine = req.query.filter === 'mine';
      const [issues, pulls, branches] = await Promise.all([github.listRequestIssues(), github.listPulls(), github.listClaudeBranches()]);
      let rows = attachStatus(issues, pulls, branches);
      if (mine) rows = rows.filter((r) => r.requester === res.locals.user.login);
      res.render('list', {
        title: '要望一覧',
        rows,
        mine,
        created: req.query.created ? Number(req.query.created) : null,
        screens: SCREENS,
        kinds: KINDS,
        targetRepo: config.targetRepo,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createRoutes };
