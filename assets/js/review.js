/*!
 * Snow Lexis · 记忆曲线引擎 + 本地存储
 * ------------------------------------------------------------------
 * 艾宾浩斯复习间隔（分钟），下标 = 评级的“当前等级”：
 *   0 级（新词） → 5      1 级 → 30     2 级 → 120
 *   3 级 → 720            4 级 → 1440   5 级 → 2880
 *
 * 规则实现（与需求逐条对应）：
 *   记住：等级 +1（上限 5），间隔取 INTERVALS[评级前等级]
 *         0级→1级/5分钟、1级→2级/30、2级→3级/120、3级→4级/720、
 *         4级→5级/1440、5级→保持5级/2880
 *   模糊：等级 -1（下限 0），间隔取 INTERVALS[降级后等级]
 *   忘记：直接重置为 0 级，间隔取 INTERVALS[0] = 5 分钟
 *   next_review_time = 当前时间 + 间隔
 */
(function (root, factory) {
  const api = factory();
  root.YY_REVIEW = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MINUTE = 60 * 1000;

  /** 复习间隔（分钟）：下标 = 当前熟悉度等级 */
  const INTERVALS = [5, 30, 120, 720, 1440, 2880];

  const MAX_LEVEL = 5;
  const MIN_LEVEL = 0;

  const RATINGS = [
    { key: 'forget', level: 0, label: '忘记', desc: '重置回 0 级', hotkey: '1' },
    { key: 'vague',  level: 1, label: '模糊', desc: '等级 -1',    hotkey: '2' },
    { key: 'know',   level: 2, label: '记住', desc: '等级 +1',    hotkey: '3' }
  ];
  const RATING_MAP = {};
  RATINGS.forEach(function (r) { RATING_MAP[r.key] = r; });

  function clamp(level) {
    return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
  }

  /** 等级对应的复习间隔（分钟） */
  function intervalOfLevel(level) {
    return INTERVALS[clamp(level)];
  }

  /**
   * 计算一次评级后的记忆状态。
   * @param {object|null} record 现有记录（可为 null = 新词）
   * @param {string} rating 'forget' | 'vague' | 'know'
   * @param {number} now 当前时间戳（毫秒）
   */
  function applyRating(record, rating, now) {
    const ts = typeof now === 'number' ? now : Date.now();
    const current = clamp(record && typeof record.familiarity === 'number' ? record.familiarity : 0);
    let nextLevel;
    let interval;

    if (rating === 'know') {
      interval = intervalOfLevel(current);      // 用评级前的等级取间隔
      nextLevel = clamp(current + 1);           // 等级 +1，最高 5
    } else if (rating === 'vague') {
      nextLevel = clamp(current - 1);           // 等级 -1，最低 0
      interval = intervalOfLevel(nextLevel);    // 用降级后的等级取间隔
    } else if (rating === 'forget') {
      nextLevel = 0;                            // 直接重置
      interval = intervalOfLevel(0);
    } else {
      throw new Error('未知评级：' + rating);
    }

    return {
      familiarity: nextLevel,
      interval_minutes: interval,
      next_review_time: ts + interval * MINUTE,
      last_review_time: ts,
      last_rating: rating,
      last_level: current,
      last_interval_minutes: record ? record.last_interval_minutes || 0 : 0
    };
  }

  /** 人类可读的间隔描述 */
  function humanInterval(minutes) {
    if (minutes < 60) return minutes + ' 分钟';
    if (minutes < 1440) return (minutes / 60) + ' 小时';
    return (minutes / 1440) + ' 天';
  }

  /** 距离下次复习的剩余时间描述 */
  function humanRemain(ms) {
    if (ms <= 0) return '待复习';
    const m = Math.ceil(ms / MINUTE);
    if (m < 60) return m + ' 分钟后';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时后';
    return Math.floor(h / 24) + ' 天后';
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ============================================================
   * 本地存储（模拟后端）
   * ============================================================ */
  const KEY_REVIEW = 'yy_review_records';
  const KEY_COLLECTION = 'yy_word_collection';
  const KEY_LIBRARY = 'yy_library_collection';
  const KEY_LOG = 'yy_study_log';
  const KEY_IMG_CACHE = 'yy_img_cache_v1';
  const KEY_USER_WORDS = 'yy_user_words';   // 用户导入的新词（一张卡 = 一个单词）
  const KEY_USER_TAGS = 'yy_user_tags';     // 用户给「已有词」追加的分类标签
  const KEY_USER_HIDDEN = 'yy_user_hidden'; // 用户「移入」后要隐藏的旧分支（词 → [分类 code]）
  const KEY_SENSE_OVERLAY = 'yy_sense_overlay'; // 用户在卡片编辑器里改的释义 / 图片 / 新增 / 删除
  const KEY_TREE_OVERLAY = 'yy_tree_overlay';   // 用户改的词库树分类名 / 备注 / 新增末级分类
  const KEY_BACKUP = 'yy_user_backup_v1';   // 本地自动快照（第二份）
  const KEY_META = 'yy_user_meta_v1';       // 备份时间、变更时间等
  const DATA_VERSION = 1;
  const APP_TAG = 'beidanci-youyuan';

  function safeParse(text, fallback) {
    try {
      const v = JSON.parse(text);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function createStore(storage) {
    const box = storage || (typeof localStorage !== 'undefined' ? localStorage : (function () {
      const mem = {};
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    })());

    function read(key, fallback) {
      const raw = box.getItem(key);
      return raw ? safeParse(raw, fallback) : fallback;
    }
    let backupTimer = null;
    const changeListeners = [];
    function notifyChange() {
      changeListeners.forEach(function (fn) { try { fn(); } catch (e) { /* 忽略 */ } });
    }
    function write(key, value) {
      box.setItem(key, JSON.stringify(value));
      if (key === KEY_BACKUP || key === KEY_META) return;
      // 每次用户数据变更后，延迟写一份完整快照到 yy_user_backup_v1（防单键被清/写坏）
      if (backupTimer) clearTimeout(backupTimer);
      backupTimer = setTimeout(function () {
        backupTimer = null;
        try {
          box.setItem(KEY_BACKUP, JSON.stringify(snapshot()));
          box.setItem(KEY_META, JSON.stringify(Object.assign(read(KEY_META, {}), { last_change_at: Date.now() })));
          notifyChange();
        } catch (e) { /* 配额满等异常忽略，不影响主流程 */ }
      }, 400);
    }

    /** 全部用户数据的快照（导出 / 备份 / 迁移 / 云同步都用它） */
    function snapshot() {
      return {
        app: APP_TAG,
        version: DATA_VERSION,
        exported_at: new Date().toISOString(),
        review_records: read(KEY_REVIEW, {}),
        word_collection: read(KEY_COLLECTION, []),
        library_collection: read(KEY_LIBRARY, []),
        study_log: read(KEY_LOG, []),
        image_cache: read(KEY_IMG_CACHE, {}),
        user_words: UserWordStore.all(),
        user_tags: UserWordStore.tags(),
        user_hidden: UserWordStore.hidden(),
        sense_overlay: UserWordStore.overlay(),
        tree_overlay: UserWordStore.treeOverlay()
      };
    }

    /** 用一份快照覆盖当前数据（导入 / 恢复） */
    function restore(data) {
      if (!data || data.app !== APP_TAG) return { ok: false, reason: '不是本应用导出的备份文件' };
      try {
        if (data.review_records) box.setItem(KEY_REVIEW, JSON.stringify(data.review_records));
        if (data.word_collection) box.setItem(KEY_COLLECTION, JSON.stringify(data.word_collection));
        if (data.library_collection) box.setItem(KEY_LIBRARY, JSON.stringify(data.library_collection));
        if (data.study_log) box.setItem(KEY_LOG, JSON.stringify(data.study_log));
        if (data.image_cache) box.setItem(KEY_IMG_CACHE, JSON.stringify(data.image_cache));
        if (data.user_words) box.setItem(KEY_USER_WORDS, JSON.stringify(data.user_words));
        if (data.user_tags) box.setItem(KEY_USER_TAGS, JSON.stringify(data.user_tags));
        if (data.user_hidden) box.setItem(KEY_USER_HIDDEN, JSON.stringify(data.user_hidden));
        if (data.sense_overlay) box.setItem(KEY_SENSE_OVERLAY, JSON.stringify(data.sense_overlay));
        if (data.tree_overlay) box.setItem(KEY_TREE_OVERLAY, JSON.stringify(data.tree_overlay));
        box.setItem(KEY_META, JSON.stringify({
          last_change_at: Date.now(),
          restored_at: Date.now(),
          restored_from: data.exported_at || ''
        }));
        box.setItem(KEY_BACKUP, JSON.stringify(snapshot()));
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: '写入失败：' + (e && e.message ? e.message : e) };
      }
    }

    /** 本地自动快照（不需要用户操作的那一层保险） */
    function backupNow() {
      try {
        box.setItem(KEY_BACKUP, JSON.stringify(snapshot()));
        box.setItem(KEY_META, JSON.stringify(Object.assign(read(KEY_META, {}), { last_backup_at: Date.now() })));
        return true;
      } catch (e) { return false; }
    }

    function localBackup() { return read(KEY_BACKUP, null); }
    function meta() { return read(KEY_META, {}); }
    function hasUserData() {
      return Object.keys(read(KEY_REVIEW, {})).length > 0 ||
        read(KEY_COLLECTION, []).length > 0 ||
        read(KEY_LIBRARY, []).length > 0 ||
        read(KEY_USER_WORDS, []).length > 0;
    }
    function summary() {
      const records = read(KEY_REVIEW, {});
      return {
        words_learned: Object.keys(records).length,
        word_favorites: read(KEY_COLLECTION, []).length,
        library_favorites: read(KEY_LIBRARY, []).length,
        imported_words: read(KEY_USER_WORDS, []).length,
        study_sessions: read(KEY_LOG, []).length,
        last_change_at: read(KEY_META, {}).last_change_at || 0,
        last_backup_at: read(KEY_META, {}).last_backup_at || 0
      };
    }

    const ReviewStore = {
      /** 全部记忆记录：{ [vocabId]: record } */
      all: function () { return read(KEY_REVIEW, {}); },
      get: function (vocabId) { return this.all()[vocabId] || null; },
      save: function (vocabId, record) {
        const all = this.all();
        all[vocabId] = record;
        write(KEY_REVIEW, all);
        return record;
      },
      /**
       * 对单词评级并写入记录。
       * @returns {object} 新记录
       */
      rate: function (vocabId, rating, now) {
        const prev = this.get(vocabId);
        const next = applyRating(prev, rating, now);
        next.vocab_id = Number(vocabId);
        next.review_count = (prev && prev.review_count ? prev.review_count : 0) + 1;
        this.save(vocabId, next);
        return next;
      },
      /** 学习队列：待复习（已到期）在前，新词在后 */
      buildQueue: function (vocabIds, now) {
        const ts = typeof now === 'number' ? now : Date.now();
        const all = this.all();
        const due = [];
        const fresh = [];
        const scheduled = [];
        vocabIds.forEach(function (id) {
          const rec = all[id];
          if (!rec) fresh.push(id);
          else if (Number(rec.next_review_time) <= ts) due.push(id);
          else scheduled.push(id);
        });
        due.sort(function (a, b) { return all[a].next_review_time - all[b].next_review_time; });
        return {
          queue: due.concat(fresh),
          due: due,
          fresh: fresh,
          scheduled: scheduled,
          total: vocabIds.length
        };
      },
      /** 某分支的学习统计 */
      stats: function (vocabIds, now) {
        const ts = typeof now === 'number' ? now : Date.now();
        const all = this.all();
        let fresh = 0, due = 0, scheduled = 0, learned = 0, levelSum = 0;
        vocabIds.forEach(function (id) {
          const rec = all[id];
          if (!rec) { fresh++; return; }
          learned++;
          levelSum += Number(rec.familiarity) || 0;
          if (Number(rec.next_review_time) <= ts) due++; else scheduled++;
        });
        return {
          total: vocabIds.length,
          fresh: fresh,
          due: due,
          scheduled: scheduled,
          learned: learned,
          avg_level: learned ? Math.round((levelSum / learned) * 10) / 10 : 0
        };
      },
      reset: function () { box.removeItem(KEY_REVIEW); }
    };

    const CollectionStore = {
      /** 返回收藏的单词 id 数组（按收藏时间倒序） */
      ids: function () {
        const list = read(KEY_COLLECTION, []);
        return list.slice().sort(function (a, b) { return b.create_time - a.create_time; })
          .map(function (x) { return x.vocab_id; });
      },
      raw: function () { return read(KEY_COLLECTION, []); },
      has: function (vocabId) {
        return this.raw().some(function (x) { return Number(x.vocab_id) === Number(vocabId); });
      },
      add: function (vocabId) {
        if (this.has(vocabId)) return false;
        const list = this.raw();
        list.push({ id: list.length + 1, vocab_id: Number(vocabId), create_time: Date.now() });
        write(KEY_COLLECTION, list);
        return true;
      },
      remove: function (vocabId) {
        const list = this.raw();
        const next = list.filter(function (x) { return Number(x.vocab_id) !== Number(vocabId); });
        write(KEY_COLLECTION, next);
        return next.length !== list.length;
      },
      toggle: function (vocabId) { return this.has(vocabId) ? (this.remove(vocabId), false) : (this.add(vocabId), true); },
      addMany: function (vocabIds) {
        let n = 0;
        const self = this;
        vocabIds.forEach(function (id) { if (self.add(id)) n++; });
        return n;
      },
      /** 把整个词库设为收藏：已在收藏里的单词保持不动 */
      setMany: function (vocabIds) { return this.addMany(vocabIds); },
      clear: function () { write(KEY_COLLECTION, []); },
      count: function () { return this.raw().length; }
    };

    /**
     * 词库收藏（订阅某个分类分支）：
     * 只存分类 code，学的时候实时取该分支下的单词 —— 词库后续加词会自动进来。
     */
    const LibraryStore = {
      /** [{ code, name, create_time }]，按收藏时间倒序 */
      all: function () {
        const list = read(KEY_LIBRARY, []);
        return list.slice().sort(function (a, b) { return b.create_time - a.create_time; });
      },
      codes: function () { return this.all().map(function (x) { return x.code; }); },
      has: function (code) {
        const key = String(code || '');
        return this.all().some(function (x) { return String(x.code) === key; });
      },
      add: function (code, name) {
        if (!code || this.has(code)) return false;
        const list = read(KEY_LIBRARY, []);
        list.push({ code: String(code), name: name || '', create_time: Date.now() });
        write(KEY_LIBRARY, list);
        return true;
      },
      remove: function (code) {
        const key = String(code || '');
        const list = read(KEY_LIBRARY, []);
        const next = list.filter(function (x) { return String(x.code) !== key; });
        write(KEY_LIBRARY, next);
        return next.length !== list.length;
      },
      toggle: function (code, name) {
        return this.has(code) ? (this.remove(code), false) : (this.add(code, name), true);
      },
      clear: function () { write(KEY_LIBRARY, []); },
      /** 分类改名后，同步收藏里存的那份名字快照 */
      rename: function (map) {
        const list = read(KEY_LIBRARY, []);
        let hit = 0;
        list.forEach(function (x) { if (map && map[x.code]) { x.name = map[x.code]; hit++; } });
        if (hit) write(KEY_LIBRARY, list);
        return hit;
      },
      count: function () { return read(KEY_LIBRARY, []).length; }
    };

    const StudyLog = {
      /** 记录一次背诵会话 */
      push: function (entry) {
        const list = read(KEY_LOG, []);
        list.push(entry);
        write(KEY_LOG, list.slice(-50));
        return entry;
      },
      list: function () { return read(KEY_LOG, []); },
      reset: function () { box.removeItem(KEY_LOG); }
    };

    /**
     * 用户导入的词（词库页「导入新词」写入）
     *   words：新词卡片 [{ word, senses:[{pos,zh,codes,uk,us,remark}], create_time }]
     *   tags ：给「词库里已存在的词」追加的分类标签 { 单词: [末级分类code] }
     * 放进这里统一管理后，导出的备份 / 云同步都会带上它们，换设备也不会丢。
     */
    const UserWordStore = {
      all: function () { return read(KEY_USER_WORDS, []) || []; },
      tags: function () { return read(KEY_USER_TAGS, {}) || {}; },
      /**
       * 「移入」时被移出的旧分支：{ 单词: [末级分类code] }
       * 只是「不在这里显示」，不修改词库原始数据，随时可以恢复
       */
      hidden: function () { return read(KEY_USER_HIDDEN, {}) || {}; },
      /** 卡片编辑器的改动 { edits:{senseId:{zh,pos,image,at}}, added:{word:[sense]}, deleted:{senseId:at} } */
      overlay: function () {
        const o = read(KEY_SENSE_OVERLAY, {}) || {};
        return { edits: o.edits || {}, added: o.added || {}, deleted: o.deleted || {} };
      },
      saveOverlay: function (overlay) {
        const o = overlay || {};
        write(KEY_SENSE_OVERLAY, { edits: o.edits || {}, added: o.added || {}, deleted: o.deleted || {} });
      },
      /** 词库树改动 { names:{code:新名}, notes:{code:备注}, added:[{parent,name,code}] } */
      treeOverlay: function () {
        const o = read(KEY_TREE_OVERLAY, {}) || {};
        return { names: o.names || {}, notes: o.notes || {}, added: o.added || [], at: Number(o.at) || 0 };
      },
      saveTreeOverlay: function (o) {
        const v = o || {};
        // at 用于多设备「后写覆盖」：改名是整体设置，取最新的一次
        write(KEY_TREE_OVERLAY, { names: v.names || {}, notes: v.notes || {}, added: v.added || [], at: Date.now() });
      },
      /** 一次性写入（触发自动快照；hidden 不传就保持原样） */
      save: function (words, tags, hidden) {
        write(KEY_USER_WORDS, (words || []).slice(-2000));
        write(KEY_USER_TAGS, tags || {});
        if (hidden !== undefined) write(KEY_USER_HIDDEN, hidden || {});
      },
      /** 新词数量 / 被追加标签的词数量 */
      count: function () {
        return {
          words: (read(KEY_USER_WORDS, []) || []).length,
          tagged: Object.keys(read(KEY_USER_TAGS, {}) || {}).length,
          hidden: Object.keys(read(KEY_USER_HIDDEN, {}) || {}).length,
          edited: Object.keys((read(KEY_SENSE_OVERLAY, {}) || {}).edits || {}).length
        };
      },
      clear: function () {
        box.removeItem(KEY_USER_WORDS);
        box.removeItem(KEY_USER_TAGS);
        box.removeItem(KEY_USER_HIDDEN);
        box.removeItem(KEY_SENSE_OVERLAY);
        box.removeItem(KEY_TREE_OVERLAY);
      }
    };

    return {
      ReviewStore: ReviewStore,
      CollectionStore: CollectionStore,
      LibraryStore: LibraryStore,
      StudyLog: StudyLog,
      UserWordStore: UserWordStore,
      APP_TAG: APP_TAG,
      DATA_VERSION: DATA_VERSION,
      snapshot: snapshot,
      restore: restore,
      backupNow: backupNow,
      localBackup: localBackup,
      meta: meta,
      hasUserData: hasUserData,
      summary: summary,
      /** 注册数据变更回调（用于自动备份、刷新状态） */
      onChange: function (fn) { if (typeof fn === 'function') changeListeners.push(fn); },
      resetAll: function () {
        ReviewStore.reset();
        CollectionStore.clear();
        LibraryStore.clear();
        StudyLog.reset();
        UserWordStore.clear();
        backupNow();
      }
    };
  }

  return {
    MINUTE: MINUTE,
    INTERVALS: INTERVALS,
    MAX_LEVEL: MAX_LEVEL,
    RATINGS: RATINGS,
    RATING_MAP: RATING_MAP,
    intervalOfLevel: intervalOfLevel,
    applyRating: applyRating,
    humanInterval: humanInterval,
    humanRemain: humanRemain,
    formatTime: formatTime,
    createStore: createStore
  };
});
