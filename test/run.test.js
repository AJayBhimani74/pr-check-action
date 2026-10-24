import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run } from '../src/index.js';

const quiet = { log() {}, warn() {} };

function setup(pr, { files = [], comments = [], config } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'prcheck-'));
  writeFileSync(join(dir, 'event.json'), JSON.stringify({ pull_request: pr }));
  if (config) {
    writeFileSync(join(dir, 'pr-check.json'), JSON.stringify(config));
  }

  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ method: options.method, path: new URL(url).pathname, body: options.body ? JSON.parse(options.body) : null });
    const path = new URL(url).pathname;
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

    const page = Number(new URL(url).searchParams.get('page') || 1);
    const slice = (list) => list.slice((page - 1) * 100, page * 100);

    if (path.endsWith('/files')) return json(slice(files));
    if (path.endsWith('/comments') && options.method === 'GET') return json(slice(comments));
    if (options.method === 'POST' && setup.denyComments) return json({}, 403);

    return json({});
  };

  const env = {
    GITHUB_EVENT_PATH: join(dir, 'event.json'),
    GITHUB_REPOSITORY: 'me/repo',
    GITHUB_WORKSPACE: dir,
    'INPUT_GITHUB-TOKEN': 'token',
    'INPUT_CONFIG-PATH': 'pr-check.json',
    'INPUT_FAIL-ON': 'fail',
  };

  return { env, fetchImpl, calls };
}

const goodBody = '## What and why\nAdds cancelling of bookings.\n\n## How to test\nBook then cancel.';
const file = (filename, additions) => ({ filename, additions, deletions: 0 });

test('events that are not pull requests are skipped', async () => {
  const { env, fetchImpl, calls } = setup(undefined);
  writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify({}));

  const outcome = await run(env, fetchImpl, quiet);

  assert.equal(outcome.skipped, true);
  assert.equal(calls.length, 0);
});

test('draft pull requests are skipped', async () => {
  const { env, fetchImpl, calls } = setup({ number: 1, draft: true, body: '' });

  assert.equal((await run(env, fetchImpl, quiet)).skipped, true);
  assert.equal(calls.length, 0);
});

test('a new comment is created when there is none', async () => {
  const { env, fetchImpl, calls } = setup({ number: 7, body: goodBody }, { files: [file('README.md', 3)] });

  const outcome = await run(env, fetchImpl, quiet);

  assert.equal(outcome.failed, false);
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.path, '/repos/me/repo/issues/7/comments');
  assert.ok(post.body.body.startsWith('<!-- pr-check -->'));
});

test('an existing comment is updated instead of adding another', async () => {
  const { env, fetchImpl, calls } = setup(
    { number: 7, body: goodBody },
    { files: [file('README.md', 3)], comments: [{ id: 11, body: 'hello' }, { id: 12, body: '<!-- pr-check -->\nold' }] }
  );

  await run(env, fetchImpl, quiet);

  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.path, '/repos/me/repo/issues/comments/12');
});

test('a failing rule makes the run fail', async () => {
  const { env, fetchImpl } = setup({ number: 7, body: '' }, { files: [file('README.md', 3)] });

  assert.equal((await run(env, fetchImpl, quiet)).failed, true);
});

test('a read-only token (fork) does not crash the run', async () => {
  setup.denyComments = true;
  const { env, fetchImpl } = setup({ number: 7, body: goodBody }, { files: [file('README.md', 3)] });

  const outcome = await run(env, fetchImpl, quiet);
  setup.denyComments = false;

  assert.equal(outcome.failed, false);
});

test('the config file overrides the defaults', async () => {
  const { env, fetchImpl } = setup({ number: 7, body: goodBody }, { files: [file('src/a.js', 60)], config: { warnLines: 10, failLines: 50 } });

  const outcome = await run(env, fetchImpl, quiet);

  assert.equal(outcome.results[0].status, 'fail');
});

test('more than one page of files is read', async () => {
  const files = Array.from({ length: 100 }, (_, i) => file(`src/f${i}.js`, 1));
  const { env, fetchImpl, calls } = setup({ number: 7, body: goodBody }, { files });

  await run(env, fetchImpl, quiet);

  assert.equal(calls.filter((c) => c.path.endsWith('/files')).length, 2);
});
