// Chat UI from BASE-CLAUDE, adapted to the existing signed session.
(function () {
  const $ = (id) => document.getElementById(id);
  const chat = $('chat');
  const input = $('input');
  const send = $('send');
  const model = $('provider');
  const quota = $('quota');
  const mode = new URLSearchParams(location.search).get('mode') === 'code' ? 'code' : 'chat';
  const modeLabel = $('mode-label');
  if (modeLabel) modeLabel.textContent = mode === 'code' ? 'โหมดโค้ด' : 'แชท';
  if (mode === 'code') {
    $('empty').textContent = 'ส่งโจทย์หรือวางโค้ดเพื่อให้ AI ช่วยเขียน ตรวจ และอธิบาย';
    $('hint').textContent = 'AI ตอบเป็นโค้ดในแชท ยังไม่แก้ไฟล์ใน GitHub · ประวัติแชทยังไม่บันทึกถาวร · อย่าใส่รหัสผ่านหรือ API key';
  }
  const turns = [];
  const MAX_TURNS = 20;
  const historyPanel = $('history');
  const historyToggle = $('history-toggle');
  let conversationId = new URLSearchParams(location.search).get('c');
  let historyAvailable = false;

  function setConversation(id) {
    conversationId = id || null;
    const params = new URLSearchParams(location.search);
    if (conversationId) params.set('c', conversationId); else params.delete('c');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
    historyPanel.querySelectorAll('.history-row').forEach((row) => row.classList.toggle('current', row.dataset.id === conversationId));
  }

  function resetChat(message) {
    turns.length = 0;
    chat.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.id = 'empty';
    empty.textContent = message;
    chat.append(empty);
  }

  async function loadHistoryList() {
    const response = await fetch('/api/chats', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    historyPanel.innerHTML = '';
    if (!response.ok || !result.ok) {
      const note = document.createElement('p');
      note.className = 'history-empty';
      note.textContent = result.message || 'โหลดประวัติแชตไม่สำเร็จ';
      historyPanel.append(note);
      return;
    }
    if (!result.conversations.length) {
      const note = document.createElement('p');
      note.className = 'history-empty';
      note.textContent = 'ยังไม่มีประวัติแชต';
      historyPanel.append(note);
      return;
    }
    for (const item of result.conversations) {
      const row = document.createElement('div');
      row.className = 'history-row' + (item.id === conversationId ? ' current' : '');
      row.dataset.id = item.id;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'history-open';
      open.textContent = item.title;
      const when = document.createElement('small');
      when.textContent = new Date(item.updated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
      open.append(when);
      open.addEventListener('click', () => openConversation(item.id));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'history-del';
      del.textContent = 'ลบ';
      del.setAttribute('aria-label', 'ลบแชต ' + item.title);
      del.addEventListener('click', () => removeConversation(item.id, item.title));
      row.append(open, del);
      historyPanel.append(row);
    }
  }

  async function openConversation(id) {
    const response = await fetch('/api/chats/' + encodeURIComponent(id), { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      if (response.status === 401) return toLogin();
      setConversation(null);
      bubble('e', result.message || 'เปิดแชตนี้ไม่ได้');
      return;
    }
    resetChat('แชตนี้ยังไม่มีข้อความ');
    for (const item of result.conversation.messages) bubble(item.role === 'user' ? 'u' : 'a', item.content);
    turns.push(...result.conversation.messages.slice(-MAX_TURNS));
    if (turns[0]?.role !== 'user') turns.shift();
    setConversation(id);
  }

  async function removeConversation(id, title) {
    if (!confirm('ลบแชต "' + title + '" ถาวร?')) return;
    const response = await fetch('/api/chats/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) {
      bubble('e', 'ลบแชตไม่สำเร็จ ลองใหม่อีกครั้ง');
      return;
    }
    if (id === conversationId) {
      setConversation(null);
      resetChat('ลบแชตแล้ว เริ่มแชทใหม่ได้เลย');
    }
    await loadHistoryList();
  }

  historyToggle.addEventListener('click', async () => {
    const opening = historyPanel.hidden;
    historyPanel.hidden = !opening;
    historyToggle.setAttribute('aria-expanded', String(opening));
    if (opening) await loadHistoryList();
  });

  function bubble(kind, text, meta) {
    $('empty')?.remove();
    const node = document.createElement('div');
    node.className = 'bubble ' + kind;
    node.textContent = text;
    if (meta) {
      const label = document.createElement('span');
      label.className = 'meta';
      label.textContent = meta;
      node.append(label);
    }
    chat.append(node);
    chat.scrollTop = chat.scrollHeight;
    return node;
  }

  function toLogin() {
    location.replace('/login?return_to=%2Fchat');
  }

  $('signout').addEventListener('click', () => {
    location.assign('/auth/logout');
  });

  $('clear').addEventListener('click', () => {
    setConversation(null);
    resetChat(mode === 'code' ? 'เริ่มโจทย์โค้ดใหม่ได้เลย' : 'เริ่มแชทใหม่ได้เลย');
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !matchMedia('(pointer: coarse)').matches) {
      event.preventDefault();
      $('composer').requestSubmit();
    }
  });

  $('composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;

    input.value = '';
    input.style.height = 'auto';
    bubble('u', text);
    turns.push({ role: 'user', content: text });
    while (turns.length > MAX_TURNS) turns.shift();
    if (turns[0]?.role !== 'user') turns.shift();

    send.disabled = true;
    const wait = bubble('a', 'กำลังคิด');
    wait.classList.add('thinking');
    let answerNode = null;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, messages: turns, mode, stream: true, ...(conversationId ? { conversation_id: conversationId } : {}), ...(mode === 'code' ? { tool: 'code' } : {}) }),
      });
      const remaining = response.headers.get('x-lsuperagen-rate-remaining');
      const limit = response.headers.get('x-lsuperagen-rate-limit');
      if (remaining !== null && limit) quota.textContent = 'เหลือในรอบนี้ ' + remaining + '/' + limit;
      if (!response.ok || !(response.headers.get('content-type') || '').includes('ndjson')) {
        const result = await response.json().catch(() => ({}));
        wait.remove();
        turns.pop();
        if (response.status === 401) return toLogin();
        bubble('e', result.message || 'ส่งข้อความไม่สำเร็จ (' + response.status + ')');
        return;
      }

      // Stream: render each delta as it arrives; only a "done" event commits the turn.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamed = '';
      let final = null;
      const onEvent = (event) => {
        if (event.type === 'delta' && typeof event.text === 'string') {
          if (!answerNode) {
            wait.remove();
            answerNode = bubble('a', '');
          }
          streamed += event.text;
          answerNode.textContent = streamed;
          chat.scrollTop = chat.scrollHeight;
        } else if (event.type === 'done' || event.type === 'error') {
          final = event;
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut + 1);
          if (!line) continue;
          try { onEvent(JSON.parse(line)); } catch (_) { /* ignore a malformed line */ }
        }
      }
      wait.remove();
      if (!final || !final.ok) {
        turns.pop();
        if (answerNode) answerNode.classList.add('e');
        bubble('e', (final && final.message) || 'การเชื่อมต่อขาดกลางคัน ลองใหม่อีกครั้ง');
        return;
      }
      const answer = final.output || streamed;
      turns.push({ role: 'assistant', content: answer });
      if (final.conversation_id) {
        setConversation(final.conversation_id);
        if (!historyPanel.hidden) loadHistoryList();
      }
      if (!answerNode) answerNode = bubble('a', '');
      answerNode.textContent = answer;
      const label = document.createElement('span');
      label.className = 'meta';
      label.textContent = 'AI';
      answerNode.append(label);
      chat.scrollTop = chat.scrollHeight;
    } catch (_) {
      wait.remove();
      if (answerNode) answerNode.classList.add('e');
      turns.pop();
      bubble('e', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  (async () => {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
      const session = await response.json();
      if (!session.authenticated) return toLogin();
      $('who').textContent = session.user?.name || session.user?.email || 'Signed in';
      model.innerHTML = '<option>OpenAI</option>';
      input.disabled = false;
      send.disabled = false;
      const probe = await fetch('/api/chats', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      historyAvailable = Boolean(probe && probe.ok);
      historyToggle.hidden = !historyAvailable;
      if (historyAvailable) $('hint').textContent = 'แชตจะถูกบันทึกในบัญชีของคุณ ลบได้จากปุ่ม "ประวัติ" · อย่าใส่รหัสผ่านหรือ API key';
      if (historyAvailable && conversationId) await openConversation(conversationId);
      else if (conversationId) setConversation(null);
    } catch (_) {
      bubble('e', 'ตรวจสอบการเข้าสู่ระบบไม่ได้ ลองรีเฟรชหน้า');
    }
  })();
})();
