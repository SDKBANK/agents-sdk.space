import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const visibleHtml = (html) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

test('chat exposes one compact tools menu without showing internal endpoint names', async () => {
  const html = await read('chat.html');
  const visible = visibleHtml(html);

  assert.match(html, /id="tools-toggle"/);
  assert.match(html, /id="tools-menu"/);
  assert.match(html, /data-tool="research"[^>]*>[^<]*ค้นหา/);
  assert.match(html, /data-tool="multi"[^>]*>[^<]*หลายโมเดล/);
  assert.match(html, /data-tool="github"[^>]*>[^<]*GitHub/);
  assert.doesNotMatch(visible, /\/api\/(providers|multi-chat|deep-research|github)/);
});

test('chat client wires research and multi-model tools but leaves GitHub inert', async () => {
  const client = await read('assets/chat.js');

  assert.match(client, /\/api\/providers/);
  assert.match(client, /\/api\/deep-research\/stream/);
  assert.match(client, /\/api\/multi-chat\/stream/);
  assert.doesNotMatch(client, /\/api\/github\//);
});

test('worker exposes authenticated routes for provider discovery, research, and multi-model chat', async () => {
  const source = await read('src/index.js');

  assert.match(source, /from ['"]\.\/multi-model-chat\.js['"]/);
  assert.match(source, /from ['"]\.\/deep-research\.js['"]/);
  for (const route of ['/api/providers', '/api/multi-chat', '/api/multi-chat/stream', '/api/deep-research', '/api/deep-research/stream']) {
    assert.equal(source.includes(route), true, `missing route ${route}`);
  }
  assert.match(source, /currentSession\(request, env\)/);
});
