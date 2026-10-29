/*!
 * Snow Lexis · 交互层
 * 页面：首页 / 搜索结果 / 词库列表 / 我的收藏 / 卡片背诵（+ 词库树弹窗）
 * 路由：hash 路由，双击 index.html 即可运行，无需后端（数据存 localStorage）
 */
(function () {
  'use strict';

  const D = window.YY_DATA;
  const R = window.YY_REVIEW;
  const YY_API = window.YY_API || { enabled: function () { return false; }, loggedIn: function () { return false; }, user: null };
  const store = R.createStore();
  const ReviewStore = store.ReviewStore;
  const CollectionStore = store.CollectionStore;
  const LibraryStore = store.LibraryStore;
  const StudyLog = store.StudyLog;

  const FRONT_HEIGHT = 320;

  /** 正反面高度按窗口自适应：半屏 / 矮窗口时收窄，避免评级按钮被挤出视口 */
  function frontHeight() {
    const h = (typeof window !== 'undefined' && window.innerHeight) || 900;
    return Math.max(190, Math.min(FRONT_HEIGHT, Math.round(h * 0.46)));
  }
  function maxBackHeight() {
    const h = (typeof window !== 'undefined' && window.innerHeight) || 900;
    return Math.max(240, Math.round(h * 0.6));
  }

  /* ============================================================
   * 通用工具
   * ============================================================ */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 层级路径渲染：pathText 用 " > " 分段，tagPath 用 ">" 分段 */
  function crumb(sep, text) {
    return String(text || '')
      .split(sep)
      .map(function (part) { return esc(part.trim()); })
      .join(' <span class="crumb-sep">›</span> ');
  }
  function pathBreadcrumb(pathText) { return crumb(' > ', pathText); }
  function tagBreadcrumb(tagPath) { return crumb('>', tagPath); }

  let toastTimer = null;
  function toast(message) {
    const box = $('#toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('is-show'); }, 2600);
  }

  /**
   * 释义配图
   * 占位链接（placeholder-img.example）根本不存在，浏览器只会显示破图，
   * 因此这里改为「本地即时生成 SVG」：不依赖网络、离线也能看到，
   * 图上是单词 + 中文释义 + 语义标签；一旦把 image_url 换成真实图片地址，
   * 就会优先加载真实图片，加载失败再自动降级回这张 SVG。
   */
  function hashHue(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function isPlaceholderImage(url) {
    return !url || url.indexOf('placeholder-img.example') > -1;
  }

  /* 离线兜底用的“该事物图形符号”：
     先按单词查（覆盖常用词），再按所属语义分支查（覆盖整类），最后给个通用书本 */
  const WORD_EMOJI = {
    apple: '🍎', banana: '🍌', grape: '🍇', pear: '🍐', peach: '🍑', lemon: '🍋', strawberry: '🍓',
    watermelon: '🍉', mango: '🥭', orange: '🍊', potato: '🥔', tomato: '🍅', carrot: '🥕', cabbage: '🥬',
    onion: '🧅', cucumber: '🥒', pumpkin: '🎃', garlic: '🧄', corn: '🌽', rice: '🍚', wheat: '🌾',
    bread: '🍞', noodle: '🍜', porridge: '🥣', dumpling: '🥟', pizza: '🍕', sandwich: '🥪', meat: '🍖',
    beef: '🥩', pork: '🥓', lamb: '🍖', sausage: '🌭', ham: '🍖', egg: '🥚', milk: '🥛', cheese: '🧀',
    butter: '🧈', cream: '🍦', salt: '🧂', sugar: '🍬', honey: '🍯', pepper: '🌶️', cake: '🍰', candy: '🍬',
    chocolate: '🍫', biscuit: '🍪', coffee: '☕', tea: '🍵', juice: '🧃', wine: '🍷', beer: '🍺', soup: '🍲',
    water: '💧', fire: '🔥', sun: '☀️', moon: '🌙', star: '⭐', cloud: '☁️', rain: '🌧️', snow: '❄️',
    wind: '🌬️', thunder: '⛈️', rainbow: '🌈', mountain: '⛰️', hill: '🏔️', river: '🏞️', lake: '🏞️',
    sea: '🌊', ocean: '🌊', beach: '🏖️', island: '🏝️', forest: '🌲', tree: '🌳', pine: '🌲', flower: '🌸',
    rose: '🌹', grass: '🌿', leaf: '🍃', root: '🌱', crop: '🌾', cotton: '🌱',
    dog: '🐕', cat: '🐈', horse: '🐎', cow: '🐄', pig: '🐖', sheep: '🐑', rabbit: '🐇', tiger: '🐅',
    lion: '🦁', elephant: '🐘', monkey: '🐒', mouse: '🐁', bird: '🐦', chicken: '🐔', duck: '🦆', goose: '🦢',
    eagle: '🦅', owl: '🦉', fish: '🐟', whale: '🐋', shark: '🦈', dolphin: '🐬', crab: '🦀', shrimp: '🦐',
    bee: '🐝', ant: '🐜', fly: '🪰', mosquito: '🦟', butterfly: '🦋', snake: '🐍', turtle: '🐢', lizard: '🦎',
    frog: '🐸', toad: '🐸',
    head: '🙂', hair: '💇', face: '🙂', eye: '👁️', ear: '👂', nose: '👃', mouth: '👄', tooth: '🦷',
    hand: '✋', arm: '💪', heart: '❤️', brain: '🧠', skin: '🖐️', bone: '🦴', finger: '👆', shoulder: '🤷',
    blood: '🩸', voice: '🗣️', mother: '👩', father: '👨', parent: '👪', sister: '👧', brother: '👦',
    son: '👦', daughter: '👧', family: '👨‍👩‍👧', uncle: '👨', aunt: '👩', baby: '👶', child: '🧒',
    doctor: '🩺', teacher: '👩‍🏫', student: '🧑‍🎓', nurse: '👩‍⚕️', lawyer: '⚖️', engineer: '👷',
    soldier: '🪖', police: '👮', manager: '👔', singer: '🎤', cook: '👨‍🍳', driver: '🚗', pilot: '✈️',
    firefighter: '🚒', guard: '💂', farmer: '👨‍🌾', scientist: '🔬', writer: '✍️', artist: '🎨',
    car: '🚗', taxi: '🚕', truck: '🚚', van: '🚐', jeep: '🚙', tire: '🛞', wheel: '🛞', bicycle: '🚲',
    bike: '🚲', train: '🚆', subway: '🚇', metro: '🚇', railway: '🛤️', wagon: '🚃', bus: '🚌', coach: '🚌',
    tram: '🚊', ship: '🚢', boat: '⛵', ferry: '⛴️', sail: '⛵', yacht: '🛥️', canoe: '🛶', raft: '🛶',
    submarine: '🚤', anchor: '⚓', propeller: '🌀', plane: '✈️', airplane: '✈️', jet: '🛩️', flight: '🛫',
    airport: '🛫', helicopter: '🚁', parachute: '🪂', drone: '🛸', scooter: '🛴', shuttle: '🚐', rocket: '🚀',
    road: '🛣️', street: '🛣️', avenue: '🛣️', highway: '🛣️', lane: '🛣️', route: '🗺️', path: '🛤️',
    bridge: '🌉', tunnel: '🚇', station: '🚉', platform: '🚉', port: '⚓', garage: '🅿️',
    house: '🏠', home: '🏠', roof: '🏠', wall: '🧱', door: '🚪', window: '🪟', yard: '🏡', flat: '🏢',
    apartment: '🏢', elevator: '🛗', balcony: '🏙️', room: '🛋️', bedroom: '🛏️', bathroom: '🛁',
    kitchen: '🍳', floor: '🧹', ceiling: '🏠', corner: '📐', school: '🏫', classroom: '🏫', library: '📚',
    playground: '🛝', campus: '🏫', college: '🎓', university: '🎓', hospital: '🏥', clinic: '🏥',
    pharmacy: '💊', ward: '🛏️', museum: '🏛️', gallery: '🖼️', exhibition: '🖼️', monument: '🗿',
    market: '🏪', shop: '🏪', store: '🏪', supermarket: '🛒', mall: '🏬', farm: '🚜', field: '🌾',
    barn: '🏚️', garden: '🌷', greenhouse: '🌡️', factory: '🏭', workshop: '🔧', mill: '🏭', industry: '🏭',
    chimney: '🏭', mine: '⛏️', coal: '⚫', quarry: '⛏️', park: '🏞️', plaza: '🏙️', scenery: '🏞️',
    attraction: '🎡', landmark: '🗼', resort: '🏖️', cinema: '🎬', theater: '🎭', stadium: '🏟️', gym: '🏋️',
    zoo: '🦓', club: '🎪', jail: '🚔', post: '📮', office: '🏢', hall: '🏛️', lamp: '💡', bin: '🗑️',
    fountain: '⛲', lock: '🔒', alarm: '🚨', fence: '🚧', key: '🔑',
    book: '📖', notebook: '📓', paper: '📄', dictionary: '📕', magazine: '📰', newspaper: '📰',
    textbook: '📗', pen: '🖊️', pencil: '✏️', eraser: '🧽', ink: '🖋️', ruler: '📏', scissors: '✂️',
    glue: '🧴', marker: '🖍️', printer: '🖨️', copier: '🖨️', scanner: '🖨️', projector: '📽️',
    computer: '💻', phone: '📱', radio: '📻', television: '📺', camera: '📷', battery: '🔋', screen: '🖥️',
    keyboard: '⌨️', clock: '🕐', watch: '⌚', scale: '⚖️', meter: '📏', thermometer: '🌡️', microscope: '🔬',
    telescope: '🔭', hammer: '🔨', knife: '🔪', nail: '🔩', rope: '🪢', brush: '🖌️', ladder: '🪜',
    needle: '🪡', machine: '⚙️', engine: '⚙️', motor: '⚙️', pump: '⚙️', robot: '🤖', weapon: '🔫',
    gun: '🔫', sword: '⚔️', shield: '🛡️', helmet: '⛑️', bullet: '🔫',
    coat: '🧥', shirt: '👕', dress: '👗', trousers: '👖', skirt: '👗', jacket: '🧥', sweater: '🧶',
    uniform: '👮', cloth: '🧵', shoe: '👟', boot: '👢', sock: '🧦', hat: '👒', cap: '🧢', ring: '💍',
    necklace: '📿', glasses: '👓', scarf: '🧣', bag: '👜', luggage: '🧳', suitcase: '🧳',
    backpack: '🎒', briefcase: '💼', glove: '🧤', mask: '😷',
    soap: '🧼', towel: '🧺', mirror: '🪞', cup: '🥤', plate: '🍽️', spoon: '🥄', fork: '🍴', pot: '🍲',
    box: '📦', bottle: '🍾', jar: '🫙', package: '📦', basket: '🧺', container: '📦', shampoo: '🧴',
    toothpaste: '🪥', toothbrush: '🪥', comb: '💈', razor: '🪒', perfume: '💐', tissue: '🧻',
    detergent: '🧴', piano: '🎹', guitar: '🎸', violin: '🎻', drum: '🥁', flute: '🎺', trumpet: '🎺',
    ball: '⚽', racket: '🎾', football: '⚽', basketball: '🏀', volleyball: '🏐', tennis: '🎾',
    baseball: '⚾', badminton: '🏸', golf: '⛳', marathon: '🏃', chess: '♟️', toy: '🧸', puzzle: '🧩',
    kite: '🪁', doll: '🪆', balloon: '🎈', stamp: '📮',
    money: '💰', coin: '🪙', cash: '💵', wallet: '👛', purse: '👛', cheque: '📝', goods: '📦',
    product: '📦', item: '📦', cargo: '🚚', merchandise: '🛍️',
    medicine: '💊', drug: '💊', pill: '💊', tablet: '💊', capsule: '💊', vitamin: '🍊',
    bandage: '🩹', gauze: '🩹', syringe: '💉', wheelchair: '♿', 'X-ray': '🩻', stethoscope: '🩺',
    painting: '🖼️', drawing: '✏️', portrait: '🖼️', sculpture: '🗿', statue: '🗿', antique: '🏺',
    relic: '🏺', collection: '📚', metal: '🔩', plastic: '🧴', glass: '🥛', rubber: '🛞', leather: '🧳',
    wool: '🧶', silk: '🧵', cement: '🧱', clay: '🏺', material: '🧱', gold: '🥇', silver: '🥈',
    iron: '🔧', copper: '🔩', diamond: '💎', stone: '🪨', ore: '🪨', oil: '🛢️', gas: '⛽', fuel: '⛽',
    petrol: '⛽', wood: '🪵', timber: '🪵', log: '🪵', board: '🪵',
    food: '🍽️', fruit: '🍎', vegetable: '🥦', salad: '🥗', mushroom: '🍄', nut: '🥜', bean: '🫘',
    dessert: '🍮', ice: '🧊', frost: '❄️', hail: '🌨️', fog: '🌫️', mist: '🌫️', sky: '🌤️',
    sunshine: '🌞', dawn: '🌅', sunset: '🌇', moonlight: '🌙', eclipse: '🌘', planet: '🪐', earth: '🌍',
    orbit: '🛰️', space: '🚀', gravity: '🍎', galaxy: '🌌', comet: '☄️', universe: '🌌',
    bacteria: '🦠', bacterium: '🦠', germ: '🦠', microbe: '🦠', virus: '🦠', viral: '🦠', epidemic: '🦠',
    fungus: '🍄', mold: '🦠', yeast: '🍞',
    bread_loaf: '🍞',
    /* 地貌（1.4.1 的 5 组） */
    summit: '🏔️', 'mountain range': '🏔️', ridge: '⛰️', slope: '📐', crag: '🪨', foothill: '⛰️',
    highland: '⛰️', pass: '🏔️', volcano: '🌋', plateau: '🏞️', basin: '🥣', plain: '🌾',
    prairie: '🌾', steppe: '🌾', tundra: '❄️', mesa: '🏜️', lowland: '🌾', canyon: '🏞️', gorge: '🏞️',
    ravine: '🕳️', desert: '🏜️', dune: '🏜️', oasis: '🌴', cave: '🕳️', cavern: '🕳️', glacier: '🧊',
    iceberg: '🧊', creek: '🏞️', brook: '🏞️', tributary: '🏞️', rapids: '🌊', delta: '🏞️',
    source: '💧', lagoon: '🏝️', reservoir: '🚰', shore: '🏖️', gulf: '🌊', strait: '🌊', cape: '🗺️',
    isthmus: '🗺️', archipelago: '🏝️', reef: '🪸', 'coral reef': '🪸', estuary: '🌊', current: '🌊',
    fjord: '🏔️',
    /* 度量（2.4.2 的 7 组） */
    length: '📏', width: '↔️', height: '📐', depth: '⬇️', breadth: '↔️', thickness: '📏',
    diameter: '⭕', radius: '⭕', circumference: '⭕', perimeter: '⬜', area: '🟦', dimension: '📐',
    distance: '📍', altitude: '⛰️', elevation: '⛰️', 'sea level': '🌊', extent: '📏', volume: '📦',
    size: '📐', weight: '⚖️', mass: '⚖️', density: '🧪', load: '📦', 'net weight': '⚖️',
    capacity: '🥤', contents: '📦', gallon: '⛽', speed: '💨', velocity: '💨', pace: '🏃',
    rate: '📊', acceleration: '🚀', frequency: '📶', rpm: '⚙️', temperature: '🌡️', degree: '🌡️',
    Celsius: '🌡️', centigrade: '🌡️', Fahrenheit: '🌡️', Kelvin: '🌡️', 'boiling point': '♨️',
    'freezing point': '🧊', 'room temperature': '🏠', quantity: '🔢', amount: '🔢', sum: '➕',
    total: '🧮', count: '🔢', portion: '🍰', ratio: '📊', proportion: '📊', percentage: '💯',
    average: '📊', maximum: '⬆️', minimum: '⬇️', fraction: '🔢', score: '🔢',
    millimeter: '📏', centimeter: '📏', meter: '📏', kilometer: '🛣️', inch: '📏', foot: '🦶',
    yard: '📏', mile: '🛣️', 'nautical mile': '⚓', 'light-year': '🌌', milligram: '⚖️',
    gram: '⚖️', kilogram: '⚖️', kilo: '⚖️', tonne: '🏋️', ton: '🏋️', pound: '⚖️', ounce: '⚖️',
    stone: '⚖️', milliliter: '🧪', liter: '🥤', quart: '🥤', pint: '🍺', barrel: '🛢️', cup: '☕',
    tablespoon: '🥄', teaspoon: '🥄', hectare: '🌾', acre: '🌾', 'square meter': '📐',
    carat: '💎', calorie: '🍎', decibel: '🔊', unit: '📐'
  };

  const LEAF_EMOJI = {
    '1.1.1.1': '🙂', '1.1.1.2': '🩺', '1.1.1.3': '👪', '1.1.1.4': '🧑', '1.1.2.1': '🐾', '1.1.2.2': '🐦',
    '1.1.2.3': '🐟', '1.1.2.4': '🐝', '1.1.2.5': '🐍', '1.1.2.6': '🐸', '1.1.3.1': '🌳', '1.1.3.2': '🌸',
    '1.1.3.3': '🍎', '1.1.3.4': '🥦', '1.1.3.5': '🌾', '1.1.4.1': '🦠', '1.1.4.2': '🦠', '1.1.4.3': '🍄',
    '1.2.1.1': '🍞', '1.2.1.2': '🥩', '1.2.1.3': '🥛', '1.2.1.4': '🥗', '1.2.1.5': '🧂', '1.2.1.6': '🍰',
    '1.2.1.7': '🥤', '1.2.2.1': '👕', '1.2.2.2': '👟', '1.2.2.3': '💍', '1.2.2.4': '🧳', '1.2.3.1': '🔨',
    '1.2.3.2': '⚙️', '1.2.3.3': '💻', '1.2.3.4': '📏', '1.2.3.5': '🛡️', '1.2.4.1': '🛋️', '1.2.4.2': '🍽️',
    '1.2.5': '🧴', '1.2.6.1': '✏️', '1.2.6.2': '🖨️', '1.2.6.3': '📚', '1.2.7': '🎸', '1.2.8': '🧱',
    '1.2.9': '🪪', '1.2.10.1': '🖼️', '1.2.10.2': '🗿', '1.2.10.3': '🏺', '1.2.10.4': '📮',
    '1.3.1.1': '🏠', '1.3.1.2': '🏢', '1.3.1.3': '🛋️', '1.3.2.1': '🏫', '1.3.2.2': '🏥', '1.3.2.3': '🏛️',
    '1.3.2.4': '🏬', '1.3.3.1': '🚜', '1.3.3.2': '🏭', '1.3.3.3': '⛏️', '1.3.4.1': '🏞️', '1.3.4.2': '🏙️',
    '1.3.4.3': '🗼', '1.3.4.4': '🎬', '1.3.5.1': '🚔', '1.3.5.2': '🏛️', '1.3.5.3': '💡', '1.3.5.4': '🔒',
    '1.4.1.1': '🏔️', '1.4.1.2': '🌾', '1.4.1.3': '🏜️', '1.4.1.4': '🏞️', '1.4.1.5': '🏖️', '1.4.2.1': '🪨',
    '1.4.2.2': '🛢️', '1.4.2.3': '🪵', '1.4.3.1': '🌧️', '1.4.3.2': '❄️', '1.4.3.3': '🌬️', '1.4.3.4': '☁️',
    '1.4.4.1': '☀️', '1.4.4.2': '🌙', '1.4.4.3': '🪐', '1.4.4.4': '⭐',
    '1.5.1.1': '🚗', '1.5.1.2': '🚢', '1.5.1.3': '✈️', '1.5.1.4': '🛸', '1.5.2': '🛣️', '1.5.3': '🚉',
    '1.5.4': '⛽', '1.5.5': '🛞', '1.6.1': '🩺', '1.6.2': '💊', '1.6.3': '🩹', '1.7.1': '💰', '1.7.2': '📦',
    '1.7.3': '📦', '2.6.1': '🔬', '2.6.2': '📝', '2.6.3': '📖', '2.6.4': '🔤', '2.7.1': '⚽', '2.7.2': '🎡',
    '2.7.3': '🧩', '2.7.4': '🧳', '2.8.1': '🤒', '2.8.2': '💪', '2.9.1': '🏦', '2.9.2': '💲', '2.9.3': '🛒',
    '2.9.4': '🏦', '2.10.1': '🧭', '2.10.2': '🧭', '2.11.1': '🌋', '2.11.2': '⚠️', '2.12': '📡',
    '2.13.1': '📈', '2.13.2': '🔁', '2.13.3': '⏰', '2.13.4': '🚶', '2.13.5': '❓', '2.13.6': '🔗',
    '2.13.7': '🚫',
    '2.4.2.1': '📏', '2.4.2.2': '⚖️', '2.4.2.3': '🥤', '2.4.2.4': '💨', '2.4.2.5': '🌡️',
    '2.4.2.6': '🔢', '2.4.2.7.1': '📏', '2.4.2.7.2': '⚖️', '2.4.2.7.3': '🧪',
    '2.4.2.7.4': '🥄', '2.4.2.7.5': '📐'
  };

  function emojiFor(word, leafCode) {
    const key = String(word || '').toLowerCase();
    if (WORD_EMOJI[key]) return WORD_EMOJI[key];
    if (leafCode && LEAF_EMOJI[leafCode]) return LEAF_EMOJI[leafCode];
    return '📘';
  }

  function placeholderSvg(word, chinese, tag, leafCode, seed) {
    // 色调按「单词 + 释义」算：同一个单词的不同意思，占位图颜色和表情都不一样，
    // 一眼就能看出「图片跟着这条释义走」，而不是整张卡共用一张图。
    // seed 是「换一张」用的：点一次换一套配色/图标，满意了再「就用这张」定稿。
    const hue = hashHue(String(word) + '|' + String(chinese || '') + '|' + (Number(seed) || 0));
    const bg1 = 'hsl(' + hue + ', 26%, 96%)';
    const bg2 = 'hsl(' + hue + ', 22%, 87%)';
    const line = 'hsl(' + hue + ', 18%, 72%)';
    const text = String(word || '');
    const subText = String(chinese || '');
    const tagText = String(tag || '');
    const emoji = emojiFor(text, leafCode) || '📘';
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="320" height="200" fill="url(#g)"/>' +
      '<rect x="8" y="8" width="304" height="184" rx="12" fill="none" stroke="' + line + '" stroke-dasharray="6 6"/>' +
      (tagText ? '<text x="20" y="30" font-family="Segoe UI, PingFang SC, sans-serif" font-size="11" fill="#6b778a">' + esc(tagText) + '</text>' : '') +
      '<text x="160" y="98" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif" font-size="62">' + esc(emoji) + '</text>' +
      '<text x="160" y="136" text-anchor="middle" font-family="Segoe UI, PingFang SC, sans-serif" font-size="24" font-weight="600" fill="#2b3441">' + esc(text) + '</text>' +
      '<text x="160" y="158" text-anchor="middle" font-family="Segoe UI, PingFang SC, sans-serif" font-size="13" fill="#5b6779">' + esc(subText) + '</text>' +
      '<text x="160" y="180" text-anchor="middle" font-family="Segoe UI, PingFang SC, sans-serif" font-size="10" fill="#9aa5b4">本地图形占位 · 联网后自动换成真实照片</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ============================================================
   * 配图：单词所指东西的真实照片
   * 取值顺序：
   *   ① assets/js/images.js 里指定的图（你自己放的图 / 抓好的图）
   *   ② 释义自带 image_url（且不是占位域名）
   *   ③ 运行时联网获取：维基百科该词条配图 → LoremFlickr 关键词照片
   *   ④ 全部失败 → 本地生成 SVG（保证永远不出现破图）
   * ============================================================ */
  const WORD_IMAGES = window.YY_WORD_IMAGES || {};
  const IMG_CACHE_KEY = 'yy_img_cache_v1';
  const IMG_MAX_PARALLEL = 4;
  /* 词库页分页：一次渲染多少张卡片（28k 词后最大的分支有 4000+ 词） */
  const LIBRARY_PAGE = 80;
  const SEARCH_MAX = 120;
  const libLimits = {};
  let lastRouteKey = null;      // 上一次渲染的页面标识（用来判断"同页重绘"还是"换页"）
  let imgCache = (function () {
    try { return JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
  })();
  const imgWaiting = {};
  const imgQueue = [];
  let imgActive = 0;

  function saveImgCache() {
    try { localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(imgCache)); } catch (e) { /* 忽略 */ }
  }
  /** 缓存里存的可能是老格式（纯地址字符串）或新格式 { url, from } */
  function cachedPhoto(key) {
    const k = String(key || '').toLowerCase();
    let v = imgCache[k];
    if (!v) {
      // 内存里没有就回读一次 localStorage（另一个标签页/另一个卡片刚找到图时也能看到）
      try {
        const all = JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || '{}') || {};
        if (all[k]) { imgCache[k] = all[k]; v = all[k]; }
      } catch (e) { /* 忽略 */ }
    }
    if (!v) return null;
    if (typeof v === 'string') return { url: v, from: '' };
    return v.url ? { url: v.url, from: v.from || '' } : null;
  }
  function putCachedPhoto(key, url, from) {
    imgCache[String(key || '').toLowerCase()] = { url: url, from: from || '', at: Date.now() };
    saveImgCache();
  }

  /** 取已备好的真实图片地址（images.js 或释义里的真实 http 地址） */
  function preparedImage(sense, word) {
    const key = String(word || '').toLowerCase();
    // 释义自己指定的配图优先（一条释义一张图）：编辑过图片的释义，绝不被整词图顶掉
    if (sense.image_url && !isPlaceholderImage(sense.image_url)) return sense.image_url;
    const baked = WORD_IMAGES[key] || WORD_IMAGES[word];
    if (baked && !isPlaceholderImage(baked)) return baked;
    return '';
  }

  /* ============================================================
   * 视图：完整教程（分组折叠 + 「去试一下」直达对应页面）
   * ============================================================ */
  const GUIDE_GROUPS = [
    {
      id: 'find', title: '一、找词：搜索 + 词库树',
      items: [
        '搜索框支持<b>中英文双向</b>：输 <code>bank</code> 或 <code>银行</code> 都行，回车即搜。',
        '搜到的是<b>单词卡</b>：一个单词一张卡，卡片里把它的多条释义聚合在一起，每条释义各带词性、语义标签、英/美音标、发音按钮和配图。',
        '卡片底部「所属词库分支」：这个词还属于哪些词库，点一下直接跳过去。',
        '<b>词库树</b>：主干 → 一级 → 二级 → 末级，<b>选到最末一级</b>才能「打开词库」。',
        '<b>收藏</b>：卡片右上角 ☆ 收藏单个词；词库页顶部「☆ 收藏该词库」订阅整个分类（以后该分类新增的词自动进来）。'
      ],
      try: [{ label: '去搜一个词（bank）', href: '#/search?q=bank' }, { label: '打开词库树', action: 'open-tree' }]
    },
    {
      id: 'study', title: '二、背单词：翻转卡片 + 记忆曲线',
      items: [
        '首页「<b>今日学习</b>」卡片：可以给今天挑一个<b>目标词库</b>，进度条显示今天在这个词库里背了多少；「待复盘」是到期的词，一键就能复习。',
        '卡片里的「<b>昨天学过</b>」点进去，就是昨天那批词（按词库分开），可以单独复习这一批。',
        '词库页顶部「<b>开始学习</b>」→ 进入翻转卡片：正面只有英文，点一下翻面看释义、音标、发音、配图。',
        '翻面后选 <b>【忘记】【模糊】【记住】</b>，系统自动算下次复习时间并在合适的时候把词重新排进「今日复习」。',
        '熟悉度 0~5 级，间隔：5 分钟 → 30 分钟 → 2 小时 → 12 小时 → 1 天 → 2 天；<b>忘记</b>直接回 0 级，<b>模糊</b>降一级。',
        '首页「今日复习」显示待复习 / 新词 / 已排期；「我的收藏」里两个标签页也都能开始学习。',
        '键盘也能背：空格翻面，1 / 2 / 3 对应忘记 / 模糊 / 记住。'
      ],
      try: [{ label: '开始学习（全部单词）', action: 'study', scope: 'all' }, { label: '回首页看今日学习', href: '#/' }]
    },
    {
      id: 'edit', title: '三、改内容：编辑卡片与配图',
      items: [
        '卡片右上角 <b>⋯ → 编辑卡片</b>：改中文释义、改词性、换配图、<b>添加一条释义</b>、<b>删除释义</b>（删除会先弹确认框）。',
        '配图有四种状态：<b>自动生成</b>（本地画的占位图，不联网也不破图）／<b>自动找到的真实照片</b>／<b>已保留</b>（定稿，不再自动换）／<b>自定义链接或本地上传</b>。',
        '「<b>↻ 换占位图</b>」换一套配色和图标；「<b>🔍 换真实照片</b>」按这条释义的中文关键词联网找 <b>3 张候选</b>，挑一张就用；满意再「<b>✓ 就用这张</b>」定稿。',
        '改错了不要紧：编辑器页脚「恢复原样」，或卡片 ⋯ 菜单里的「↺ 撤销编辑」都能还原。',
        '所有改动只影响你自己的账号，词库原始数据不动。'
      ],
      try: [{ label: '去搜一个词，点 ⋯ 试编辑', href: '#/search?q=treadmill' }]
    },
    {
      id: 'organize', title: '四、整理词库：放进词库 / 导入新词 / 改分类',
      items: [
        '⋯ → <b>放进词库</b>：选末级分类后确认。<b>加入</b> = 原来的词库保留，两边都能看到；<b>移入</b> = 只归新词库，旧分支不再显示（面板里会写清「现在在：xxx」）。',
        '移入错了：卡片 ⋯ 菜单里的「<b>↺ 恢复系统分类</b>」一键撤销。',
        '词库树弹窗右上角「<b>✎ 编辑分类名</b>」：改分类名、加备注、在任意分类下<b>新增末级分类</b>，随时「恢复默认」。',
        '词库页顶部「<b>＋ 导入新词</b>」：单个导入（音标会自动补齐）或批量导入（一行一个词，支持「单词|词性|释义|英音|美音|备注」），导入的词只属于你自己的账号。'
      ],
      try: [{ label: '打开词库树', action: 'open-tree' }, { label: '去词库页导入', href: '#/library?code=2.5.6.3' }]
    },
    {
      id: 'data', title: '五、别丢数据：账号同步 + 备份',
      items: [
        '设置 → <b>账号与同步</b>：注册一个账号（或用自己的同步码登录），进度、收藏、自己导入的词和改动都会存到服务器，手机和电脑用同一个账号即可同步。',
        '设置 → <b>数据</b>：<b>导出备份文件</b>（存成 JSON，换电脑靠它）、<b>导入备份恢复</b>、<b>自动备份到本地文件</b>（授权一次，之后自动写盘）、<b>恢复上一份本地快照</b>。',
        '<b>手机上怎么用</b>：电脑上双击 start-server.bat（窗口别关）→ 设置 → <b>手机访问</b>里直接显示该用哪个地址（一键复制），手机连同一 WiFi 打开即可；打不开就按那里的提示用管理员 PowerShell 放行端口。想让地址固定不变，见 README「让地址永远不变」。',
        '会丢数据的情况：浏览器「清除浏览数据」、无痕窗口、换浏览器、换电脑、换打开方式（file:// 与 http://localhost 不共享数据）。',
        '首页平时不会打扰你；只有真的检测到风险（比如浏览器空了但快照里还有数据）才会出现一条橙色提醒。'
      ],
      try: [{ label: '去设置里备份', href: '#/settings' }]
    }
  ];

  function viewGuide() {
    return '' +
      '<nav class="breadcrumb">Snow Lexis <span class="crumb-sep">/</span> 教程</nav>' +
      '<div class="page-head"><div class="page-head-main">' +
        '<h2 class="page-title">新手教程</h2>' +
        '<p class="page-desc">按模块分成五组，点标题展开。想跟着点一遍，就用「新手引导」那个聚光灯模式。</p>' +
        '<div class="page-actions">' +
          '<button type="button" class="btn btn-primary" data-action="start-tour">▶ 看一遍新手引导（聚光灯）</button>' +
          '<a class="btn" href="#/settings">去设置</a>' +
        '</div>' +
      '</div></div>' +
      '<div class="gd-list">' +
        GUIDE_GROUPS.map(function (g, i) {
          return '<details class="gd-group"' + (i === 0 ? ' open' : '') + '>' +
            '<summary>' + esc(g.title) + '</summary>' +
            '<ul class="gd-items">' + g.items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' +
            '<div class="gd-actions">' + g.try.map(function (btn) {
              if (btn.href) return '<a class="btn" href="' + esc(btn.href) + '">' + esc(btn.label) + '</a>';
              return '<button type="button" class="btn" data-action="' + esc(btn.action) + '"' +
                (btn.scope ? ' data-scope="' + esc(btn.scope) + '"' : '') + '>' + esc(btn.label) + '</button>';
            }).join('') + '</div>' +
            '</details>';
        }).join('') +
      '</div>';
  }

  /** 用 <img> 探一张图能不能加载（不需要 CORS，任何图床都行） */
  function probeImage(url) {
    if (typeof Image !== 'function') return Promise.reject(new Error('no Image'));
    return new Promise(function (resolve, reject) {
      const im = new Image();
      const timer = setTimeout(function () { im.src = ''; reject(new Error('timeout')); }, 8000);
      im.onload = function () { clearTimeout(timer); resolve(url); };
      im.onerror = function () { clearTimeout(timer); reject(new Error('load-failed')); };
      im.referrerPolicy = 'no-referrer';
      im.src = url;
    });
  }

  /** 维基百科该词条配图（需要能 fetch 且允许 CORS） */
  function wikiPhoto(key) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    const api = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1' +
      '&prop=pageimages&piprop=thumbnail&pithumbsize=520&titles=' + encodeURIComponent(key);
    return fetch(api, { mode: 'cors' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('http ' + res.status)); })
      .then(function (data) {
        const pages = (data && data.query && data.query.pages) || {};
        const first = pages[Object.keys(pages)[0]] || null;
        const src = first && first.thumbnail && first.thumbnail.source;
        if (!src) throw new Error('no-image');       // 抛错 → 让另一个来源胜出
        return { url: src, from: '维基百科' };
      });
  }

  /**
   * 找一张「单词所指事物」的真实照片，几条路同时走、谁先成功用谁：
   *   ① 维基百科词条配图（最贴切，但要 https + CORS）
   *   ② Bing 图片代理（普通 <img> 即可，不需要 CORS，国内一般可访问）
   *   ③ LoremFlickr 关键词照片（普通 <img>，不需要 CORS）
   * 全部失败就返回空字符串，前端保留本地图形占位，绝不出现破图。
   */
  function lookupRealPhoto(word) {
    const key = String(word || '').toLowerCase();
    const hit = cachedPhoto(key);
    if (hit) return Promise.resolve({ url: hit.url, from: hit.from || '缓存' });
    if (typeof Promise.any !== 'function') return Promise.resolve({ url: '', from: '' });
    const bing = 'https://tse1.mm.bing.net/th?q=' + encodeURIComponent(key) +
      '&w=480&h=300&c=7&rs=1&p=0&dpr=1&pid=1.7&mkt=zh-CN';
    const flickr = 'https://loremflickr.com/480/300/' + encodeURIComponent(key) + '?lock=' + (hashHue(key) + 1);
    const tasks = [
      wikiPhoto(key),
      probeImage(bing).then(function (url) { return { url: url, from: 'Bing 图片' }; }),
      probeImage(flickr).then(function (url) { return { url: url, from: '关键词照片' }; })
    ];
    return Promise.any(tasks).catch(function () { return { url: '', from: '' }; });
  }

  /** 一条释义的"找图关键词"：优先中文释义（图源对中文支持好），再退英文单词 */
  function photoKeywords(sense, word) {
    const wordText = String((word && word.word) || '').trim();
    const zh = String((sense && sense.chinese_translation) || '')
      .split(/[；;，,、（）()\s]/)[0].trim().slice(0, 8);
    const list = [];
    if (zh && /[\u4e00-\u9fa5]/.test(zh)) list.push(zh);
    if (wordText) list.push(wordText);
    return list;
  }

  /**
   * 按关键词找「候选真实照片」：多个来源一起试，返回最多 want 张能加载成功的图。
   *   ① 维基百科词条配图（中/英各试一次） ② Bing 图片 ③ LoremFlickr 关键词照片（换 lock 就是不同图）
   */
  function findPhotoCandidates(keywords, want) {
    const kws = (keywords || []).filter(Boolean);
    if (!kws.length || typeof Image !== 'function') return Promise.resolve([]);
    const list = (want || 3) + 2;
    const tasks = [];
    kws.forEach(function (kw, i) {
      tasks.push(wikiPhoto(kw).then(function (hit) { return { url: hit.url, from: '维基百科' }; }));
      const bing = 'https://tse1.mm.bing.net/th?q=' + encodeURIComponent(kw) +
        '&w=480&h=300&c=7&rs=1&p=0&dpr=1&pid=1.7&mkt=zh-CN';
      tasks.push(probeImage(bing).then(function (url) { return { url: url, from: 'Bing 图片' }; }));
      for (let n = 0; n < 2; n++) {
        const lock = hashHue(kw + '|' + n) + 1 + i * 97;
        const flickr = 'https://loremflickr.com/480/300/' + encodeURIComponent(kw) + '?lock=' + lock;
        tasks.push(probeImage(flickr).then(function (url) { return { url: url, from: '关键词照片' }; }));
      }
    });
    const out = [];
    const seen = {};
    return new Promise(function (resolve) {
      let left = Math.min(tasks.length, list);
      if (!left) return resolve([]);
      let done = false;
      const finish = function () { if (!done) { done = true; resolve(out.slice(0, want || 3)); } };
      tasks.slice(0, list).forEach(function (p) {
        p.then(function (hit) {
          if (hit && hit.url && !seen[hit.url]) { seen[hit.url] = true; out.push(hit); }
        }).catch(function () { /* 单个来源失败无所谓 */ }).then(function () {
          left--;
          if (out.length >= (want || 3) || left <= 0) finish();
        });
      });
      setTimeout(finish, 9000);      // 兜底：9 秒还没凑够就先拿现有的
    });
  }

  function applyPhoto(word, url, from) {
    $$('img[data-word]').forEach(function (img) {
      if (img.dataset.word !== word) return;
      if (img.dataset.fixed === '1') return;      // 这条释义自己指定了配图，别被整词图顶掉
      img.dataset.fallback = '0';
      img.dataset.from = from || '';
      img.src = url;
    });
  }

  function pumpImages() {
    while (imgActive < IMG_MAX_PARALLEL && imgQueue.length) {
      const word = imgQueue.shift();
      imgActive++;
      lookupRealPhoto(word).then(function (hit) {
        if (!hit || !hit.url) return;
        putCachedPhoto(word, hit.url, hit.from);
        applyPhoto(word, hit.url, hit.from);
      }).catch(function () { /* 忽略，保持 SVG */ }).then(function () {
        imgActive--;
        pumpImages();
      });
    }
  }

  /** 把「还没拿到真实照片」的图排进队列 */
  function primeImages() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    $$('img[data-pending="1"]').forEach(function (img) {
      img.dataset.pending = '0';
      const key = String(img.dataset.word || '').toLowerCase();
      const hit = cachedPhoto(key);
      if (hit) { applyPhoto(img.dataset.word, hit.url, hit.from || '缓存'); return; }
      if (imgWaiting[key]) return;
      imgWaiting[key] = true;
      imgQueue.push(img.dataset.word);
    });
    pumpImages();
  }

  /** 首页底部的配图状态提示：让使用者一眼看出图源是否连通 */
  function reportImageStatus(hit) {
    const el = $('#imgStatus');
    if (!el) return;
    if (hit && hit.url) {
      el.textContent = '配图：已连通图源，正在把占位图自动换成真实照片（来源：' + hit.from + '）';
      el.className = 'img-status is-ok';
    } else {
      el.textContent = '配图：当前连不上图源（网络或跨域被拦），显示的是本地占位图；' +
        '可在有网络的机器上运行 node tools/resolve-images.js 一次性生成图片表。';
      el.className = 'img-status is-warn';
    }
  }

  function probeImageSource() {
    if (!$('#imgStatus')) return;
    lookupRealPhoto('apple').then(reportImageStatus).catch(function () { reportImageStatus(null); });
  }

  /**
   * 该释义要显示的图片：真实照片优先；还没拿到就先用本地 SVG 顶着，
   * 拿到照片后由 primeImages() 替换。第二个返回值表示是否需要联网找图。
   */
  function imageSrcFor(sense, word) {
    const ready = preparedImage(sense, word);
    if (ready) return { src: ready, pending: false };
    const tagName = sense.semantic_codes.length
      ? D.getNode(sense.semantic_codes[0]).name
      : (D.POS_MAP[sense.pos_tag] || {}).name;
    return {
      src: placeholderSvg(word.word, sense.chinese_translation, tagName, sense.semantic_codes[0] || '', sense.image_seed),
      pending: true
    };
  }

  /** 兜底：真实照片加载失败时换回本地 SVG（error 事件不冒泡，用捕获阶段接） */
  function handleImgError(e) {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fallback === '1' || !img.dataset.word) return;
    img.dataset.fallback = '1';
    const key = String(img.dataset.word).toLowerCase();
    if (imgCache[key]) { delete imgCache[key]; saveImgCache(); }   // 下次重新找图
    img.src = placeholderSvg(img.dataset.word, img.dataset.zh, img.dataset.tag, img.dataset.leaf);
  }

  /* ---------- 发音：优先真实音频，失败时用合成音提示（占位音频） ---------- */
  let audioCtx = null;
  function beep(accent) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(accent === 'uk' ? 452 : 610, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.10, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) { /* 忽略 */ }
  }

  function playPronunciation(url, text, accent) {
    const label = accent === 'uk' ? '英式' : '美式';
    let done = false;
    const fallback = function () {
      if (done) return;
      done = true;
      beep(accent);
      toast('占位音频 · ' + label + ' ' + text + '（地址：' + url + '）');
    };
    try {
      const audio = new Audio(url);
      audio.addEventListener('error', fallback);
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.then(function () { done = true; }).catch(fallback);
        setTimeout(function () { if (!done && audio.readyState === 0) fallback(); }, 900);
      } else {
        fallback();
      }
    } catch (e) {
      fallback();
    }
  }

  /* ============================================================
   * 数据安全：本地快照 / 导出导入 / 自动备份到本地文件
   *   ① localStorage 自动快照（每次变更写一份完整副本，防单键被清或写坏）
   *   ② 导出 / 导入 JSON（跨浏览器、跨设备迁移）
   *   ③ 自动备份到本地文件（File System Access，一次授权后每次变动自动落盘）
   * ============================================================ */
  const FS_DB = 'yy_fs';
  const FS_STORE = 'handles';
  const FS_KEY = 'backup';
  let backupHandle = null;
  let backupWriteTimer = null;

  function fmtTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function refreshDataStatus() {
    const el = $('#dataStatus');
    if (!el) return;
    const s = store.summary();
    el.textContent = '已学单词 ' + s.words_learned + ' · 单词收藏 ' + s.word_favorites +
      ' · 词库收藏 ' + s.library_favorites + ' · 学习记录 ' + s.study_sessions +
      ' 次 · 上次自动快照 ' + fmtTime(s.last_backup_at || s.last_change_at);

    const hint = $('#dataHint');
    if (!hint) return;
    const snap = store.localBackup();
    if (!store.hasUserData() && snap) {
      hint.textContent = '⚠ 当前浏览器里没有学习数据，但检测到一份本地快照（'
        + Object.keys(snap.review_records || {}).length + ' 个单词有记忆记录、'
        + (snap.word_collection || []).length + ' 个单词收藏、'
        + (snap.library_collection || []).length + ' 个词库收藏）。'
        + '可能是换了浏览器或清了缓存 —— 点「恢复上一份本地快照」即可找回。';
      hint.className = 'ds-hint is-warn';
      return;
    }
    if (backupHandle) {
      hint.textContent = '已连接本地备份文件：每次数据变化会自动写入该文件，换浏览器、清缓存、换电脑都能从它恢复。';
      hint.className = 'ds-hint is-ok';
      return;
    }
    const changed = s.words_learned + s.word_favorites + s.library_favorites;
    const days = s.last_change_at ? (Date.now() - s.last_change_at) / 86400000 : 0;
    if (changed > 0 && days > 7) {
      hint.textContent = '⚠ 已经有 ' + Math.floor(days) + ' 天没备份了。点「导出备份文件」或「自动备份到本地文件」存一份，'
        + '否则清除浏览器数据、换浏览器、或换打开方式（file:// 与 http://localhost 不共享数据）都会丢进度。';
      hint.className = 'ds-hint is-warn';
      return;
    }
    hint.textContent = '数据现在只存在浏览器 localStorage：清浏览器数据、无痕模式、换浏览器、换打开方式都会看不到。'
      + '建议导出一份备份，或用「自动备份到本地文件」做自动落盘。';
    hint.className = 'ds-hint';
  }

  function exportUserData() {
    try {
      const data = store.snapshot();
      store.backupNow();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SnowLexis-我的数据-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      if (a.remove) a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
      toast('已导出备份文件：记忆进度 / 单词收藏 / 词库收藏 / 学习日志');
      refreshDataStatus();
    } catch (e) {
      toast('导出失败：' + (e && e.message ? e.message : e));
    }
  }

  function triggerImport() {
    const input = $('#importFile');
    if (input) input.click();
  }

  function handleImportFile(file) {
    if (!file) return;
    if (typeof FileReader !== 'function') { toast('当前环境不支持读取文件'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      let data = null;
      try { data = JSON.parse(String(reader.result)); } catch (e) { /* 交给 restore 报错 */ }
      const res = store.restore(data);
      if (res.ok) { toast('恢复成功：记忆进度与收藏已载入'); render(); }
      else toast('恢复失败：' + res.reason);
    };
    reader.readAsText(file);
  }

  /* ---------- File System Access：自动备份到本地文件 ---------- */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
      const req = indexedDB.open(FS_DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(FS_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbPut(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        const tx = db.transaction(FS_STORE, 'readwrite');
        tx.objectStore(FS_STORE).put(val, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        const tx = db.transaction(FS_STORE, 'readonly');
        const rq = tx.objectStore(FS_STORE).get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  async function writeBackupFile() {
    if (!backupHandle) return;
    try {
      if (backupHandle.queryPermission) {
        let perm = await backupHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted' && backupHandle.requestPermission) {
          perm = await backupHandle.requestPermission({ mode: 'readwrite' });
        }
        if (perm !== 'granted') return;
      }
      const w = await backupHandle.createWritable();
      await w.write(JSON.stringify(store.snapshot(), null, 2));
      await w.close();
      store.backupNow();
    } catch (e) { /* 用户取消或权限失效，静默 */ }
  }

  function scheduleBackupFile() {
    if (!backupHandle) return;
    if (backupWriteTimer) clearTimeout(backupWriteTimer);
    backupWriteTimer = setTimeout(function () { backupWriteTimer = null; writeBackupFile(); }, 600);
  }

  async function linkBackupFile() {
    if (typeof window.showSaveFilePicker !== 'function') {
      toast('这个浏览器不支持「自动备份到本地文件」，请用「导出备份文件」（Chrome / Edge 支持自动备份）');
      return;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'SnowLexis-我的数据.json',
        types: [{ description: 'JSON 备份', accept: { 'application/json': ['.json'] } }]
      });
      backupHandle = handle;
      try { await idbPut(FS_KEY, handle); } catch (e) { /* handle 存不住也不影响本次会话 */ }
      await writeBackupFile();
      toast('已连接：之后每次学习/收藏变动都会自动写入这个文件');
      refreshDataStatus();
    } catch (e) { /* 用户取消选择 */ }
  }

  async function initBackupFile() {
    try {
      const handle = await idbGet(FS_KEY);
      if (!handle) return;
      const perm = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
      if (perm === 'granted') { backupHandle = handle; refreshDataStatus(); }
    } catch (e) { /* 忽略 */ }
  }

  function restoreLocalBackup() {
    const snap = store.localBackup();
    if (!snap) { toast('没有找到本地快照'); return; }
    if (!window.confirm('用本地快照覆盖当前数据吗？（会替换记忆进度与收藏）')) return;
    const res = store.restore(snap);
    toast(res.ok ? '已从本地快照恢复' : '恢复失败：' + res.reason);
    if (res.ok) render();
  }

  /* ============================================================
   * 导入新词（词库页 → 单个导入 / 批量导入）
   *   存哪：localStorage（yy_user_words 新词 + yy_user_tags 已有词追加的标签）
   *   怎么生效：运行时合并进词库（搜索、词库树、背诵、收藏立刻可查）
   *   怎么永久：弹窗里可导出 JSON，交给开发者烘焙进正式词库
   *   另：导出的备份 / 云同步都会带上这些导入词（走 store.UserWordStore）
   *   音标：填完单词后自动向服务器查音标库补齐（静态托管时留空手填）
   * ============================================================ */
  const KEY_USER_WORDS = 'yy_user_words';
  const KEY_USER_TAGS = 'yy_user_tags';
  const importState = { mode: 'menu', code: '', preview: null };
  const ipaCache = {};   // 单词（小写）→ [英音, 美音]，服务器查回来的音标
  const ipaAsked = {};   // 已经问过服务器的单词，避免重复请求

  // 统一交给 store 管理：这样导入的词也会进本地快照、导出备份和云同步
  function loadUserWords() { return store.UserWordStore.all(); }
  function loadUserTags() { return store.UserWordStore.tags(); }
  function loadUserHidden() { return store.UserWordStore.hidden(); }
  function loadUserOverlay() { return store.UserWordStore.overlay(); }
  function saveUserOverlay(overlay) { store.UserWordStore.saveOverlay(overlay); }
  function loadTreeOverlay() { return store.UserWordStore.treeOverlay(); }

  const T = window.YY_TREE;

  /** 把四层用户数据一次性应用回词库（导入词 / 追加标签 / 移出隐藏 / 释义编辑） */
  function applyAllUserData() {
    D.applyUserData(loadUserWords(), loadUserTags(), loadUserHidden(), loadUserOverlay());
  }
  function saveUserWords(list) { store.UserWordStore.save(list, store.UserWordStore.tags(), loadUserHidden()); }
  function saveUserTags(map) { store.UserWordStore.save(store.UserWordStore.all(), map, loadUserHidden()); }

  /** 这张卡有没有被编辑过（改释义 / 加释义 / 删释义） */
  function hasSenseEdits(word) {
    if (!word) return false;
    const ov = loadUserOverlay();
    if (word.senses.some(function (s) { return ov.edits[s.id]; })) return true;
    if (word.senses.some(function (s) { return ov.deleted[s.id]; })) return true;
    return !!((ov.added || {})[word.word.toLowerCase()] || []).length;
  }

  /**
   * 向服务器音标库查音标（导入新词时自动补全）
   *   有服务端（node server/server.js 托管）→ 查 data/cache 里的 ipa-dict，19 万词条
   *   静态托管 / 双击 index.html       → 静默跳过，音标留空让人手填
   * @param {string[]} words 单词列表
   * @param {(found:number)=>void} [onDone] 查到几个（用于刷新预览文案）
   */
  function requestIpa(words, onDone) {
    if (!YY_API.enabled()) { if (onDone) onDone(0); return; }
    const need = [];
    (words || []).forEach(function (w) {
      const key = String(w || '').trim().toLowerCase();
      if (!key || ipaCache[key] || ipaAsked[key]) return;
      ipaAsked[key] = 1;
      need.push(key);
    });
    if (!need.length) { if (onDone) onDone(0); return; }
    YY_API.ipa(need).then(function (map) {
      let found = 0;
      need.forEach(function (k) {
        const v = (map || {})[k] || [];
        const uk = v[0] || v[1] || '';
        const us = v[1] || v[0] || '';
        if (uk || us) { ipaCache[k] = [uk, us]; found++; }
      });
      if (onDone) onDone(found);
    });
  }

  /** 把已查到的音标填进待导入的条目（缺哪侧补哪侧，不覆盖手工填写的） */
  function applyIpaToItems(items) {
    let filled = 0;
    (items || []).forEach(function (it) {
      const hit = ipaCache[String(it.word || '').trim().toLowerCase()];
      if (!hit) return;
      (it.senses || []).forEach(function (s) {
        if (!s.uk && hit[0]) { s.uk = hit[0]; filled++; }
        if (!s.us && hit[1]) { s.us = hit[1]; if (!s.uk) filled++; }
        if (s.uk && !s.us) s.us = s.uk;
        if (s.us && !s.uk) s.uk = s.us;
      });
    });
    return filled;
  }

  /** 把本地存的用户新词合并进当前词库（启动时调用一次） */
  function applyStoredUserData() {
    const words = loadUserWords();
    const tags = loadUserTags();
    const hidden = loadUserHidden();
    const ov = loadUserOverlay();
    if (!words.length && !Object.keys(tags).length && !Object.keys(hidden).length &&
      !Object.keys(ov.edits).length && !Object.keys(ov.added).length && !Object.keys(ov.deleted).length) return;
    applyAllUserData();
  }

  /** 把一批解析好的词写入本地存储（已有词只追加标签），并立即合并 */
  function commitImports(items) {
    const words = loadUserWords();
    const tags = loadUserTags();
    let added = 0, tagged = 0;
    items.forEach(function (it) {
      if (D.wordByText(it.word)) {
        const list = tags[it.word] || [];
        it.senses.forEach(function (s) {
          (s.codes || []).forEach(function (c) { if (list.indexOf(c) < 0) list.push(c); });
        });
        tags[it.word] = list;
        tagged++;
      } else {
        words.push({ word: it.word, senses: it.senses, created_at: Date.now() });
        added++;
      }
    });
    saveUserWords(words);
    saveUserTags(tags);
    applyAllUserData();
    return { added: added, tagged: tagged };
  }

  function exportUserWords() {
    const payload = {
      note: 'Snow Lexis · 我导入的新词（可交给开发者烘焙进正式词库）',
      exported_at: new Date().toISOString(),
      words: loadUserWords(),
      tags: loadUserTags()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '我导入的新词-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    if (a.remove) a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    toast('已导出新词文件（' + loadUserWords().length + ' 个新词）');
  }

  /** 解析批量导入文本：每行 单词|词性|中文释义|英式音标|美式音标|备注（后 5 段可省） */
  function parseBatchText(text, code) {
    const out = { items: [], errors: [], exists: 0 };
    String(text || '').split(/\r?\n/).forEach(function (raw, i) {
      let line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      line = line.replace(/^\d+[.、)]\s*/, '');                     // 去掉行首序号
      let parts = line.split('|').map(function (s) { return s.trim(); });
      if (parts.length === 1) parts = line.split(/\s{1,}/);          // 退化为空格分隔
      const word = (parts[0] || '').trim();
      if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) { out.errors.push('第 ' + (i + 1) + ' 行：不是合法英文单词 → ' + raw.slice(0, 20)); return; }
      const rest = parts.slice(1);
      let pos = 'n.', zh = '', uk = '', us = '', remark = '';
      if (rest.length) {
        if (/^(n|v|adj|adv|pron|prep|conj|art|interj|aux|modal|det|num)\.?$/i.test(rest[0])) { pos = rest[0].toLowerCase(); if (pos.slice(-1) !== '.') pos += '.'; rest.shift(); }
        rest.forEach(function (p) {
          if (!zh && /[\u4e00-\u9fa5]/.test(p)) { zh = p; return; }
          if (!uk && /^\/.*\/$/.test(p)) { uk = p; return; }
          if (!us && /^\/.*\/$/.test(p)) { us = p; return; }
          if (p) remark = remark ? remark + ' ' + p : p;
        });
      }
      if (!zh) { out.errors.push('第 ' + (i + 1) + ' 行：缺少中文释义 → ' + word); return; }
      if (!uk) uk = us;
      if (!us) us = uk;
      if (D.wordByText(word)) out.exists++;
      out.items.push({ word: word, senses: [{ pos: pos, zh: zh, codes: [code], uk: uk, us: us, remark: remark }] });
    });
    return out;
  }

  function renderImport() {
    const body = $('#importBody');
    const foot = $('#importFoot');
    const target = $('#importTarget');
    if (!body) return;
    const node = D.getNode(importState.code);
    const pathText = node ? node.pathText : '—';
    target.innerHTML = '将导入到：' + pathBreadcrumb(pathText);
    target.classList.remove('is-placeholder');

    if (importState.mode === 'menu') {
      body.innerHTML = '' +
        '<div class="import-options">' +
          '<button type="button" class="import-card" data-action="import-mode" data-mode="single">' +
            '<b>单个导入</b><span>填一个单词：中文释义、词性、英美音标、备注</span></button>' +
          '<button type="button" class="import-card" data-action="import-mode" data-mode="batch">' +
            '<b>批量导入</b><span>一行一个词，支持「单词|词性|释义|英音|美音|备注」，可先预览</span></button>' +
        '</div>' +
        '<p class="import-note">导入的词会挂在当前分类「' + esc(node ? node.name : '') + '」下；' +
        '如果这个词库里已经有这个词，不会再建一张卡，而是把该分类标签挂到它身上。' +
        '数据存在本机浏览器，可随时导出。</p>';
      foot.innerHTML = '<button type="button" class="btn" data-action="export-user-words">导出我导入的词</button>' +
        '<button type="button" class="btn btn-ghost" data-action="close-import">关闭</button>';
      return;
    }

    if (importState.mode === 'single') {
      body.innerHTML = '' +
        '<div class="import-form">' +
          '<label class="acct-row"><span>单词</span><input type="text" id="impWord" placeholder="例如 sustainable" autocomplete="off"></label>' +
          '<label class="acct-row"><span>词性</span>' +
            '<select id="impPos">' + D.POS_TAGS.map(function (p) { return '<option value="' + p.pos + '">' + p.pos + ' ' + p.name + '</option>'; }).join('') + '</select></label>' +
          '<label class="acct-row"><span>中文释义</span><input type="text" id="impZh" placeholder="例如 可持续的" autocomplete="off"></label>' +
          '<label class="acct-row"><span>英式音标</span><input type="text" id="impUk" placeholder="/səˈsteɪnəbl/（可留空）" autocomplete="off"></label>' +
          '<label class="acct-row"><span>美式音标</span><input type="text" id="impUs" placeholder="/səˈsteɪnəbəl/（可留空）" autocomplete="off"></label>' +
          '<label class="acct-row"><span>备注</span><input type="text" id="impRemark" placeholder="可选，例如 CEFR B2 · 句频 11" autocomplete="off"></label>' +
        '</div>' +
        '<p class="import-ipa-hint" id="impIpaHint">填完英文单词会自动补英/美音标（需要由 start-server 启动网址访问）。</p>';
      foot.innerHTML = '<button type="button" class="btn btn-primary" data-action="do-single-import">确认导入</button>' +
        '<button type="button" class="btn" data-action="import-back">返回</button>';
      return;
    }

    body.innerHTML = '' +
      '<textarea id="impBatch" class="import-textarea" rows="9" spellcheck="false" ' +
        'placeholder="一行一个词，用 | 分隔（后 5 段可省略）：&#10;apple|n.|苹果|/ˈæpl/|/ˈæpl/&#10;negotiate|v.|谈判；协商&#10;climate change|n.|气候变化|/ˈklaɪmət tʃeɪndʒ/&#10;&#10;也支持只写一行：&#10;sustainable 可持续的"></textarea>' +
      '<div class="import-preview" id="impPreview">上面粘贴后会自动预览</div>';
    foot.innerHTML = '<button type="button" class="btn btn-primary" data-action="do-batch-import">确认导入</button>' +
      '<button type="button" class="btn" data-action="import-back">返回</button>';
    updateBatchPreview();
  }

  function updateBatchPreview() {
    const ta = $('#impBatch');
    const box = $('#impPreview');
    if (!ta || !box) return;
    const text = String(ta.value || '');
    const parsed = parseBatchText(text, importState.code);
    importState.preview = parsed;
    if (!text.trim()) { box.textContent = '上面粘贴后会自动预览'; box.className = 'import-preview'; return; }

    // 没写音标的词，自动向服务器查（有服务端时）
    const needIpa = [];
    parsed.items.forEach(function (it) {
      it.senses.forEach(function (s) { if (!s.uk && !s.us) needIpa.push(it.word); });
    });
    let filled = 0;
    needIpa.forEach(function (w) { if (ipaCache[String(w).trim().toLowerCase()]) filled++; });

    const lines = [];
    lines.push('识别到 <b>' + parsed.items.length + '</b> 个词：新增 <b>' + (parsed.items.length - parsed.exists) +
      '</b> 个，词库已有的 <b>' + parsed.exists + '</b> 个（只追加本分类标签）');
    if (needIpa.length) {
      lines.push('音标：自动补齐 <b>' + filled + '</b> / ' + needIpa.length + ' 个' +
        (filled < needIpa.length ? '（剩下的可以手动补，或先留空）' : ''));
    }
    if (parsed.errors.length) lines.push('<span class="imp-err">' + parsed.errors.length + ' 行有问题：' + esc(parsed.errors[0]) + '</span>');
    box.innerHTML = lines.join('<br>');
    box.className = 'import-preview' + (parsed.errors.length ? ' has-err' : ' is-ok');

    if (needIpa.length > filled) {
      requestIpa(needIpa, function (n) { if (n) updateBatchPreview(); });
    }
  }

  function openImport(code) {
    importState.mode = 'menu';
    importState.code = code;
    importState.preview = null;
    const modal = $('#importModal');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    renderImport();
  }
  function closeImport() {
    const modal = $('#importModal');
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function doSingleImport() {
    const word = ($('#impWord') || {}).value || '';
    const pos = ($('#impPos') || {}).value || 'n.';
    const zh = ($('#impZh') || {}).value || '';
    const uk = ($('#impUk') || {}).value || '';
    const us = ($('#impUs') || {}).value || '';
    const remark = ($('#impRemark') || {}).value || '';
    const w = String(word).trim();
    if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(w)) { toast('请填写合法的英文单词'); return; }
    if (!String(zh).trim()) { toast('请填写中文释义'); return; }
    const item = { word: w, senses: [{ pos: pos, zh: String(zh).trim(), codes: [importState.code], uk: uk.trim(), us: (us || uk).trim(), remark: String(remark).trim() }] };

    // 音标没填：先问服务器要一次，再落库（避免用户刚打完字就点确认、音标来不及补）
    const item0 = item.senses[0];
    if (!item0.uk && !item0.us && YY_API.enabled() && !ipaCache[w.toLowerCase()] && !ipaAsked[w.toLowerCase()]) {
      const hint = $('#impIpaHint');
      if (hint) { hint.textContent = '正在查音标…'; hint.className = 'import-ipa-hint is-ok'; }
      requestIpa([w], function () { applyIpaToItems([item]); finishSingleImport(item); });
      return;
    }
    finishSingleImport(item);
  }

  function finishSingleImport(item) {
    const w = item.word;
    applyIpaToItems([item]);
    const r = commitImports([item]);
    const name = D.getNode(importState.code) ? D.getNode(importState.code).name : '';
    closeImport();
    toast(r.added ? ('已新增单词：' + w + '（挂在「' + name + '」）') : ('已在词库中：' + w + '，已把「' + name + '」标签挂上去'));
    render();
  }

  function doBatchImport() {
    const ta = $('#impBatch');
    const parsed = ta ? parseBatchText(String(ta.value || ''), importState.code) : { items: [], errors: [] };
    if (!parsed.items.length) { toast('没有识别到可导入的词'); return; }
    const ipaFilled = applyIpaToItems(parsed.items);   // 把查到的音标补进去再落库
    const r = commitImports(parsed.items);
    closeImport();
    toast('导入完成：新增 ' + r.added + ' 个，已有词追加标签 ' + r.tagged + ' 个' +
      (ipaFilled ? '，音标自动补齐 ' + ipaFilled + ' 条' : ''));
    render();
  }

  /* ============================================================
   * 云同步（多设备 / 多用户）：没有服务器就自动退回纯本地模式
   * ============================================================ */
  let syncTimer = null;
  let syncApplying = false;

  function currentBase() {
    return ($('#accountBase') && $('#accountBase').value) || YY_API.base || '';
  }

  async function doAuth(kind, payload) {
    try {
      const base = currentBase();
      if (!base) { toast('请先填写服务器地址（例如 http://192.168.1.5:8787）'); return; }
      YY_API.base = base;
      const res = kind === 'register' ? await YY_API.register(payload.username, payload.password)
        : kind === 'login' ? await YY_API.login(payload.username, payload.password)
          : await YY_API.loginByCode(payload.code);
      YY_API.applySession(res);
      const merged = YY_API.mergeSnapshots(store.snapshot(), res.data);
      syncApplying = true;
      store.restore(merged);
      syncApplying = false;
      await YY_API.push(merged);
      toast('登录成功：' + (YY_API.user ? YY_API.user.username : '') + '，云端数据已合并');
      render();
    } catch (e) {
      toast('失败：' + (e && e.message ? e.message : e));
    }
  }

  async function syncNow(silent) {
    if (!YY_API.loggedIn()) { toast('还没有登录账号'); return; }
    try {
      const res = await YY_API.pull();
      const merged = YY_API.mergeSnapshots(store.snapshot(), res.data);
      syncApplying = true;
      store.restore(merged);
      syncApplying = false;
      await YY_API.push(merged);
      refreshDataStatus();
      if (!silent) { toast('已与云端同步'); render(); }
    } catch (e) {
      if (!silent) toast('同步失败：' + (e && e.message ? e.message : e));
    }
  }

  function scheduleSync() {
    if (syncApplying || !YY_API.loggedIn()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      syncTimer = null;
      YY_API.push(store.snapshot()).then(function (r) {
        if (!r || !r.data) return;
        syncApplying = true;
        store.restore(YY_API.mergeSnapshots(store.snapshot(), r.data));
        syncApplying = false;
        refreshDataStatus();
      }).catch(function () { /* 离线时静默，恢复网络后下次变更会再同步 */ });
    }, 2500);
  }

  function logoutAccount() {
    if (!window.confirm('退出登录？本地数据会保留，云端数据不受影响。')) return;
    YY_API.logout();
    toast('已退出登录');
    render();
  }

  /** 账号与同步区块（放进设置页；老的 #/account 链接也走这里） */
  function accountBody() {
    const served = YY_API.served();
    const logged = YY_API.loggedIn();
    const base = YY_API.base;
    const user = YY_API.user;
    const s = store.summary();

    const describe = served
      ? '当前由服务器托管：注册或登录后，学习进度、收藏、自己导入的词与改动都会存到服务器，手机和电脑用同一个账号即可同步。'
      : '当前是本地打开（file://）：数据只在这台电脑的浏览器里。要让手机/朋友也能用，请用 node server/server.js 启动服务后用网址访问。';

    const form = '' +
      '<form class="acct-card" id="accountForm">' +
        '<label class="acct-row"><span>服务器地址</span>' +
          '<input type="text" id="accountBase" name="base" placeholder="http://192.168.1.5:8787" value="' + esc(base) + '"></label>' +
        '<label class="acct-row"><span>用户名</span><input type="text" name="username" autocomplete="username" placeholder="2~24 个字符"></label>' +
        '<label class="acct-row"><span>密码</span><input type="password" name="password" autocomplete="current-password" placeholder="至少 4 位"></label>' +
        '<div class="acct-actions">' +
          '<button type="submit" class="btn btn-primary" data-mode="login">登录</button>' +
          '<button type="submit" class="btn" data-mode="register">注册新账号</button>' +
        '</div>' +
        '<p class="acct-tip">朋友各自注册一个账号即可，进度互不干扰。</p>' +
      '</form>' +
      '<form class="acct-card" id="codeForm">' +
        '<label class="acct-row"><span>同步码</span><input type="text" name="code" placeholder="XXXX-XXXX-XXXX-XXXX"></label>' +
        '<div class="acct-actions">' +
          '<button type="submit" class="btn">用同步码登录</button>' +
        '</div>' +
        '<p class="acct-tip">手机上不想输密码？用注册时给你的同步码即可快速登录同一账号。</p>' +
      '</form>';

    if (logged) {
      const code = YY_API.token || '';
      return '<p class="set-desc">' + describe + '</p>' +
        '<section class="acct-card">' +
          '<h3 class="acct-user">已登录：' + esc(user ? user.username : '（未知）') + '</h3>' +
          '<p class="acct-tip">服务器：' + esc(base) + '</p>' +
          '<p class="acct-code-label">同步码（在手机上用它登录，别泄露给他人）</p>' +
          '<p class="acct-code" id="syncCodeText">' + esc(code) + '</p>' +
          '<div class="acct-actions">' +
            '<button type="button" class="btn btn-primary" data-action="sync-now">立即同步</button>' +
            '<button type="button" class="btn" data-action="copy-sync-code">复制同步码</button>' +
            '<button type="button" class="btn" data-action="logout-account">退出登录</button>' +
          '</div>' +
          '<p class="acct-tip">本地已有：已学单词 ' + s.words_learned + ' · 单词收藏 ' + s.word_favorites +
            ' · 词库收藏 ' + s.library_favorites + '。学习时每 2.5 秒自动同步一次，也可手动点「立即同步」。</p>' +
        '</section>';
    }

    return '<p class="set-desc">' + describe + '</p>' + (served
      ? form
      : '<section class="acct-card"><h3>怎么变成「朋友也能用」的网站</h3>' +
        '<ol class="acct-steps">' +
          '<li>在电脑上启动服务：<code>node server/server.js</code></li>' +
          '<li>同一 WiFi 下，手机浏览器访问 <code>http://电脑IP:8787</code>（启动时命令行会打印出来）</li>' +
          '<li>想给外网的朋友用：把服务放到云服务器，或做端口映射 / 内网穿透，用域名 + HTTPS 访问</li>' +
        '</ol>' +
        '<p class="acct-tip">本页面填写服务器地址后，也可以在这种本地打开的方式下同步（跨域已放开）。</p>' +
      '</section>');
  }

  /* ============================================================
   * 视图：设置（新手教程 / 数据 / 账号同步 / 配图图源 / 其他）
   *   首页只留背单词要用的东西，其余都收进这里
   * ============================================================ */
  function viewSettings() {
    const words = D.allWords().length;
    const senses = D.allWords().reduce(function (a, w) { return a + w.senses.length; }, 0);
    const backup = typeof window.showSaveFilePicker === 'function';
    return '' +
      '<nav class="breadcrumb">Snow Lexis <span class="crumb-sep">/</span> 设置</nav>' +
      '<div class="page-head"><div class="page-head-main">' +
        '<h2 class="page-title">设置</h2>' +
        '<p class="page-desc">新手教程、数据备份、账号同步、配图与图源都在这里——首页只留背单词用的东西。</p>' +
      '</div></div>' +

      '<section class="set-card" id="sec-tour">' +
        '<h3>新手教程</h3>' +
        '<p class="set-desc">第一次用？跟着指引点一遍最快（9 步，随时可跳过）。也可以打开完整教程，按模块随时查。</p>' +
        '<div class="set-actions">' +
          '<button type="button" class="btn btn-primary" data-action="start-tour">看一遍新手引导</button>' +
          '<a class="btn" href="#/guide">打开完整教程</a>' +
        '</div>' +
      '</section>' +

      '<section class="set-card" id="sec-data">' +
        '<h3>数据</h3>' +
        '<p class="set-desc">词库：<b>' + words + '</b> 张单词卡 · <b>' + senses + '</b> 条释义 · <b>' +
          D.LEAF_NODES.length + '</b> 个末级词库</p>' +
        '<p class="ds-status" id="dataStatus">统计中…</p>' +
        '<div class="set-actions">' +
          '<button type="button" class="btn btn-primary" data-action="export-data">导出备份文件</button>' +
          '<button type="button" class="btn" data-action="import-data">导入备份恢复</button>' +
          '<button type="button" class="btn" data-action="link-backup-file">自动备份到本地文件</button>' +
          '<button type="button" class="btn" data-action="restore-local">恢复上一份本地快照</button>' +
        '</div>' +
        '<input type="file" id="importFile" accept=".json,application/json" hidden>' +
        '<p class="ds-hint" id="dataHint"></p>' +
        '<details class="set-more"><summary>这几个按钮分别管什么？</summary>' +
          '<ul class="set-list">' +
            '<li><b>导出备份文件</b>：把学习进度、收藏、自己导入的词与改动存成一个 JSON 文件，换电脑/换浏览器都靠它。</li>' +
            '<li><b>导入备份恢复</b>：选上面那个 JSON 文件，把数据还原回来。</li>' +
            '<li><b>自动备份到本地文件</b>：授权一次（Chrome/Edge），以后每次变动自动写进那个文件，最省心。</li>' +
            '<li><b>恢复上一份本地快照</b>：浏览器里还留着一份自动快照，误点重置或数据没显示时可一键找回。</li>' +
            '<li>浏览器「清除浏览数据」、无痕窗口、换浏览器都会看不到进度——先导出或自动备份就不会丢。</li>' +
          '</ul>' +
        '</details>' +
      '</section>' +

      '<section class="set-card" id="sec-account">' +
        '<h3>账号与同步</h3>' +
        accountBody() +
      '</section>' +

      '<section class="set-card" id="sec-mobile">' +
        '<h3>手机访问</h3>' +
        '<p class="set-desc">手机和电脑连同一个 WiFi，用下面这个地址打开就能用（电脑上的服务窗口保持开着）。</p>' +
        '<p class="lan-addr" id="lanAddr">检测中…</p>' +
        '<div class="set-actions">' +
          '<button type="button" class="btn" data-action="copy-lan">复制地址</button>' +
          '<button type="button" class="btn" data-action="recheck-lan">重新检测</button>' +
        '</div>' +
        '<details class="set-more"><summary>手机上打不开怎么办？</summary>' +
          '<ul class="set-list">' +
            '<li>确认手机和电脑在<b>同一个 WiFi</b>，并且用的是上面这个「推荐」地址（<code>172.x</code> 那种多半是虚拟网卡，手机连不上）。</li>' +
            '<li>还是打不开：用<b>管理员 PowerShell</b>放行端口 —— <code>netsh advfirewall firewall add rule name="SnowLexis 8787" dir=in action=allow protocol=TCP localport=8787</code>（服务启动时也会打印这行，直接复制）。</li>' +
            '<li>电脑 IP 会变（例如换 WiFi、重启路由器）：每次以<b>服务窗口里打印的地址</b>为准；想让它固定，见 README「让手机地址固定下来」。</li>' +
            '<li>想在手机上「添加到主屏幕」当 App 用，需要 HTTPS（局域网 http 装不了，但浏览器里能正常背单词）。</li>' +
            '<li>想让手机和电脑共用进度：在下面「账号与同步」注册/登录同一个账号，手机上用同步码登录最省事。</li>' +
          '</ul>' +
        '</details>' +
      '</section>' +

      '<section class="set-card" id="sec-images">' +
        '<h3>配图与图源</h3>' +
        '<p class="set-desc">卡片配图优先用「这条释义自己的图」（编辑卡片里可以换/上传），其次是联网找到的真实照片，最后是本地生成的占位图（离线也不会破图）。</p>' +
        '<p class="img-status" id="imgStatus">配图检测中…</p>' +
        '<div class="set-actions">' +
          '<button type="button" class="btn" data-action="recheck-images">重新检测图源</button>' +
        '</div>' +
      '</section>' +

      '<section class="set-card" id="sec-other">' +
        '<h3>其他</h3>' +
        '<p class="set-desc">音频是占位链接，配图见上一条。' +
          (backup ? '' : '（当前浏览器不支持「自动备份到本地文件」，建议用导出备份。）') + '</p>' +
        '<div class="set-actions">' +
          '<button type="button" class="btn" data-action="open-tree">打开词库树</button>' +
          '<button type="button" class="btn" data-action="open-tree-editor">编辑词库树（改名 / 加分类）</button>' +
          '<button type="button" class="btn btn-danger" data-action="reset-demo">重置演示数据</button>' +
        '</div>' +
      '</section>';
  }

  /* ============================================================
   * 记忆状态展示
   * ============================================================ */
  function memInfo(vocabId) {
    const rec = ReviewStore.get(vocabId);
    const now = Date.now();
    if (!rec) return { key: 'fresh', label: '新词', detail: '未学习', level: 0 };
    const due = Number(rec.next_review_time) <= now;
    return {
      key: due ? 'due' : 'scheduled',
      label: due ? '待复习' : '已排期',
      detail: (due ? '已到期 · ' : '下次 ') + R.formatTime(rec.next_review_time),
      level: Number(rec.familiarity) || 0,
      remain: R.humanRemain(Number(rec.next_review_time) - now)
    };
  }

  function memBadge(vocabId) {
    const info = memInfo(vocabId);
    return '<span class="mem-badge mem-' + info.key + '" title="' + esc(info.detail) + '">' +
      '<span class="mem-dot"></span>' + esc(info.label) +
      (info.key === 'fresh' ? '' : ' · ' + info.level + '级') + '</span>';
  }

  /* ============================================================
   * 卡片片段
   * ============================================================ */
  function posChip(pos) {
    const meta = D.POS_MAP[pos] || { name: pos, kind: 'content' };
    return '<span class="pos-chip pos-' + meta.kind + '" title="' + esc(meta.name) + '">' + esc(pos) + '</span>';
  }

  function semanticChips(sense) {
    if (!sense.semantic_codes.length) {
      return '<span class="sem-empty" title="虚词只绑定词性标签">语义标签：空数组</span>';
    }
    const codes = sense.semantic_codes.filter(function (code) {
      return !D.isHidden(sense.vocab_id, code);      // 「移入」移出的分支不再显示标签
    });
    if (!codes.length) {
      return '<span class="sem-empty" title="这个释义的语义分支被「移入」移出了，可以在卡片右上角恢复">语义标签：已移出</span>';
    }
    return codes.map(function (code) {
      const node = D.getNode(code);
      if (!node) return '';
      return '<button type="button" class="sem-chip" data-action="open-branch" data-code="' + code + '" ' +
        'title="' + esc(node.pathText) + '">' + esc(node.name) + '</button>';
    }).join('');
  }

  function senseHTML(sense, opts) {
    const options = opts || {};
    const node = D.getNode(options.highlightCode);
    const matched = !!(node && sense.semantic_codes.indexOf(options.highlightCode) > -1);
    const word = D.wordById(sense.vocab_id);
    const photo = imageSrcFor(sense, word);
    return '' +
      '<section class="sense' + (matched ? ' is-match' : '') + '">' +
        '<div class="sense-main">' +
          '<div class="sense-head">' +
            '<span class="sense-index">释义 ' + sense.seq + '</span>' +
            posChip(sense.pos_tag) +
            '<span class="sem-chips">' + semanticChips(sense) + '</span>' +
          '</div>' +
          '<p class="sense-zh">' + esc(sense.chinese_translation) + '</p>' +
          '<div class="sense-phon">' +
            '<span class="phon-line">' +
              '<span class="phon-tag">英</span>' + esc(sense.uk_phonetic || '—') +
              '<button type="button" class="play-btn" data-action="play" data-accent="uk" ' +
                'data-url="' + esc(sense.uk_audio_url) + '" data-text="' + esc(sense.pos_tag + ' ' + sense.chinese_translation) + '" ' +
                'title="播放英式发音（占位音频）">▶ 英</button>' +
            '</span>' +
            '<span class="phon-line">' +
              '<span class="phon-tag">美</span>' + esc(sense.us_phonetic || '—') +
              '<button type="button" class="play-btn" data-action="play" data-accent="us" ' +
                'data-url="' + esc(sense.us_audio_url) + '" data-text="' + esc(sense.pos_tag + ' ' + sense.chinese_translation) + '" ' +
                'title="播放美式发音（占位音频）">▶ 美</button>' +
            '</span>' +
          '</div>' +
          (sense.remark ? '<p class="sense-remark">' + esc(sense.remark) + '</p>' : '') +
        '</div>' +
        '<figure class="sense-figure">' +
          '<img src="' + esc(photo.src) + '" ' +
            'alt="' + esc(word.word + ' ' + sense.chinese_translation + ' 配图') + '" ' +
            'data-word="' + esc(word.word) + '" ' +
            'data-zh="' + esc(sense.chinese_translation) + '" ' +
            'data-tag="' + esc(sense.semantic_codes.length ? D.getNode(sense.semantic_codes[0]).name : '') + '" ' +
            'data-leaf="' + esc(sense.semantic_codes[0] || '') + '" ' +
            'data-pending="' + (photo.pending ? '1' : '0') + '" ' +
            'data-fixed="' + (photo.pending ? '0' : '1') + '" title="' + esc(word.word + ' · ' + sense.chinese_translation) + '" ' +
            'loading="lazy">' +
        '</figure>' +
      '</section>';
  }

  function branchLinksHTML(word) {
    const branches = D.branchesOfWord(word);
    if (!branches.length) return '';
    return '' +
      '<footer class="word-branches">' +
        '<span class="branches-label">所属词库分支（' + branches.length + '）</span>' +
        '<span class="branches-list">' +
          branches.map(function (b) {
            return '<button type="button" class="branch-link" data-action="open-branch" data-code="' + b.code + '" ' +
              'title="' + esc(b.pathText) + '">' + tagBreadcrumb(b.tagPath) + '</button>';
          }).join('') +
        '</span>' +
      '</footer>';
  }

  function wordCardHTML(word, opts) {
    const options = opts || {};
    const faved = CollectionStore.has(word.id);
    const moved = D.hiddenCodesOf(word).length > 0;
    const menuOpen = state.cardMenu === word.id;
    const edited = hasSenseEdits(word);
    return '' +
      '<article class="word-card' + (options.compact ? ' is-compact' : '') + '" data-word-id="' + word.id + '">' +
        '<header class="word-card-head">' +
          '<div class="word-title">' +
            '<h3>' + esc(word.word) + '</h3>' +
            '<span class="word-meta">' + word.senses.length + ' 条释义</span>' +
          '</div>' +
          '<div class="word-actions">' +
            memBadge(word.id) +
            '<button type="button" class="btn-fav' + (faved ? ' is-on' : '') + '" data-action="toggle-fav" data-id="' + word.id + '">' +
              (faved ? '★ 已收藏' : '☆ 收藏') +
            '</button>' +
            '<div class="card-more">' +
              '<button type="button" class="btn-fav btn-more' + (menuOpen ? ' is-on' : '') + '" ' +
                'data-action="toggle-card-menu" data-id="' + word.id + '" aria-haspopup="menu" aria-expanded="' + (menuOpen ? 'true' : 'false') + '" ' +
                'title="更多操作">⋯</button>' +
              (menuOpen
                ? '<div class="card-menu" role="menu">' +
                    '<button type="button" role="menuitem" data-action="open-lib-picker" data-id="' + word.id + '">🗂 放进词库</button>' +
                    '<button type="button" role="menuitem" data-action="open-card-editor" data-id="' + word.id + '">✎ 编辑卡片</button>' +
                    (edited ? '<button type="button" role="menuitem" data-action="reset-card-edits" data-id="' + word.id + '">↺ 撤销编辑，恢复原样</button>' : '') +
                    (moved ? '<button type="button" role="menuitem" data-action="reset-word-branches" data-id="' + word.id + '">↺ 恢复系统分类</button>' : '') +
                  '</div>'
                : '') +
            '</div>' +
          '</div>' +
        '</header>' +
        '<div class="senses">' +
          word.senses.map(function (sense) { return senseHTML(sense, options); }).join('') +
        '</div>' +
        (options.hideBranches ? '' : branchLinksHTML(word)) +
      '</article>';
  }

  /* ============================================================
   * 路由
   * ============================================================ */
  const state = {
    route: { name: 'home', params: {} },
    treeSelected: null,
    treeExpanded: { '0': true },
    // 「放进词库」模式：{ id, word, step:'tree'|'confirm', code }
    //   tree    = 正在选末级分类
    //   confirm = 已选好分支，等用户选「移入」还是「加入」
    treePick: null,
    cardMenu: null,          // 卡片右上角 ⋯ 菜单展开的是哪张卡
    lanUrl: '',              // 设置页里显示的「手机打开这个地址」
    editor: null,            // 卡片编辑器状态
    treeEdit: null,          // 词库树编辑器状态
    confirm: null,           // 通用确认弹窗的回调
    tour: null,              // 新手引导（聚光灯）状态
    pendingStudy: null,      // 「复习这一批」临时指定的单词 id 列表
    study: null
  };

  function parseHash() {
    const raw = String(location.hash || '').replace(/^#/, '');
    if (!raw || raw === '/') return { name: 'home', params: {} };
    const parts = raw.split('?');
    const segs = parts[0].split('/').filter(Boolean);
    const params = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = i < 0 ? kv : kv.slice(0, i);
      const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      params[k] = v;
    });
    if (segs[0] === 'search') return { name: 'search', params: params };
    if (segs[0] === 'library') return { name: 'library', params: params };
    if (segs[0] === 'favorites') return { name: 'favorites', params: params };
    if (segs[0] === 'account') return { name: 'account', params: params };
    if (segs[0] === 'settings') return { name: 'settings', params: params };
    if (segs[0] === 'guide') return { name: 'guide', params: params };
    if (segs[0] === 'recent') return { name: 'recent', params: params };
    if (segs[0] === 'study') return { name: 'study', params: params };
    return { name: 'home', params: {} };
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render() {
    state.route = parseHash();
    const view = $('#view');
    const route = state.route;
    // 同一个页面内的重绘（点 ⋯ 菜单、收藏、保存、显示更多…）要保住滚动位置，
    // 只有真的换了页面（首页↔词库↔搜索…）才回到顶部；学习页每张卡都回到顶部。
    const routeKey = route.name + '|' + JSON.stringify(route.params || {});
    const samePage = routeKey === lastRouteKey;
    const prevY = (samePage && typeof window.scrollY === 'number') ? window.scrollY : 0;
    if (route.name === 'search') view.innerHTML = viewSearch(route.params.q || '');
    else if (route.name === 'library') view.innerHTML = viewLibrary(route.params.code);
    else if (route.name === 'favorites') view.innerHTML = viewFavorites(route.params.tab);
    else if (route.name === 'settings') view.innerHTML = viewSettings();
    else if (route.name === 'account') view.innerHTML = viewSettings();
    else if (route.name === 'guide') view.innerHTML = viewGuide();
    else if (route.name === 'recent') view.innerHTML = viewRecent(route.params.code, Number(route.params.day) || -1);
    else if (route.name === 'study') view.innerHTML = viewStudy(route.params.scope);
    else view.innerHTML = viewHome();
    document.body.classList.toggle('on-study', route.name === 'study');
    if (samePage && route.name !== 'study') restoreScroll(prevY);
    else window.scrollTo(0, 0);
    lastRouteKey = routeKey;
    syncNav();
    if (route.name === 'study') afterStudyRender();
    primeImages();
    if (route.name === 'settings' || route.name === 'account') {
      refreshDataStatus();
      probeImageSource();
      loadLanInfo();
      if (route.name === 'account') scrollToSection('sec-account');
    }
    if (route.name === 'home') maybeStartTour();
    if (state.tour) tourOnRoute(route.name);
  }

  /** 渲染完把某个区块滚到视野里（#/account 老链接会用到） */
  function scrollToSection(id) {
    const el = $('#' + id);
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    const y = el.getBoundingClientRect().top + (window.scrollY || 0) - 70;
    setTimeout(function () { try { window.scrollTo(0, y); } catch (e) { /* 忽略 */ } }, 0);
  }

  /** 问服务器「手机该用哪个地址」，显示在设置页里（省得去命令行里找） */
  function loadLanInfo() {
    const el = $('#lanAddr');
    if (!el) return;
    if (!YY_API.served()) {
      el.textContent = '当前是双击 index.html 打开的（file://），手机访问不了。' +
        '请在电脑上双击 start-server.bat 启动服务，再用它打印的局域网地址在手机上打开。';
      el.className = 'lan-addr is-warn';
      return;
    }
    const base = YY_API.base || location.origin;
    fetch(base.replace(/\/+$/, '') + '/api/lan')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        const urls = (d && d.urls) || [];
        state.lanUrl = (d && d.primary) || urls[0] || '';
        if (!state.lanUrl) throw new Error('empty');
        el.innerHTML = '手机打开：<b>' + esc(state.lanUrl) + '</b>' +
          (urls.length > 1 ? '<br><span class="lan-more">（其它网卡地址：' + esc(urls.slice(1).join('、')) + '，一般不用）</span>' : '');
        el.className = 'lan-addr is-ok';
      })
      .catch(function () {
        el.textContent = '没检测到局域网地址：确认电脑已联网，或直接在服务窗口里看「手机/同局域网」那一行。';
        el.className = 'lan-addr is-warn';
      });
  }

  /** 等浏览器把新内容排版完，再把滚动位置放回去（innerHTML 重绘会把它清成 0） */
  function restoreScroll(y) {
    if (!y) return;
    const run = function () { try { window.scrollTo(0, y); } catch (e) { /* 忽略 */ } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function syncNav() {
    const name = state.route.name;
    $$('.nav-link').forEach(function (a) {
      const target = a.getAttribute('data-nav');
      a.classList.toggle('is-active', target === name ||
        (target === 'home' && (name === 'home' || name === 'search')) ||
        (target === 'library' && name === 'library') ||
        (target === 'settings' && (name === 'settings' || name === 'account' || name === 'guide')));
    });
    const wordCount = CollectionStore.count();
    const libCount = LibraryStore.count();
    const total = wordCount + libCount;
    $$('.fav-count').forEach(function (badge) {
      badge.textContent = total;
      badge.hidden = total === 0;
      badge.title = '单词收藏 ' + wordCount + ' · 词库收藏 ' + libCount;
    });
  }

  /* ============================================================
   * 视图：首页
   * ============================================================ */
  /* ---------- 今日学习：统计口径 ---------- */
  const GOAL_KEY = 'yy_daily_goal';

  /** 某天的 0 点时间戳（offset：0=今天，-1=昨天） */
  function dayStart(offset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (offset || 0));
    return d.getTime();
  }
  function dayStartOf(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function studiedBetween(fromTs, toTs, code) {
    const all = ReviewStore.all();
    let filter = null;
    if (code) {
      const set = new Set(D.wordIdsOfBranch(code));
      filter = function (id) { return set.has(id); };
    }
    const out = [];
    Object.keys(all).forEach(function (k) {
      const ts = Number(all[k].last_review_time) || 0;
      if (ts < fromTs || ts >= toTs) return;
      const id = Number(k);
      if (filter && !filter(id)) return;
      out.push(id);
    });
    return out;
  }
  /** 连续学习天数（今天还没学就从昨天往前数，不会显示成 0） */
  function streakDays() {
    const days = Object.create(null);
    const all = ReviewStore.all();
    Object.keys(all).forEach(function (k) {
      const ts = Number(all[k].last_review_time) || 0;
      if (ts) days[dayStartOf(ts)] = 1;
    });
    let n = 0;
    let i = days[dayStart(0)] ? 0 : 1;
    while (days[dayStart(-i)]) { n++; i++; }
    return n;
  }
  /** 这个词"主要属于"哪个末级词库（取第一条释义的第一个语义标签；虚词按词性） */
  function primaryBranchOf(vocabId) {
    const w = D.wordById(vocabId);
    if (!w || !w.senses.length) return null;
    const s = w.senses[0];
    const code = (s.semantic_codes || [])[0];
    if (code && D.getNode(code)) return D.getNode(code);
    const kind = (D.POS_MAP[s.pos_tag] || {}).kind;
    if (kind === 'function') {
      return D.LEAF_NODES.filter(function (n) {
        return n.bindType === 'pos' && n.posTags.indexOf(s.pos_tag) > -1;
      })[0] || null;
    }
    return null;
  }
  function goalStore() {
    try { return JSON.parse(localStorage.getItem(GOAL_KEY) || 'null'); } catch (e) { return null; }
  }
  function setGoal(code, name) {
    try {
      if (code) localStorage.setItem(GOAL_KEY, JSON.stringify({ code: code, name: name || '', at: Date.now() }));
      else localStorage.removeItem(GOAL_KEY);
    } catch (e) { /* 忽略 */ }
  }
  /** 今日目标 = 一个词库 + 今天在这个词库里学了多少 */
  function goalView() {
    const g = goalStore();
    if (!g || !g.code) return null;
    const node = D.getNode(g.code);
    if (!node) return null;
    const ids = D.wordIdsOfBranch(g.code);
    const done = studiedBetween(dayStart(0), dayStart(1), g.code).length;
    return {
      code: g.code, name: node.name, total: ids.length, done: done,
      pct: ids.length ? Math.min(100, Math.round(done / ids.length * 100)) : 0,
      finished: ids.length > 0 && done >= ids.length
    };
  }
  function goalHTML(g) {
    if (!g) {
      return '<div class="tc-goal is-empty">' +
        '<span class="tc-goal-label">🎯 今日目标</span>' +
        '<span class="tc-goal-tip">还没设目标——挑一个词库，今天把它背完</span>' +
        '<button type="button" class="btn" data-action="pick-goal">选一个词库当目标</button>' +
        '</div>';
    }
    return '<div class="tc-goal">' +
      '<span class="tc-goal-label">🎯 今日目标：<b>' + esc(g.name) + '</b>' + (g.finished ? ' ✅ 已背完' : '') + '</span>' +
      '<span class="tc-bar"><span class="tc-bar-fill" style="width:' + g.pct + '%"></span></span>' +
      '<span class="tc-goal-num">' + g.done + ' / ' + g.total + '</span>' +
      '<span class="tc-goal-acts">' +
        '<button type="button" class="link-btn" data-action="pick-goal">换一个</button>' +
        '<button type="button" class="link-btn" data-action="clear-goal">取消目标</button>' +
      '</span>' +
      '</div>';
  }
  function yesterdayHTML(list) {
    if (!list.length) {
      return '<p class="tc-yesterday is-empty">昨天学过：<span class="tc-none">还没有记录——昨天背过的词库第二天会出现在这里，点进去可以单独复习那批词。</span></p>';
    }
    return '<p class="tc-yesterday">昨天学过：' + list.slice(0, 6).map(function (x) {
      const href = x.code
        ? '#/recent?code=' + encodeURIComponent(x.code) + '&day=-1'
        : '#/recent?day=-1';
      return '<a class="tc-chip" href="' + href + '" title="看看昨天在这里学了哪些词">' +
        esc(x.name) + '(' + x.count + ')</a>';
    }).join('') + (list.length > 6 ? '<span class="tc-more">等 ' + list.length + ' 个</span>' : '') + '</p>';
  }
  function todayRoundsHTML(rounds) {
    if (!rounds.length) {
      return '<p class="tc-rounds-empty">今天还没开始——背完一轮会记在这里（词库名 · 词数 · 记住/模糊/忘记）。</p>';
    }
    const t = rounds.reduce(function (a, r) {
      a.forget += Number(r.forget) || 0; a.vague += Number(r.vague) || 0;
      a.know += Number(r.know) || 0; a.total += Number(r.total) || 0;
      return a;
    }, { forget: 0, vague: 0, know: 0, total: 0 });
    return '<details class="tc-rounds"><summary>今天 ' + rounds.length + ' 轮 · ' + t.total +
      ' 个词（记住 ' + t.know + ' / 模糊 ' + t.vague + ' / 忘记 ' + t.forget + '）</summary>' +
      '<ul class="tc-round-list">' + rounds.slice().reverse().map(function (r) {
        return '<li>' + esc(r.label || '学习') + ' · ' + (Number(r.total) || 0) + ' 个（记住 ' +
          (Number(r.know) || 0) + ' / 模糊 ' + (Number(r.vague) || 0) + ' / 忘记 ' + (Number(r.forget) || 0) + '）' +
          (r.partial ? ' <span class="tc-partial">未背完</span>' : '') + '</li>';
      }).join('') + '</ul></details>';
  }
  /** 首页「今日学习」要的全部数据 */
  function todaysStudy() {
    const todayIds = studiedBetween(dayStart(0), dayStart(1));
    const log = StudyLog.list();
    const rounds = log.filter(function (x) {
      const ts = Number(x.finished_at) || 0;
      return ts >= dayStart(0) && ts < dayStart(1);
    });
    const yLog = log.filter(function (x) {
      const ts = Number(x.finished_at) || 0;
      return ts >= dayStart(-1) && ts < dayStart(0);
    });
    // 昨天学过的词库：优先用"学习日志"（准确记录你从哪个词库进去学的）
    const seen = Object.create(null);
    const yesterday = [];
    yLog.forEach(function (x) {
      const scope = String(x.scope || '');
      const code = scope.indexOf('lib:') === 0 ? scope.slice(4) : '';
      const key = code || ('@' + (x.label || ''));
      if (seen[key]) { seen[key].count += Number(x.total) || 0; return; }
      const node = code ? D.getNode(code) : null;
      seen[key] = { code: node ? code : '', name: (node && node.name) || x.label || '学习', count: Number(x.total) || 0 };
      yesterday.push(seen[key]);
    });
    // 日志里没有昨天的记录（比如中途退出过、或被 50 条上限挤掉）→ 用记忆记录兜底
    if (!yesterday.length) {
      const byCode = Object.create(null);
      studiedBetween(dayStart(-1), dayStart(0)).forEach(function (id) {
        const node = primaryBranchOf(id);
        if (!node) return;
        const cur = byCode[node.code] || (byCode[node.code] = { code: node.code, name: node.name, count: 0 });
        cur.count++;
      });
      yesterday.push.apply(yesterday, Object.keys(byCode).map(function (k) { return byCode[k]; })
        .sort(function (a, b) { return b.count - a.count; }));
    }
    const last = log.length ? log[log.length - 1] : null;
    return {
      count: todayIds.length,
      rounds: rounds,
      yesterday: yesterday,
      streak: streakDays(),
      lastScope: last ? last.scope : '',
      lastLabel: last ? last.label : ''
    };
  }

  function viewHome() {
    const stats = ReviewStore.stats(D.allWords().map(function (w) { return w.id; }));
    const today = todaysStudy();
    const goal = goalView();

    return '' +
      '<section class="hero">' +
        '<h1 class="visually-hidden">Snow Lexis · 词库之树，枝枝相筑</h1>' +
        '<img class="hero-logo" src="assets/snow-lexis-branch.png" alt="Snow Lexis 标志（雪花与树）" width="320" height="319">' +
        '<h1 class="site-title">Snow Lexis</h1>' +
        '<p class="site-slogan">A lexicon tree, built branch by branch.</p>' +
        '<p class="site-sub">词库之树，枝枝相筑。</p>' +
        '<form class="search-bar" id="searchForm" autocomplete="off">' +
          '<input type="text" id="searchInput" name="q" placeholder="输入英文或中文，例如 bank / 银行 / 跑 / 关闭" aria-label="搜索单词">' +
          '<button type="submit" class="btn btn-primary">搜索</button>' +
        '</form>' +
        '<div class="hero-actions">' +
          '<button type="button" class="btn" data-action="open-tree">词库树</button>' +
          '<a class="btn" href="#/favorites">我的收藏<span class="pill fav-count" ' + (CollectionStore.count() + LibraryStore.count() ? '' : 'hidden') + '>' + (CollectionStore.count() + LibraryStore.count()) + '</span></a>' +
        '</div>' +
      '</section>' +

      (riskBanner() || '') +

      '<section class="today-card">' +
        '<div class="tc-head">' +
          '<h2>今日学习</h2>' +
          '<p class="tc-nums">今日已学 <b>' + today.count + '</b> 个 · 待复盘 <b>' + stats.due + '</b> 个' +
            ' · 累计已学 <b>' + stats.learned + '</b> 个' +
            ' · 连续学习 <b>' + today.streak + '</b> 天</p>' +
        '</div>' +
        goalHTML(goal) +
        '<div class="tc-actions">' +
          (stats.due > 0
            ? '<button type="button" class="btn btn-primary" data-action="study" data-scope="due">▶ 开始复盘（' + stats.due + '）</button>'
            : '<button type="button" class="btn btn-primary" data-action="study" data-scope="all">▶ 学新词</button>') +
          (goal && goal.code ? '<button type="button" class="btn" data-action="study" data-scope="lib:' + esc(goal.code) + '">继续「' + esc(goal.name) + '」</button>' : '') +
          // 「继续上次」和「今日目标」是同一个词库时只显示一个，别重复
          (today.lastLabel && (!goal || !goal.code || today.lastScope !== 'lib:' + goal.code)
            ? '<button type="button" class="btn" data-action="study" data-scope="' + esc(today.lastScope) + '">继续「' + esc(today.lastLabel) + '」</button>'
            : '') +
        '</div>' +
        yesterdayHTML(today.yesterday) +
        todayRoundsHTML(today.rounds) +
      '</section>' +

      '<footer class="site-foot">' +
        '<a class="link-btn" href="#/guide">新手教程</a>' +
        '<a class="link-btn" href="#/settings">设置 · 数据备份</a>' +
        '<span>数据存在你自己的浏览器里，账号同步与备份在设置里</span>' +
      '</footer>';
  }

  /** 首页只在"真有丢数据风险"时提醒一句，平时保持干净 */
  function riskBanner() {
    const s = store.summary();
    const snap = store.localBackup();
    const hasLocal = s.words_learned + s.word_favorites + s.library_favorites > 0;
    const snapHasData = !!snap && (Object.keys(snap.review_records || {}).length > 0 ||
      (snap.word_collection || []).length > 0 || (snap.library_collection || []).length > 0);
    if (!hasLocal && snapHasData) {
      return '<section class="ds-alert">⚠ 检测到浏览器里还留着一份数据快照，但当前显示是空的（可能换了浏览器或清了缓存）——' +
        '<a href="#/settings">去设置里一键找回</a></section>';
    }
    const days = s.last_change_at ? (Date.now() - s.last_change_at) / 86400000 : 0;
    if (hasLocal && days > 7) {
      return '<section class="ds-alert">⚠ 已经 ' + Math.floor(days) + ' 天没备份了——' +
        '<a href="#/settings">去设置里导出或自动备份</a>，免得清缓存后进度丢失。</section>';
    }
    return '';
  }

  /* ============================================================
   * 新手引导（聚光灯）：首次打开自动来一遍，随时可从设置/教程重看
   *   覆盖层不吃点击（pointer-events:none），只把目标"挖亮"，用户可以真的点
   * ============================================================ */
  const TOUR_KEY = 'yy_tour_done';
  const TOUR_STEPS = [
    {
      sel: '.hero-logo', place: 'bottom',
      title: '欢迎来到 Snow Lexis',
      text: '一个单词一张卡片，卡片里能放好几条释义：词性、中文意思、英/美音标、配图都跟着「这一条释义」走。'
    },
    {
      sel: '.today-card', place: 'top',
      title: '今日学习：一眼看清今天做什么',
      text: '这里显示今天已学多少、多少个到期该复盘、累计和连续天数；还能给今天挑一个<b>目标词库</b>看进度条；' +
        '「昨天学过」点进去就是昨天那批词，可以单独复习。'
    },
    {
      sel: '#searchForm', place: 'bottom', nextGo: '#/search?q=bank', nextLabel: '去搜 bank 试试',
      title: '找词：中英文都能搜',
      text: '搜索框支持中英文双向：输 bank 或「银行」都行，回车即搜。点下面的按钮，我带你去看搜出来的卡片。'
    },
    {
      sel: '.word-card-head', place: 'bottom',
      title: '一个单词 = 一张卡片',
      text: '一个词只有一张卡，卡里把它的多条释义聚合在一起（每条各带词性、标签、音标、配图）；右上角 ⋯ 是「放进词库 / 编辑卡片」的入口。'
    },
    {
      sel: '[data-action="open-tree"]', place: 'bottom', requireClick: true, advanceOn: 'treeOpen',
      title: '按分类背：词库树',
      text: '想按主题背就点这个「词库树」。现在点一下它（我也会跟着你走）。'
    },
    {
      sel: '.tree-body', place: 'left', requireClick: true, advanceOn: 'leafSelected',
      title: '点一个末级分类',
      text: '带 ▸ 的还能继续展开；点最末一级（括号里是词数的那些）——比如「房屋」，选中后我会带你去下一步。'
    },
    {
      sel: '[data-action="open-branch-selected"]', requireClick: true, advanceOn: 'route:library',
      title: '打开这个词库',
      text: '选好了就点这个「打开词库」进词库页（就在弹窗右下角）。'
    },
    {
      sel: '.page-actions', place: 'bottom', requireClick: true, advanceOn: 'route:study',
      title: '词库页与卡片菜单',
      text: '词库页顶部是「开始学习 / 🎯 设为今日目标 / ＋ 导入新词 / ☆ 收藏该词库」；' +
        '每张卡的 ⋯ 里能放进别的词库、编辑卡片。想继续就点「开始学习」。'
    },
    {
      sel: '.rating-bar', place: 'top', last: true,
      title: '翻面 + 三档评级',
      text: '卡片正面只有英文，点一下翻面看释义、音标和发音；再选【忘记】【模糊】【记住】，系统按艾宾浩斯自动安排下次复习（5 分钟→30 分钟→2 小时→12 小时→1 天→2 天）。'
    }
  ];

  function tourDone() {
    try { return localStorage.getItem(TOUR_KEY) === '1'; } catch (e) { return false; }
  }
  function markTourDone() {
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* 忽略 */ }
  }
  function startTour() {
    state.tour = { i: 0 };
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.add('tour-on');
    }
    const el = $('#tour');
    if (el) el.hidden = false;
    renderTour();
  }
  function endTour(silent) {
    state.tour = null;
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.remove('tour-on');
    }
    const el = $('#tour');
    if (el) el.hidden = true;
    markTourDone();
    if (!silent) toast('引导结束。想再看一遍：设置 → 新手教程');
  }
  function maybeStartTour() {
    if (state.tour || tourDone()) return;
    setTimeout(function () { if (!state.tour && !tourDone()) startTour(); }, 700);
  }
  /** 某一步的"跟做"条件达成（打开词库树 / 进到某个页面）时推进 */
  function tourAdvanceIf(kind) {
    const st = state.tour;
    if (!st) return;
    const step = TOUR_STEPS[st.i];
    if (step && step.requireClick && step.advanceOn === kind) tourStep(st.i + 1);
  }
  function tourOnRoute(name) {
    tourAdvanceIf('route:' + name);
    if (state.tour) setTimeout(renderTour, 60);      // 换页后重新定位
  }
  function tourStep(i) {
    if (!state.tour) return;
    if (i >= TOUR_STEPS.length) { endTour(false); return; }
    state.tour.i = i;
    renderTour();
  }
  function renderTour() {
    const st = state.tour;
    if (!st) return;
    const wrap = $('#tour');
    if (!wrap) return;
    const step = TOUR_STEPS[st.i];
    if (!step) { endTour(false); return; }
    const hole = $('#tourHole');
    const dot = $('#tourStep');
    const title = $('#tourTitle');
    const text = $('#tourText');
    const foot = $('#tourFoot');
    const target = $(step.sel);
    const vw = window.innerWidth || 390;
    const vh = window.innerHeight || 700;

    let box = null;
    if (target && typeof target.getBoundingClientRect === 'function') {
      const r = target.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        if (r.top < 60 || r.bottom > vh - 60) {
          try { target.scrollIntoView({ block: 'center' }); } catch (e) { /* 忽略 */ }
        }
        const r2 = target.getBoundingClientRect();
        const pad = 8;
        const left = Math.max(6, Math.min(vw - 12, r2.left - pad));
        const top = Math.max(6, Math.min(vh - 12, r2.top - pad));
        box = {
          left: left, top: top,
          width: Math.max(24, Math.min(vw - 12 - left, r2.width + pad * 2)),
          height: Math.max(24, Math.min(vh - 12 - top, r2.height + pad * 2))   // 目标比屏幕还高时，洞口最多铺满视口
        };
      }
    }
    if (hole) {
      if (box) {
        hole.style.left = box.left + 'px'; hole.style.top = box.top + 'px';
        hole.style.width = box.width + 'px'; hole.style.height = box.height + 'px';
        hole.hidden = false;
      } else { hole.hidden = true; }
    }
    if (dot) dot.textContent = '第 ' + (st.i + 1) + ' / ' + TOUR_STEPS.length + ' 步';
    if (title) title.textContent = step.title;
    if (text) {
      text.innerHTML = step.text + (box ? '' : '<br><span class="tour-warn">（这一步要指的地方还没出现，先点「下一步」或「跳过」）</span>');
    }
    const tip = $('#tourTip');
    if (tip) {
      // 「左侧模式」用窄一点的气泡，好塞进弹窗左边的空白里，绝不压住要点的分类名
      const tw = step.place === 'left' ? Math.min(260, vw - 40) : Math.min(360, vw - 24);
      tip.style.width = tw + 'px';
      let left = box ? box.left + box.width / 2 - tw / 2 : vw / 2 - tw / 2;
      left = Math.max(12, Math.min(vw - tw - 12, left));
      // 气泡位置：优先放目标下面 → 放不下放上面 → 都放不下就贴着屏幕底部（保证按钮一定点得到）
      const tipH = tip.offsetHeight || 168;
      const margin = 12;
      let top;
      if (!box) {
        top = vh / 2 - tipH / 2;
      } else if (step.place === 'left' && box.left - tw - 16 >= 8) {
        // 目标左右没空间放气泡时的稳妥做法：塞进左边的空白里，绝对不挡要点的东西
        left = Math.max(10, box.left - tw - 14);
        top = Math.max(12, Math.min(vh - tipH - 12, box.top + 20));
      } else if (step.place === 'left') {
        // 窄屏时弹窗几乎占满屏幕：贴到最上面（压住弹窗标题无所谓），
        // 下面的分类列表和底部按钮都露出来，用户照点不误
        top = 10;
      } else {
        const below = box.top + box.height + 12;
        const above = box.top - tipH - 12;
        if (below + tipH <= vh - margin) top = below;
        else if (above >= margin) top = above;
        else top = vh - tipH - margin;
      }
      top = Math.max(margin, Math.min(vh - tipH - margin, top));
      tip.style.left = left + 'px';
      tip.style.top = Math.round(top) + 'px';
    }
    if (foot) {
      const prevBtn = st.i > 0 ? '<button type="button" class="btn" data-action="tour-prev">上一步</button>' : '';
      const nextLabel = step.last ? '开始用吧 ✓'
        : (step.requireClick ? '点上面的按钮继续' : (step.nextLabel || '下一步'));
      const nextBtn = step.last
        ? '<button type="button" class="btn btn-primary" data-action="tour-skip">开始用吧 ✓</button>'
        : (step.requireClick ? '' : '<button type="button" class="btn btn-primary" data-action="tour-next">' + esc(nextLabel) + '</button>');
      foot.innerHTML = prevBtn + nextBtn +
        (step.requireClick
          ? '<span class="tour-wait">' + esc(nextLabel) + '</span>' +
            '<button type="button" class="link-btn" data-action="tour-next">跳过这一步 →</button>'
          : '') +
        '<button type="button" class="link-btn" data-action="tour-skip">跳过引导</button>';
    }
  }

  /* ============================================================
   * 视图：某天学过的词（首页「昨天学过」点进来）
   * ============================================================ */
  function viewRecent(code, dayOffset) {
    const off = Number(dayOffset) || -1;
    const node = code ? D.getNode(code) : null;
    const ids = studiedBetween(dayStart(off), dayStart(off + 1), node ? code : '');
    const words = ids.map(function (id) { return D.wordById(id); }).filter(Boolean);
    const dayName = off === -1 ? '昨天' : (off === 0 ? '今天' : '那天');
    return '' +
      '<nav class="breadcrumb">Snow Lexis <span class="crumb-sep">/</span> ' + dayName + '学过的词' +
        (node ? ' <span class="crumb-sep">/</span> ' + esc(node.name) : '') + '</nav>' +
      '<div class="page-head">' +
        '<div class="page-head-main">' +
          '<h2 class="page-title">' + dayName + (node ? '在「' + esc(node.name) + '」' : '在各个词库') + '学过的词</h2>' +
          '<p class="page-desc">共 <b>' + words.length + '</b> 个卡片 · 点卡片看释义，或直接开始复习这一批</p>' +
        '</div>' +
        '<div class="page-actions">' +
          (words.length
            ? '<button type="button" class="btn btn-primary" data-action="study-ids" ' +
                'data-label="' + esc(dayName + (node ? '在「' + node.name + '」' : '') + '学过的词') + '" ' +
                'data-ids="' + words.map(function (w) { return w.id; }).join(',') + '">▶ 复习这一批（' + words.length + '）</button>'
            : '') +
          '<a class="btn" href="#/">回首页</a>' +
        '</div>' +
      '</div>' +
      (words.length
        ? '<div class="word-list">' + words.map(function (w) { return wordCardHTML(w); }).join('') + '</div>'
        : '<div class="empty"><h3>' + dayName + '没有学习记录</h3><p>去首页看看「今日学习」吧。</p>' +
          '<p><a class="btn btn-primary" href="#/">回首页</a></p></div>');
  }

  /* ============================================================
   * 视图：搜索结果
   * ============================================================ */
  function viewSearch(q) {
    const word = D.wordByText(q);
    const all = word ? [word] : D.searchWords(q);
    const list = all.slice(0, SEARCH_MAX);   // 28k 词后中文检索可能命中上千条，只渲染前一批
    return '' +
      '<div class="page-head">' +
        '<div class="page-head-main">' +
          '<form class="search-bar search-bar-inline" id="searchForm" autocomplete="off">' +
            '<input type="text" id="searchInput" name="q" value="' + esc(q) + '" placeholder="输入英文或中文" aria-label="搜索单词">' +
            '<button type="submit" class="btn btn-primary">搜索</button>' +
          '</form>' +
          '<p class="result-meta">' +
            (q ? '关键词「' + esc(q) + '」命中 ' + all.length + ' 张单词卡片（中英文双向检索）'
              + (all.length > list.length ? ' · 只显示前 ' + list.length + ' 张，请用更具体的关键词' : '')
              : '请输入英文单词或中文释义') +
          '</p>' +
        '</div>' +
      '</div>' +
      (list.length
        ? '<div class="word-list">' + list.map(function (w) { return wordCardHTML(w); }).join('') + '</div>'
        : (q
          ? '<div class="empty"><h3>没有找到匹配的单词</h3><p>可以试试：bank / 银行 / run / 跑步 / close / 关闭 / in</p></div>'
          : '<div class="empty"><h3>等待输入</h3><p>搜索支持英文单词与中文释义双向匹配</p></div>'));
  }

  /* ============================================================
   * 视图：词库列表
   * ============================================================ */
  function viewLibrary(code) {
    const node = D.getNode(code);
    if (!node) {
      return '<div class="empty"><h3>词库不存在</h3><p>请返回首页，从词库树重新选择分类。</p>' +
        '<p><a class="btn btn-primary" href="#/">回到首页</a></p></div>';
    }
    // 自己导入的词排最前（刚加完就能看到），其余保持原顺序
    const words = D.wordsOfBranch(code).slice().sort(function (a, b) {
      return (a.user_added ? 0 : 1) - (b.user_added ? 0 : 1);
    });
    const ids = words.map(function (w) { return w.id; });
    const stats = ReviewStore.stats(ids);
    const isPosBranch = node.bindType === 'pos';
    const libFaved = LibraryStore.has(code);
    const goal = goalStore();
    const isGoal = !!(goal && goal.code === code);
    // 词库大了不能一次全渲染（最大的分支 4000+ 词），先渲染一屏，剩下的点「显示更多」
    const shown = Math.min(words.length, libLimits[code] || LIBRARY_PAGE);
    const visible = words.slice(0, shown);
    const rest = words.length - shown;

    return '' +
      '<nav class="breadcrumb">' + pathBreadcrumb(node.pathText) + '</nav>' +
      '<div class="page-head">' +
        '<div class="page-head-main">' +
          '<h2 class="page-title">' + esc(node.name) + '</h2>' +
          '<p class="page-desc">' +
            (isPosBranch
              ? '词性分支：命中所有 pos_tag ∈ {' + esc((node.posTags || [node.posTag]).join(', ')) + '} 的释义 '
              : '语义分支：命中所有绑定该语义标签的释义 ') +
            '· ' + words.length + ' 张卡片 · ' + stats.total + ' 个单词' +
          '</p>' +
          '<p class="page-desc muted">待复习 <b>' + stats.due + '</b> · 新词 <b>' + stats.fresh + '</b> · 已排期 <b>' + stats.scheduled + '</b>' +
            (stats.learned ? ' · 平均熟悉度 ' + stats.avg_level + ' 级' : '') + '</p>' +
        '</div>' +
        '<div class="page-actions">' +
          '<button type="button" class="btn btn-primary" data-action="study" data-scope="lib:' + esc(code) + '">开始学习</button>' +
          '<button type="button" class="btn' + (isGoal ? ' is-on' : '') + '" data-action="toggle-goal" data-code="' + esc(code) + '">' +
            (isGoal ? '🎯 今日目标' : '🎯 设为今日目标') +
          '</button>' +
          '<button type="button" class="btn" data-action="open-import" data-code="' + esc(code) + '">＋ 导入新词</button>' +
          '<button type="button" class="btn' + (libFaved ? ' is-on' : '') + '" data-action="toggle-lib-fav" data-code="' + esc(code) + '">' +
            (libFaved ? '★ 已收藏该词库' : '☆ 收藏该词库') +
          '</button>' +
        '</div>' +
      '</div>' +
      (words.length
        ? '<div class="word-list">' + visible.map(function (w) { return wordCardHTML(w, { highlightCode: code }); }).join('') + '</div>' +
          (rest > 0
            ? '<div class="load-more-wrap">' +
                '<button type="button" class="btn" data-action="load-more" data-code="' + esc(code) + '" data-shown="' + shown + '">' +
                  '显示更多（还有 ' + rest + ' 个）</button>' +
                '<p class="load-more-tip">已显示 ' + shown + ' / ' + words.length + ' 个 · 也可以直接搜索找词</p>' +
              '</div>'
            : '')
        : '<div class="empty"><h3>该分类暂无单词</h3><p>换一个末级分类看看吧。</p></div>');
  }

  /* ============================================================
   * 视图：我的收藏
   * ============================================================ */
  /** 收藏页：单词收藏 / 词库收藏 两个标签页 */
  function viewFavorites(tab) {
    const active = tab === 'libs' ? 'libs' : 'words';
    const ids = CollectionStore.ids();
    const words = ids.map(function (id) { return D.wordById(id); }).filter(Boolean);
    const libs = LibraryStore.all();
    const wordStats = ReviewStore.stats(ids);

    const libRows = libs.map(function (item) {
      const node = D.getNode(item.code);
      const libIds = node ? D.wordIdsOfBranch(item.code) : [];
      const st = ReviewStore.stats(libIds);
      return { item: item, node: node, count: libIds.length, stats: st };
    });
    const libIdSet = new Set();
    libRows.forEach(function (r) {
      if (r.node) D.wordIdsOfBranch(r.item.code).forEach(function (id) { libIdSet.add(id); });
    });
    const libStats = ReviewStore.stats(Array.from(libIdSet));

    const tabs = '' +
      '<div class="tabs">' +
        '<a class="tab' + (active === 'words' ? ' is-active' : '') + '" href="#/favorites">单词收藏<b>' + words.length + '</b></a>' +
        '<a class="tab' + (active === 'libs' ? ' is-active' : '') + '" href="#/favorites?tab=libs">词库收藏<b>' + libs.length + '</b></a>' +
      '</div>';

    const head = '' +
      '<nav class="breadcrumb">词库树 <span class="crumb-sep">/</span> 我的收藏</nav>' +
      '<div class="page-head">' +
        '<div class="page-head-main">' +
          '<h2 class="page-title">我的收藏</h2>' +
          (active === 'words'
            ? '<p class="page-desc">单个单词收藏 ' + words.length + ' 张卡片 · 与词库收藏各自独立，可分别背诵</p>' +
              '<p class="page-desc muted">待复习 <b>' + wordStats.due + '</b> · 新词 <b>' + wordStats.fresh + '</b> · 已排期 <b>' + wordStats.scheduled + '</b></p>'
            : '<p class="page-desc">词库收藏 ' + libs.length + ' 个分支（订阅式：该分类以后新增的词会自动进入）</p>' +
              '<p class="page-desc muted">共 ' + libIdSet.size + ' 个单词 · 待复习 <b>' + libStats.due + '</b> · 新词 <b>' + libStats.fresh + '</b></p>') +
        '</div>' +
        '<div class="page-actions">' +
          (active === 'words'
            ? '<button type="button" class="btn btn-primary" data-action="study" data-scope="fav"' + (words.length ? '' : ' disabled') + '>开始学习单词收藏</button>' +
              '<button type="button" class="btn" data-action="clear-fav"' + (words.length ? '' : ' disabled') + '>清空单词收藏</button>'
            : '<button type="button" class="btn btn-primary" data-action="study" data-scope="favlib"' + (libs.length ? '' : ' disabled') + '>学习全部收藏词库（' + libIdSet.size + '）</button>' +
              '<button type="button" class="btn" data-action="clear-fav-libs"' + (libs.length ? '' : ' disabled') + '>清空词库收藏</button>') +
        '</div>' +
      '</div>' + tabs;

    if (active === 'words') {
      return head + (words.length
        ? '<div class="word-list">' + words.map(function (w) { return wordCardHTML(w, { hideBranches: false }); }).join('') + '</div>'
        : '<div class="empty"><h3>还没有收藏任何单词</h3><p>在搜索结果卡片或词库列表点击「☆ 收藏」即可加入单词收藏。</p>' +
          '<p><a class="btn btn-primary" href="#/">去搜索单词</a></p></div>');
    }

    return head + (libRows.length
      ? '<div class="lib-list">' + libRows.map(function (r) {
          const path = r.node ? r.node.pathText : '';
          const name = r.node ? r.node.name : (r.item.name || r.item.code);
          const missing = !r.node;
          return '' +
            '<article class="lib-card">' +
              '<div class="lib-main">' +
                '<div class="lib-path">' + (missing ? '分类已不存在：<code>' + esc(r.item.code) + '</code>' : pathBreadcrumb(path)) + '</div>' +
                '<h3 class="lib-name">' + esc(name) + '</h3>' +
                (missing
                  ? '<p class="lib-meta muted">分类树里已找不到这个分支，建议移除收藏</p>'
                  : '<p class="lib-meta">' + r.count + ' 张卡片 · 待复习 <b>' + r.stats.due + '</b> · 新词 <b>' + r.stats.fresh + '</b> · 已排期 <b>' + r.stats.scheduled + '</b></p>') +
              '</div>' +
              '<div class="lib-actions">' +
                (missing ? '' : '<button type="button" class="btn btn-primary" data-action="study" data-scope="lib:' + esc(r.item.code) + '">开始学习</button>') +
                (missing ? '' : '<a class="btn" href="#/library?code=' + encodeURIComponent(r.item.code) + '">打开词库</a>') +
                '<button type="button" class="btn" data-action="unfav-lib" data-code="' + esc(r.item.code) + '">取消收藏</button>' +
              '</div>' +
            '</article>';
        }).join('') + '</div>'
      : '<div class="empty"><h3>还没有收藏任何词库</h3><p>在词库列表页顶部点击「☆ 收藏该词库」，或从词库树里收藏一个分类。</p>' +
        '<p><button type="button" class="btn btn-primary" data-action="open-tree">打开词库树</button></p></div>');
  }

  /* ============================================================
   * 背诵模式（翻转卡片 + 记忆曲线）
   * ============================================================ */
  function resolveScope(scope) {
    if (scope === 'fav') {
      return { scope: scope, label: '单词收藏', ids: CollectionStore.ids() };
    }
    if (scope === 'favlib') {
      // 多个收藏词库取并集，按单词去重
      const set = new Set();
      LibraryStore.all().forEach(function (item) {
        D.wordIdsOfBranch(item.code).forEach(function (id) { set.add(id); });
      });
      return { scope: scope, label: '收藏的词库', ids: Array.from(set) };
    }
    if (scope === 'all') {
      return { scope: scope, label: '全部单词', ids: D.allWords().map(function (w) { return w.id; }) };
    }
    if (scope === 'due') {
      const now = Date.now();
      const ids = D.allWords().map(function (w) { return w.id; }).filter(function (id) {
        const rec = ReviewStore.get(id);
        return rec && Number(rec.next_review_time) <= now;
      });
      return { scope: scope, label: '今日复习', ids: ids };
    }
    if (scope === 'pending') {
      const p = state.pendingStudy;
      return { scope: scope, label: (p && p.label) || '这一批词', ids: (p && p.ids) || [] };
    }
    if (scope && scope.indexOf('lib:') === 0) {
      const code = scope.slice(4);
      const node = D.getNode(code);
      return { scope: scope, label: node ? node.name : '词库', code: code, ids: D.wordIdsOfBranch(code) };
    }
    return { scope: scope, label: '学习', ids: [] };
  }

  /** 组卷：不改变路由，供 viewStudy 直接复用 */
  function buildSession(scope) {
    const info = resolveScope(scope);
    if (!info.ids.length) return null;
    const q = ReviewStore.buildQueue(info.ids, Date.now());
    return {
      scope: info.scope,
      label: info.label,
      code: info.code,
      ids: info.ids,
      queue: q.queue,
      meta: q,
      index: 0,
      flipped: false,
      finished: false,
      stats: { forget: 0, vague: 0, know: 0 },
      results: []
    };
  }

  function startStudy(scope) {
    const session = buildSession(scope);
    if (!session) {
      toast('该范围暂无可学习的单词');
      return;
    }
    state.study = session;
    navigate('#/study?scope=' + encodeURIComponent(scope));
  }

  function studyCardHTML(word) {
    const rec = ReviewStore.get(word.id);
    const tag = !rec ? '新词' : (Number(rec.next_review_time) <= Date.now() ? '待复习' : '复习 · ' + rec.familiarity + '级');
    return '' +
      '<div class="flashcard" id="flashcard" data-action="flip-card" data-flipped="0" style="height:' + frontHeight() + 'px">' +
        '<div class="flashcard-inner">' +
          '<section class="face face-front">' +
            '<span class="face-badge">' + esc(tag) + '</span>' +
            '<div class="front-word">' + esc(word.word) + '</div>' +
            '<div class="face-hint">点击卡片查看释义（空格键）</div>' +
          '</section>' +
          '<section class="face face-back">' +
            '<header class="back-head">' +
              '<span class="back-word">' + esc(word.word) + '</span>' +
              '<span class="back-meta">' + word.senses.length + ' 条释义 · ' + esc(tag) + '</span>' +
            '</header>' +
            '<div class="senses senses-back">' +
              word.senses.map(function (sense) { return senseHTML(sense); }).join('') +
            '</div>' +
            '<p class="back-tip">评级后自动安排下次复习时间</p>' +
          '</section>' +
        '</div>' +
      '</div>';
  }

  function viewStudy(scope) {
    // 直接打开链接（刷新 / 分享）时，按 scope 重新组卷
    let s = state.study;
    if (!s || s.scope !== scope) {
      s = buildSession(scope);
      state.study = s;
    }
    if (!s) {
      const node = scope && scope.indexOf('lib:') === 0 ? D.getNode(scope.slice(4)) : null;
      const backHash = node ? '#/library?code=' + encodeURIComponent(node.code) : '#/';
      return '<div class="empty"><h3>没有可学习的单词</h3><p>请先从词库树或我的收藏进入。</p>' +
        '<p><a class="btn btn-primary" href="' + backHash + '">返回</a></p></div>';
    }

    if (!s.queue.length) {
      return '' +
        '<nav class="breadcrumb">' + esc(s.label) + ' <span class="crumb-sep">/</span> 记忆卡片</nav>' +
        '<div class="empty">' +
          '<h3>' + (s.meta.total ? '本词库单词全部处于复习排期中' : '本词库暂无单词') + '</h3>' +
          '<p>' + (s.meta.scheduled ? '未到复习时间的有 ' + s.meta.scheduled + ' 个单词，可先做一次强制复习。' : '') + '</p>' +
          '<p>' +
            (s.meta.scheduled ? '<button type="button" class="btn btn-primary" data-action="force-review" data-scope="' + esc(s.scope) + '">立即复习全部 ' + s.meta.total + ' 个单词</button> ' : '') +
            '<a class="btn" href="' + (s.code ? '#/library?code=' + encodeURIComponent(s.code) : '#/') + '">返回</a>' +
          '</p>' +
        '</div>';
    }

    if (s.finished) return viewStudyResult(s);

    const word = D.wordById(s.queue[s.index]);
    const total = s.queue.length;
    const pct = Math.round((s.index / total) * 100);
    return '' +
      '<nav class="breadcrumb">' + esc(s.label) + ' <span class="crumb-sep">/</span> 记忆卡片</nav>' +
      '<div class="page-head study-head">' +
        '<div class="page-head-main">' +
          '<h2 class="page-title">' + esc(s.label) + ' · 记忆卡片</h2>' +
          '<p class="page-desc">本轮 ' + total + ' 张（待复习 ' + s.meta.due.length + ' · 新词 ' + s.meta.fresh.length + '）' +
            (s.meta.scheduled.length ? ' · 未到期 ' + s.meta.scheduled.length + ' 张本轮跳过' : '') + '</p>' +
        '</div>' +
        '<div class="page-actions">' +
          '<button type="button" class="btn" data-action="exit-study">退出学习</button>' +
        '</div>' +
      '</div>' +
      '<div class="progress-row"><span>第 ' + (s.index + 1) + ' / ' + total + ' 张</span><span>' + pct + '%</span></div>' +
      '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      studyCardHTML(word) +
      '<div class="rating-bar" id="ratingBar" data-enabled="' + (s.flipped ? '1' : '0') + '">' +
        R.RATINGS.map(function (r) {
          return '<button type="button" class="btn btn-rate rate-' + r.key + '" data-action="rate" data-rating="' + r.key + '"' +
            (s.flipped ? '' : ' disabled') + '>' +
            '<b>' + r.label + '</b><span>' + r.desc + '</span></button>';
        }).join('') +
      '</div>' +
      '<p class="rating-tip" id="ratingTip">' +
        (s.flipped ? '评级后自动计算下次复习时间：' + R.INTERVALS.join(' / ') + ' 分钟（0~5 级）' : '先翻牌查看完整释义，再进行记忆评级') +
      '</p>' +
      '<p class="key-tip">快捷键：空格翻牌 · 1 忘记 / 2 模糊 / 3 记住</p>';
  }

  function viewStudyResult(s) {
    const next = s.results.map(function (r) {
      const word = D.wordById(r.vocabId);
      return '<li><span class="res-word">' + esc(word.word) + '</span>' +
        '<span class="res-rating rate-' + r.rating + '">' + R.RATING_MAP[r.rating].label + '</span>' +
        '<span class="res-level">' + r.record.familiarity + ' 级</span>' +
        '<span class="res-next">下次复习：' + R.formatTime(r.record.next_review_time) + '（+' + R.humanInterval(r.record.interval_minutes) + '）</span></li>';
    }).join('');

    return '' +
      '<nav class="breadcrumb">' + esc(s.label) + ' <span class="crumb-sep">/</span> 本轮结果</nav>' +
      '<div class="study-result">' +
        '<h2>本轮学习完成</h2>' +
        '<p class="page-desc">共复习 ' + s.results.length + ' 张卡片，记忆状态已写入本地记录。</p>' +
        '<div class="result-grid">' +
          '<div class="result-cell rate-forget"><b>' + s.stats.forget + '</b><span>忘记 → 重置 0 级</span></div>' +
          '<div class="result-cell rate-vague"><b>' + s.stats.vague + '</b><span>模糊 → 等级 -1</span></div>' +
          '<div class="result-cell rate-know"><b>' + s.stats.know + '</b><span>记住 → 等级 +1</span></div>' +
        '</div>' +
        '<ul class="result-list">' + next + '</ul>' +
        '<div class="result-actions">' +
          '<button type="button" class="btn btn-primary" data-action="restart-study">再来一轮</button>' +
          '<a class="btn" href="' + (s.code ? '#/library?code=' + encodeURIComponent(s.code) : (s.scope === 'fav' ? '#/favorites' : '#/')) + '">返回列表</a>' +
        '</div>' +
      '</div>';
  }

  /** 渲染后处理：卡片高度自适应 + 动画兼容 */
  function afterStudyRender() {
    const s = state.study;
    if (!s || s.finished) return;
    const card = $('#flashcard');
    if (!card) return;
    if (s.flipped) applyFlipHeight(card, true);
  }

  function applyFlipHeight(card, flipped) {
    const back = $('.face-back', card);
    const front = frontHeight();
    const target = flipped
      ? Math.min(Math.max(front, back.scrollHeight + 8), maxBackHeight())
      : front;
    card.style.height = target + 'px';
    card.setAttribute('data-flipped', flipped ? '1' : '0');
  }

  function flipCard() {
    const s = state.study;
    const card = $('#flashcard');
    if (!s || !card || s.finished) return;
    s.flipped = !s.flipped;
    card.classList.toggle('is-flipped', s.flipped);
    applyFlipHeight(card, s.flipped);
    const bar = $('#ratingBar');
    if (bar) {
      bar.setAttribute('data-enabled', s.flipped ? '1' : '0');
      $$('.btn-rate', bar).forEach(function (b) { b.disabled = !s.flipped; });
    }
    const tip = $('#ratingTip');
    if (tip) {
      tip.textContent = s.flipped
        ? '评级后自动计算下次复习时间：' + R.INTERVALS.join(' / ') + ' 分钟（0~5 级）'
        : '先翻牌查看完整释义，再进行记忆评级';
    }
  }

  function rateCurrent(rating) {
    const s = state.study;
    if (!s || s.finished || !s.flipped) return;
    const vocabId = s.queue[s.index];
    const record = ReviewStore.rate(vocabId, rating, Date.now());
    s.stats[rating]++;
    s.results.push({ vocabId: vocabId, rating: rating, record: record });
    s.index++;
    s.flipped = false;
    if (s.index >= s.queue.length) {
      s.finished = true;
      StudyLog.push({
        scope: s.scope, label: s.label, total: s.results.length,
        forget: s.stats.forget, vague: s.stats.vague, know: s.stats.know,
        finished_at: Date.now()
      });
    }
    render();
  }

  function restartStudy() {
    const s = state.study;
    if (!s) return;
    const q = ReviewStore.buildQueue(s.ids, Date.now());
    state.study = {
      scope: s.scope, label: s.label, code: s.code, ids: s.ids,
      queue: q.queue, meta: q, index: 0, flipped: false, finished: false,
      stats: { forget: 0, vague: 0, know: 0 }, results: []
    };
    render();
    if (!q.queue.length) toast('本轮所有单词都已进入复习排期');
  }

  function forceReview() {
    const s = state.study;
    if (!s) return;
    const q = ReviewStore.buildQueue(s.ids, Date.now());
    state.study = {
      scope: s.scope, label: s.label, code: s.code, ids: s.ids,
      queue: s.ids.slice(), meta: q, index: 0, flipped: false, finished: false,
      stats: { forget: 0, vague: 0, know: 0 }, results: []
    };
    render();
    toast('已开始强制复习（含未到期单词）');
  }

  /* ============================================================
   * 词库树弹窗
   * ============================================================ */
  function openTree() {
    const modal = $('#treeModal');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    state.treeSelected = null;
    state.treePick = null;
    renderTree();
    tourAdvanceIf('treeOpen');
  }

  /** 卡片上的「放进词库」：打开词库树 → 选末级分类 → 再确认「移入 / 加入」 */
  function openTreeForPick(vocabId) {
    const word = D.wordById(vocabId);
    if (!word) return;
    const modal = $('#treeModal');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    state.treeSelected = null;
    state.treePick = { id: word.id, word: word.word, step: 'tree', code: '' };
    renderTree();
  }

  /** 选一个末级词库当「今日目标」（点分类即生效，不用再确认） */
  function openTreeForGoal() {
    const modal = $('#treeModal');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    state.treeSelected = null;
    state.treePick = { goal: true, step: 'tree', code: '' };
    renderTree();
  }

  function closeTree() {
    const modal = $('#treeModal');
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    state.treePick = null;
  }

  function treeNodeHTML(node) {
    const meta = D.getNode(node.code);
    const count = D.wordIdsOfBranch(node.code).length;
    const hasChildren = node.children && node.children.length > 0;
    const expanded = !!state.treeExpanded[node.code];
    const selected = state.treeSelected === node.code;
    return '' +
      '<div class="tree-node" data-code="' + node.code + '">' +
        '<div class="tree-row' + (selected ? ' is-selected' : '') + (meta.isLeaf ? ' is-leaf' : '') + '" ' +
          'data-action="tree-row" data-code="' + node.code + '" data-leaf="' + (meta.isLeaf ? '1' : '0') + '" tabindex="0">' +
          '<span class="caret">' + (hasChildren ? (expanded ? '▾' : '▸') : '·') + '</span>' +
          '<span class="node-name">' + esc(node.name) + '</span>' +
          (meta.posTag ? '<span class="node-pos">' + esc(meta.posTag) + '</span>' : '') +
          (LibraryStore.has(node.code) ? '<span class="node-fav" title="已收藏该词库">★</span>' : '') +
          '<span class="node-count">' + count + '</span>' +
        '</div>' +
        (hasChildren
          ? '<div class="tree-children"' + (expanded ? '' : ' hidden') + '>' +
              node.children.map(treeNodeHTML).join('') + '</div>'
          : '') +
      '</div>';
  }

  function renderTree() {
    const body = $('#treeBody');
    if (!body) return;
    const pathEl = $('#treeSelectedPath');
    const actions = $('#treeActions');
    const hint = $('#treeHint');
    const title = $('#treeTitle');
    const pick = state.treePick;
    const setFoot = function (html) { if (actions) actions.innerHTML = html; };
    const editBtn = $('#treeEditBtn');
    if (editBtn) editBtn.hidden = !!pick;      // 「放进词库」模式下不显示编辑分类名的按钮

    /* ①「放进词库」第二步：确认「移入 / 加入」 */
    if (pick && pick.step === 'confirm') {
      const node = D.getNode(pick.code);
      const word = D.wordById(pick.id);
      const others = word ? D.branchesOfWord(word).filter(function (n) { return n.code !== pick.code; }) : [];
      const nowAt = others.length ? others.map(function (n) { return n.name; }).join('、') : '（没有别的词库了）';
      if (title) title.textContent = '确认放进词库';
      body.innerHTML = '' +
        '<div class="pick-confirm">' +
          '<p class="pick-question">把 <b>' + esc(pick.word) + '</b> 放进 <b>' + esc(node ? node.name : pick.code) + '</b>？</p>' +
          '<button type="button" class="pick-option" data-action="do-pick" data-mode="move">' +
            '<b>⇄ 移入</b>' +
            '<span>从它现在所在的词库移出，只留在新词库<br><em>现在在：' + esc(nowAt) + '</em></span>' +
          '</button>' +
          '<button type="button" class="pick-option" data-action="do-pick" data-mode="join">' +
            '<b>＋ 加入</b>' +
            '<span>原来的词库保留，两个词库都能看到它</span>' +
          '</button>' +
        '</div>';
      pathEl.textContent = '第 2 步 / 共 2 步';
      pathEl.classList.add('is-placeholder');
      actions.hidden = false;
      setFoot('<button type="button" class="btn btn-ghost" data-action="pick-back">返回</button>' +
        '<button type="button" class="btn" data-action="close-tree">取消</button>');
      if (hint) hint.textContent = '移入 = 只归这里；加入 = 两边都在（都不会删掉单词本身）';
      return;
    }

    /* ②「放进词库」第一步：选末级分类 */
    if (pick) {
      if (title) title.textContent = pick.goal ? '选一个词库当今日目标' : '把「' + pick.word + '」放进词库';
      body.innerHTML = CATEGORY_HTML();
      pathEl.innerHTML = pick.goal
        ? '点一个末级分类 = 设成今日目标（今天把它背完）'
        : '把 <b>' + esc(pick.word) + '</b> 放进哪个词库？逐级展开，点末级分类';
      pathEl.classList.remove('is-placeholder');
      actions.hidden = false;
      setFoot('<button type="button" class="btn" data-action="close-tree">取消</button>');
      if (hint) hint.textContent = pick.goal
        ? '点末级分类就设成今日目标，随时可以换'
        : '点末级分类 → 下一步选「移入」还是「加入」';
      return;
    }

    /* ③ 普通浏览模式：选末级分类 → 打开词库 */
    if (title) title.textContent = '词库树';
    setFoot('<button type="button" class="btn btn-ghost" data-action="cancel-tree">取消</button>' +
      '<button type="button" class="btn btn-primary" data-action="open-branch-selected">打开词库</button>');
    body.innerHTML = CATEGORY_HTML();
    const sel = state.treeSelected ? D.getNode(state.treeSelected) : null;
    if (sel) {
      pathEl.innerHTML = pathBreadcrumb(sel.name === '词库树' ? '词库树' : sel.pathText);
      pathEl.classList.remove('is-placeholder');
      actions.hidden = false;
      hint.textContent = sel.bindType === 'pos'
        ? '已选末级分类（词性分支）'
        : '已选末级分类：' + sel.name;
    } else {
      pathEl.textContent = '请逐级展开，选择末级分类';
      pathEl.classList.add('is-placeholder');
      actions.hidden = true;
      hint.textContent = '点击分类名逐级展开，末级分类可打开词库';
    }
  }

  function CATEGORY_HTML() {
    const expanded = !!state.treeExpanded['0'];
    return '<div class="tree-root">' +
      '<div class="tree-row tree-root-row is-root" data-action="tree-row" data-code="0" data-leaf="0" tabindex="0">' +
        '<span class="caret">' + (expanded ? '▾' : '▸') + '</span><span class="node-name">词库树</span>' +
        '<span class="node-count">' + D.allWords().length + '</span>' +
      '</div>' +
      '<div class="tree-children"' + (expanded ? '' : ' hidden') + '>' +
        D.CATEGORY_TREE.children.map(treeNodeHTML).join('') +
      '</div>' +
      '</div>';
  }

  function handleTreeRow(code, isLeaf) {
    if (state.treePick) {
      if (isLeaf) {
        const node = D.getNode(code);
        if (node && node.bindType === 'pos') {
          toast('「' + node.name + '」是按词性自动归类的分支，请选语义分类');
          return;
        }
        if (state.treePick.goal) {                      // 选今日目标：点一下即生效
          setGoal(code, node ? node.name : '');
          closeTree();
          toast('今日目标已设为「' + (node ? node.name : '') + '」');
          render();
          return;
        }
        state.treePick.step = 'confirm';
        state.treePick.code = code;
        renderTree();
        return;
      }
      state.treeExpanded[code] = !state.treeExpanded[code];
      renderTree();
      return;
    }
    if (isLeaf) {
      state.treeSelected = code;
      tourAdvanceIf('leafSelected');
    } else {
      state.treeExpanded[code] = !state.treeExpanded[code];
      state.treeSelected = null;
    }
    renderTree();
  }

  function openSelectedBranch() {
    const code = state.treeSelected;
    if (!code) return;
    closeTree();
    navigate('#/library?code=' + encodeURIComponent(code));
  }

  /**
   * 「放进词库」的最终动作（核心规则：标签绑在释义上，一个词可以同时属于多个分支）
   *   加入 join：原来的词库保留，只往新词库追加一个标签
   *   移入 move：追加新标签，同时把其它语义分支记进「隐藏表」——只归新词库
   * 存哪：yy_user_tags（追加标签）+ yy_user_hidden（移出的旧分支），
   *       与「导入新词」共用同一套存储 / 备份 / 云同步。
   */
  function applyPick(mode) {
    const pick = state.treePick;
    if (!pick) return;
    const word = D.wordById(pick.id);
    const node = D.getNode(pick.code);
    if (!word || !node) { closeTree(); return; }
    const target = pick.code;

    // ① 追加目标词库的标签
    const tags = loadUserTags();
    const list = (tags[word.word] || []).slice();
    if (list.indexOf(target) < 0) list.push(target);
    tags[word.word] = list;

    // ② 目标分支一定要显示出来（撤销历史隐藏）
    //    存储格式：{ 单词: { codes:[被移出的分支], at:时间戳 } } —— 带时间戳是为了多设备「后写覆盖」，
    //    否则并集合并会让「恢复分类」永远同步不回去。
    const hidden = loadUserHidden();
    const entry = hidden[word.word] || { codes: [], at: 0 };
    const hideList = (entry.codes || []).slice();
    const at = hideList.indexOf(target);
    if (at > -1) hideList.splice(at, 1);

    // ③ 移入 = 把其它语义分支全部移出（词性分支是按 pos_tag 自动归的，不动）
    const movedOut = [];
    if (mode === 'move') {
      D.branchesOfWord(word).forEach(function (n) {
        if (n.code === target || n.bindType === 'pos') return;
        if (hideList.indexOf(n.code) < 0) { hideList.push(n.code); movedOut.push(n.name); }
      });
    }
    hidden[word.word] = { codes: hideList, at: Date.now() };

    store.UserWordStore.save(loadUserWords(), tags, hidden);
    applyAllUserData();
    closeTree();

    if (mode === 'move') {
      toast('已移入「' + node.name + '」' + (movedOut.length
        ? '；不再出现在：' + movedOut.join('、')
        : '（它本来也没有别的词库）'));
    } else {
      toast('已加入「' + node.name + '」：原来的词库保留，两边都能看到它');
    }
    render();
  }

  /** 卡片上的「恢复分类」：撤销这个词的所有「移入」，恢复系统原本的分支 */
  function resetWordBranches(vocabId) {
    const word = D.wordById(vocabId);
    if (!word) return;
    const hidden = loadUserHidden();
    const entry = hidden[word.word];
    const list = (entry && entry.codes) || [];
    if (!list.length) { toast('「' + word.word + '」没有被移出过'); return; }
    hidden[word.word] = { codes: [], at: Date.now() };   // 留一条空记录，才能把「恢复」同步到别的设备
    store.UserWordStore.save(loadUserWords(), loadUserTags(), hidden);
    applyAllUserData();
    toast('已恢复「' + word.word + '」的系统分类（' + list.length + ' 个词库重新显示）');
    render();
  }

  /* ============================================================
   * 卡片编辑器（⋯ → 编辑卡片）
   *   改释义 / 改词性 / 改配图（一条释义一张图）/ 添加释义 / 删除释义（要确认）
   *   改动写进 yy_sense_overlay，跟备份、云同步一起走；词库原始数据永远不动
   * ============================================================ */
  function showModal(sel) {
    const m = $(sel);
    if (!m) return;
    m.hidden = false;
    document.body.classList.add('modal-open');
  }
  function hideModal(sel) {
    const m = $(sel);
    if (m) m.hidden = true;
    const anyOpen = typeof document.querySelectorAll === 'function' &&
      Array.prototype.some.call(document.querySelectorAll('.modal'), function (x) { return !x.hidden; });
    if (!anyOpen) document.body.classList.remove('modal-open');
  }

  /** 通用确认弹窗（删除等破坏性操作前必须过这一关） */
  function askConfirm(title, text, onYes) {
    state.confirm = { onYes: onYes };
    const t = $('#confirmTitle');
    const p = $('#confirmText');
    if (t) t.textContent = title || '确认操作';
    if (p) p.textContent = text || '';
    const foot = $('#confirmFoot');
    if (foot) {
      foot.innerHTML = '<button type="button" class="btn btn-danger" data-action="confirm-yes">确定</button>' +
        '<button type="button" class="btn" data-action="confirm-no">取消</button>';
    }
    showModal('#confirmModal');
  }
  function closeConfirm() {
    state.confirm = null;
    hideModal('#confirmModal');
  }

  function isBlankImage(url) {
    return !url || String(url).indexOf('placeholder-img.example') > -1;
  }
  /** 这条释义在「自动」模式下会显示的那张占位图 */
  function autoImageSrc(row) {
    const st = state.editor;
    return placeholderSvg((st && st.word) || '', row.zh || '', row.tag || '',
      (row.codes && row.codes[0]) || '', row.seed);
  }

  /** 上传的图片：缩到宽 ≤720 的 JPEG 再存，避免把浏览器存储撑满 */
  function readEditorImage(file) {
    const row = editorRow(state.editorUploadKey);
    if (!row || typeof FileReader !== 'function') return;
    const reader = new FileReader();
    reader.onload = function () {
      const raw = String(reader.result || '');
      const finish = function (url) {
        row.image = url;
        row.mode = 'upload';
        renderEditor();
        toast('图片已放进这条释义（保存后生效）');
      };
      if (typeof Image !== 'function' || typeof document.createElement !== 'function') { finish(raw); return; }
      const im = new Image();
      im.onload = function () {
        try {
          const max = 720;
          const scale = Math.min(1, max / (im.width || max));
          const cv = document.createElement('canvas');
          cv.width = Math.round((im.width || max) * scale);
          cv.height = Math.round((im.height || max) * scale);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          const out = cv.toDataURL('image/jpeg', 0.82);
          finish(out.length < raw.length * 1.2 ? out : raw);
        } catch (e) { finish(raw); }
      };
      im.onerror = function () { finish(raw); };
      im.src = raw;
    };
    reader.readAsDataURL(file);
  }
  /** 新释义用负数 id，和内置 id（正数）永远不冲突 */
  function nextAddedSenseId(overlay) {
    let min = 0;
    Object.keys(overlay.added || {}).forEach(function (w) {
      (overlay.added[w] || []).forEach(function (x) { if (Number(x.id) < min) min = Number(x.id); });
    });
    return min - 1;
  }

  function openCardEditor(vocabId) {
    const word = D.wordById(vocabId);
    if (!word) return;
    state.cardMenu = null;
    state.editor = {
      id: word.id,
      word: word.word,
      rows: word.senses.map(function (s) {
        const auto = isBlankImage(s.image_url);
        const found = auto ? cachedPhoto(word.word) : null;   // 浏览器刚联网找到的那张真照片
        return {
          key: 's' + s.id, id: s.id, isNew: !!s.user_sense,
          pos: s.pos_tag, zh: s.chinese_translation,
          image: auto ? '' : s.image_url,
          mode: auto ? 'auto' : (s.image_mode && s.image_mode !== 'auto' ? s.image_mode : 'link'),
          seed: Number(s.image_seed) || 0,
          found: found,
          tag: s.semantic_codes.length ? D.getNode(s.semantic_codes[0]).name : (D.POS_MAP[s.pos_tag] || {}).name,
          codes: s.semantic_codes.slice(),
          orig: {
            pos: s.pos_tag, zh: s.chinese_translation, image: auto ? '' : s.image_url,
            mode: auto ? 'auto' : (s.image_mode && s.image_mode !== 'auto' ? s.image_mode : 'link'),
            seed: Number(s.image_seed) || 0
          }
        };
      }),
      deleted: [],
      defaultCodes: (word.senses[0] && word.senses[0].semantic_codes.slice()) || []
    };
    showModal('#editModal');
    renderEditor();
  }

  function renderEditor() {
    const st = state.editor;
    const body = $('#editBody');
    if (!st || !body) return;
    const title = $('#editTitle');
    const sub = $('#editSub');
    const foot = $('#editFoot');
    if (title) title.textContent = '编辑卡片 · ' + st.word;
    if (sub) {
      sub.innerHTML = '共 <b>' + st.rows.length + '</b> 条释义 · 一条释义一张图，改完点「保存」';
      sub.classList.add('is-placeholder');
    }
    body.innerHTML = st.rows.map(function (r, i) {
      const opts = D.POS_TAGS.map(function (p) {
        return '<option value="' + p.pos + '"' + (p.pos === r.pos ? ' selected' : '') + '>' + p.pos + ' ' + p.name + '</option>';
      }).join('');
      const auto = r.mode === 'auto' || !r.image;
      // 预览必须是「卡片上真正显示的那张」：自己定的图 → 浏览器刚找到的真照片 → 本地占位图
      const preview = auto
        ? (r.found && r.found.url ? r.found.url
          : placeholderSvg(st.word, r.zh || '', r.tag || '', (r.codes && r.codes[0]) || '', r.seed))
        : r.image;
      const statusText = auto
        ? (r.found && r.found.url
          ? '自动找到的真实照片' + (r.found.from ? '（来自' + r.found.from + '）' : '') + '，暂存在浏览器里，可能过期'
          : '自动生成（本地画的占位图，不联网也不破图）')
        : r.mode === 'pinned' ? '已保留（就定稿成这张，不会再变）'
          : r.mode === 'photo' ? '网络照片（可能过期；点「✓ 就用这张」即定稿）'
            : r.mode === 'upload' ? '本地上传的图片（存在浏览器里）'
              : '自定义链接';
      const finding = st.findingKey === r.key;
      const cands = (st.candidates && st.candidates.key === r.key) ? st.candidates.list : null;
      return '' +
        '<div class="edit-row' + (r.isNew ? ' is-new' : '') + (auto ? ' is-auto' : '') + '">' +
          '<div class="edit-row-head">' +
            '<span>释义 ' + (i + 1) + (r.isNew ? ' · 新增' : '') + '</span>' +
            '<button type="button" class="btn-fav btn-restore" data-action="edit-del-sense" data-key="' + r.key + '">删除</button>' +
          '</div>' +
          '<label class="acct-row"><span>中文释义</span>' +
            '<input type="text" data-field="zh" data-key="' + r.key + '" value="' + esc(r.zh) + '" placeholder="比如 银行；岸"></label>' +
          '<label class="acct-row"><span>词性</span>' +
            '<select data-field="pos" data-key="' + r.key + '">' + opts + '</select></label>' +
          '<div class="edit-img">' +
            '<img class="edit-thumb" src="' + esc(preview) + '" alt="这条释义的配图预览">' +
            '<div class="edit-img-main">' +
              '<p class="edit-img-status">配图：' + esc(statusText) + '</p>' +
              '<div class="edit-img-actions">' +
                (auto ? '' : '<button type="button" class="btn-fav" data-action="edit-auto-image" data-key="' + r.key + '">↺ 回到自动</button>') +
                '<button type="button" class="btn-fav" data-action="edit-regen-image" data-key="' + r.key + '" title="换一张本地画的占位图">↻ 换占位图</button>' +
                '<button type="button" class="btn-fav" data-action="edit-find-photo" data-key="' + r.key + '" title="按这条释义的关键词联网找真实照片">🔍 ' + (finding ? '正在找图…' : '换真实照片') + '</button>' +
                (auto ? '<button type="button" class="btn-fav btn-keep" data-action="edit-pin-image" data-key="' + r.key + '" title="就用现在这一张，以后不再自动换">✓ 就用这张</button>' : '') +
                '<button type="button" class="btn-fav" data-action="edit-upload-image" data-key="' + r.key + '">⬆ 上传图片</button>' +
              '</div>' +
              (cands && cands.length
                ? '<div class="edit-cands"><span>挑一张：</span>' + cands.map(function (c) {
                    return '<button type="button" class="edit-cand" data-action="edit-use-candidate" data-key="' + r.key + '" ' +
                      'data-url="' + esc(c.url) + '" title="用这张（' + esc(c.from || '') + '）">' +
                      '<img src="' + esc(c.url) + '" alt="候选图"></button>';
                  }).join('') + '</div>'
                : '') +
              '<input type="text" class="edit-img-url" data-field="image" data-key="' + r.key + '" value="' + esc(r.image) + '" ' +
                'placeholder="或粘贴图片网址（留空 = 用自动生成的占位图）">' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('') +
      '<button type="button" class="btn btn-add-sense" data-action="edit-add-sense">＋ 添加一条释义</button>';
    if (foot) {
      foot.innerHTML = '<button type="button" class="btn btn-primary" data-action="edit-save">保存</button>' +
        '<button type="button" class="btn btn-ghost" data-action="edit-reset">恢复原样</button>' +
        '<button type="button" class="btn" data-action="close-editor">取消</button>';
    }
  }

  function editorRow(key) {
    const st = state.editor;
    if (!st) return null;
    return st.rows.filter(function (r) { return r.key === key; })[0] || null;
  }
  function updateEditorRow(key, field, value) {
    const row = editorRow(key);
    if (!row || ['zh', 'pos', 'image'].indexOf(field) < 0) return;
    row[field] = String(value === undefined || value === null ? '' : value);
    if (field === 'image') {
      row.mode = row.image ? (row.mode === 'upload' ? 'upload' : 'link') : 'auto';
      if (state.editor) state.editor.candidates = null;
    }
  }
  function closeCardEditor() {
    state.editor = null;
    hideModal('#editModal');
  }

  function saveEditor() {
    const st = state.editor;
    if (!st) return;
    const word = D.wordById(st.id);
    if (!word) { closeCardEditor(); return; }
   if (!st.rows.length) { toast('至少要留一条释义，不能全删'); return; }
    if (st.rows.some(function (r) { return !String(r.zh || '').trim(); })) { toast('每条释义都要填中文释义'); return; }

    const key = word.word.toLowerCase();
    const now = Date.now();
    const ov = loadUserOverlay();
    ov.edits = ov.edits || {};
    ov.added = ov.added || {};
    ov.deleted = ov.deleted || {};

    // ① 本轮删掉的内置释义 → 记进 deleted（用户新增的直接从 added 里摘掉）
    st.deleted.forEach(function (id) { if (Number(id) > 0) ov.deleted[id] = now; });

    // ② 新增的释义（含之前就新增、这次只是改了的）
    const newList = [];
    st.rows.forEach(function (r) {
      if (!r.isNew) {
        const changed = r.zh !== r.orig.zh || r.pos !== r.orig.pos || r.image !== r.orig.image ||
          r.mode !== r.orig.mode || Number(r.seed) !== Number(r.orig.seed);
        if (changed) {
          ov.edits[r.id] = {
            zh: String(r.zh).trim(), pos: r.pos, image: String(r.image).trim(),
            mode: r.mode || (r.image ? 'link' : 'auto'), seed: Number(r.seed) || 0, at: now
          };
        }
        return;
      }
      newList.push({
        id: Number(r.id) || nextAddedSenseId(ov),
        pos: r.pos, zh: String(r.zh).trim(), image: String(r.image).trim(),
        mode: r.mode || (r.image ? 'link' : 'auto'), seed: Number(r.seed) || 0,
        codes: st.defaultCodes, at: now
      });
    });
    if (newList.length) ov.added[key] = newList;
    else delete ov.added[key];

    saveUserOverlay(ov);
    applyAllUserData();
    closeCardEditor();
    toast('已保存「' + word.word + '」的 ' + st.rows.length + ' 条释义（只影响你自己的账号，可随时「恢复原样」）');
    render();
  }

  /** 撤销这张卡的所有编辑（改过的、加过的、删过的全部还原） */
  function resetCardEdits(vocabId) {
    const word = D.wordById(vocabId);
    if (!word) return;
    const ov = loadUserOverlay();
    Object.keys(ov.edits).forEach(function (id) { if (Math.floor(Number(id) / 100) === word.id) delete ov.edits[id]; });
    Object.keys(ov.deleted).forEach(function (id) { if (Math.floor(Number(id) / 100) === word.id) delete ov.deleted[id]; });
    delete ov.added[word.word.toLowerCase()];
    saveUserOverlay(ov);
    applyAllUserData();
    state.cardMenu = null;
    closeCardEditor();
    toast('已把「' + word.word + '」恢复成词库原样');
    render();
  }

  /* ============================================================
   * 词库树编辑器（词库树弹窗 → ✎ 编辑分类名）
   *   第一期：改分类名 / 加备注；第二期：在任意分类下新增末级分类
   *   节点 code 是主键不能动；改动只是一层覆盖，随时「恢复默认」
   * ============================================================ */
  function openTreeEditor() {
    const ov = loadTreeOverlay();
    const names = {};
    const notes = {};
    (function walk(n) {
      const info = D.getNode(n.code);
      names[n.code] = ov.names[n.code] || (info ? info.name : n.name);
      notes[n.code] = ov.notes[n.code] !== undefined ? ov.notes[n.code] : ((info && info.note) || '');
      (n.children || []).forEach(walk);
    })(D.CATEGORY_TREE);
    state.treeEdit = { names: names, notes: notes, added: [], expanded: { '0': true, '1': true, '2': true }, newSeq: 0 };
    ov.added.forEach(function (x) {
      state.treeEdit.added.push({ key: 'a' + (state.treeEdit.newSeq++), parent: x.parent, name: x.name, code: x.code });
    });
    showModal('#treeEditModal');
    renderTreeEditor();
  }

  function treeEditRows(node, depth) {
    const st = state.treeEdit;
    const hasKids = (node.children && node.children.length) ||
      st.added.some(function (x) { return x.parent === node.code; });
    const expanded = !!st.expanded[node.code];
    const out = [];
    out.push('<div class="te-row" style="padding-left:' + (8 + depth * 16) + 'px">' +
      '<button type="button" class="te-caret" data-action="te-toggle" data-code="' + node.code + '">' +
        (hasKids ? (expanded ? '▾' : '▸') : '·') + '</button>' +
      '<input class="te-name" type="text" data-field="name" data-key="' + node.code + '" ' +
        'value="' + esc(st.names[node.code] !== undefined ? st.names[node.code] : node.name) + '">' +
      '<input class="te-note" type="text" data-field="note" data-key="' + node.code + '" ' +
        'value="' + esc(st.notes[node.code] || '') + '" placeholder="备注（可空）">' +
      '<button type="button" class="te-btn" data-action="te-add" data-code="' + node.code + '">＋ 子分类</button>' +
      (node.__userAdded ? '<button type="button" class="te-btn te-del" data-action="te-del" data-code="' + node.code + '">删除</button>' : '') +
      '</div>');
    if (expanded) {
      st.added.filter(function (x) { return x.parent === node.code; }).forEach(function (x) {
        out.push('<div class="te-row is-new" style="padding-left:' + (8 + (depth + 1) * 16) + 'px">' +
          '<span class="te-caret">＋</span>' +
          '<input class="te-name" type="text" data-field="new" data-key="' + x.key + '" ' +
            'value="' + esc(x.name) + '" placeholder="新分类的名字（必填）">' +
          '<button type="button" class="te-btn te-del" data-action="te-remove-pending" data-key="' + x.key + '">移除</button>' +
          '</div>');
      });
      (node.children || []).forEach(function (c) { out.push(treeEditRows(c, depth + 1)); });
    }
    return out.join('');
  }

  function renderTreeEditor() {
    const st = state.treeEdit;
    const body = $('#treeEditBody');
    if (!st || !body) return;
    const sub = $('#treeEditSub');
    if (sub) {
      sub.innerHTML = '改名字 / 加备注 / 加末级分类 · 改完点「保存」。分类编号不动（很多地方在引用它），随时能「恢复默认」';
      sub.classList.add('is-placeholder');
    }
    body.innerHTML = treeEditRows(D.CATEGORY_TREE, 0);
    const foot = $('#treeEditFoot');
    if (foot) {
      foot.innerHTML = '<button type="button" class="btn btn-primary" data-action="tree-edit-save">保存</button>' +
        '<button type="button" class="btn btn-ghost" data-action="tree-edit-reset">恢复默认</button>' +
        '<button type="button" class="btn" data-action="close-tree-editor">取消</button>';
    }
  }

  function closeTreeEditor() {
    state.treeEdit = null;
    hideModal('#treeEditModal');
  }

  function saveTreeEditor() {
    const st = state.treeEdit;
    if (!st) return;
    const names = {};
    const notes = {};
    Object.keys(st.names).forEach(function (code) {
      const val = String(st.names[code] || '').trim();
      if (val && val !== T.originalName(code)) names[code] = val;
    });
    Object.keys(st.notes).forEach(function (code) {
      const val = String(st.notes[code] || '').trim();
      if (val) notes[code] = val;
    });
    const used = Object.create(null);
    Object.keys(D.NODE_INDEX).forEach(function (c) { used[c] = true; });
    const added = [];
    st.added.forEach(function (x) {
      const name = String(x.name || '').trim();
      if (!name) return;
      let i = 1;
      while (used[x.parent + '.' + i]) i++;
      const code = (x.code && D.NODE_INDEX[x.code]) ? x.code : (x.parent + '.' + i);
      used[code] = true;
      added.push({ code: code, parent: x.parent, name: name });
    });
    const ov = { names: names, notes: notes, added: added };
    store.UserWordStore.saveTreeOverlay(ov);
    applyTreeOverlay(ov);
    closeTreeEditor();
    toast('词库树已保存：改名 ' + Object.keys(names).length + ' 处 · 备注 ' + Object.keys(notes).length +
      ' 处 · 新增分类 ' + added.length + ' 个');
    render();
  }

  /** 把树的覆盖层套进内存，并刷新所有派生数据（路径 / 收藏名 / 分支索引） */
  function applyTreeOverlay(ov) {
    T.applyOverlay(ov || {});
    const nameMap = Object.create(null);
    Object.keys(D.NODE_INDEX).forEach(function (code) { nameMap[code] = D.NODE_INDEX[code].name; });
    LibraryStore.rename(nameMap);
    D.refreshTagPaths();
    applyAllUserData();
  }

  function resetTreeOverlay() {
    store.UserWordStore.saveTreeOverlay({});
    applyTreeOverlay({});
    toast('词库树已恢复默认（改过的名字、备注、用户新增的分类都清掉了）');
    render();
  }

  /* ============================================================
   * 事件绑定（统一委托）
   * ============================================================ */
  function onViewClick(e) {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const trigger = e.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.getAttribute('data-action');

    if (action === 'open-branch') {
      e.preventDefault();
      navigate('#/library?code=' + encodeURIComponent(trigger.getAttribute('data-code')));
      return;
    }
    if (action === 'toggle-fav') {
      const id = Number(trigger.getAttribute('data-id'));
      const on = CollectionStore.toggle(id);
      const word = D.wordById(id);
      toast(on ? '已收藏：' + word.word : '已取消收藏：' + word.word);
      render();
      return;
    }
    if (action === 'play') {
      playPronunciation(trigger.getAttribute('data-url'), trigger.getAttribute('data-text'), trigger.getAttribute('data-accent'));
      return;
    }
    if (action === 'study') {
      startStudy(trigger.getAttribute('data-scope'));
      return;
    }
    if (action === 'fav-all') {
      const code = trigger.getAttribute('data-code');
      const ids = D.wordIdsOfBranch(code);
      const added = CollectionStore.addMany(ids);
      toast(added ? '已把该词库的 ' + added + ' 个单词加入单词收藏' : '该词库单词均已在单词收藏中');
      render();
      return;
    }
    if (action === 'toggle-lib-fav') {
      const code = trigger.getAttribute('data-code');
      const node = D.getNode(code);
      const on = LibraryStore.toggle(code, node ? node.name : '');
      const n = D.wordIdsOfBranch(code).length;
      toast(on ? '已收藏词库：' + (node ? node.name : code) + '（' + n + ' 词，动态订阅）' : '已取消收藏词库：' + (node ? node.name : code));
      render();
      return;
    }
    if (action === 'unfav-lib') {
      const code = trigger.getAttribute('data-code');
      const node = D.getNode(code);
      LibraryStore.remove(code);
      toast('已取消收藏词库：' + (node ? node.name : code));
      render();
      return;
    }
    if (action === 'clear-fav-libs') {
      if (!window.confirm('确定清空词库收藏吗？（单词收藏不受影响）')) return;
      LibraryStore.clear();
      toast('已清空词库收藏');
      render();
      return;
    }
    if (action === 'clear-fav') {
      if (!window.confirm('确定清空单词收藏吗？（词库收藏不受影响）')) return;
      CollectionStore.clear();
      toast('已清空单词收藏');
      render();
      return;
    }
    if (action === 'flip-card') {
      flipCard();
      return;
    }
    if (action === 'rate') {
      rateCurrent(trigger.getAttribute('data-rating'));
      return;
    }
    if (action === 'exit-study') {
      const s = state.study;
      const back = s && s.code ? '#/library?code=' + encodeURIComponent(s.code) : (s && s.scope === 'fav' ? '#/favorites' : '#/');
      // 中途退出也记一笔（标"未背完"），否则"今天几轮 / 对错统计"会少算
      if (s && !s.finished && s.results.length) {
        StudyLog.push({
          scope: s.scope, label: s.label, total: s.results.length,
          forget: s.stats.forget, vague: s.stats.vague, know: s.stats.know,
          finished_at: Date.now(), partial: true
        });
      }
      state.study = null;
      navigate(back);
      return;
    }
    if (action === 'restart-study') {
      restartStudy();
      return;
    }
    if (action === 'force-review') {
      forceReview();
      return;
    }
    if (action === 'open-tree') {
      openTree();
      return;
    }
    if (action === 'open-lib-picker') {
      state.cardMenu = null;
      openTreeForPick(trigger.getAttribute('data-id'));
      return;
    }
    if (action === 'toggle-card-menu') {
      const id = Number(trigger.getAttribute('data-id'));
      state.cardMenu = state.cardMenu === id ? null : id;
      render();
      return;
    }
    if (action === 'open-card-editor') {
      openCardEditor(Number(trigger.getAttribute('data-id')));
      return;
    }
    if (action === 'edit-add-sense') {
      if (state.editor) {
        state.editor.rows.push({
          key: 'n' + Date.now(), id: 0, isNew: true, pos: 'n.', zh: '', image: '',
          orig: { pos: 'n.', zh: '', image: '' }
        });
        renderEditor();
      }
      return;
    }
    if (action === 'edit-del-sense') {
      const row = editorRow(trigger.getAttribute('data-key'));
      if (!row || !state.editor) return;
      askConfirm('删除这条释义？',
        '「' + (row.zh || '（空释义）') + '」将从这张卡片里删掉，保存后生效；之后可以用「恢复原样」找回来。',
        function () {
          state.editor.rows = state.editor.rows.filter(function (r) { return r.key !== row.key; });
          if (row.id) state.editor.deleted.push(row.id);
          closeConfirm();
          renderEditor();
        });
      return;
    }
    if (action === 'edit-save') { saveEditor(); return; }
    if (action === 'edit-pin-image') {
      const row = editorRow(trigger.getAttribute('data-key'));
      if (row) {
        // 「就用这张」= 把现在显示的那张定稿：可能是刚联网找到的真照片，也可能是本地占位图
        if (row.mode === 'auto' && row.found && row.found.url) {
          row.image = row.found.url;
          row.mode = 'photo';
        } else if (row.mode === 'auto') {
          row.image = autoImageSrc(row);
          row.mode = 'pinned';
        }
        renderEditor();
      }
      return;
    }
    if (action === 'edit-find-photo') {
      const row = editorRow(trigger.getAttribute('data-key'));
      const st = state.editor;
      if (!row || !st) return;
      st.findingKey = row.key;
      st.candidates = null;
      renderEditor();
      const kws = photoKeywords({ chinese_translation: row.zh }, { word: st.word });
      findPhotoCandidates(kws, 3).then(function (list) {
        if (state.editor !== st) return;                 // 编辑器已经关了 / 换卡了
        st.findingKey = null;
        st.candidates = list.length ? { key: row.key, list: list } : null;
        renderEditor();
        if (!list.length) toast('这次没找到网络照片（网络或图源被拦），可以先「换占位图」或粘图片网址');
        else toast('找到 ' + list.length + ' 张候选，点一张就能用（满意再「✓ 就用这张」定稿）');
      });
      return;
    }
    if (action === 'edit-use-candidate') {
      const row = editorRow(trigger.getAttribute('data-key'));
      const url = trigger.getAttribute('data-url');
      if (row && url) {
        row.image = url;
        row.mode = 'photo';
        if (state.editor) state.editor.candidates = null;
        renderEditor();
      }
      return;
    }
    if (action === 'edit-regen-image') {
      const row = editorRow(trigger.getAttribute('data-key'));
      if (row) {
        row.seed = (Number(row.seed) || 0) + 1;
        if (row.mode !== 'auto') { row.image = ''; row.mode = 'auto'; }   // 定稿/链接的也允许换回自动再换
        renderEditor();
      }
      return;
    }
    if (action === 'edit-auto-image') {
      const row = editorRow(trigger.getAttribute('data-key'));
      if (row) { row.image = ''; row.mode = 'auto'; renderEditor(); }
      return;
    }
    if (action === 'edit-upload-image') {
      state.editorUploadKey = trigger.getAttribute('data-key');
      const input = $('#editImgFile');
      if (input && typeof input.click === 'function') input.click();
      else toast('当前环境不支持选择文件，可以直接粘贴图片网址');
      return;
    }
    if (action === 'edit-reset') {
      askConfirm('恢复这张卡的原样？',
        '「' + ((state.editor && state.editor.word) || '') + '」的释义、配图、新增和删除都会被撤销，回到词库自带的版本。',
        function () {
          const id = state.editor && state.editor.id;
          closeConfirm();
          if (id) resetCardEdits(id);
        });
      return;
    }
    if (action === 'close-editor') { closeCardEditor(); return; }
    if (action === 'confirm-yes') {
      const fn = state.confirm && state.confirm.onYes;
      closeConfirm();
      if (typeof fn === 'function') fn();
      return;
    }
    if (action === 'confirm-no') { closeConfirm(); return; }
    if (action === 'reset-card-edits') { resetCardEdits(Number(trigger.getAttribute('data-id'))); return; }
    if (action === 'open-tree-editor') { closeTree(); openTreeEditor(); return; }
    if (action === 'start-tour') { startTour(); return; }
    if (action === 'study-ids') {
      const ids = String(trigger.getAttribute('data-ids') || '').split(',')
        .map(function (x) { return Number(x); }).filter(Boolean);
      if (!ids.length) { toast('这一批里没有单词'); return; }
      state.pendingStudy = { ids: ids, label: trigger.getAttribute('data-label') || '这一批词' };
      startStudy('pending');
      return;
    }
    if (action === 'pick-goal') { openTreeForGoal(); return; }
    if (action === 'clear-goal') { setGoal(''); toast('已取消今日目标'); render(); return; }
    if (action === 'toggle-goal') {
      const code = trigger.getAttribute('data-code');
      const node = D.getNode(code);
      const cur = goalStore();
      if (cur && cur.code === code) { setGoal(''); toast('已取消今日目标'); }
      else { setGoal(code, node ? node.name : ''); toast('已把「' + (node ? node.name : '') + '」设为今日目标'); }
      render();
      return;
    }
    if (action === 'recheck-lan') { loadLanInfo(); toast('已重新检测局域网地址'); return; }
    if (action === 'copy-lan') {
      const url = state.lanUrl || '';
      if (!url) { toast('还没检测到地址，点「重新检测」试试'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('已复制：' + url + '（发给手机即可）'); })
          .catch(function () { toast('地址：' + url); });
      } else toast('地址：' + url);
      return;
    }
    if (action === 'tour-next') {
      const st = state.tour;
      if (!st) return;
      const step = TOUR_STEPS[st.i];
      if (step && step.nextGo) { tourStep(st.i + 1); navigate(step.nextGo); return; }   // 先换页，再定位
      tourStep(st.i + 1);
      return;
    }
    if (action === 'tour-prev') {
      if (state.tour) tourStep(Math.max(0, state.tour.i - 1));
      return;
    }
    if (action === 'tour-skip') { endTour(false); return; }
    if (action === 'close-tree-editor') { closeTreeEditor(); return; }
    if (action === 'tree-edit-save') { saveTreeEditor(); return; }
    if (action === 'tree-edit-reset') {
      askConfirm('恢复默认分类树？', '你改过的分类名、备注，以及新增的分类都会清掉，回到词库自带的分类树。',
        function () { closeConfirm(); closeTreeEditor(); resetTreeOverlay(); });
      return;
    }
    if (action === 'te-toggle') {
      const code = trigger.getAttribute('data-code');
      if (state.treeEdit) {
        state.treeEdit.expanded[code] = !state.treeEdit.expanded[code];
        renderTreeEditor();
      }
      return;
    }
    if (action === 'te-add') {
      if (state.treeEdit) {
        const code = trigger.getAttribute('data-code');
        state.treeEdit.added.push({ key: 'a' + (state.treeEdit.newSeq++), parent: code, name: '' });
        state.treeEdit.expanded[code] = true;
        renderTreeEditor();
      }
      return;
    }
    if (action === 'te-remove-pending') {
      const key = trigger.getAttribute('data-key');
      if (state.treeEdit) {
        state.treeEdit.added = state.treeEdit.added.filter(function (x) { return x.key !== key; });
        renderTreeEditor();
      }
      return;
    }
    if (action === 'te-del') {
      const code = trigger.getAttribute('data-code');
      const used = D.wordIdsOfBranch(code).length;
      if (used) { toast('这个分类里还有 ' + used + ' 个单词，不能删（会变成没有家）。可以先把词「放进」别的分类。'); return; }
      const ov = loadTreeOverlay();
      store.UserWordStore.saveTreeOverlay({
        names: ov.names, notes: ov.notes,
        added: ov.added.filter(function (x) { return x.code !== code; })
      });
      applyTreeOverlay(loadTreeOverlay());
      if (state.treeEdit) {
        state.treeEdit.added = state.treeEdit.added.filter(function (x) { return x.code !== code; });
        renderTreeEditor();
      }
      toast('已删掉这个自定义分类');
      return;
    }
    if (action === 'do-pick') {
      applyPick(trigger.getAttribute('data-mode') === 'move' ? 'move' : 'join');
      return;
    }
    if (action === 'pick-back') {
      if (state.treePick) { state.treePick.step = 'tree'; state.treePick.code = ''; renderTree(); }
      return;
    }
    if (action === 'reset-word-branches') {
      resetWordBranches(trigger.getAttribute('data-id'));
      return;
    }
    if (action === 'close-tree') {
      closeTree();
      return;
    }
    if (action === 'cancel-tree') {
      // 需求：点击【取消】关闭弹窗并返回首页
      closeTree();
      navigate('#/');
      return;
    }
    if (action === 'open-branch-selected') {
      openSelectedBranch();
      return;
    }
    if (action === 'random-search') {
      const pool = ['bank', 'run', 'close', 'in', 'star', 'orange', 'table', 'match'];
      const pick = pool[Math.floor(Math.random() * pool.length)];
      navigate('#/search?q=' + encodeURIComponent(pick));
      return;
    }
    if (action === 'reset-demo') {
      if (!window.confirm('确定重置演示数据吗？将清空记忆记录、收藏与学习日志。')) return;
      store.resetAll();
      state.study = null;
      toast('演示数据已重置');
      render();
      return;
    }
    if (action === 'recheck-images') {
      // 换网络 / 开代理后重新探测图源：清掉缓存再试
      try { localStorage.removeItem(IMG_CACHE_KEY); } catch (e) { /* 忽略 */ }
      imgCache = {};
      { const el = $('#imgStatus'); if (el) { el.textContent = '配图检测中…'; el.className = 'img-status'; } }
      toast('正在重新检测图源…');
      probeImageSource();
      primeImages();
      return;
    }
    if (action === 'export-data') { exportUserData(); return; }
    if (action === 'import-data') { triggerImport(); return; }
    if (action === 'link-backup-file') { linkBackupFile(); return; }
    if (action === 'restore-local') { restoreLocalBackup(); return; }
    if (action === 'sync-now') { syncNow(false); return; }
    if (action === 'logout-account') { logoutAccount(); return; }
    if (action === 'copy-sync-code') {
      const code = YY_API.token || '';
      if (!code) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function () { toast('同步码已复制'); })
          .catch(function () { toast('同步码：' + code); });
      } else toast('同步码：' + code);
      return;
    }
    if (action === 'open-import') { openImport(trigger.getAttribute('data-code')); return; }
    if (action === 'load-more') {
      const code = trigger.getAttribute('data-code');
      const shown = Number(trigger.getAttribute('data-shown')) || LIBRARY_PAGE;
      const total = D.wordsOfBranch(code).length;
      const y = (typeof window.scrollY === 'number') ? window.scrollY : 0;
      libLimits[code] = Math.min(total, shown + LIBRARY_PAGE);
      render();
      if (y) setTimeout(function () { try { window.scrollTo(0, y); } catch (e) { /* 忽略 */ } }, 0);
      return;
    }
    if (action === 'close-import') { closeImport(); return; }
    if (action === 'import-mode') { importState.mode = trigger.getAttribute('data-mode') || 'menu'; renderImport(); return; }
    if (action === 'import-back') { importState.mode = 'menu'; renderImport(); return; }
    if (action === 'do-single-import') { doSingleImport(); return; }
    if (action === 'do-batch-import') { doBatchImport(); return; }
    if (action === 'export-user-words') { exportUserWords(); return; }
  }

  function onSubmit(e) {
    const form = e.target;
    if (form && form.id === 'searchForm') {
      e.preventDefault();
      const q = ($('input[name="q"]', form) || {}).value || '';
      const text = String(q).trim();
      if (!text) { toast('请输入要搜索的单词或中文释义'); return; }
      navigate('#/search?q=' + encodeURIComponent(text));
      return;
    }
    if (form && form.id === 'accountForm') {
      e.preventDefault();
      const mode = (e.submitter && e.submitter.getAttribute('data-mode')) || 'login';
      const val = function (name) { const el = form.querySelector('[name="' + name + '"]'); return el ? el.value : ''; };
      if (val('base')) YY_API.base = val('base');
      const username = String(val('username')).trim();
      const password = String(val('password'));
      if (!username || !password) { toast('请填写用户名和密码'); return; }
      doAuth(mode, { username: username, password: password });
      return;
    }
    if (form && form.id === 'codeForm') {
      e.preventDefault();
      const input = form.querySelector('[name="code"]');
      const code = input ? String(input.value).trim() : '';
      if (!code) { toast('请输入同步码'); return; }
      doAuth('code', { code: code });
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t && t.id === 'importFile' && t.files && t.files[0]) {
      handleImportFile(t.files[0]);
      t.value = '';
    }
    if (t && t.id === 'editImgFile' && t.files && t.files[0]) {
      readEditorImage(t.files[0]);
      t.value = '';
    }
    syncEditorField(t);      // 编辑器里的下拉框（词性）走 change
  }

  function onInput(e) {
    if (e.target && e.target.id === 'impBatch') updateBatchPreview();
    if (e.target && e.target.id === 'impWord') scheduleSingleIpa();
    syncEditorField(e.target);
    syncTreeEditField(e.target);
  }

  /** 编辑器输入框 → 状态（保证「保存」时读的是状态，不依赖 DOM 取值） */
  function syncEditorField(t) {
    if (!t || typeof t.getAttribute !== 'function' || !state.editor) return;
    const key = t.getAttribute('data-key');
    const field = t.getAttribute('data-field');
    if (key && field) updateEditorRow(key, field, t.value);
  }

  /** 词库树编辑器的输入框 → 状态 */
  function syncTreeEditField(t) {
    if (!t || typeof t.getAttribute !== 'function' || !state.treeEdit) return;
    const key = t.getAttribute('data-key');
    const field = t.getAttribute('data-field');
    const val = String(t.value === undefined || t.value === null ? '' : t.value);
    if (!key || !field) return;
    if (field === 'name') state.treeEdit.names[key] = val;
    else if (field === 'note') state.treeEdit.notes[key] = val;
    else if (field === 'new') {
      state.treeEdit.added.forEach(function (x) { if (x.key === key) x.name = val; });
    }
  }

  /** 单个导入：单词打完停 400ms 再查音标，避免每敲一个字母都请求一次 */
  let singleIpaTimer = null;
  function scheduleSingleIpa() {
    if (singleIpaTimer) clearTimeout(singleIpaTimer);
    singleIpaTimer = setTimeout(function () {
      singleIpaTimer = null;
      const w = (($('#impWord') || {}).value || '').trim();
      if (!w || !/^[A-Za-z][A-Za-z'’\- ]*$/.test(w)) return;
      requestIpa([w], function (found) {
        const hit = ipaCache[w.toLowerCase()];
        if (!found || !hit) return;
        const ukEl = $('#impUk');
        const usEl = $('#impUs');
        if (ukEl && !ukEl.value) ukEl.value = hit[0];
        if (usEl && !usEl.value) usEl.value = hit[1];
        const hint = $('#impIpaHint');
        if (hint) {
          hint.textContent = '已自动补全音标：' + hit[0] + ' / ' + hit[1] + '（可以直接改）';
          hint.className = 'import-ipa-hint is-ok';
        }
      });
    }, 400);
  }

  function onTreeClick(e) {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const trigger = e.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.getAttribute('data-action');
    if (action === 'tree-row') {
      handleTreeRow(trigger.getAttribute('data-code'), trigger.getAttribute('data-leaf') === '1');
    }
  }

  function onKeydown(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea';

    if (e.key === 'Escape') {
      if (state.tour) { endTour(false); return; }
      const modal = $('#treeModal');
      if (modal && !modal.hidden) { closeTree(); return; }
      const editModal = $('#editModal');
      const treeEdit = $('#treeEditModal');
      const cfm = $('#confirmModal');
      if (editModal && !editModal.hidden) { closeCardEditor(); return; }
      if (treeEdit && !treeEdit.hidden) { closeTreeEditor(); return; }
      if (cfm && !cfm.hidden) { closeConfirm(); return; }
    }
    if (typing) return;
    if (state.route.name !== 'study') return;
    const s = state.study;
    if (!s || s.finished || !s.queue.length) return;

    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      flipCard();
    } else if (s.flipped && (e.key === '1' || e.key === '2' || e.key === '3')) {
      const map = { '1': 'forget', '2': 'vague', '3': 'know' };
      e.preventDefault();
      rateCurrent(map[e.key]);
    }
  }

  function init() {
    document.addEventListener('click', onViewClick);
    $('#treeModal').addEventListener('click', onTreeClick);
    // 配图加载失败时换成本地 SVG（error 事件不冒泡，必须用捕获阶段）
    $('#view').addEventListener('error', handleImgError, true);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    // 点卡片以外的任何地方 → 收起 ⋯ 菜单
    document.addEventListener('click', function (e) {
      if (!state.cardMenu) return;
      const t = e.target;
      const act = t && typeof t.getAttribute === 'function' ? t.getAttribute('data-action') : '';
      const inside = act === 'toggle-card-menu' ||
        !!(t && typeof t.closest === 'function' && t.closest('.card-menu'));
      if (inside) return;
      state.cardMenu = null;
      render();
    });
    window.addEventListener('hashchange', render);
    // 窗口尺寸变化（含半屏切换）时重算卡片高度，保证评级按钮不被挤出视口
    window.addEventListener('resize', function () {
      const card = $('#flashcard');
      if (card && state.study && !state.study.finished) applyFlipHeight(card, !!state.study.flipped);
      if (state.tour) renderTour();
    });
    window.addEventListener('scroll', function () { if (state.tour) renderTour(); }, { passive: true });
    applyStoredUserData();          // 先把「我导入的词」合并进词库，再渲染
    render();
    // 数据变更 → 自动写入本地备份文件 + 刷新首页的数据安全状态
    store.onChange(function () {
      scheduleBackupFile();
      scheduleSync();
      refreshDataStatus();
    });
    initBackupFile();
    if (YY_API.loggedIn()) syncNow(true);
    // 注册 Service Worker（手机"添加到主屏幕"、离线打开）
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 忽略 */ });
    }
    refreshDataStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
