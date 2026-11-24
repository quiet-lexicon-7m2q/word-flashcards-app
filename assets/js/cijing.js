(function (root) {
  'use strict';
  const KEY = 'snow-lexis-cijing-v1';
  const labels = { noun:'名词', verb:'动词', adjective:'形容词', numeral:'数词', quantifier:'量词', pronoun:'代词', adverb:'副词', preposition:'介词', conjunction:'连词', auxiliary:'助动词', particle:'助词', interjection:'感叹词', determiner:'限定词', unknown:'待确认' };
  const posMap = { noun:'n.', verb:'v.', adjective:'adj.', adverb:'adv.', pronoun:'pron.', preposition:'prep.', conjunction:'conj.', interjection:'interj.' };
  let saved = { text:'', words:[] };
  try { saved = JSON.parse(localStorage.getItem(KEY)) || saved; } catch (_) {}
  if (!Array.isArray(saved.words)) saved = { text:'', words:[] };
  let draft = saved.text || '';
  const html = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(saved)); return true; } catch (_) { return false; } }
  function buildIndex() {
    const index = Object.create(null);
    root.YY_DATA.allWords().forEach(function (word) {
      word.senses.forEach(function (sense) {
        const parts = sense.chinese_translation.split(/[，,；;、/]/);
        parts.forEach(function (part) {
          // 仅接受完整释义，避免把“银行家”误当作“银行”。
          part = part.replace(/^[（(][^）)]*[）)]\s*/, '').trim();
          const variants = [part];
          if (sense.pos_tag === 'adj.' && part.length > 1 && /的$/.test(part)) variants.push(part.slice(0, -1));
          variants.forEach(function (term) {
            if (!/^[\u3400-\u9fff]{1,12}$/.test(term)) return;
            (index[term] || (index[term] = [])).push({ word:word.word, pos:sense.pos_tag, gloss:sense.chinese_translation, remark:sense.remark || '' });
          });
        });
      });
    });
    return index;
  }
  function analyse(text) {
    const index = buildIndex();
    const result = root.LexicalEngine.analyse(text, { languageMode:'zh' });
    const words = result.words.filter(w => w.language === 'zh').map(function (w) {
      const candidates = index[w.word] || [];
      // 词典中有唯一的词性时，可辅助判断规则无法确定的词；有歧义时保留待确认。
      let pos = w.pos;
      if (w.confidence < .65) {
        const possible = Object.keys(posMap).filter(p => candidates.some(c => c.pos === posMap[p]));
        pos = possible.length === 1 ? possible[0] : 'unknown';
      }
      const hits = posMap[pos] ? candidates.filter(c => c.pos === posMap[pos]) : (pos === 'numeral' ? candidates.filter(c => c.pos === 'n.' || c.pos === 'adj.') : []);
      const unique = [];
      hits.forEach(function (hit) { if (!unique.some(x => x.word.toLowerCase() === hit.word.toLowerCase())) unique.push(hit); });
      return { word:w.word, pos:pos, count:w.count, context:(w.contexts || [])[0] || '', phrases:(w.contextPhrases || []).map(p => p.text).slice(0, 3), matches:unique.slice(0, 15) };
    });
    saved = { text:text, words:words };
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
  function view() {
    const groups = Object.keys(labels).filter(p => saved.words.some(w => w.pos === p));
    const pack = groups.map(function (p) {
      const entries = saved.words.filter(w => w.pos === p);
      const ids = idsFor('cijing:' + p);
      const rows = entries.map(function (w) {
        const matches = (w.matches || []).map(m => '<label class="cj-match"><input type="checkbox" data-cj-match="' + html(w.word) + '" data-cj-pos="' + html(w.pos) + '" data-cj-english="' + html(m.word) + '"' + (m.enabled === false ? '' : ' checked') + '><b>' + html(m.word) + '</b><small>' + html(m.gloss) + '</small>' + (m.remark ? '<small>词库备注：' + html(m.remark) + '</small>' : '') + '</label>').join('');
        const options = Object.keys(labels).map(key => '<option value="' + html(key) + '"' + (key === w.pos ? ' selected' : '') + '>' + html(labels[key]) + '</option>').join('');
        return '<li class="cj-word"><div class="cj-word-head"><b>' + html(w.word) + '</b><span>' + w.count + ' 次 · <label>词性 <select data-cj-word="' + html(w.word) + '" data-cj-original="' + html(w.pos) + '" aria-label="调整' + html(w.word) + '的词性">' + options + '</select></label></span></div>' + (w.context ? '<p class="cj-context">' + html(w.context) + '</p>' : '') + (w.phrases.length ? '<p class="cj-context">文中搭配：' + html(w.phrases.join(' · ')) + '</p>' : '') + '<div class="cj-matches">' + (matches || '<span class="cj-unmatched">词库中暂无可靠对应</span>') + '</div></li>';
      }).join('');
      return '<section class="cj-pack"><div class="cj-pack-head"><div><h3>' + html(labels[p]) + '</h3><p>' + entries.length + ' 个中文词 · ' + ids.length + ' 个英文词</p></div><button type="button" class="btn btn-primary" data-action="study" data-scope="cijing:' + p + '"' + (ids.length ? '' : ' disabled') + '>开始学习</button></div><details><summary>查看中文词与匹配结果</summary><ul class="cj-words">' + rows + '</ul></details></section>';
    }).join('');
    return '<div class="cj-page"><div class="cj-heading"><span class="cj-eyebrow">CONTEXT TO VOCABULARY</span><h1>词境</h1><p>从中文文章出发，把遇见的词变成你的英文词库。</p></div><section class="cj-input"><div class="cj-input-head"><div><h2>导入一篇中文文章</h2><p>粘贴文字或导入文件，先检查识别结果，再生成词性词库。</p></div><label class="btn cj-upload">导入文件<input id="cjFile" type="file" accept="image/*,.pdf,.docx,.txt,.md" hidden></label></div><textarea id="cjText" rows="8" placeholder="在这里粘贴中文文章……">' + html(draft) + '</textarea><p class="cj-note" id="cjStatus">支持图片、TXT、Markdown、DOCX 和文字版 PDF；图片识别和部分文档解析需要联网。</p><div class="cj-actions"><button type="button" class="btn btn-primary" data-cj="analyse">分类并匹配词库</button><button type="button" class="btn" data-cj="sample">试试示例</button></div></section>' + (groups.length ? '<div class="cj-results"><div class="cj-results-head"><h2>你的词性词库</h2><p>根据中文词性匹配现有英文释义；候选可能有歧义，请结合原文检查。</p></div><div class="cj-grid">' + pack + '</div></div>' : '<div class="cj-empty"><b>文章里的词，正在等待被发现</b><p>导入文章后，这里会按中文词性生成可学习的词库。</p></div>') + '</div>';
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
      else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/.test(n)) { await script('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','Tesseract'); const r=await root.Tesseract.recognize(file,'chi_sim+eng',{logger:m=>{if(m.status==='recognizing text') status('图片识别中：'+Math.round(m.progress*100)+'%');}}); text=r.data.text; }
      else throw new Error('暂不支持此文件格式，请使用图片、TXT、DOCX 或 PDF。');
      if (!text.trim()) throw new Error('没有识别到文字，请尝试更清晰的文件。');
      draft=text; const el=document.getElementById('cjText'); if(el) el.value=text; status('读取完成，请检查文字后点击“分类并匹配词库”。');
    } catch(e) { status('导入失败：' + (e.message || '请重试'), true); }
  }
  function click(e, rerender) {
    const button=e.target.closest('[data-cj]'); if(!button) return;
    const action=button.getAttribute('data-cj');
    if(action==='sample') { draft='《红楼梦》描写了许多生动的人物。宝玉喜欢阅读，他正在阅读一本有趣的书。美丽的花园里有三只小鸟。'; const el=document.getElementById('cjText'); if(el) el.value=draft; status('示例已填入，点击“分类并匹配词库”开始。'); }
    if(action==='analyse') { const el=document.getElementById('cjText'); const text=el ? el.value.trim() : ''; if(!/[\u3400-\u9fff]/.test(text)) { status('请输入或导入中文文章。',true); return; } if(text.length>30000) { status('文章过长，请分段导入（每次最多 3 万字）。',true); return; } const persisted=analyse(text); rerender(); if(!persisted) status('分类已完成，但浏览器存储空间不足，结果未能保存。',true); }
  }
  function change(e, rerender) {
    const t=e.target;
    if(!t) return;
    if(t.id==='cjFile' && t.files[0]) { importFile(t.files[0]); t.value=''; return; }
    if(t.hasAttribute('data-cj-match')) {
      const w=saved.words.find(x=>x.word===t.getAttribute('data-cj-match') && x.pos===t.getAttribute('data-cj-pos'));
      const m=w && w.matches.find(x=>x.word===t.getAttribute('data-cj-english'));
      if(m) { m.enabled=t.checked; persist(); const pack=t.closest('.cj-pack'); if(pack) { const button=pack.querySelector('[data-action="study"]'); const count=idsFor('cijing:'+w.pos).length; button.disabled=!count; const description=pack.querySelector('.cj-pack-head p'); description.textContent=saved.words.filter(x=>x.pos===w.pos).length+' 个中文词 · '+count+' 个英文词'; } }
    }
    if(t.hasAttribute('data-cj-word')) {
      const w=saved.words.find(x=>x.word===t.getAttribute('data-cj-word') && x.pos===t.getAttribute('data-cj-original'));
      if(w && labels[t.value]) {
        w.pos=t.value;
        const candidates=buildIndex()[w.word] || [];
        w.matches=[];
        candidates.filter(c=>posMap[w.pos] ? c.pos===posMap[w.pos] : w.pos==='numeral' && (c.pos==='n.' || c.pos==='adj.')).forEach(c=>{ if(w.matches.length<15 && !w.matches.some(m=>m.word.toLowerCase()===c.word.toLowerCase())) w.matches.push(c); });
        persist(); rerender();
      }
    }
  }
  function input(e) { if(e.target && e.target.id==='cjText') draft=e.target.value; }
  root.CiJing={view:view,scopeInfo:scopeInfo,click:click,change:change,input:input};
})(window);
