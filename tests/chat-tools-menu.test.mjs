import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const visibleHtml = (html) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

test('chat exposes one compact tools menu without showing internal endpoint names', async () => {
  const html = await read('chat.html');
  const visible = visibleHtml(html);

  assert.match(html, /chat-tools\.js\?v=1/);
  assert.doesNotMatch(visible, /\/api\/(providers|multi-chat|deep-research|github)/);

  const client = await read('assets/chat-tools.js');
  assert.match(client, /id = 'tools-toggle'/);
  assert.match(client, /id = 'tools-menu'/);
  assert.match(client, /data-tool/);
  assert.match(client, /ค้นหา/);
  assert.match(client, /หลายโมเดล/);
  assert.match(client, /GitHub/);
});

test('chat tools client wires research and multi-model tools but leaves GitHub inert', async () => {
  const client = await read('assets/chat-tools.js');

  assert.match(client, /\/api\/providers/);
  assert.match(client, /\/api\/deep-research\/stream/);
  assert.match(client, /\/api\/multi-chat\/stream/);
  assert.doesNotMatch(client, /\/api\/github\//);
});

test('chat tools browser script is valid JavaScript', () => {
  const path = new URL('../assets/chat-tools.js', import.meta.url);
  const result = spawnSync(process.execPath, ['--check', path.pathname], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('worker entrypoint exposes authenticated routes for provider discovery, research, and multi-model chat', async () => {
  const source = await read('src/firebase-worker.js');

  assert.match(source, /from ['"]\.\/multi-model-chat\.js['"]/);
  assert.match(source, /from ['"]\.\/deep-research\.js['"]/);
  for (const route of ['/api/providers', '/api/multi-chat', '/api/multi-chat/stream', '/api/deep-research', '/api/deep-research/stream']) {
    assert.equal(source.includes(route), true, `missing route ${route}`);
  }
  assert.match(source, /authenticated/);
  assert.match(source, /legacyWorker\.fetch/);
});
