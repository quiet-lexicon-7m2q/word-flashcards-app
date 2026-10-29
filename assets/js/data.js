/*!
 * Snow Lexis · 数据层（聚合器）
 * ------------------------------------------------------------------
 * 依赖两份上游数据：
 *   tree.js   词性标签字典 + 三层语义分类树（code → 层级路径）
 *   words.js  词库原始数据（一个单词一行，行内声明它的多条释义）
 *
 * 本文件负责规范化：
 *   1. 给单词分配 vocab_id，给每条释义分配 sense_id；
 *   2. 把释义里的标签 code 翻译成 semantic_tags（"主干>一级>二级>三级" 路径数组）；
 *   3. 生成占位音频 / 图片链接；
 *   4. 建立“分支 → 单词”“单词 → 分支”索引与搜索。
 *
 * 核心规则：
 *   - 单词是主条目，标签绑定在“释义”上，不在单词本体；
 *   - 一个单词可挂多个语义标签 → 同一单词会出现在它绑定的所有词库分支；
 *   - 虚词（pron./prep./conj./art./interj.）semantic_tags 恒为 []，
 *     它们在词库树里通过主干3 的词性分支命中。
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const treeApi = root.YY_TREE || (isNode ? require('./tree.js') : null);
  // 浏览器：优先用「叠加后的词库数组」（words.js + words-cet6.js 都会往里 push）
  let wordsApi = root.YY_RAW_WORDS ? { words: root.YY_RAW_WORDS } : root.YY_WORDS_RAW;
  if (!wordsApi && isNode) {
    // Node 环境：把主人力词库与批量导入词库合并
    const main = require('./words.js');
    // 顺序必须是：人工精标 → 六级 → Wiktionary 常用词；新增词永远排在后面，已有词的 id 才不会变
    const extras = ['./words-cet6.js', './words-wiki.js'].map(function (f) {
      try { return require(f).words || []; } catch (e) { return []; }
    });
    wordsApi = { words: (main.words || []).concat(extras[0], extras[1]) };
  }
  const api = factory(treeApi, wordsApi);
  root.YY_DATA = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TREE, RAW) {
  'use strict';

  if (!TREE) throw new Error('缺少 tree.js：请先加载词库分类树');
  if (!RAW) throw new Error('缺少 words.js：请先加载词库数据');

  const POS_TAGS = TREE.POS_TAGS;
  const POS_MAP = TREE.POS_MAP;
  const CATEGORY_TREE = TREE.CATEGORY_TREE;
  const NODE_INDEX = TREE.NODE_INDEX;
  const LEAF_NODES = TREE.LEAF_NODES;

  /* 占位资源模板：后续批量替换真实资源时只改这里 */
  const PLACEHOLDER_HOST = 'https://placeholder-audio.example';
  const PLACEHOLDER_IMG_HOST = 'https://placeholder-img.example';
  function audioUrl(accent, word) {
    return PLACEHOLDER_HOST + '/' + accent + '/' + encodeURIComponent(word) + '.mp3';
  }
  function imageUrl(word) {
    return PLACEHOLDER_IMG_HOST + '/' + encodeURIComponent(word) + '.jpg';
  }

  /* ============================================================
   * 解析 words.js 的释义字符串
   * 格式：中文|词性|标签1,标签2|备注|uk音标;us音标|图片地址
   *   - 第 3 段：语义标签 code，可多标签；虚词留空
   *   - 第 4、5、6 段：可选；第 6 段填了就用它当这条释义的配图
   *     （http(s) 网络图片或本地相对路径都行，如 assets/img/bank-1.jpg；
   *       留空则用占位地址，前端会即时画一张本地 SVG）
   * ============================================================ */
  function parseSense(raw, word, seq) {
    const parts = String(raw).split('|');
    const chinese = (parts[0] || '').trim();
    const pos = (parts[1] || '').trim();
    const codes = (parts[2] || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
    const remark = (parts[3] || '').trim();
    const phon = (parts[4] || '').trim();
    const image = (parts[5] || '').trim();
    if (!chinese) throw new Error('单词 ' + word + ' 第 ' + seq + ' 条释义缺少中文释义');
    if (!POS_MAP[pos]) throw new Error('单词 ' + word + ' 第 ' + seq + ' 条释义词性非法：' + pos);
    const isFunction = POS_MAP[pos].kind === 'function';
    codes.forEach(function (code) {
      if (!NODE_INDEX[code]) throw new Error('单词 ' + word + ' 引用了不存在的分类 code：' + code);
      if (!NODE_INDEX[code].isLeaf) throw new Error('单词 ' + word + ' 的标签必须指向末级分类：' + code);
    });
    if (!isFunction && !codes.length) {
      throw new Error('单词 ' + word + ' 的实词释义缺少 semantic_tags：' + pos + ' ' + chinese);
    }
    if (isFunction && codes.length) {
      throw new Error('单词 ' + word + ' 的虚词释义 semantic_tags 必须为空数组：' + pos + ' ' + chinese);
    }
    return { chinese: chinese, pos: pos, codes: codes, remark: remark, phon: phon, image: image };
  }

  /* ============================================================
   * 规范化：单词 → 卡片（含多条释义）
   * ============================================================ */
  const WORDS = RAW.words.map(function (raw, wi) {
    const vocabId = wi + 1;
    const senses = raw.senses.map(function (senseStr, si) {
      const s = parseSense(senseStr, raw.word, si + 1);
      const phon = s.phon ? s.phon.split(';') : null;
      return {
        id: vocabId * 100 + (si + 1),
        vocab_id: vocabId,
        chinese_translation: s.chinese,
        pos_tag: s.pos,
        semantic_codes: s.codes,
        semantic_tags: s.codes.map(function (code) { return NODE_INDEX[code].tagPath; }),
        uk_phonetic: (phon && phon[0]) || raw.uk || '',
        us_phonetic: (phon && phon[1]) || raw.us || '',
        uk_audio_url: audioUrl('uk', raw.word),
        us_audio_url: audioUrl('us', raw.word),
        image_url: s.image || imageUrl(raw.word),
        remark: s.remark,
        seq: si + 1
      };
    });
    return {
      id: vocabId,
      word: raw.word,
      senses: senses,
      search_key: (raw.word + ' ' + senses.map(function (x) { return x.chinese_translation; }).join(' ')).toLowerCase()
    };
  });

  const WORD_BY_ID = {};
  const WORD_BY_TEXT = {};
  WORDS.forEach(function (wv) {
    WORD_BY_ID[wv.id] = wv;
    WORD_BY_TEXT[wv.word.toLowerCase()] = wv;
  });

  /* 分支 → 单词（语义分支按释义标签命中；功能虚词分支按词性命中） */
  const BRANCH_WORD_IDS = {};
  const SUBTREE_WORD_IDS = {};

  /** 重建索引：用户新导入的词也会一起算进来（导入后调用一次即可） */
  function buildIndexes() {
    Object.keys(BRANCH_WORD_IDS).forEach(function (k) { delete BRANCH_WORD_IDS[k]; });
    LEAF_NODES.forEach(function (leaf) { BRANCH_WORD_IDS[leaf.code] = []; });
    WORDS.forEach(function (wv) {
      const hits = {};
      wv.senses.forEach(function (sense) {
        sense.semantic_codes.forEach(function (code) { hits[code] = true; });
        const kind = (POS_MAP[sense.pos_tag] || {}).kind;
        if (kind === 'function') {
          LEAF_NODES.forEach(function (leaf) {
            if (leaf.bindType === 'pos' && leaf.posTags.indexOf(sense.pos_tag) > -1) hits[leaf.code] = true;
          });
        }
      });
      Object.keys(hits).forEach(function (code) {
        if (BRANCH_WORD_IDS[code]) BRANCH_WORD_IDS[code].push(wv.id);
      });
    });
    Object.keys(SUBTREE_WORD_IDS).forEach(function (k) { delete SUBTREE_WORD_IDS[k]; });
    (function walk(n) {
      const set = new Set();
      if ((!n.children || !n.children.length) && n.code !== '0' && BRANCH_WORD_IDS[n.code]) {
        BRANCH_WORD_IDS[n.code].forEach(function (id) { set.add(id); });
      }
      (n.children || []).forEach(function (c) {
        walk(c).forEach(function (id) { set.add(id); });
      });
      SUBTREE_WORD_IDS[n.code] = set;
      return set;
    })(CATEGORY_TREE);
  }
  buildIndexes();

  /* ============================================================
   * 对外工具函数
   * ============================================================ */
  function getNode(code) { return NODE_INDEX[code] || null; }
  function pathTextOf(code) { const n = NODE_INDEX[code]; return n ? n.pathText : ''; }
  function tagPathOf(code) { const n = NODE_INDEX[code]; return n ? n.tagPath : ''; }
  function leaves() { return LEAF_NODES.slice(); }
  function wordById(id) { return WORD_BY_ID[id] || null; }
  function wordByText(text) { return WORD_BY_TEXT[String(text || '').trim().toLowerCase()] || null; }
  function allWords() { return WORDS.slice(); }

  /* 用户「移入」词库时，被移出的旧分支记在这里：vocabId → { code: true }
     只影响「在哪个词库出现」的显示逻辑，不修改词库原始数据，随时可恢复 */
  const HIDDEN_CODES = Object.create(null);
  function isHidden(vocabId, code) {
    const set = HIDDEN_CODES[vocabId];
    return !!(set && set[code]);
  }
  function hiddenCodesOf(wv) {
    const set = wv ? HIDDEN_CODES[wv.id] : null;
    return set ? Object.keys(set) : [];
  }

  function wordIdsOfBranch(code) {
    let ids;
    if (NODE_INDEX[code] && NODE_INDEX[code].isLeaf) ids = (BRANCH_WORD_IDS[code] || []).slice();
    else {
      const set = SUBTREE_WORD_IDS[code];
      ids = set ? Array.from(set) : [];
    }
    return ids.filter(function (id) { return !isHidden(id, code); });
  }
  function wordsOfBranch(code) {
    return wordIdsOfBranch(code).map(wordById).filter(Boolean);
  }

  /** 该单词归属的全部分支词库（含虚词的词性分支），按 code 排序去重 */
  function branchesOfWord(wv) {
    const seen = {};
    const ids = [];
    function push(code) {
      if (!code || seen[code] || !NODE_INDEX[code]) return;
      if (isHidden(wv.id, code)) return;          // 被「移入」移出的分支不再算作所属词库
      seen[code] = true;
      ids.push(code);
    }
    wv.senses.forEach(function (sense) {
      sense.semantic_codes.forEach(push);
      const kind = (POS_MAP[sense.pos_tag] || {}).kind;
      if (kind === 'function') {
        LEAF_NODES.forEach(function (leaf) {
          if (leaf.bindType === 'pos' && leaf.posTags.indexOf(sense.pos_tag) > -1) push(leaf.code);
        });
      }
    });
    return ids.map(function (code) { return NODE_INDEX[code]; })
      .sort(function (a, b) { return a.code.localeCompare(b.code, undefined, { numeric: true }); });
  }

  /** 中英文双向搜索：英文按单词、中文按释义命中，按相关度排序 */
  function searchWords(query, limit) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    WORDS.forEach(function (wv) {
      const word = wv.word.toLowerCase();
      let score = 0;
      if (word === q) score = 100;
      else if (word.indexOf(q) === 0) score = 80;
      else if (word.indexOf(q) > -1) score = 60;
      else {
        let hit = 0;
        wv.senses.forEach(function (sense) {
          const zh = sense.chinese_translation.toLowerCase();
          if (zh.indexOf(q) > -1) hit = Math.max(hit, zh === q ? 90 : zh.indexOf(q) === 0 ? 70 : 50);
        });
        score = hit;
      }
      if (score > 0) scored.push({ word: wv, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score || a.word.word.localeCompare(b.word.word); });
    const list = scored.map(function (x) { return x.word; });
    return limit > 0 ? list.slice(0, limit) : list;
  }

  /** 数据自检：返回问题清单（构建脚本与测试共用） */
  /* ============================================================
   * 用户数据层（全部是「覆盖层」，词库原始数据永远不动）
   *   ① 导入的新词       userWords
   *   ② 给已有词追加标签  tagAdds
   *   ③ 「移入」移出的旧分支 hiddenMap
   *   ④ 释义编辑         overlay { edits:{id:{zh,pos,image}}, added:{word:[sense]}, deleted:{id:1} }
   * 每次改完都从「基座」重建一遍，所以任何操作都能撤销、也不会互相踩。
   * ============================================================ */
  const BASE_WORDS = WORDS.slice();
  const BASE_SENSES = Object.create(null);      // vocabId → 原始释义数组（只存引用）
  BASE_WORDS.forEach(function (wv) { BASE_SENSES[wv.id] = wv.senses.slice(); });
  const USER_WORDS = [];                        // 用户导入的新词卡片
  let NEXT_USER_ID = BASE_WORDS.reduce(function (m, w) { return Math.max(m, w.id); }, 0) + 1;

  function reindexWords() {
    Object.keys(WORD_BY_ID).forEach(function (k) { delete WORD_BY_ID[k]; });
    Object.keys(WORD_BY_TEXT).forEach(function (k) { delete WORD_BY_TEXT[k]; });
    WORDS.forEach(function (wv) {
      WORD_BY_ID[wv.id] = wv;
      WORD_BY_TEXT[wv.word.toLowerCase()] = wv;
    });
    buildIndexes();
  }

  /** 词库树改了名字之后，把每条释义里的语义路径（semantic_tags）跟着刷新 */
  function refreshTagPaths() {
    WORDS.forEach(function (wv) {
      wv.senses.forEach(function (s) {
        s.semantic_tags = (s.semantic_codes || []).map(function (c) {
          return NODE_INDEX[c] ? NODE_INDEX[c].tagPath : '';
        });
      });
    });
  }

  /** 用户新增/导入的一条释义 → 标准释义对象（id 为负 = 用户新增，绝不会撞内置 id） */
  function userSenseObject(word, x) {
    const pos = POS_MAP[x.pos] ? x.pos : 'n.';
    const kind = (POS_MAP[pos] || {}).kind;
    const codes = kind === 'function' ? [] : (x.codes || []).filter(function (c) {
      const n = NODE_INDEX[c];
      return !!(n && n.isLeaf);
    });
    return {
      id: Number(x.id) || 0,
      vocab_id: word.id,
      chinese_translation: String(x.zh || '').trim(),
      pos_tag: pos,
      semantic_codes: codes,
      semantic_tags: codes.map(function (c) { return NODE_INDEX[c].tagPath; }),
      uk_phonetic: x.uk || '',
      us_phonetic: x.us || x.uk || '',
      uk_audio_url: audioUrl('uk', word.word),
      us_audio_url: audioUrl('us', word.word),
      image_url: x.image || imageUrl(word.word),
      remark: x.remark || '',
      user_sense: true,
      seq: 1
    };
  }

  /** 从基座重建整份词库（静态词库 + 四层用户覆盖） */
  function rebuildUserLayers(user) {
    const u = user || {};
    const tagAdds = u.tags || {};
    const hiddenMap = u.hidden || {};
    const overlay = u.overlay || {};
    const edits = overlay.edits || {};
    const addedMap = overlay.added || {};
    const deleted = overlay.deleted || {};
    let tagged = 0;

    // ① 词表 = 静态词库 + 用户导入的新词
    WORDS.length = 0;
    BASE_WORDS.forEach(function (wv) { WORDS.push(wv); });
    USER_WORDS.forEach(function (wv) { WORDS.push(wv); });
    reindexWords();

    // ② 释义 = 基座 → 应用编辑 → 去掉删除的 → 追加用户新增的
    WORDS.forEach(function (wv) {
      const base = BASE_SENSES[wv.id] || wv.senses;
      const list = [];
      base.forEach(function (s) {
        if (deleted[s.id]) return;
        const e = edits[s.id];
        if (!e) { list.push(s); return; }
        const copy = Object.assign({}, s);       // 绝不改原始对象
        if (e.zh) copy.chinese_translation = e.zh;
        if (e.pos && POS_MAP[e.pos]) copy.pos_tag = e.pos;
        if (e.image !== undefined) copy.image_url = e.image || imageUrl(wv.word);
        copy.image_mode = (e.image !== undefined && e.image) ? (e.mode || 'link') : 'auto';
        copy.image_seed = Number(e.seed) || 0;
        const kind = (POS_MAP[copy.pos_tag] || {}).kind;
        if (kind === 'function') {               // 词性改成虚词 → 标签必须清空
          copy.semantic_codes = [];
          copy.semantic_tags = [];
        }
        list.push(copy);
      });
      (addedMap[wv.word.toLowerCase()] || []).forEach(function (x) {
        const obj = userSenseObject(wv, x);
        obj.image_mode = x.image ? (x.mode || 'link') : 'auto';
        obj.image_seed = Number(x.seed) || 0;
        if (obj.chinese_translation) list.push(obj);
      });
      list.forEach(function (s, i) { s.seq = i + 1; });
      wv.senses = list;
      wv.search_key = (wv.word + ' ' + list.map(function (x) { return x.chinese_translation; }).join(' ')).toLowerCase();
    });

    // ③ 已有词：追加标签（挂在该词第一条释义上）
    Object.keys(tagAdds).forEach(function (wordText) {
      const wv = WORD_BY_TEXT[String(wordText).toLowerCase()];
      if (!wv || !wv.senses.length) return;
      const codes = (tagAdds[wordText] || []).filter(function (c) {
        const n = NODE_INDEX[c];
        return !!(n && n.isLeaf);
      });
      if (!codes.length) return;
      const target = wv.senses[0];
      codes.forEach(function (c) {
        if (target.semantic_codes.indexOf(c) < 0) {
          target.semantic_codes.push(c);
          target.semantic_tags.push(NODE_INDEX[c].tagPath);
        }
      });
      wv.user_tagged = true;
      tagged++;
    });

    // ④ 「移入」移出的旧分支
    Object.keys(HIDDEN_CODES).forEach(function (k) { delete HIDDEN_CODES[k]; });
    Object.keys(hiddenMap).forEach(function (wordText) {
      const wv = WORD_BY_TEXT[String(wordText).toLowerCase()];
      if (!wv) return;
      const codes = (hiddenMap[wordText] && hiddenMap[wordText].codes) || [];
      if (!codes.length) return;
      const set = Object.create(null);
      codes.forEach(function (c) { if (NODE_INDEX[c] && NODE_INDEX[c].isLeaf) set[c] = true; });
      if (Object.keys(set).length) HIDDEN_CODES[wv.id] = set;
    });

    buildIndexes();
    return { tagged: tagged };
  }

  /**
   * 应用全部用户数据（导入新词 / 追加标签 / 移出隐藏 / 释义编辑）
   * @param {Array}  userWords  [{ word, senses:[{ pos, zh, codes:[leafCode], uk, us, remark }] }]
   * @param {Object} tagAdds    { 单词: [leafCode] }
   * @param {Object} hiddenMap  { 单词: { codes:[leafCode], at } }
   * @param {Object} overlay    { edits, added, deleted }
   * @returns {{added:number, tagged:number, skipped:number}}
   */
  function applyUserData(userWords, tagAdds, hiddenMap, overlay) {
    let added = 0, skipped = 0;

    const known = Object.create(null);
    BASE_WORDS.forEach(function (wv) { known[wv.word.toLowerCase()] = true; });
    USER_WORDS.forEach(function (wv) { known[wv.word.toLowerCase()] = true; });

    (userWords || []).forEach(function (item) {
      const wordText = String(item.word || '').trim();
      if (!wordText) { skipped++; return; }
      if (known[wordText.toLowerCase()]) { skipped++; return; }   // 已存在 → 交给 tagAdds
      const id = NEXT_USER_ID++;
      const wv = {
        id: id, word: wordText, senses: [], user_added: true,
        search_key: wordText.toLowerCase()
      };
      wv.senses = (item.senses || []).map(function (s, i) {
        return userSenseObject(wv, {
          id: id * 100 + (i + 1), pos: s.pos, zh: s.zh, codes: s.codes,
          uk: s.uk, us: s.us, remark: s.remark
        });
      }).filter(function (s) { return s.chinese_translation; });
      if (!wv.senses.length) { skipped++; NEXT_USER_ID--; return; }
      BASE_SENSES[id] = wv.senses.slice();      // 导入词同样可被编辑/删除
      USER_WORDS.push(wv);
      known[wordText.toLowerCase()] = true;
      added++;
    });

    const r = rebuildUserLayers({ tags: tagAdds, hidden: hiddenMap, overlay: overlay });
    return { added: added, tagged: r.tagged, skipped: skipped };
  }

  function audit() {
    const issues = [];
    const seen = {};
    WORDS.forEach(function (wv) {
      const key = wv.word.toLowerCase();
      if (seen[key]) issues.push('单词重复：' + wv.word);
      seen[key] = true;
      if (!wv.senses.length) issues.push('单词无释义：' + wv.word);
      wv.senses.forEach(function (s) {
        if (!s.uk_phonetic || !s.us_phonetic) issues.push('缺少音标：' + wv.word + ' ' + s.chinese_translation);
        if (!s.uk_audio_url || !s.us_audio_url || !s.image_url) issues.push('缺少占位资源：' + wv.word);
      });
    });
    LEAF_NODES.forEach(function (l) {
      if (l.code.indexOf('9.') === 0) return;   // 9.x 是「待归类」暂存区，允许暂时为空
      if (!(BRANCH_WORD_IDS[l.code] || []).length) {
        issues.push('末级分类无单词：' + l.code + ' ' + l.name + '（' + l.tagPath + '）');
      }
    });
    return issues;
  }

  return {
    POS_TAGS: POS_TAGS,
    POS_MAP: POS_MAP,
    CATEGORY_TREE: CATEGORY_TREE,
    WORDS: WORDS,
    LEAF_NODES: LEAF_NODES,
    NODE_INDEX: NODE_INDEX,
    BRANCH_WORD_IDS: BRANCH_WORD_IDS,
    PLACEHOLDER_HOST: PLACEHOLDER_HOST,
    PLACEHOLDER_IMG_HOST: PLACEHOLDER_IMG_HOST,
    audioUrl: audioUrl,
    imageUrl: imageUrl,
    getNode: getNode,
    pathTextOf: pathTextOf,
    tagPathOf: tagPathOf,
    leaves: leaves,
    allWords: allWords,
    wordById: wordById,
    wordByText: wordByText,
    wordIdsOfBranch: wordIdsOfBranch,
    wordsOfBranch: wordsOfBranch,
    branchesOfWord: branchesOfWord,
    isHidden: isHidden,
    hiddenCodesOf: hiddenCodesOf,
    searchWords: searchWords,
    applyUserData: applyUserData,
    refreshTagPaths: refreshTagPaths,
    buildIndexes: buildIndexes,
    audit: audit
  };
});
