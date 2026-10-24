import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults } from '../src/config.js';
import { FAIL, PASS, WARN, descriptionRule, evaluate, matches, plainText, renderComment, section, shouldFail, sizeRule, testsRule } from '../src/rules.js';

const file = (filename, additions = 1, deletions = 0) => ({ filename, additions, deletions });

test('ignored files do not count towards size', () => {
  const result = sizeRule([file('src/a.js', 100), file('package-lock.json', 5000), file('docs/guide.md', 900), file('x.snap', 900)], defaults);

  assert.equal(result.status, PASS);
  assert.match(result.message, /^100 changed lines/);
});

test('size warns above the warn limit and fails above the fail limit', () => {
  assert.equal(sizeRule([file('a.js', 400)], defaults).status, PASS);
  assert.equal(sizeRule([file('a.js', 401)], defaults).status, WARN);
  assert.equal(sizeRule([file('a.js', 1000)], defaults).status, WARN);
  assert.equal(sizeRule([file('a.js', 1001)], defaults).status, FAIL);
});

test('additions and deletions both count', () => {
  assert.equal(sizeRule([file('a.js', 300, 150)], defaults).status, WARN);
});

test('matches handles folders, endings and exact names', () => {
  assert.ok(matches('docs/a.md', 'docs/'));
  assert.ok(matches('packages/x/docs/a.md', 'docs/'));
  assert.ok(!matches('mydocs/a.md', 'docs/'));
  assert.ok(matches('yarn.lock', '.lock'));
  assert.ok(matches('package-lock.json', 'package-lock.json'));
});

test('plainText drops comments, headings and checklist lines', () => {
  const body = '## What\n<!-- say what -->\n\n- [ ] Tests added\n- [x] Docs\nReal text here';

  assert.equal(plainText(body), 'Real text here');
});

test('section returns the text under a heading until the next heading', () => {
  const body = '## What\nA\n\n## How to test\nrun it\nthen look\n\n## Risks\nnone';

  assert.equal(section(body, 'How to test').trim(), 'run it\nthen look');
  assert.equal(section(body, 'Missing'), null);
  assert.equal(section('### how to test\nok', 'How to test').trim(), 'ok');
});

test('a description that is only the empty template fails', () => {
  const template = '## What and why\n\n<!-- What does this change? -->\n\n## How to test\n\n<!-- Steps -->\n';

  assert.equal(descriptionRule(template, defaults).status, FAIL);
  assert.equal(descriptionRule(null, defaults).status, FAIL);
  assert.equal(descriptionRule('', defaults).status, FAIL);
});

test('a template with only its checklist filled in still fails', () => {
  const body = '## What and why\n\n## Checklist\n- [x] Tests added or updated, and they fail without the change\n- [x] Authorisation checked (who is allowed to do this?)\n';

  assert.equal(descriptionRule(body, defaults).status, FAIL);
});

test('a long description without the required section only warns', () => {
  const body = '## What and why\nThis adds a way to cancel bookings and explains the reason in detail.';

  const result = descriptionRule(body, defaults);

  assert.equal(result.status, WARN);
  assert.match(result.message, /How to test/);
});

test('a filled description passes', () => {
  const body = '## What and why\nThis adds a way to cancel bookings online.\n\n## How to test\nBook, then cancel from My bookings.';

  assert.equal(descriptionRule(body, defaults).status, PASS);
});

test('required sections can be turned off', () => {
  const body = 'This adds a way to cancel bookings online and nothing else changes.';

  assert.equal(descriptionRule(body, { ...defaults, requiredSections: [] }).status, PASS);
});

test('code changes without tests warn, with tests pass, without code pass', () => {
  assert.equal(testsRule([file('app/Models/Booking.php')], defaults).status, WARN);
  assert.equal(testsRule([file('app/Models/Booking.php'), file('tests/Feature/BookingTest.php')], defaults).status, PASS);
  assert.equal(testsRule([file('README.md'), file('docs/a.md')], defaults).status, PASS);
});

test('test files themselves are not counted as code', () => {
  assert.equal(testsRule([file('src/tests/a.js')], { ...defaults, codePaths: ['src/'], testPaths: ['tests/'] }).status, PASS);
});

test('shouldFail follows the fail-on setting', () => {
  const warnOnly = [{ status: WARN }, { status: PASS }];
  const failed = [{ status: FAIL }];

  assert.equal(shouldFail(warnOnly, 'fail'), false);
  assert.equal(shouldFail(warnOnly, 'warn'), true);
  assert.equal(shouldFail(failed, 'fail'), true);
  assert.equal(shouldFail(failed, 'none'), false);
});

test('the comment starts with the marker and lists every rule', () => {
  const pr = { body: '## How to test\nclick things and see that it works as expected' };
  const results = evaluate({ pr, files: [file('app/a.php', 500)], config: defaults });
  const comment = renderComment(results);

  assert.ok(comment.startsWith('<!-- pr-check -->'));
  for (const id of ['size', 'description', 'tests']) {
    assert.ok(comment.includes(`**${id}**`));
  }
});
