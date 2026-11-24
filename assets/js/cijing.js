(function (root) {
  'use strict';
  const KEY = 'snow-lexis-cijing-en-v1';
  let examMonth = '', examSet = '', examOpen = false;
  const labels = { noun:'名词', verb:'动词', adjective:'形容词', numeral:'数词', quantifier:'量词', pronoun:'代词', adverb:'副词', preposition:'介词', conjunction:'连词', auxiliary:'助动词', particle:'助词', interjection:'感叹词', determiner:'限定词', unknown:'待确认' };
  const posMap = { noun:'n.', verb:'v.', adjective:'adj.', adverb:'adv.', pronoun:'pron.', preposition:'prep.', conjunction:'conj.', interjection:'interj.' };
  let saved = { text:'', words:[] };
  try { saved = JSON.parse(localStorage.getItem(KEY)) || saved; } catch (_) {}
  if (!Array.isArray(saved.words)) saved = { text:'', words:[] };
  if (!saved.phrases) saved.phrases = {};
  let draft = saved.text || '';
  const html = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); return true; } catch (_) { return false; } }
  // 仅为出现于文章的已知搭配提供中文释义，避免把普通相邻词误标成固定搭配。
  const phraseRules = [
    ['example', /\bfor example\b/ig, '例如'],
    ['instance', /\bfor instance\b/ig, '例如'],
    ['able', /\b(?:am|is|are|was|were|be|been|being) able to(?:\s+\w+)?/ig, '能够做某事'],
    ['make', /\b(?:make|makes|made|making) (?:great|significant|remarkable|considerable|substantial) progress\b/ig, '取得巨大进步'],
    ['progress', /\b(?:make|makes|made|making) (?:great|significant|remarkable|considerable|substantial) progress\b/ig, '取得巨大进步'],
    ['make', /\b(?:make|makes|made|making) (?:a )?(?:great|significant|important|major|remarkable) contributions? to\b/ig, '对……作出重大贡献'],
    ['contribution', /\b(?:make|makes|made|making) (?:a )?(?:great|significant|important|major|remarkable) contributions? to\b/ig, '对……作出重大贡献'],
    ['make', /\b(?:make|makes|made|making) a difference\b/ig, '产生影响；带来改变'],
    ['take', /\b(?:take|takes|took|taken|taking) part in\b/ig, '参加'],
    ['take', /\b(?:take|takes|took|taken|taking) (?:good )?care of\b/ig, '照顾'],
    ['pay', /\b(?:pay|pays|paid|paying) attention to\b/ig, '关注；注意'],
    ['play', /\b(?:play|plays|played|playing) (?:an? )?(?:important|significant|key|vital|crucial) role in\b/ig, '在……中发挥重要作用'],
    ['role', /\b(?:play|plays|played|playing) (?:an? )?(?:important|significant|key|vital|crucial) role in\b/ig, '在……中发挥重要作用'],
    ['lead', /\b(?:lead|leads|led|leading) to\b/ig, '导致；通向'],
    ['result', /\bresult(?:s|ed|ing)? in\b/ig, '导致'],
    ['result', /\bresult(?:s|ed|ing)? from\b/ig, '由……引起'],
    ['depend', /\bdepend(?:s|ed|ing)? on\b/ig, '依靠；取决于'],
    ['focus', /\bfocus(?:es|ed|ing)? on\b/ig, '关注；专注于'],
    ['contribute', /\bcontribut(?:e|es|ed|ing) to\b/ig, '有助于；为……作贡献'],
    ['benefit', /\bbenefit(?:s|ed|ing)? from\b/ig, '受益于'],
    ['base', /\b(?:is|are|was|were|be|been) based on\b/ig, '以……为基础'],
    ['important', /\b(?:is|are|was|were|be) important to\b/ig, '对……很重要'],
    ['good', /\b(?:is|are|was|were|be) good at\b/ig, '擅长'],
    ['interested', /\b(?:is|are|was|were|be) interested in\b/ig, '对……感兴趣'],
    ['addition', /\bin addition(?: to)?\b/ig, '此外；除……之外'],
    ['course', /\bof course\b/ig, '当然'],
    ['well', /\bas well as\b/ig, '以及；和'],
    ['fact', /\bin fact\b/ig, '事实上'],
    ['terms', /\bin terms of\b/ig, '在……方面'],
    ['order', /\bin order to\b/ig, '为了'],
    ['due', /\bdue to\b/ig, '由于'],
    ['according', /\baccording to\b/ig, '根据'],
    ['responsible', /\b(?:is|are|was|were|be) responsible for\b/ig, '负责'],
    ['advantage', /\b(?:take|takes|took|taken|taking) advantage of\b/ig, '利用'],
    ['take', /\b(?:take|takes|took|taken|taking) advantage of\b/ig, '利用']
  ];
  function phrasesForText(text) {
    const byWord = Object.create(null);
    phraseRules.forEach(function(rule) {
      rule[1].lastIndex=0; let match;
      while ((match=rule[1].exec(text))) {
        const list=byWord[rule[0]] || (byWord[rule[0]]=[]);
        if (!list.some(p=>p.en.toLowerCase()===match[0].toLowerCase())) list.push({en:match[0],zh:rule[2]});
      }
    });
    return byWord;
  }
  function phrasesFor(word) {
    const key=String(word || '').toLowerCase();
    return (saved.phrases && saved.phrases[key]) || [];
  }
  function analyse(text) {
    const result = root.LexicalEngine.analyse(text, { languageMode:'en' });
    const foundPhrases = phrasesForText(text);
    const phrases = saved.phrases || {};
    Object.keys(foundPhrases).forEach(function(key) {
      const list = phrases[key] || (phrases[key] = []);
      foundPhrases[key].forEach(p => { if (!list.some(x => x.en.toLowerCase() === p.en.toLowerCase() && x.zh === p.zh)) list.push(p); });
    });
    const words = result.words.filter(w => w.language === 'en').map(function (w) {
      const item = root.YY_DATA.wordByText(w.word) || root.YY_DATA.wordByText(w.surface);
      const matches = item ? [{word:item.word, gloss:item.senses.map(s=>s.chinese_translation).join('；'), remark:''}] : [];
      const pos = w.word.toLowerCase() === 'example' && foundPhrases.example ? 'noun' : w.pos;
      return { word:w.word, pos:pos, count:w.count, context:(w.contexts || [])[0] || '', phrases:(foundPhrases[w.word.toLowerCase()] || []), matches:matches };
    });
    saved = { text:text, words:words, phrases:phrases };
    draft = text;
    return persist();
  }
  function idsFor(scope) {
    const pos = scope.slice('cijing:'.length);
    const names = new Set();
    (saved.words || []).filter(w => w.pos === pos).forEach(w => (w.matches || []).forEach(m => { if (m.enabled !== false) names.add(m.word.toLowerCase()); }));
    return Array.from(names).map(name => root.YY_DATA.wordByText(name)).filter(Boolean).map(w => w.id);
  }
  function scopeInfo(scope) { const pos = scope.slice('cijing:'.length); return { scope:scope, label:'词境 · ' + (labels[pos] || '词库'), ids:idsFor(scope) }; }
  function examView() {
    const sets = root.CET6_TRANSLATION_SETS || [];
    const months = Array.from(new Set(sets.map(x=>x.slice(0,7))));
    const monthOptions = months.map(m=>'<option value="'+html(m)+'"'+(m===examMonth?' selected':'')+'>'+html(m.slice(0,4))+' 年 '+Number(m.slice(5))+' 月</option>').join('');
    const setOptions = sets.filter(x=>x.slice(0,7)===examMonth).map(x=>'<option value="'+html(x)+'"'+(x===examSet?' selected':'')+'>第 '+Number(x.slice(8))+' 套</option>').join('');
    const url = examSet ? 'https://english-exam.lazynote.cn/cet6/sections/'+encodeURIComponent(examSet)+'/part-iv/' : '';
    return '<section class="cj-exams"><div class="cj-exams-head"><div><h2>英语六级历年翻译</h2><p>按考试月份与套次查找原题、参考译文与解析。</p></div><button class="btn" type="button" data-cj="exams">'+(examOpen?'收起':'选择月份')+'</button></div>'+(examOpen ? '<div class="cj-exams-body"><div class="cj-exam-selects"><label>考试月份 <select id="cjExamMonth"><option value="">请选择月份</option>'+monthOptions+'</select></label><label>试卷套次 <select id="cjExamSet"'+(examMonth?'':' disabled')+'><option value="">请选择套次</option>'+setOptions+'</select></label></div>'+(url ? '<p class="cj-note">下方内容来自懒笔记。复制需要学习的英文参考译文，粘贴到文章框中即可分类。</p><p><a href="'+html(url)+'" target="_blank" rel="noopener noreferrer">在懒笔记打开题目与解析</a></p><iframe class="cj-exam-frame" title="六级翻译题目与解析（懒笔记）" src="'+html(url)+'" loading="lazy"></iframe>' : '<p class="cj-note">选择月份和套次后查看原站题目与解析。</p>')+'</div>' : '')+'</section>';
  }
  function view() {
    const groups = Object.keys(labels).filter(p => saved.words.some(w => w.pos === p));
    const pack = groups.map(function (p) {
      const entries = saved.words.filter(w => w.pos === p);
      const ids = idsFor('cijing:' + p);
      const rows = entries.map(function (w) {
        const matches = (w.matches || []).map(m => '<label class="cj-match"><input type="checkbox" data-cj-match="' + html(w.word) + '" data-cj-pos="' + html(w.pos) + '" data-cj-english="' + html(m.word) + '"' + (m.enabled === false ? '' : ' checked') + '><b>' + html(m.word) + '</b><small>' + html(m.gloss) + '</small>' + (m.remark ? '<small>词库备注：' + html(m.remark) + '</small>' : '') + '</label>').join('');
        const options = Object.keys(labels).map(key => '<option value="' + html(key) + '"' + (key === w.pos ? ' selected' : '') + '>' + html(labels[key]) + '</option>').join('');
        return '<li class="cj-word"><div class="cj-word-head"><b>' + html(w.word) + '</b><span>' + w.count + ' 次 · <label>词性 <select data-cj-word="' + html(w.word) + '" data-cj-original="' + html(w.pos) + '" aria-label="调整' + html(w.word) + '的词性">' + options + '</select></label></span></div>' + (w.context ? '<p class="cj-context">' + html(w.context) + '</p>' : '') + (w.phrases.length ? '<p class="cj-context">词组：' + html(w.phrases.map(p=>p.en + ' · ' + p.zh).join('；')) + '</p>' : '') + '<div class="cj-matches">' + (matches || '<span class="cj-unmatched">词库中暂无可靠对应</span>') + '</div></li>';
      }).join('');
      return '<section class="cj-pack"><div class="cj-pack-head"><div><h3>' + html(labels[p]) + '</h3><p>' + entries.length + ' 个词条 · ' + ids.length + ' 个可学习单词</p></div><button type="button" class="btn btn-primary" data-action="study" data-scope="cijing:' + p + '"' + (ids.length ? '' : ' disabled') + '>开始学习</button></div><details><summary>查看单词与词组</summary><ul class="cj-words">' + rows + '</ul></details></section>';
    }).join('');
    return '<div class="cj-page"><div class="cj-heading"><span class="cj-eyebrow">CONTEXT TO VOCABULARY</span><h1>词境</h1><p>从英文文章出发，把遇见的单词和词组变成你的词库。</p></div>'+examView()+'<section class="cj-input"><div class="cj-input-head"><div><h2>导入一篇英文文章</h2><p>粘贴文字或导入文件，先检查识别结果，再生成词性词库。</p></div><label class="btn cj-upload">导入文件<input id="cjFile" type="file" accept="image/*,.pdf,.docx,.txt,.md" hidden></label></div><textarea id="cjText" rows="8" placeholder="在这里粘贴英文文章……">' + html(draft) + '</textarea><p class="cj-note" id="cjStatus">支持图片、TXT、Markdown、DOCX 和文字版 PDF；图片识别和部分文档解析需要联网。</p><div class="cj-actions"><button type="button" class="btn btn-primary" data-cj="analyse">分类并匹配词库</button><button type="button" class="btn" data-cj="sample">试试示例</button></div></section>' + (groups.length ? '<div class="cj-results"><div class="cj-results-head"><h2>你的词性词库</h2><p>按英文词性匹配现有词库，词组附在相应单词的卡片上；分类结果可调整。</p></div><div class="cj-grid">' + pack + '</div></div>' : '<div class="cj-empty"><b>文章里的词，正在等待被发现</b><p>导入文章后，这里会按英文词性生成可学习的词库。</p></div>') + '</div>';
  }
  function status(message, error) { const el = document.getElementById('cjStatus'); if (el) { el.textContent = message; el.classList.toggle('cj-error', !!error); } }
  function script(url, name) { return root[name] ? Promise.resolve() : new Promise(function(resolve,reject) { const s=document.createElement('script'); s.src=url; s.onload=resolve; s.onerror=() => reject(new Error('组件加载失败，请检查网络连接')); document.head.appendChild(s); }); }
  async function importFile(file) {
    status('正在读取 ' + file.name + '，请稍候……');
    try {
      const n = file.name.toLowerCase(); let text = '';
      if (/\.(txt|md)$/.test(n) || file.type.startsWith('text/')) text = await file.text();
      else if (/\.docx$/.test(n)) { await script('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js','mammoth'); text = (await root.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value; }
      else if (/\.pdf$/.test(n)) { const pdf = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'); pdf.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'; const doc=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise; for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i); text+=(await page.getTextContent()).items.map(x=>x.str+(x.hasEOL?'\n':'')).join('')+'\n';} if(!text.trim()) throw new Error('这个 PDF 没有文字层，请先将页面导出成图片再识别。'); }
      else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/.test(n)) { await script('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract'); const r=await root.Tesseract.recognize(file,'eng',{logger:m=>{if(m.status==='recognizing text') status('图片识别中：'+Math.round(m.progress*100)+'%');}}); text=r.data.text; }
      else throw new Error('暂不支持此文件格式，请使用图片、TXT、DOCX 或 PDF。');
      if (!text.trim()) throw new Error('没有识别到文字，请尝试更清晰的文件。');
      draft=text; const el=document.getElementById('cjText'); if(el) el.value=text; status('读取完成，请检查文字后点击“分类并匹配词库”。');
    } catch(e) { status('导入失败：' + (e.message || '请重试'), true); }
  }
  function click(e, rerender) {
    const button=e.target.closest('[data-cj]'); if(!button) return;
    const action=button.getAttribute('data-cj');
    if(action==='exams') { examOpen=!examOpen; rerender(); return; }
    if(action==='sample') { draft='For example, students are able to make great progress. Their teachers make a significant contribution to education and play an important role in their lives.'; const el=document.getElementById('cjText'); if(el) el.value=draft; status('示例已填入，点击“分类并匹配词库”开始。'); }
    if(action==='analyse') { const el=document.getElementById('cjText'); const text=el ? el.value.trim() : ''; if(!/[A-Za-z]/.test(text)) { status('请输入或导入英文文章。',true); return; } if(text.length>30000) { status('文章过长，请分段导入（每次最多 3 万字）。',true); return; } const persisted=analyse(text); rerender(); if(!persisted) status('分类已完成，但浏览器存储空间不足，结果未能保存。',true); }
  }
  function change(e, rerender) {
    const t=e.target;
    if(!t) return;
    if(t.id==='cjExamMonth') { examMonth=t.value; examSet=''; rerender(); return; }
    if(t.id==='cjExamSet') { examSet=t.value; rerender(); return; }
    if(t.id==='cjFile' && t.files[0]) { importFile(t.files[0]); t.value=''; return; }
    if(t.hasAttribute('data-cj-match')) {
      const w=saved.words.find(x=>x.word===t.getAttribute('data-cj-match') && x.pos===t.getAttribute('data-cj-pos'));
      const m=w && w.matches.find(x=>x.word===t.getAttribute('data-cj-english'));
      if(m) { m.enabled=t.checked; persist(); const pack=t.closest('.cj-pack'); if(pack) { const button=pack.querySelector('[data-action="study"]'); const count=idsFor('cijing:'+w.pos).length; button.disabled=!count; const description=pack.querySelector('.cj-pack-head p'); description.textContent=saved.words.filter(x=>x.pos===w.pos).length+' 个词条 · '+count+' 个可学习单词'; } }
    }
    if(t.hasAttribute('data-cj-word')) {
      const w=saved.words.find(x=>x.word===t.getAttribute('data-cj-word') && x.pos===t.getAttribute('data-cj-original'));
      if(w && labels[t.value]) {
        w.pos=t.value;
        // 调整词性不改变已匹配的英文单词。
        persist(); rerender();
      }
    }
  }
  function input(e) { if(e.target && e.target.id==='cjText') draft=e.target.value; }
  root.CiJing={view:view,scopeInfo:scopeInfo,click:click,change:change,input:input,phrasesFor:phrasesFor};
})(window);
