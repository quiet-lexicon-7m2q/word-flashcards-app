/*!
 * Snow Lexis · 云同步客户端（可选）
 * ------------------------------------------------------------------
 * 设计：双模式 —— 没有服务器时，全部走本地 localStorage（双击 index.html 照样能用）；
 *       配置了服务器地址并登录后，进度与收藏会同步到服务端，多设备/多用户各自独立。
 *
 * 合并策略（与 server/server.js 保持一致）：
 *   - 记忆记录：取 last_review_time 更新的一条；完全相同则取熟悉度更高的
 *   - 单词收藏 / 词库收藏：取并集（收藏时间取更早的）
 *   - 学习日志：按「范围+名称+完成时间」去重，保留最近 200 条
 */
(function (root) {
  'use strict';

  const KEY_BASE = 'yy_api_base';
  const KEY_TOKEN = 'yy_api_token';
  const KEY_USER = 'yy_api_user';
  const APP_TAG = 'beidanci-youyuan';

  function safeParse(text, fallback) {
    try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; }
  }
  function ls(key, value) {
    if (value === undefined) return root.localStorage.getItem(key) || '';
    root.localStorage.setItem(key, String(value));
  }

  function sameOriginBase() {
    // 页面本身就是服务器托管的（http/https）时，直接用同源 API
    return /^https?:$/.test(location.protocol) ? location.origin : '';
  }

  const API = {
    get base() {
      const saved = ls(KEY_BASE);
      return (saved || sameOriginBase()).replace(/\/+$/, '');
    },
    set base(v) { ls(KEY_BASE, String(v || '').replace(/\/+$/, '')); },
    get token() { return ls(KEY_TOKEN); },
    set token(v) { ls(KEY_TOKEN, v || ''); },
    get user() { return safeParse(ls(KEY_USER), null); },
    set user(v) { ls(KEY_USER, v ? JSON.stringify(v) : ''); },

    /** 是否具备同步条件（有服务器地址） */
    enabled: function () { return !!this.base; },
    /** 页面是否由服务器托管（手机直接访问网址时就是这种情况） */
    served: function () { return /^https?:$/.test(location.protocol); },
    loggedIn: function () { return !!(this.base && this.token); },

    request: function (path, options) {
      const opts = options || {};
      const base = this.base;
      if (!base) return Promise.reject(new Error('还没有配置服务器地址'));
      const headers = { 'Content-Type': 'application/json' };
      if (this.token) headers.Authorization = 'Bearer ' + this.token;
      return fetch(base + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
          return data;
        });
      });
    },

    health: function () { return this.request('/api/health'); },
    register: function (username, password) { return this.request('/api/register', { method: 'POST', body: { username: username, password: password } }); },
    login: function (username, password) { return this.request('/api/login', { method: 'POST', body: { username: username, password: password } }); },
    loginByCode: function (code) { return this.request('/api/login-code', { method: 'POST', body: { code: code } }); },
    pull: function () { return this.request('/api/sync'); },
    push: function (data) { return this.request('/api/sync', { method: 'POST', body: { data: data } }); },

    /**
     * 批量查音标（导入新词时自动补全用）
     * 由 node server/server.js 托管时可用（本地缓存了 19 万词条的 ipa-dict）；
     * 静态托管或没启动服务端时返回空对象，导入表单就把音标留空让人手填。
     * @returns {Promise<{ [word: string]: [uk, us] }>}
     */
    ipa: function (words) {
      const self = this;
      const list = (words || []).map(function (w) { return String(w || '').trim(); })
        .filter(Boolean).slice(0, 500);
      if (!list.length || !self.base) return Promise.resolve({});
      return self.request('/api/ipa?words=' + encodeURIComponent(list.join(',')))
        .then(function (r) { return (r && r.ipa) || {}; })
        .catch(function () { return {}; });
    },

    applySession: function (result) {
      if (!result) return;
      this.token = result.token || result.sync_code || '';
      this.user = result.user || null;
    },
    logout: function () { ls(KEY_TOKEN, ''); ls(KEY_USER, ''); }
  };

  /** 快照合并（本地 + 云端） */
  function mergeSnapshots(local, remote) {
    const a = local || {}, b = remote || {};
    const out = { review_records: {}, word_collection: [], library_collection: [], study_log: [] };

    const rr = Object.assign({}, a.review_records || {});
    Object.keys(b.review_records || {}).forEach(function (k) {
      const x = rr[k], y = b.review_records[k];
      if (!x) { rr[k] = y; return; }
      const tx = Number(x.last_review_time) || 0, ty = Number(y.last_review_time) || 0;
      if (ty > tx) rr[k] = y;
      else if (ty === tx && (Number(y.familiarity) || 0) > (Number(x.familiarity) || 0)) rr[k] = y;
    });
    out.review_records = rr;

    const wm = {};
    (a.word_collection || []).concat(b.word_collection || []).forEach(function (x) {
      const id = Number(x && x.vocab_id);
      if (!id) return;
      wm[id] = { vocab_id: id, create_time: wm[id] ? Math.min(wm[id].create_time, x.create_time || Date.now()) : (x.create_time || Date.now()) };
    });
    out.word_collection = Object.keys(wm).map(function (k) { return wm[k]; });

    const lm = {};
    (a.library_collection || []).concat(b.library_collection || []).forEach(function (x) {
      if (!x || !x.code) return;
      lm[x.code] = {
        code: x.code,
        name: x.name || (lm[x.code] && lm[x.code].name) || '',
        create_time: lm[x.code] ? Math.min(lm[x.code].create_time, x.create_time || Date.now()) : (x.create_time || Date.now())
      };
    });
    out.library_collection = Object.keys(lm).map(function (k) { return lm[k]; });

    const seen = {};
    (a.study_log || []).concat(b.study_log || []).forEach(function (x) {
      if (!x) return;
      const key = (x.scope || '') + '|' + (x.label || '') + '|' + (x.finished_at || 0);
      if (!seen[key]) seen[key] = x;
    });
    out.study_log = Object.keys(seen).map(function (k) { return seen[k]; })
      .sort(function (x, y) { return (y.finished_at || 0) - (x.finished_at || 0); }).slice(0, 200);

    // 用户导入的新词：按单词合并，信息更全的那份胜出（同步不会把释义/音标冲掉）
    const wordScore = function (x) {
      const senses = (x && x.senses) || [];
      let score = senses.length * 100;
      senses.forEach(function (s) {
        if (!s) return;
        if (s.uk) score += 2;
        if (s.us) score += 2;
        if (s.zh) score += 1;
        if ((s.codes || []).length) score += 1;
      });
      return score;
    };
    const uw = {};
    (a.user_words || []).concat(b.user_words || []).forEach(function (x) {
      if (!x || !x.word) return;
      const key = String(x.word).trim().toLowerCase();
      const prev = uw[key];
      if (!prev || wordScore(x) > wordScore(prev)) uw[key] = x;
    });
    out.user_words = Object.keys(uw).map(function (k) { return uw[k]; }).slice(-2000);

    // 给已有词追加的分类标签：取并集
    const ut = {};
    [(a.user_tags || {}), (b.user_tags || {})].forEach(function (src) {
      Object.keys(src).forEach(function (w) {
        const key = String(w).trim().toLowerCase();
        const list = ut[key] || (ut[key] = []);
        (src[w] || []).forEach(function (code) { if (list.indexOf(code) < 0) list.push(code); });
      });
    });
    out.user_tags = ut;

    // 「移入」移出的旧分支：按词后写覆盖（减法设置，不能用并集，否则「恢复分类」同步不回去）
    const uh = {};
    [(a.user_hidden || {}), (b.user_hidden || {})].forEach(function (src) {
      Object.keys(src).forEach(function (w) {
        const key = String(w).trim().toLowerCase();
        const val = src[w];
        if (!val) return;
        const prev = uh[key];
        if (!prev || (Number(val.at) || 0) >= (Number(prev.at) || 0)) uh[key] = val;
      });
    });
    out.user_hidden = uh;

    // 卡片编辑器的改动：逐条后写覆盖（与 server/server.js 保持一致）
    const so = { edits: {}, added: {}, deleted: {} };
    [(a.sense_overlay || {}), (b.sense_overlay || {})].forEach(function (src) {
      Object.keys(src.edits || {}).forEach(function (id) {
        const v = src.edits[id];
        const prev = so.edits[id];
        if (!prev || (Number(v.at) || 0) >= (Number(prev.at) || 0)) so.edits[id] = v;
      });
      Object.keys(src.deleted || {}).forEach(function (id) {
        const at = Number(src.deleted[id]) || 0;
        if (!(id in so.deleted) || at >= so.deleted[id]) so.deleted[id] = at;
      });
      Object.keys(src.added || {}).forEach(function (w) {
        const key = String(w).toLowerCase();
        const list = so.added[key] || (so.added[key] = []);
        (src.added[w] || []).forEach(function (x) {
          const i = list.findIndex(function (y) { return Number(y.id) === Number(x.id); });
          if (i < 0) list.push(x);
          else if ((Number(x.at) || 0) >= (Number(list[i].at) || 0)) list[i] = x;
        });
      });
    });
    out.sense_overlay = so;

    // 词库树改动：整体按 at 后写覆盖
    const atA = Number((a.tree_overlay || {}).at) || 0;
    const atB = Number((b.tree_overlay || {}).at) || 0;
    const pickTree = atB >= atA ? (b.tree_overlay || {}) : (a.tree_overlay || {});
    out.tree_overlay = {
      names: pickTree.names || {}, notes: pickTree.notes || {},
      added: pickTree.added || [], at: Number(pickTree.at) || 0
    };

    out.app = APP_TAG;
    out.version = 1;
    out.exported_at = new Date().toISOString();
    return out;
  }

  root.YY_API = API;
  root.YY_API.mergeSnapshots = mergeSnapshots;
})(typeof window !== 'undefined' ? window : globalThis);
