/*!
 * Snow Lexis · 词库分类树 + 词性标签字典（v4）
 * ------------------------------------------------------------------
 * 路径写法：
 *   pathText  含根节点、用 " > " 连接，用于页面面包屑
 *   tagPath   不含根节点、用 ">" 连接，写入 vocabulary_sense.semantic_tags
 *             例：具象实体>交通出行>交通工具>陆上交通工具
 *
 * 末级判定：没有子节点即为末级，因此各主干末级深度不同（3~5 层）都支持。
 * 绑定方式两种：
 *   semantic  释义用 semantic_tags 挂到这个分支（主干1/2、主干3.1/3.2、主干4.1/4.2）
 *   pos       按词性命中（posTag 单个 / posTags 多个），用于功能词分支：
 *             3.3 其他功能词 = prep./conj./art./interj.，4.3 代词 = pron.
 *
 * v4 复盘要点：
 *   1. 主干3 改为「基本助动词 / 情态助动词 / 其他功能词」，代词并入主干4；
 *      do/be/have 的助动词义入 3.1，实义义入 2.1（一条词条多释义）。
 *   2. 主干4 = 数字（基数/序数/分数小数百分数）、限定词、代词。
 *   3. 1.5 交通出行按「交通工具 / 基础设施 / 场站枢纽 / 能源补给 / 部件配件」重排。
 *   4. 2.4.2 度量拆为尺寸/重量/容量/速度/温度/数量/单位 7 个末级。
 *   5. 2.13 副词单列 7 类，副词不再散落在形容词分支。
 */
(function (root, factory) {
  const api = factory();
  root.YY_TREE = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================================================
   * 一、词性标签字典
   * ============================================================ */
  const POS_TAGS = [
    { pos: 'n.',      name: '名词',   kind: 'content',  note: '实词，需绑定语义标签' },
    { pos: 'v.',      name: '动词',   kind: 'content',  note: '实词，需绑定语义标签（含助动词的语法义项）' },
    { pos: 'adj.',    name: '形容词', kind: 'content',  note: '实词，需绑定语义标签（含限定词）' },
    { pos: 'adv.',    name: '副词',   kind: 'content',  note: '实词，需绑定语义标签' },
    { pos: 'pron.',   name: '代词',   kind: 'function', note: '虚词，semantic_tags 为空数组' },
    { pos: 'prep.',   name: '介词',   kind: 'function', note: '虚词，semantic_tags 为空数组' },
    { pos: 'conj.',   name: '连词',   kind: 'function', note: '虚词，semantic_tags 为空数组' },
    { pos: 'art.',    name: '冠词',   kind: 'function', note: '虚词，semantic_tags 为空数组' },
    { pos: 'interj.', name: '感叹词', kind: 'function', note: '虚词，semantic_tags 为空数组' }
  ];
  const POS_MAP = {};
  POS_TAGS.forEach(function (p) { POS_MAP[p.pos] = p; });

  /* ============================================================
   * 二、语义分类树
   * ============================================================ */
  function node(code, name, children, extra) {
    const n = { code: code, name: name, level: code.split('.').length, children: children || [] };
    if (extra) Object.assign(n, extra);
    return n;
  }

  const CATEGORY_TREE = node('0', '词库树', [
    /* ================= 主干 1：具象实体 ================= */
    node('1', '具象实体', [
      node('1.1', '生物', [
        node('1.1.1', '人类', [
          node('1.1.1.1', '人体部位'),
          node('1.1.1.2', '生理特征'),
          node('1.1.1.3', '亲属家人'),
          node('1.1.1.4', '社会角色与职业')
        ]),
        node('1.1.2', '动物', [
          node('1.1.2.1', '哺乳动物'),
          node('1.1.2.2', '鸟类'),
          node('1.1.2.3', '水生生物'),
          node('1.1.2.4', '昆虫'),
          node('1.1.2.5', '爬行动物'),
          node('1.1.2.6', '两栖动物')
        ]),
        node('1.1.3', '植物', [
          node('1.1.3.1', '树木'),
          node('1.1.3.2', '花卉'),
          node('1.1.3.3', '水果植株'),
          node('1.1.3.4', '蔬菜'),
          node('1.1.3.5', '农作物')
        ]),
        node('1.1.4', '微生物与菌类', [
          node('1.1.4.1', '细菌'),
          node('1.1.4.2', '病毒'),
          node('1.1.4.3', '真菌')
        ], { note: 'v4 新增' })
      ], { note: '有生命的名词整体' }),
      node('1.2', '物质与物品', [
        node('1.2.1', '食物饮品', [
          node('1.2.1.1', '主食'),
          node('1.2.1.2', '肉类'),
          node('1.2.1.3', '蛋奶'),
          node('1.2.1.4', '蔬果'),
          node('1.2.1.5', '调味品'),
          node('1.2.1.6', '零食甜点'),
          node('1.2.1.7', '饮品')
        ]),
        node('1.2.2', '服饰穿戴与箱包', [
          node('1.2.2.1', '衣物'),
          node('1.2.2.2', '鞋帽'),
          node('1.2.2.3', '配饰'),
          node('1.2.2.4', '行李箱包')
        ], { note: 'v4 扩展：新增行李箱包' }),
        node('1.2.3', '工具、仪器与器械', [
          node('1.2.3.1', '手工工具'),
          node('1.2.3.2', '工业器械'),
          node('1.2.3.3', '电子设备'),
          node('1.2.3.4', '测量仪器'),
          node('1.2.3.5', '武器与防护装备')
        ], { note: 'v4 扩展：新增武器与防护装备' }),
        node('1.2.4', '家居器物', [
          node('1.2.4.1', '家具'),
          node('1.2.4.2', '厨卫日用品')
        ]),
        node('1.2.5', '个护与清洁用品'),
        node('1.2.6', '办公、文具与出版物', [
          node('1.2.6.1', '文具'),
          node('1.2.6.2', '办公设备'),
          node('1.2.6.3', '书籍报刊音像制品')
        ], { note: 'v4 扩展' }),
        node('1.2.7', '乐器、体育与游戏器材'),
        node('1.2.8', '材料与原料'),
        node('1.2.9', '证件与票券实物'),
        node('1.2.10', '艺术品、文物与收藏品', [
          node('1.2.10.1', '画作'),
          node('1.2.10.2', '雕塑'),
          node('1.2.10.3', '古董'),
          node('1.2.10.4', '邮票藏品')
        ], { note: 'v4 新增' })
      ]),
      node('1.3', '建筑与场所', [
        node('1.3.1', '居住', [
          node('1.3.1.1', '房屋'),
          node('1.3.1.2', '公寓'),
          node('1.3.1.3', '房间')
        ]),
        node('1.3.2', '机构建筑', [
          node('1.3.2.1', '学校'),
          node('1.3.2.2', '医院'),
          node('1.3.2.3', '博物馆'),
          node('1.3.2.4', '商场')
        ]),
        node('1.3.3', '生产', [
          node('1.3.3.1', '农场'),
          node('1.3.3.2', '工厂'),
          node('1.3.3.3', '矿山')
        ]),
        node('1.3.4', '休闲景观', [
          node('1.3.4.1', '公园'),
          node('1.3.4.2', '广场'),
          node('1.3.4.3', '景点'),
          node('1.3.4.4', '娱乐场所')
        ]),
        node('1.3.5', '安全市政', [
          node('1.3.5.1', '警务消防'),
          node('1.3.5.2', '公共服务'),
          node('1.3.5.3', '市政设施'),
          node('1.3.5.4', '安防设施')
        ])
      ]),
      node('1.4', '自然地理 & 天体', [
        node('1.4.1', '地貌', [
          node('1.4.1.1', '山地与高地'),
          node('1.4.1.2', '高原、盆地与平原'),
          node('1.4.1.3', '谷地与荒漠'),
          node('1.4.1.4', '河湖与水体'),
          node('1.4.1.5', '海岸与海洋地貌')
        ], { note: 'v5：按地貌类型细分为 5 组，核心词 66 个' }),
        node('1.4.2', '自然资源', [
          node('1.4.2.1', '矿石'),
          node('1.4.2.2', '石油'),
          node('1.4.2.3', '木材')
        ]),
        node('1.4.3', '气象事物', [
          node('1.4.3.1', '雨'),
          node('1.4.3.2', '雪'),
          node('1.4.3.3', '风'),
          node('1.4.3.4', '云')
        ]),
        node('1.4.4', '天体宇宙', [
          node('1.4.4.1', '太阳'),
          node('1.4.4.2', '月亮'),
          node('1.4.4.3', '行星'),
          node('1.4.4.4', '星辰')
        ])
      ]),
      node('1.5', '交通出行', [
        node('1.5.1', '交通工具', [
          node('1.5.1.1', '陆上交通工具'),
          node('1.5.1.2', '水上交通工具'),
          node('1.5.1.3', '空中交通工具'),
          node('1.5.1.4', '新兴智能交通工具')
        ]),
        node('1.5.2', '交通基础设施'),
        node('1.5.3', '交通场站与枢纽'),
        node('1.5.4', '能源补给设施'),
        node('1.5.5', '交通工具部件与配件', [], { note: 'v4 新增' })
      ]),
      node('1.6', '医疗健康实体', [
        node('1.6.1', '医疗器械'),
        node('1.6.2', '药品药剂'),
        node('1.6.3', '医用耗材')
      ]),
      node('1.7', '货币商业实体', [
        node('1.7.1', '钱币资产实物'),
        node('1.7.2', '商品货物'),
        node('1.7.3', '包装容器')
      ])
    ], { note: '看得见摸得着的实体事物' }),

    /* ================= 主干 2：抽象概念 ================= */
    node('2', '抽象概念', [
      node('2.1', '动作行为', [
        node('2.1.1', '移动与出行'),
        node('2.1.2', '感官感知'),
        node('2.1.3', '交互沟通'),
        node('2.1.4', '创造加工'),
        node('2.1.5', '心理活动'),
        node('2.1.6', '经营管理'),
        node('2.1.7', '自然变化'),
        node('2.1.8', '学习阅读'),
        node('2.1.9', '饮食动作'),
        node('2.1.10', '运动行为'),
        node('2.1.11', '医疗诊治'),
        node('2.1.12', '交易买卖'),
        node('2.1.13', '家务与生活'),
        node('2.1.14', '求职与职场'),
        node('2.1.15', '法律与公民'),
        node('2.1.16', '存在与状态动词', [], { note: 'v4 新增：exist/seem/remain/become/appear' }),
        node('2.1.17', '所属与包含动词', [], { note: 'v4 新增：own/belong/contain/include/consist' }),
        node('2.1.18', '身体动作与表情动词', [], { note: 'v4 新增：sleep/breathe/cough/laugh/nod/hug' })
      ], { note: '动词，18 类' }),
      node('2.2', '属性特征', [
        node('2.2.1', '尺寸形状'),
        node('2.2.2', '颜色'),
        node('2.2.3', '年龄新旧'),
        node('2.2.4', '评价好坏'),
        node('2.2.5', '感官特征'),
        node('2.2.6', '情绪感受形容词', [
          node('2.2.6.1', '愉悦正向情绪'),
          node('2.2.6.2', '负面低落情绪'),
          node('2.2.6.3', '愤怒烦躁情绪'),
          node('2.2.6.4', '恐惧紧张情绪')
        ]),
        node('2.2.7', '数量程度 & 空间距离'),
        node('2.2.8', '健康状态'),
        node('2.2.9', '经济属性'),
        node('2.2.10', '性质判断', [], { note: 'v4：真伪、可能性、必要性' }),
        node('2.2.11', '天气与气候形容词', [], { note: 'v4 新增：sunny/rainy/windy/humid' })
      ], { note: '形容词，11 类' }),
      node('2.3', '心智情感', [
        node('2.3.1', '情绪感受名词'),
        node('2.3.2', '思维认知名词', [], { note: '想法、真相、记忆、逻辑、信息内容' }),
        node('2.3.3', '性格与品质名词'),
        node('2.3.4', '状态、变化与因果名词', [], { note: 'v4 新增：situation/cause/effect/result' }),
        node('2.3.5', '感知与感受名词', [], { note: 'v4 新增：sight/sound/taste/smell/feeling' })
      ], { note: '抽象名词' }),
      node('2.4', '时空计量', [
        node('2.4.1', '时间', [], { note: '年、月、时刻、时代' }),
        node('2.4.2', '度量', [
          node('2.4.2.1', '尺寸与长度'),
          node('2.4.2.2', '重量与质量'),
          node('2.4.2.3', '容量与含量'),
          node('2.4.2.4', '速度与比率'),
          node('2.4.2.5', '温度'),
          node('2.4.2.6', '数量与计数'),
          node('2.4.2.7', '度量单位', [
            node('2.4.2.7.1', '长度单位'),
            node('2.4.2.7.2', '重量单位'),
            node('2.4.2.7.3', '容量单位'),
            node('2.4.2.7.4', '烹饪小单位'),
            node('2.4.2.7.5', '其他常用单位')
          ])
        ], { note: 'v6：按度量类型分 7 组（度量单位再分 5 类），核心词 91 个' })
      ]),
      node('2.5', '社会与规则', [
        node('2.5.1', '组织机构', [], { note: '国家政府 / 公司企业 / 国际组织 / 非营利机构；政治概念挂靠 election/policy/party' }),
        node('2.5.2', '事件活动', [], { note: 'v4 扩展：社会事件 + 人生大事 birth/wedding/death/funeral/graduation' }),
        node('2.5.3', '文化、艺术与宗教', [], { note: 'v4 扩展：faith/ceremony/prayer 归此' }),
        node('2.5.4', '法律与制度规则'),
        node('2.5.5', '社会关系抽象名词'),
        node('2.5.6', '社会议题', [
          node('2.5.6.1', '贫困与福利'),
          node('2.5.6.2', '平等与权利'),
          node('2.5.6.3', '环境与生态'),
          node('2.5.6.4', '人口与社会结构'),
          node('2.5.6.5', '健康与公共危机'),
          node('2.5.6.6', '犯罪与安全'),
          node('2.5.6.7', '战争与和平')
        ], { note: 'v7：按议题类型分 7 组' })
      ]),
      node('2.6', '学习教育', [
        node('2.6.1', '学科科目'),
        node('2.6.2', '学习行为抽象'),
        node('2.6.3', '书本文具抽象概念'),
        node('2.6.4', '语言与符号概念', [], { note: 'v4 新增：word/name/meaning/grammar/symbol' })
      ]),
      node('2.7', '运动休闲', [
        node('2.7.1', '体育运动项目'),
        node('2.7.2', '娱乐休闲活动'),
        node('2.7.3', '游戏与爱好'),
        node('2.7.4', '旅行与旅游')
      ]),
      node('2.8', '医疗健康抽象', [
        node('2.8.1', '疾病症状'),
        node('2.8.2', '健康状态名词')
      ]),
      node('2.9', '商业经济', [
        node('2.9.1', '交易金融概念'),
        node('2.9.2', '成本价格概念'),
        node('2.9.3', '市场贸易概念'),
        node('2.9.4', '银行与金融')
      ]),
      node('2.10', '方位空间抽象', [
        node('2.10.1', '方位描述名词'),
        node('2.10.2', '方位状态描述')
      ]),
      node('2.11', '灾害、事故与风险', [
        node('2.11.1', '自然灾害'),
        node('2.11.2', '危险风险概念')
      ]),
      node('2.12', '科技、信息与媒体'),
      node('2.13', '副词', [
        node('2.13.1', '程度副词'),
        node('2.13.2', '频率副词'),
        node('2.13.3', '时间副词'),
        node('2.13.4', '方式副词'),
        node('2.13.5', '疑问副词', [], { note: 'when/where/why/how' }),
        node('2.13.6', '连接与评论副词', [], { note: 'however/therefore/obviously' }),
        node('2.13.7', '否定与限制副词', [], { note: 'v4 新增：not/never/hardly/barely/seldom' })
      ], { note: '副词单列 7 类' })
    ], { note: '动作、属性、情绪、规则、状态等不可见概念' }),

    /* ================= 主干 3：功能虚词 ================= */
    node('3', '功能虚词', [
      node('3.1', '基本助动词', [], { note: 'do / be / have；实义用法入 2.1，词条兼类' }),
      node('3.2', '情态助动词', [], { note: 'can/could/may/might/shall/should/will/would/must' }),
      node('3.3', '其他功能词', [], { posTags: ['prep.', 'conj.', 'art.', 'interj.'], note: '介词/连词/冠词/感叹词/粒子词（to）' })
    ], { note: '功能词：助动词与情态动词按其语法义项挂到 3.1/3.2，其余按词性命中' }),

    /* ================= 主干 4：数字、限定词与代词 ================= */
    node('4', '数字、限定词与代词', [
      node('4.1', '数字', [
        node('4.1.1', '基数词'),
        node('4.1.2', '序数词'),
        node('4.1.3', '分数、小数与百分数')
      ]),
      node('4.2', '限定词', [], { note: 'some / many / few / several / each' }),
      node('4.3', '代词', [], { posTag: 'pron.', note: '人称 / 物主 / 反身 / 指示 / 疑问 / 不定' })
    ], { note: 'v4 调整：代词从主干3 移入主干4' })
    ,
    /* ================= 主干 9：待归类（自动导入的词暂放这里） ================= */
    node('9', '待归类', [
      node('9.1', '待人工归类')
    ], { note: '批量导入且规则无法判定的词暂时放这里，人工细化后迁到正式分类' })
  ]);
  CATEGORY_TREE.level = 0;

  /* ============================================================
   * 三、索引
   * ============================================================ */
  const NODE_INDEX = {};
  const LEAF_NODES = [];

  function buildTreeIndex() {
    Object.keys(NODE_INDEX).forEach(function (k) { delete NODE_INDEX[k]; });
    LEAF_NODES.length = 0;
    function walk(n, names, parentCode) {
      const full = names.concat([n.name]);
      const isLeaf = !n.children || n.children.length === 0;
      const posList = n.posTag ? [n.posTag] : (n.posTags ? n.posTags.slice() : []);
      NODE_INDEX[n.code] = {
        node: n,
        code: n.code,
        name: n.name,
        level: n.level,
        names: full,
        pathText: full.join(' > '),
        tagPath: full.slice(1).join('>'),
        parentCode: parentCode,
        isLeaf: isLeaf,
        bindType: posList.length ? 'pos' : 'semantic',
        posTag: posList[0] || null,
        posTags: posList,
        note: n.note || ''
      };
      if (isLeaf && n.code !== '0') LEAF_NODES.push(NODE_INDEX[n.code]);
      (n.children || []).forEach(function (c) { walk(c, full, n.code); });
    }
    walk(CATEGORY_TREE, [], null);
  }
  buildTreeIndex();

  /* ============================================================
   * 四、用户覆盖层（改名字 / 改备注 / 新增末级分类）
   *   节点 code 是主键（释义标签、词库收藏、用户标签、复习范围都在引用），
   *   所以只能改「显示名」和「备注」，绝不改 code；改动全都能一键还原。
   * ============================================================ */
  const ORIG_NAMES = Object.create(null);
  const ORIG_NOTES = Object.create(null);
  Object.keys(NODE_INDEX).forEach(function (code) {
    ORIG_NAMES[code] = NODE_INDEX[code].name;
    ORIG_NOTES[code] = NODE_INDEX[code].note || '';
  });
  let USER_ADDED_CODES = [];      // 用户新增的末级分类（可整体撤掉）

  /** 给某个父节点算一个没被占用的子节点 code（沿用 1.2.3 → 1.2.3.4 这套编号） */
  function nextChildCode(parentCode) {
    const parent = NODE_INDEX[parentCode];
    const used = Object.create(null);
    (parent && parent.node && parent.node.children || []).forEach(function (c) { used[c.code] = true; });
    Object.keys(NODE_INDEX).forEach(function (c) { used[c] = true; });
    let i = 1;
    while (used[parentCode + '.' + i]) i++;
    return parentCode + '.' + i;
  }

  function removeNode(code) {
    const info = NODE_INDEX[code];
    if (!info) return;
    const parent = NODE_INDEX[info.parentCode];
    if (parent && parent.node && parent.node.children) {
      parent.node.children = parent.node.children.filter(function (c) { return c.code !== code; });
    }
  }

  /**
   * 套用用户覆盖层（可以反复调用：每次都先回到原始树再套一遍）
   * @param {object} overlay { names:{code:新名}, notes:{code:备注}, added:[{parent,name}] }
   */
  function applyOverlay(overlay) {
    const ov = overlay || {};

    // ① 撤掉上一轮用户新增的节点
    USER_ADDED_CODES.forEach(function (code) { removeNode(code); });
    USER_ADDED_CODES = [];

    // ② 名字 / 备注 → 回到原始
    Object.keys(ORIG_NAMES).forEach(function (code) {
      const n = nodeByCode(code);
      if (!n) return;
      n.name = ORIG_NAMES[code];
      n.note = ORIG_NOTES[code];
    });

    // ③ 套用用户的改名 / 备注
    Object.keys(ov.names || {}).forEach(function (code) {
      const n = nodeByCode(code);
      if (n && String(ov.names[code] || '').trim()) n.name = String(ov.names[code]).trim();
    });
    Object.keys(ov.notes || {}).forEach(function (code) {
      const n = nodeByCode(code);
      if (n) n.note = String(ov.notes[code] || '');
    });

    // ④ 用户新增的末级分类
    (ov.added || []).forEach(function (item) {
      const parent = nodeByCode(item.parent);
      if (!parent || !item.name) return;
      const code = item.code || nextChildCode(item.parent);
      if (nodeByCode(code)) return;                       // 内置树上已经有这个 code 就跳过
      if (!parent.children) parent.children = [];
      parent.children.push({
        code: code, name: String(item.name).trim(), children: [],
        level: (parent.level || 0) + 1, __userAdded: true
      });
      USER_ADDED_CODES.push(code);
    });

    // ⑤ 重建索引（路径、tagPath、末级列表全部跟着重算）
    buildTreeIndex();
    return { added: USER_ADDED_CODES.length };
  }

  /** 在原始树里按 code 找节点对象（不依赖索引，索引会被重建） */
  function nodeByCode(code) {
    let hit = null;
    (function walk(n) {
      if (hit) return;
      if (n.code === code) { hit = n; return; }
      (n.children || []).forEach(walk);
    })(CATEGORY_TREE);
    return hit;
  }

  function userAddedCodes() { return USER_ADDED_CODES.slice(); }
  function originalName(code) { return ORIG_NAMES[code] || ''; }

  function getNode(code) { return NODE_INDEX[code] || null; }
  function leaves() { return LEAF_NODES.slice(); }

  // 浏览器里：加载时就把用户改过的分类名 / 新增分类套上去
  // （Node 构建与测试没有 localStorage，会直接跳过，交付物永远是原始树）
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('yy_tree_overlay');
      if (raw) applyOverlay(JSON.parse(raw) || {});
    }
  } catch (e) { /* 坏数据忽略 */ }

  return {
    POS_TAGS: POS_TAGS,
    POS_MAP: POS_MAP,
    CATEGORY_TREE: CATEGORY_TREE,
    NODE_INDEX: NODE_INDEX,
    LEAF_NODES: LEAF_NODES,
    getNode: getNode,
    leaves: leaves,
    applyOverlay: applyOverlay,
    nodeByCode: nodeByCode,
    nextChildCode: nextChildCode,
    userAddedCodes: userAddedCodes,
    originalName: originalName
  };
});
