// Optional chat tools. Internal routes stay hidden from the visible UI.
(function () {
  const bar = document.querySelector('.bar');
  const composer = document.getElementById('composer');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const attach = document.getElementById('attach');
  const chat = document.getElementById('chat');
  const modeLabel = document.getElementById('mode-label');
  const modelSelect = document.getElementById('provider');
  if (!bar || !composer || !input || !send || !chat || !modelSelect) return;

  const style = document.createElement('style');
  style.textContent = `
    .chat-tools{position:relative;display:inline-flex}
    .chat-tools-menu{position:absolute;z-index:30;top:46px;left:0;min-width:190px;padding:7px;background:#10111c;border:1px solid #2a2a2a;border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.5)}
    .chat-tools-menu[hidden]{display:none!important}
    .chat-tools-item{width:100%;min-height:42px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:#fff;font:inherit;font-size:14px;text-align:left;cursor:pointer}
    .chat-tools-item:hover,.chat-tools-item[aria-checked="true"]{background:#1c1d25}
    .chat-tools-item:disabled{opacity:.35;cursor:default}
    .tool-answer-text{white-space:pre-wrap}
    .tool-sources{display:grid;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid #2a2a2a}
    .tool-sources a{color:#aeb8c4;text-decoration:none;font-size:12px;overflow-wrap:anywhere}
  `;
  document.head.append(style);

  const shell = document.createElement('div');
  shell.className = 'chat-tools';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn-ghost';
  toggle.id = 'tools-toggle';
  toggle.textContent = 'เครื่องมือ';
  toggle.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.id = 'tools-menu';
  menu.className = 'chat-tools-menu';
  menu.hidden = true;

  const items = [
    ['research', 'ค้นหา'],
    ['multi', 'หลายโมเดล'],
    ['github', 'GitHub'],
  ];
  const buttons = new Map();
  for (const [tool, label] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-tools-item';
    button.setAttribute('data-tool', tool);
    button.textContent = label;
    button.setAttribute('aria-checked', 'false');
    if (tool !== 'github') button.disabled = true;
    menu.append(button);
    buttons.set(tool, button);
  }
  shell.append(toggle, menu);
  modelSelect.insertAdjacentElement('afterend', shell);

  let selectedTool = null;
  let busy = false;
  let capabilities = { research: false, multi: false };

  function setMenu(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function setSelected(tool) {
    if (tool === 'github') {
      setMenu(false);
      return;
    }
    selectedTool = selectedTool === tool ? null : tool;
    for (const [name, button] of buttons) button.setAttribute('aria-checked', String(name === selectedTool));
    const label = selectedTool ? buttons.get(selectedTool).textContent : 'เครื่องมือ';
    toggle.textContent = label;
    if (modeLabel) modeLabel.textContent = selectedTool ? label : 'แชท';
    if (attach && !busy) attach.disabled = Boolean(selectedTool) || input.disabled;
    setMenu(false);
  }

  toggle.addEventListener('click', () => setMenu(menu.hidden));
  document.addEventListener('click', (event) => {
    if (!shell.contains(event.target)) setMenu(false);
  });
  for (const [tool, button] of buttons) button.addEventListener('click', () => setSelected(tool));

  function bubble(kind, text) {
    document.getElementById('empty')?.remove();
    const node = document.createElement('div');
    node.className = 'bubble ' + kind;
    node.textContent = text;
    chat.append(node);
    chat.scrollTop = chat.scrollHeight;
    return node;
  }

  function answerBubble(meta) {
    const node = bubble('a', '');
    const text = document.createElement('div');
    text.className = 'tool-answer-text';
    const label = document.createElement('span');
    label.className = 'meta';
    label.textContent = meta;
    node.replaceChildren(text, label);
    return { node, text };
  }

  function setBusy(next) {
    busy = next;
    send.disabled = next;
    input.disabled = next;
    if (attach) attach.disabled = next || Boolean(selectedTool);
  }

  async function readNdjson(response, onEvent) {
    if (!response.ok || !(response.headers.get('content-type') || '').includes('ndjson')) {
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) location.replace('/login?return_to=%2Fchat');
      throw new Error(result.message || 'ส่งคำขอไม่สำเร็จ (' + response.status + ')');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); } catch (_) { continue; }
        onEvent(event);
      }
    }
  }

  async function runResearch(text) {
    const wait = bubble('a', 'กำลังค้นหา');
    let output = null;
    let sources = [];
    let streamError = '';
    try {
      const response = await fetch('/api/deep-research/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      await readNdjson(response, (event) => {
        if (event.type === 'sources' && Array.isArray(event.sources)) sources = event.sources;
        if (event.type === 'delta' && typeof event.text === 'string') {
          if (!output) { wait.remove(); output = answerBubble('ค้นหา'); }
          output.text.textContent += event.text;
          chat.scrollTop = chat.scrollHeight;
        }
        if (event.type === 'error') streamError = event.message || 'ค้นหาไม่สำเร็จ';
      });
      if (streamError) throw new Error(streamError);
      wait.remove();
      if (!output) output = answerBubble('ค้นหา');
      if (!output.text.textContent) output.text.textContent = 'ไม่พบคำตอบจากการค้นหา';
      if (sources.length) {
        const list = document.createElement('div');
        list.className = 'tool-sources';
        for (const source of sources.slice(0, 6)) {
          if (!source?.url) continue;
          const link = document.createElement('a');
          link.href = source.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = source.title || source.url;
          list.append(link);
        }
        output.node.append(list);
      }
    } catch (error) {
      wait.remove();
      bubble('e', error.message || 'ค้นหาไม่สำเร็จ');
    }
  }

  async function runMulti(text) {
    const wait = bubble('a', 'กำลังเรียกหลายโมเดล');
    const outputs = new Map();
    try {
      const response = await fetch('/api/multi-chat/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }], models: 'all' }),
      });
      await readNdjson(response, (event) => {
        if (event.type === 'delta' && event.model && typeof event.text === 'string') {
          if (!outputs.has(event.model)) {
            wait.remove();
            outputs.set(event.model, answerBubble(event.label || event.model));
          }
          outputs.get(event.model).text.textContent += event.text;
          chat.scrollTop = chat.scrollHeight;
        } else if (event.type === 'error') {
          const item = outputs.get(event.model) || answerBubble(event.label || event.model || 'AI');
          outputs.set(event.model || 'error', item);
          item.node.classList.add('e');
          item.text.textContent = event.message || 'โมเดลตอบไม่สำเร็จ';
        }
      });
      wait.remove();
      if (!outputs.size) bubble('e', 'ยังไม่มีโมเดลพร้อมใช้งาน');
    } catch (error) {
      wait.remove();
      bubble('e', error.message || 'เรียกหลายโมเดลไม่สำเร็จ');
    }
  }

  composer.addEventListener('submit', async (event) => {
    if (!selectedTool || busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    bubble('u', text);
    setBusy(true);
    try {
      if (selectedTool === 'research') await runResearch(text);
      else if (selectedTool === 'multi') await runMulti(text);
    } finally {
      setBusy(false);
      input.focus();
    }
  }, true);

  (async () => {
    try {
      const response = await fetch('/api/providers', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      capabilities.research = Boolean(result.capabilities?.research);
      capabilities.multi = Boolean(result.capabilities?.multi_model);
    } catch (_) {
      capabilities = { research: false, multi: false };
    } finally {
      buttons.get('research').disabled = !capabilities.research;
      buttons.get('multi').disabled = !capabilities.multi;
    }
  })();
})();
