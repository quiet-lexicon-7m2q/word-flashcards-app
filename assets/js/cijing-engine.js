/*!
 * 词镜 Word Lens · 浏览器端词法分析原型
 * ------------------------------------------------------------------
 * English: compromise (POS + light lemmatisation)
 * Chinese: Intl.Segmenter + a compact learning lexicon + lightweight rules
 * Collocations: curated learning phrases + context patterns from the article
 *
 * This module intentionally has no server dependency. It is a rules-based
 * prototype, not a full dictionary or a generative model.
 */
(function (root) {
  'use strict';

  var POS_META = {
    noun: { key: 'noun', label: '名词', short: 'N', color: '#2f5d57', soft: '#e8f0ed', order: 10 },
    verb: { key: 'verb', label: '动词', short: 'V', color: '#55778b', soft: '#eaf0f4', order: 20 },
    adjective: { key: 'adjective', label: '形容词', short: 'Adj', color: '#a87545', soft: '#f4eadc', order: 30 },
    numeral: { key: 'numeral', label: '数词', short: 'Num', color: '#746a8f', soft: '#efecf5', order: 40 },
    quantifier: { key: 'quantifier', label: '量词', short: 'Q', color: '#8a7151', soft: '#f2ece1', order: 50 },
    pronoun: { key: 'pronoun', label: '代词', short: 'Pron', color: '#97605a', soft: '#f3e9e7', order: 60 },
    adverb: { key: 'adverb', label: '副词', short: 'Adv', color: '#8b7441', soft: '#f4efdf', order: 70 },
    preposition: { key: 'preposition', label: '介词', short: 'Prep', color: '#5f7b72', soft: '#edf2ef', order: 80 },
    conjunction: { key: 'conjunction', label: '连词', short: 'Conj', color: '#726b7d', soft: '#efedf2', order: 90 },
    determiner: { key: 'determiner', label: '限定词', short: 'Det', color: '#7d7766', soft: '#f1efe8', order: 100 },
    auxiliary: { key: 'auxiliary', label: '助动词', short: 'Aux', color: '#697c88', soft: '#eef2f4', order: 110 },
    particle: { key: 'particle', label: '助词 / 语气', short: 'Ptc', color: '#a18967', soft: '#f3eee6', order: 120 },
    interjection: { key: 'interjection', label: '感叹词', short: 'Int', color: '#a36754', soft: '#f5eae5', order: 130 }
  };

  var SAMPLES = {
    english: [
      'Small actions can make a big difference.',
      'Every morning, Maya takes a short walk along the quiet river.',
      'She often stops to watch the birds, listen to their songs, and collect a few fallen leaves.',
      'These simple habits help her feel calm and focused.',
      'Researchers say that regular exercise improves memory, reduces stress, and supports better sleep.',
      'However, many people still spend too much time sitting indoors.',
      'They should pay attention to their health and take part in outdoor activities whenever possible.'
    ].join('\n\n'),
    chinese: [
      '清晨，小镇上的许多居民会沿着安静的河边散步。',
      '他们常常停下来观察几只白鸟，也会收集一些落叶。',
      '这些简单的习惯不仅让人感到放松，还能改善记忆、减轻压力。',
      '研究人员认为，规律运动对健康十分重要，但是很多人仍然长时间坐在室内。',
      '我们应该关注自己的身体，并积极参加户外活动。'
    ].join('\n\n')
  };

  function words(s) {
    return String(s || '').split(/\s+/).filter(Boolean);
  }

  function makeSet(s) {
    var out = Object.create(null);
    words(s).forEach(function (w) { out[w] = 1; });
    return out;
  }

  var STOP_EN = makeSet(
    'a an the and or but nor so yet for of to in on at by from with without about into over under through ' +
    'during before after between among across along around near off up down out as than that this these those ' +
    'i me my mine myself you your yours he him his she her hers it its we us our ours they them their theirs ' +
    'am is are was were be been being do does did have has had will would can could may might must shall should ' +
    'not no very too also just only there here when where why how what which who whom whose if because while ' +
    'although though until unless since each every all any both few many much some more most other another'
  );
  var STOP_ZH = makeSet(
    '的 地 得 了 着 过 是 在 和 与 及 或 而 但 但 是 因为 所以 如果 就 都 也 还 又 很 更 最 被 把 给 对 从 向 往 于 以 为 之 ' +
    '我 你 您 他 她 它 我们 你们 他们 她们 它们 这 那 这些 那些 一个 一种 这个 那个 有 无 不 没 没有'
  );

  var ZH_LEXICON = buildZhLexicon();

  function buildZhLexicon() {
    var out = Object.create(null);
    function add(pos, list) {
      // The lexicon is ordered by confidence. Keep the first, more specific
      // category when the same surface form appears in several lists.
      words(list).forEach(function (word) { if (!out[word]) out[word] = pos; });
    }

    add('pronoun',
      '我 你 您 他 她 它 我们 你们 他们 她们 它们 自己 大家 别人 人家 谁 什么 哪 哪个 哪些 哪里 哪儿 这 那 这些 那些 这里 那里 ' +
      '怎么 怎样 怎么样 多少 每 各 某 任何 其他 其余 彼此 双方 本人 咱们 咱'
    );
    add('numeral',
      '零 一 二 三 四 五 六 七 八 九 十 百 千 万 亿 两 半 几 第一 第二 第三 零几 若干 数 数十 数百 数千 数万'
    );
    add('quantifier',
      '个 位 名 只 条 张 本 件 台 辆 座 间 所 家 种 类 批 组 份 项 次 回 遍 趟 场 阵 杯 碗 瓶 盒 包 双 对 套 片 块 根 支 枝 朵 ' +
      '颗 粒 滴 束 群 堆 层 串 排 行 页 章 节 段 篇 首 幅 口 头 匹 艘 架 门 扇 堵 面 股 缕 团 批 些 一点 一些 许多 很多 大量 少量 ' +
      '大量 多数 少数 部分 全部 全部 每 各 米 公里 厘米 毫米 公斤 千克 克 吨 升 毫升 小时 分钟 秒 天 年 月 日 岁 元 角 分 倍 成'
    );
    add('adjective',
      '好 坏 大 小 高 低 长 短 快 慢 新 旧 冷 热 暖 凉 亮 暗 安静 热闹 简单 复杂 容易 困难 重要 主要 必要 明显 清楚 正确 错误 ' +
      '美丽 漂亮 好看 干净 整洁 健康 快乐 开心 高兴 难过 悲伤 紧张 放松 平静 认真 仔细 积极 消极 主动 被动 勇敢 小心 安全 危险 ' +
      '丰富 贫乏 充足 缺乏 方便 麻烦 现代 传统 自然 人工 真实 虚假 有效 无效 稳定 变化 特殊 普通 独特 一般 具体 抽象 清楚 模糊 ' +
      '优秀 普通 良好 巨大 微小 长期 短期 定期 不定 有力 无力 有利 有害 友好 亲切 严格 宽松 灵活 固定 全面 局部 公共 私人 ' +
      '国际 国内 城市 农村 年轻 年老 熟悉 陌生 繁忙 轻松 有趣 无聊 美好 温暖 寒冷 明亮 黑暗 深刻 浅显 丰富 单纯 安静 舒适 ' +
      '规律 健康 科学 合理 真实 重要 关键 积极 有益 少数 多数 大量 简单 复杂 成功 失败 满意 不满 独立 相同 不同 相似 独特'
    );
    add('verb',
      '是 有 做 去 来 看 听 说 讲 读 写 学 想 要 会 能 可以 应该 需要 喜欢 爱 恨 知道 认为 觉得 发现 看见 听到 感觉 希望 相信 ' +
      '开始 结束 继续 停止 改变 保持 成为 变成 实现 完成 进行 使用 利用 提供 得到 获得 取得 失去 带来 留下 带走 增加 减少 提高 ' +
      '降低 改善 影响 帮助 支持 反对 同意 拒绝 接受 选择 决定 解决 处理 发生 出现 存在 包括 包含 属于 来自 进入 离开 到达 返回 ' +
      '走 跑 坐 站 躺 睡 吃 喝 玩 买 卖 工作 学习 生活 休息 旅行 散步 观察 收集 停 停下 观察 感到 让 使 提高 减轻 支持 关注 ' +
      '参加 热爱 培养 推动 促进 造成 导致 防止 保护 研究 分析 说明 表示 显示 证明 组织 管理 建设 发展 创造 设计 生产 服务 ' +
      '分享 交流 沟通 讨论 回答 提问 介绍 表达 理解 记住 忘记 练习 复习 背诵 陪伴 等待 寻找 完成 完成 记录 收集 整理 阅读 观看 ' +
      '跑步 游泳 运动 锻炼 呼吸 生长 变化 形成 联系 依靠 适应 准备 计划 安排 邀请 欢迎 感谢 道歉 允许 鼓励 批评 检查 调查'
    );
    add('adverb',
      '很 非常 十分 特别 极 极其 更 最 太 挺 较 比较 相当 更加 越来越 已经 正在 将要 即将 曾经 一直 始终 总是 经常 常常 常 ' +
      '有时 偶尔 从不 从未 刚刚 马上 立刻 突然 渐渐 逐渐 不断 持续 仍然 依然 还 也 都 又 再 再次 重新 只 仅 仅仅 大约 约 ' +
      '也许 或许 可能 必然 一定 当然 确实 甚至 尤其 互相 一起 共同 分别 单独 亲自 终于 果然 竟然 居然 反而 其实 实际上 ' +
      '几乎 完全 全部 尽量 努力 认真 仔细 积极 主动 安静 迅速 快速 慢慢 轻轻 好好 非常 特别 有些 稍微 有点 足够 更加 大量'
    );
    add('preposition',
      '在 从 自 向 往 朝 对 对于 关于 由于 为了 为 被 把 将 给 跟 与 同 比 按照 根据 通过 经过 随着 除了 沿着 沿 从 由 ' +
      '向着 对着 为了 对 于 自 自从 至 到 当 趁 除去 除 除了 关于 至于 鉴于 基于 依 依照 依赖 靠 依靠'
    );
    add('conjunction',
      '和 与 及 以及 或 或者 还是 而且 并且 并 但是 但 可是 然而 不过 虽然 尽管 因为 由于 所以 因此 从而 因而 如果 假如 ' +
      '要是 那么 只要 只有 除非 即使 既然 无论 不管 不仅 而且 不是 而是 然后 接着 同时 于是 何况 况且 只要 一旦'
    );
    add('auxiliary',
      '会 能 可以 应该 应当 必须 需要 敢 肯 愿 愿意 可能 将要 已 已经 正在 被 把 着 过 得 地 所'
    );
    add('particle',
      '的 地 得 了 着 过 所 吗 呢 吧 啊 呀 哇 嘛 罢了 而已 了 啦 喽 咯 嗯 哦 噢 唉 咦 哎'
    );
    add('interjection',
      '啊 呀 哇 唉 哎 嗯 哦 噢 咦 嘿 嗨 喂 哈 哈哈 唉呀 天哪'
    );
    add('determiner',
      '这 那 这些 那些 这个 那个 每 各 某 任何 其他 其余 所有 全部 整个 另外 另 本 该 此'
    );
    add('noun',
      '人 人物 红楼梦 人们 居民 朋友 家人 父母 父亲 母亲 孩子 学生 老师 医生 工人 农民 研究人员 研究员 作者 读者 自己 身体 生命 生活 ' +
      '时间 地方 城市 小镇 村庄 国家 世界 社会 公司 学校 大学 医院 图书馆 市场 商店 家庭 房间 电脑 手机 书本 文章 语言 ' +
      '英语 中文 词 单词 句子 文章 照片 图片 文档 文件 内容 信息 数据 问题 答案 方法 方式 过程 结果 原因 关系 条件 目标 ' +
      '计划 方案 事情 情况 变化 发展 影响 作用 价值 意义 效率 质量 机会 挑战 需要 需求 自由 环境 自然 河 河边 山 海 雨 ' +
      '风 雪 太阳 月亮 星 树 花 草 叶 鸟 鱼 动物 植物 食物 水果 蔬菜 水 茶 咖啡 早餐 午餐 晚餐 运动 记忆 压力 睡眠 ' +
      '习惯 早晨 清晨 中午 下午 晚上 季节 春天 夏天 秋天 冬天 室内 户外 户外活动 活动 健康 心态 情绪 快乐 未来 过去 现在'
    );
    return out;
  }

  var CHINESE_NUMBER = /^[0-9]+(?:\.[0-9]+)?(?:%|％)?$/;
  var CHINESE_NUMERAL_CHAR = /^[零〇一二三四五六七八九十百千万亿两半]+$/;
  var CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
  var LATIN_RE = /[A-Za-z]/;

  var FIXED_COLLOCATIONS = {
    en: {
      good: ['be good at', 'good for', 'a good idea', 'good at doing'],
      bad: ['be bad at', 'bad for', 'a bad habit'],
      big: ['a big difference', 'make a big decision', 'big challenge'],
      small: ['a small change', 'small actions', 'a small amount of'],
      quiet: ['a quiet place', 'keep quiet', 'quiet voice'],
      simple: ['a simple solution', 'keep it simple', 'simple habit'],
      regular: ['regular exercise', 'on a regular basis', 'regular practice'],
      better: ['better than', 'do better', 'feel better'],
      calm: ['stay calm', 'calm down', 'a calm voice'],
      focused: ['stay focused', 'become focused', 'remain focused'],
      possible: ['as soon as possible', 'whenever possible', 'if possible'],
      able: ['be able to', 'be capable of'],
      responsible: ['be responsible for', 'take responsibility for'],
      interested: ['be interested in', 'show interest in'],
      aware: ['be aware of', 'raise awareness of'],
      afraid: ['be afraid of', 'afraid to do'],
      ready: ['be ready for', 'ready to do'],
      likely: ['be likely to', 'it is likely that'],
      different: ['be different from', 'make a difference'],
      similar: ['be similar to', 'in a similar way'],
      essential: ['be essential to', 'play an essential role'],
      important: ['be important to', 'play an important role'],
      make: ['make a difference', 'make progress', 'make a decision', 'make sense'],
      take: ['take part in', 'take care of', 'take action', 'take a walk'],
      pay: ['pay attention to', 'pay for', 'pay a visit'],
      spend: ['spend time on', 'spend time doing', 'spend money on'],
      stop: ['stop doing', 'stop to do', 'stop by'],
      watch: ['watch out for', 'watch a film', 'watch closely'],
      listen: ['listen to', 'listen carefully', 'listen for'],
      collect: ['collect data', 'collect information', 'collect leaves'],
      improve: ['improve performance', 'improve quality', 'improve memory'],
      reduce: ['reduce stress', 'reduce the risk of', 'reduce costs'],
      support: ['support a decision', 'support each other', 'provide support'],
      help: ['help somebody do', 'help with', 'help to do'],
      focus: ['focus on', 'lose focus', 'focus attention on'],
      depend: ['depend on', 'be dependent on'],
      deal: ['deal with', 'make a deal'],
      consist: ['consist of', 'be consistent with'],
      result: ['result in', 'result from', 'as a result of'],
      contribute: ['contribute to', 'make a contribution to'],
      refer: ['refer to', 'reference book'],
      come: ['come up with', 'come from', 'come true'],
      give: ['give up', 'give advice', 'give somebody a chance'],
      look: ['look after', 'look for', 'look forward to'],
      carry: ['carry out', 'carry on'],
      ask: ['ask for', 'ask a question'],
      wait: ['wait for', 'wait to do'],
      arrive: ['arrive at', 'arrive in'],
      agree: ['agree with', 'agree on', 'agree to do'],
      believe: ['believe in', 'believe that'],
      belong: ['belong to'],
      activity: ['outdoor activities', 'take part in an activity', 'physical activity'],
      exercise: ['regular exercise', 'do exercise', 'exercise regularly'],
      memory: ['improve memory', 'have a good memory', 'from memory'],
      stress: ['reduce stress', 'under stress', 'cause stress'],
      sleep: ['good sleep', 'go to sleep', 'lack of sleep'],
      health: ['good health', 'mental health', 'improve health'],
      decision: ['make a decision', 'reach a decision', 'a difficult decision'],
      attention: ['pay attention to', 'draw attention to', 'attract attention'],
      difference: ['make a difference', 'a big difference', 'tell the difference'],
      habit: ['form a habit', 'good habit', 'daily habit'],
      action: ['take action', 'small actions', 'in action'],
      progress: ['make progress', 'in progress', 'steady progress'],
      information: ['collect information', 'provide information', 'a piece of information'],
      research: ['do research', 'research shows', 'conduct research']
    },
    zh: {
      '安静': ['保持安静', '安静的环境', '安静地'],
      '简单': ['简单的方法', '简单的习惯', '简单来说'],
      '重要': ['非常重要', '十分重要', '起重要作用'],
      '积极': ['积极参加', '积极影响', '积极面对'],
      '健康': ['身体健康', '健康生活', '对健康有益'],
      '规律': ['规律运动', '生活规律', '有规律地'],
      '放松': ['感到放松', '放松心情', '身心放松'],
      '改善': ['改善生活', '改善环境', '明显改善'],
      '提高': ['提高效率', '提高水平', '不断提高'],
      '减轻': ['减轻压力', '减轻负担', '减轻影响'],
      '减少': ['减少浪费', '显著减少', '减少时间'],
      '支持': ['支持发展', '给予支持', '大力支持'],
      '关注': ['关注问题', '密切关注', '关注健康'],
      '参加': ['积极参加', '参加会议', '参加活动'],
      '收集': ['收集数据', '收集信息', '收集材料'],
      '观察': ['仔细观察', '观察变化', '观察结果'],
      '感到': ['感到快乐', '感到压力', '感到满意'],
      '发挥': ['发挥作用', '发挥优势', '充分发挥'],
      '解决': ['解决问题', '有效解决', '解决方案'],
      '采取': ['采取措施', '采取行动', '采取办法'],
      '产生': ['产生影响', '产生效果', '产生变化'],
      '取得': ['取得进展', '取得成功', '取得成果'],
      '实现': ['实现目标', '成为现实', '顺利实现'],
      '满足': ['满足需求', '满足条件', '得到满足'],
      '推动': ['推动发展', '推动进步', '有力推动'],
      '面对': ['面对挑战', '面对问题', '勇敢面对'],
      '影响': ['产生影响', '重要影响', '受到影响'],
      '环境': ['自然环境', '生活环境', '保护环境'],
      '活动': ['户外活动', '参加活动', '社会活动'],
      '习惯': ['养成习惯', '生活习惯', '良好习惯'],
      '压力': ['减轻压力', '面临压力', '工作压力'],
      '记忆': ['改善记忆', '记忆力', '留下记忆'],
      '睡眠': ['改善睡眠', '睡眠质量', '充足睡眠'],
      '问题': ['解决问题', '面对问题', '关键问题'],
      '目标': ['实现目标', '明确目标', '长期目标'],
      '发展': ['推动发展', '社会发展', '不断发展'],
      '作用': ['发挥作用', '重要作用', '积极作用'],
      '关系': ['社会关系', '密切相关', '关系重大'],
      '原因': ['主要原因', '重要原因', '导致原因'],
      '结果': ['产生结果', '最终结果', '研究结果'],
      '方式': ['生活方式', '有效方式', '主要方式'],
      '机会': ['抓住机会', '提供机会', '学习机会'],
      '挑战': ['面对挑战', '重大挑战', '接受挑战'],
      '一些': ['一些问题', '一些变化', '一些人'],
      '许多': ['许多人', '许多问题', '许多例子'],
      '大量': ['大量数据', '大量时间', '大量工作'],
      '几个': ['几个问题', '几点建议', '几个人'],
      '每': ['每一个', '每天', '每次'],
      '一': ['一个人', '一项措施', '一个目标']
    }
  };

  function cleanText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function splitSentences(text) {
    return String(text || '')
      .split(/(?<=[.!?。！？；;])\s*|\n+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function detectLanguage(text, forced) {
    if (forced === 'zh' || forced === 'en') return forced;
    var cjk = (String(text).match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
    var latinWords = (String(text).match(/\b[A-Za-z][A-Za-z'’-]*\b/g) || []).length;
    if (!cjk && latinWords) return 'en';
    if (!latinWords && cjk) return 'zh';
    if (!cjk && !latinWords) return 'en';
    return Math.min(cjk, latinWords * 2) / Math.max(cjk, latinWords * 2) > 0.12 ? 'mixed' : (cjk > latinWords ? 'zh' : 'en');
  }

  function languageLabel(lang) {
    return { en: '英语', zh: '中文', mixed: '中英混合' }[lang] || '自动';
  }

  function safeEnglishLemma(word, pos, tags) {
    var ln = String(word || '').toLowerCase();
    if (!root.nlp) return ln;
    try {
      if (pos === 'verb') {
        var v = root.nlp(ln).verbs().toInfinitive().out('text');
        if (v && v !== ln) return v.toLowerCase().split(/\s+/)[0];
      }
      if (pos === 'noun' && tags && tags.indexOf('Plural') > -1) {
        var n = root.nlp(ln).nouns().toSingular().out('text');
        if (n) return n.toLowerCase().split(/\s+/)[0];
      }
    } catch (e) { /* keep surface form */ }
    return ln;
  }

  function mapEnglishPOS(tags, surface) {
    var tag = function (name) { return tags.indexOf(name) > -1; };
    var lower = String(surface || '').toLowerCase();

    if (lower === 'to') return 'preposition';
    if (tag('Interjection')) return 'interjection';
    if (tag('Value') || tag('Cardinal') || tag('Ordinal') || tag('TextValue') || tag('NumericValue')) return 'numeral';
    if (tag('Pronoun')) return 'pronoun';
    if (tag('Adjective') || tag('Comparative') || tag('Superlative')) return 'adjective';
    if (tag('Modal')) return 'auxiliary';
    if (tag('Verb') || tag('Copula') || tag('Imperative')) return 'verb';
    if (tag('Adverb') || tag('Negative')) return 'adverb';
    if (tag('Preposition')) return 'preposition';
    if (tag('Conjunction')) return 'conjunction';
    if (tag('Determiner')) return 'determiner';
    if (tag('Noun')) return 'noun';
    if (tag('Acronym') || tag('ProperNoun')) return 'noun';
    return '';
  }

  function collectEnglishModel(text) {
    var byForm = Object.create(null);
    if (!root.nlp) return byForm;

    var doc;
    try { doc = root.nlp(text); } catch (e) { return byForm; }
    var items = [];
    try { items = doc.json(); } catch (e) { items = []; }

    items.forEach(function (item) {
      (item.terms || []).forEach(function (term) {
        var surface = String(term.text || '');
        if (!/[A-Za-z]/.test(surface)) return;
        var normal = String(term.normal || surface).toLowerCase();
        var tags = term.tags || [];
        var pos = mapEnglishPOS(tags, surface);
        if (!pos) return;
        var key = normal;
        var prev = byForm[key];
        var confidence = typeof term.confidence === 'number' ? Math.max(.55, term.confidence) : .9;
        if (!prev) {
          byForm[key] = {
            pos: pos,
            tags: tags,
            confidence: confidence,
            lemma: safeEnglishLemma(surface, pos, tags)
          };
        } else if (prev.pos !== pos) {
          var priority = { pronoun: 9, numeral: 8, adjective: 7, verb: 7, adverb: 6, preposition: 6, conjunction: 5, determiner: 4, noun: 3 };
          if ((priority[pos] || 0) > (priority[prev.pos] || 0)) {
            prev.pos = pos;
            prev.tags = tags;
            prev.lemma = safeEnglishLemma(surface, pos, tags);
          }
        }
      });
    });
    return byForm;
  }

  function findEnglishRuns(text) {
    var runs = [];
    var re = /[A-Za-z][A-Za-z0-9'’\-]*(?:[ \t\r\n]+[A-Za-z][A-Za-z0-9'’\-]*)*/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      runs.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
    return runs;
  }

  function analyseEnglish(text) {
    var runs = findEnglishRuns(text);
    if (!runs.length) return { words: [], annotations: [], tokens: [] };

    var joined = runs.map(function (r) { return r.text; }).join(' ');
    var model = collectEnglishModel(joined);
    var annotations = [];
    var tokens = [];

    runs.forEach(function (run) {
      var re = /[A-Za-z][A-Za-z0-9'’\-]*/g;
      var m;
      while ((m = re.exec(run.text)) !== null) {
        var surface = m[0];
        var normal = surface.toLowerCase();
        var info = model[normal];
        if (!info && /^\d/.test(surface)) info = { pos: 'numeral', confidence: .8, lemma: surface, tags: [] };
        if (!info) continue;
        var start = run.start + m.index;
        var item = {
          text: surface,
          lemma: info.lemma || normal,
          pos: info.pos,
          confidence: info.confidence || .75,
          tags: info.tags || [],
          start: start,
          end: start + surface.length,
          language: 'en'
        };
        annotations.push(item);
        tokens.push(item);
      }
    });

    return { words: aggregateWords(tokens), annotations: annotations, tokens: tokens };
  }

  function previousLexical(tokens, i) {
    for (var j = i - 1; j >= 0 && j >= i - 3; j--) {
      if (tokens[j] && tokens[j].pos !== 'punctuation') return tokens[j];
    }
    return null;
  }

  function classifyChinese(token, prev, prev2) {
    if (!token) return null;
    if (CHINESE_NUMBER.test(token)) return { pos: 'numeral', confidence: .98 };
    if (CHINESE_NUMERAL_CHAR.test(token)) return { pos: 'numeral', confidence: .92 };

    if (prev && /^(正在|已经|将要|曾经)$/.test(prev.text)) return { pos: 'verb', confidence: .8 };
    if (prev && /^(很|非常|十分|特别|较|更|最)$/.test(prev.text)) return { pos: 'adjective', confidence: .8 };

    var exact = ZH_LEXICON[token];
    if (exact) {
      // Some one-character words are strongly context sensitive. Prefer the
      // preceding numeral only when the token is a known measure word.
      if (exact === 'noun' && ZH_LEXICON[token] === 'quantifier') exact = 'quantifier';
      return { pos: exact, confidence: .9 };
    }

    if (token === '的' || token === '地' || token === '得') return { pos: 'particle', confidence: .94 };
    if (/^[嗯哦啊呀哎咦哈嘿喂]+$/.test(token)) return { pos: 'interjection', confidence: .88 };
    if (/[的地]$/.test(token) && token.length > 1) return { pos: 'adverb', confidence: .62 };
    if (/的$/.test(token) && token.length > 1) return { pos: 'adjective', confidence: .65 };

    if (prev && (prev.text === '很' || prev.text === '非常' || prev.text === '十分' || prev.text === '更' || prev.text === '最' ||
      prev.text === '相当' || prev.text === '特别' || prev.text === '比较')) {
      return { pos: 'adjective', confidence: .7 };
    }
    if (prev && (prev.text === '正在' || prev.text === '已经' || prev.text === '将要' || prev.text === '一直' || prev.text === '常常')) {
      return { pos: 'verb', confidence: .62 };
    }
    if (prev && (CHINESE_NUMBER.test(prev.text) || CHINESE_NUMERAL_CHAR.test(prev.text))) {
      return { pos: 'quantifier', confidence: .66 };
    }
    if (prev2 && CHINESE_NUMBER.test(prev2.text) && prev) return { pos: 'noun', confidence: .7 };

    if (/(者|员|家|师|生|物|品|机|器|学|法|制|权|局|院|场|所|业|界|区|城|村|镇|市|国|人|事|情|意|题|心|身|体|音|形|色|味|气|能|位|期|段|类|型|式|价|值|量|额|率|比|数|文|书|画|乐|舞|戏|剧|赛|会|务|程|方|案|计|划|目|标|需求|效果|影响|变化|发展|关系|条件|原因|结果|方法|问题)$/.test(token)) {
      return { pos: 'noun', confidence: .63 };
    }
    if (token.length === 1) return { pos: 'noun', confidence: .4 };
    return { pos: 'noun', confidence: .52 };
  }

  function analyseChinese(text, mode) {
    if (typeof Intl === 'undefined' || !Intl.Segmenter) {
      return analyseChineseFallback(text, mode);
    }

    var segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    var segments = Array.from(segmenter.segment(text));
    // 书名号内的专名是一个整体；即使浏览器词典不认识也不拆开。
    var titles = [];
    var titleRe = /《([^《》\n]{1,40})》/g, titleMatch;
    while ((titleMatch = titleRe.exec(text))) titles.push({ start: titleMatch.index + 1, end: titleMatch.index + 1 + titleMatch[1].length, text: titleMatch[1] });
    var merged = [];
    segments.forEach(function (seg) {
      var title = titles.find(function (t) { return seg.index >= t.start && seg.index < t.end; });
      if (title) {
        if (seg.index === title.start) merged.push({ segment: title.text, index: title.start, isWordLike: true, title: true });
        return;
      }
      var numberMeasure = /^([零〇一二三四五六七八九十百千万亿两半\d]+)([个位名只条张本件台辆座间种次篇首])([\u3400-\u9fff]*)$/.exec(seg.segment);
      if (numberMeasure) {
        merged.push({ segment: numberMeasure[1], index: seg.index, isWordLike: true });
        merged.push({ segment: numberMeasure[2], index: seg.index + numberMeasure[1].length, isWordLike: true });
        if (numberMeasure[3]) {
          Array.from(segmenter.segment(numberMeasure[3])).forEach(function (rest) {
            merged.push({ segment: rest.segment, index: seg.index + numberMeasure[1].length + numberMeasure[2].length + rest.index, isWordLike: rest.isWordLike });
          });
        }
      } else merged.push(seg);
    });
    segments = merged;
    var tokens = [];
    var previous = [];
    segments.forEach(function (seg) {
      var token = seg.segment;
      if (!seg.isWordLike) { if (/[。！？；;\n]/.test(token)) previous = []; return; }
      var isCjk = CJK_RE.test(token);
      var isNumber = CHINESE_NUMBER.test(token);
      if (!isCjk && !isNumber) return;
      if (LATIN_RE.test(token)) return;

      if (token === '了' || token === '着' || token === '过') {
        previous = [];
        return;
      }
      var prev = previous.length ? previous[previous.length - 1] : null;
      var prev2 = previous.length > 1 ? previous[previous.length - 2] : null;
      var cls = seg.title ? { pos: 'noun', confidence: .95 } : classifyChinese(token, prev, prev2);
      if (!cls) return;

      var item = {
        text: token,
        lemma: token,
        pos: cls.pos,
        confidence: cls.confidence,
        start: seg.index,
        end: seg.index + token.length,
        language: 'zh'
      };
      tokens.push(item);
      previous.push(item);
      if (previous.length > 5) previous.shift();
    });
    return { words: aggregateWords(tokens), annotations: tokens, tokens: tokens };
  }

  function analyseChineseFallback(text, mode) {
    var tokens = [];
    var re = /[\u3400-\u4dbf\u4e00-\u9fff]+|[0-9]+(?:\.[0-9]+)?/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var chunk = m[0];
      if (/^[0-9]/.test(chunk)) {
        tokens.push({ text: chunk, lemma: chunk, pos: 'numeral', confidence: .95, start: m.index, end: m.index + chunk.length, language: 'zh' });
        continue;
      }
      if (chunk.length <= 2) {
        var cls = classifyChinese(chunk, null, null);
        tokens.push({ text: chunk, lemma: chunk, pos: cls.pos, confidence: cls.confidence, start: m.index, end: m.index + chunk.length, language: 'zh' });
      } else {
        // Without word segmentation, preserve the run as a coarse noun chunk.
        tokens.push({ text: chunk, lemma: chunk, pos: 'noun', confidence: .32, start: m.index, end: m.index + chunk.length, language: 'zh' });
      }
    }
    return { words: aggregateWords(tokens), annotations: tokens, tokens: tokens };
  }

  function aggregateWords(tokens) {
    var map = Object.create(null);
    (tokens || []).forEach(function (t) {
      var key = t.language + '|' + t.pos + '|' + String(t.lemma || t.text).toLowerCase();
      var word = map[key];
      if (!word) {
        word = map[key] = {
          id: key,
          word: t.language === 'en' ? String(t.lemma || t.text).toLowerCase() : t.text,
          surface: t.text,
          lemma: t.lemma || t.text,
          pos: t.pos,
          language: t.language,
          count: 0,
          forms: [],
          confidence: 0,
          contexts: []
        };
      }
      word.count += 1;
      word.confidence += Number(t.confidence) || .5;
      if (word.forms.indexOf(t.text) < 0) word.forms.push(t.text);
    });
    var out = Object.keys(map).map(function (k) {
      var w = map[k];
      w.confidence = Math.min(.99, w.confidence / Math.max(1, w.count));
      return w;
    });
    out.sort(function (a, b) {
      var oa = POS_META[a.pos] ? POS_META[a.pos].order : 999;
      var ob = POS_META[b.pos] ? POS_META[b.pos].order : 999;
      if (oa !== ob) return oa - ob;
      if (b.count !== a.count) return b.count - a.count;
      return a.word.localeCompare(b.word);
    });
    return out;
  }

  function attachSentenceContexts(words, text) {
    var sentences = splitSentences(text);
    words.forEach(function (word) {
      var forms = word.forms && word.forms.length ? word.forms : [word.word];
      var unique = [];
      sentences.forEach(function (sentence) {
        var hit = forms.some(function (form) {
          if (word.language === 'en') {
            return new RegExp('\\b' + escapeRegExp(form) + '\\b', 'i').test(sentence);
          }
          return sentence.indexOf(form) > -1;
        });
        if (hit && unique.indexOf(sentence) < 0) unique.push(sentence);
      });
      word.contexts = unique.slice(0, 3);
    });
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function articleContextPhrases(words, tokens, lang, rawText) {
    var byLemmas = Object.create(null);
    words.forEach(function (w) { byLemmas[w.language + '|' + w.lemma.toLowerCase()] = w; });

    // Tokens do not carry punctuation, so phrases are safely inferred from
    // position gaps and the original text between them.
    function processWithGaps(list) {
      var current = [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var previousToken = current.length ? current[current.length - 1] : null;
        var gapText = previousToken ? String(rawText || '').slice(previousToken.end, t.start) : '';
        if (current.length && /[.!?。！？；;\n]/.test(gapText)) {
          if (lang === 'en') extractEnglishPhrases(current, byLemmas);
          else extractChinesePhrases(current, byLemmas);
          current = [];
        }
        current.push(t);
      }
      if (current.length) {
        if (lang === 'en') extractEnglishPhrases(current, byLemmas);
        else extractChinesePhrases(current, byLemmas);
      }
    }
    processWithGaps(tokens);
  }

  function addContextPhrase(wordMap, token, phrase, kind) {
    if (!token || !phrase) return;
    var word = wordMap[token.language + '|' + token.lemma.toLowerCase()];
    if (!word) return;
    if (!word._contextPhrases) word._contextPhrases = [];
    var key = phrase.trim();
    if (!key || word._contextPhrases.some(function (x) { return x.text === key; })) return;
    word._contextPhrases.push({ text: key, kind: kind || '文中搭配' });
  }

  function extractEnglishPhrases(tokens, wordMap) {
    for (var i = 0; i < tokens.length; i++) {
      var a = tokens[i], b = tokens[i + 1], c = tokens[i + 2], d = tokens[i + 3];
      if (!b) continue;
      if (a.pos === 'adjective' && b.pos === 'noun') addContextPhrase(wordMap, a, a.text + ' ' + b.text, 'adj. + n.');
      if (a.pos === 'verb' && b.pos === 'preposition') addContextPhrase(wordMap, a, a.text + ' ' + b.text, 'v. + prep.');
      if (a.pos === 'verb' && (b.pos === 'determiner' || b.pos === 'adjective') && c && c.pos === 'noun') {
        addContextPhrase(wordMap, a, a.text + ' ' + b.text + ' ' + c.text, 'v. + phrase');
      }
      if (a.pos === 'adjective' && b.pos === 'preposition') addContextPhrase(wordMap, a, a.text + ' ' + b.text, 'adj. + prep.');
      if (a.pos === 'noun' && b.pos === 'preposition' && c) addContextPhrase(wordMap, a, a.text + ' ' + b.text + ' ' + c.text, 'n. + prep.');
      if (a.pos === 'verb' && /^(up|down|out|off|on|in|through|around|along|away|back)$/i.test(b.text)) {
        addContextPhrase(wordMap, a, a.text + ' ' + b.text, 'phrasal verb');
      }
      if (a.pos === 'determiner' && b.pos === 'adjective' && c && c.pos === 'noun') {
        addContextPhrase(wordMap, b, b.text + ' ' + c.text, 'adj. + n.');
      }
      if (a.pos === 'numeral' && b.pos === 'noun') addContextPhrase(wordMap, a, a.text + ' ' + b.text, 'num. + n.');
    }
  }

  function extractChinesePhrases(tokens, wordMap) {
    for (var i = 0; i < tokens.length; i++) {
      var a = tokens[i], b = tokens[i + 1], c = tokens[i + 2], d = tokens[i + 3];
      if (!b) continue;
      if (a.pos === 'adjective' && b.text === '的' && c && c.pos === 'noun') {
        addContextPhrase(wordMap, a, a.text + '的' + c.text, 'adj. + 的 + n.');
      }
      if (a.pos === 'verb' && b.pos === 'noun') addContextPhrase(wordMap, a, a.text + b.text, 'v. + n.');
      if (a.pos === 'verb' && b.text === '了' && c && c.pos === 'noun') addContextPhrase(wordMap, a, a.text + '了' + c.text, 'v. + 了');
      if ((a.pos === 'numeral' || a.pos === 'pronoun') && b.pos === 'quantifier' && c && c.pos === 'noun') {
        addContextPhrase(wordMap, a, a.text + b.text + c.text, 'num. + measure + n.');
        addContextPhrase(wordMap, b, a.text + b.text + c.text, 'num. + measure + n.');
      }
      if (a.pos === 'verb' && b.pos === 'preposition') addContextPhrase(wordMap, a, a.text + b.text, 'v. + prep.');
      if (a.pos === 'noun' && b.pos === 'verb') addContextPhrase(wordMap, a, a.text + b.text, 'n. + v.');
      if (a.pos === 'verb' && b.pos === 'adverb') addContextPhrase(wordMap, a, a.text + b.text, 'v. + adv.');
      if (a.pos === 'adverb' && b.pos === 'verb') addContextPhrase(wordMap, b, a.text + b.text, 'adv. + v.');
    }
  }

  function attachCollocations(words) {
    words.forEach(function (w) {
      var fixed = FIXED_COLLOCATIONS[w.language] && FIXED_COLLOCATIONS[w.language][w.word];
      if (!fixed && w.language === 'en') fixed = FIXED_COLLOCATIONS.en[String(w.lemma).toLowerCase()];
      w.fixedCollocations = (fixed || []).slice(0, 4).map(function (text) { return { text: text }; });
      w.contextPhrases = (w._contextPhrases || [])
        .filter(function (x, i, arr) {
          return arr.findIndex(function (y) { return y.text === x.text; }) === i;
        })
        .slice(0, 4);
      delete w._contextPhrases;
    });
  }

  function applyStopWordFilter(words, hide) {
    if (!hide) return words.slice();
    return words.filter(function (w) {
      return w.language === 'en' ? !STOP_EN[w.word] : !STOP_ZH[w.word];
    });
  }

  function analyse(text, options) {
    var opts = options || {};
    var raw = cleanText(text);
    var lang = detectLanguage(raw, opts.languageMode || 'auto');
    var zh = null;
    var en = null;
    var annotations = [];
    var words = [];

    if (lang === 'zh' || lang === 'mixed') {
      zh = analyseChinese(raw, lang);
      annotations = annotations.concat(zh.annotations);
      words = words.concat(zh.words);
    }
    if (lang === 'en' || lang === 'mixed') {
      en = analyseEnglish(raw);
      if (en.words.length || lang === 'en') {
        annotations = annotations.concat(en.annotations);
        words = words.concat(en.words);
      }
    }

    annotations.sort(function (a, b) { return a.start - b.start; });
    attachSentenceContexts(words, raw);

    if (en && en.tokens.length) articleContextPhrases(words, en.tokens, 'en', raw);
    if (zh && zh.tokens.length) articleContextPhrases(words, zh.tokens, 'zh', raw);
    attachCollocations(words);

    var fullWords = words.slice();
    var visibleWords = applyStopWordFilter(words, !!opts.hideStopWords);
    var counts = {};
    visibleWords.forEach(function (w) { counts[w.pos] = (counts[w.pos] || 0) + 1; });

    return {
      rawText: raw,
      language: lang,
      languageLabel: languageLabel(lang),
      words: visibleWords,
      allWords: fullWords,
      annotations: annotations,
      counts: counts,
      totalTokens: annotations.length,
      characterCount: Array.from(raw.replace(/\s/g, '')).length,
      sentenceCount: splitSentences(raw).length,
      generatedAt: new Date().toISOString()
    };
  }

  function toMarkdown(result) {
    var lines = [];
    lines.push('# 文章词性拆解');
    lines.push('');
    lines.push('- 语言：' + result.languageLabel);
    lines.push('- 字符数：' + result.characterCount);
    lines.push('- 词次：' + result.totalTokens);
    lines.push('- 词条：' + result.words.length);
    lines.push('');
    Object.keys(POS_META).sort(function (a, b) { return POS_META[a].order - POS_META[b].order; }).forEach(function (pos) {
      var list = result.words.filter(function (w) { return w.pos === pos; });
      if (!list.length) return;
      lines.push('## ' + POS_META[pos].label + '（' + list.length + '）');
      lines.push('');
      list.forEach(function (w) {
        var collocations = [];
        (w.fixedCollocations || []).forEach(function (x) { collocations.push(x.text); });
        (w.contextPhrases || []).forEach(function (x) { collocations.push(x.text + '（文中）'); });
        lines.push('- **' + w.word + '** · ' + w.count + ' 次' + (collocations.length ? ' · ' + collocations.slice(0, 5).join('；') : ''));
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  root.LexicalEngine = {
    POS_META: POS_META,
    SAMPLES: SAMPLES,
    analyse: analyse,
    toMarkdown: toMarkdown
  };
})(typeof window !== 'undefined' ? window : globalThis);
