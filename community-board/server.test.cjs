"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp, FIVE_DAYS } = require('./server.js');

async function start(options) {
  const app = await createApp(options);
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { ...app, base, stop: () => new Promise(resolve => { app.server.close(resolve); app.server.closeAllConnections(); }) };
}
const submit = (base, body, headers = {}) => fetch(`${base}/api/posts`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const read = async base => (await fetch(`${base}/api/board`)).json();

test('shared notes, attachments, validation, persistence and reset cadence', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'common-room-'));
  let clock = Date.UTC(2026, 9, 16, 14);
  let app = await start({ dataDir: directory, now: () => clock });
  try {
    const initial = await read(app.base);
    assert.equal(initial.nextResetAt, clock + FIVE_DAYS);
    const title = '<img src=x onerror=alert(1)>';
    let response = await submit(app.base, { title, body: 'Hello\nSecond line', author: '' });
    assert.equal(response.status, 201);
    let board = await read(app.base); // Independent browser-style request.
    assert.equal(board.posts.length, 1);
    assert.equal(board.posts[0].title, title);
    assert.equal(board.posts[0].author, 'Anonymous');
    assert.equal(board.nextResetAt, initial.nextResetAt);
    assert.equal((await submit(app.base, { title: 'Empty', body: '   ' })).status, 400);
    assert.equal((await submit(app.base, { title: 'Long', body: 'x'.repeat(5001) })).status, 400);
    assert.equal((await submit(app.base, { title: 'Bad', file: { name: 'bad.html', data: Buffer.from('<h1>x</h1>').toString('base64') } })).status, 400);
    assert.equal((await submit(app.base, { title: 'Wrong base64', file: { name: 'file.txt', data: '!!!=' } })).status, 400);
    assert.equal((await submit(app.base, { title: 'Cross-site', body: 'no' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    const contents = Buffer.from('Revision notes: elasticity.');
    response = await submit(app.base, { title: 'My file', file: { name: '笔记.txt', data: contents.toString('base64') } });
    assert.equal(response.status, 201);
    board = await response.json();
    const fileId = board.posts[0].id;
    response = await fetch(`${app.base}/api/files/${fileId}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), contents);
    for (const route of ['/', '/style.css', '/script.js']) assert.equal((await fetch(app.base + route)).status, 200);
    assert.equal((await fetch(app.base + '/server.js')).status, 404);
    assert.equal((await fetch(app.base + '/data/board.json')).status, 404);
    await app.stop();
    clock += 3600000;
    app = await start({ dataDir: directory, now: () => clock });
    board = await read(app.base);
    assert.equal(board.posts.length, 2);
    assert.equal(board.nextResetAt, initial.nextResetAt);
    clock = initial.nextResetAt;
    assert.equal((await fetch(`${app.base}/api/files/${fileId}`)).status, 404);
    board = await read(app.base);
    assert.equal(board.posts.length, 0);
    assert.equal(board.nextResetAt, initial.nextResetAt + FIVE_DAYS);
    assert.deepEqual(await fs.readdir(path.join(directory, 'uploads')), []);
    await app.stop();
    clock = initial.nextResetAt + FIVE_DAYS * 4 + 100;
    app = await start({ dataDir: directory, now: () => clock });
    board = await read(app.base);
    assert.equal(board.nextResetAt, initial.nextResetAt + FIVE_DAYS * 5);
  } finally { await app.stop(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('background timer deletes notes and file bytes without any browser requests', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'common-room-timer-'));
  const app = await start({ dataDir: directory, periodMs: 700 });
  try {
    assert.equal((await submit(app.base, { title: 'Temporary', file: { name: 'test.txt', data: 'aGk=' } })).status, 201);
    assert.equal((await fs.readdir(path.join(directory, 'uploads'))).length, 1);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const saved = JSON.parse(await fs.readFile(path.join(directory, 'board.json'), 'utf8'));
    assert.equal(saved.posts.length, 0);
    assert.deepEqual(await fs.readdir(path.join(directory, 'uploads')), []);
  } finally { await app.stop(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('concurrent requests preserve every post and oversize uploads are rejected', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'common-room-concurrency-'));
  const app = await start({ dataDir: directory });
  try {
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => submit(app.base, { title: `Note ${index}`, body: 'Shared text' })));
    assert.ok(responses.every(response => response.status === 201));
    assert.equal((await read(app.base)).posts.length, 10);
    const large = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
    assert.equal((await submit(app.base, { title: 'Too large', file: { name: 'large.txt', data: large } })).status, 413);
  } finally { await app.stop(); await fs.rm(directory, { recursive: true, force: true }); }
});
