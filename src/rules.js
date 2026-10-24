const PASS = 'pass';
const WARN = 'warn';
const FAIL = 'fail';

export { PASS, WARN, FAIL };

export function matches(file, pattern) {
  if (pattern.endsWith('/')) {
    return file.startsWith(pattern) || file.includes(`/${pattern}`);
  }

  return file === pattern || file.endsWith(pattern);
}

export function countsTowardsSize(file, config) {
  return !config.ignore.some((pattern) => matches(file, pattern));
}

export function sizeRule(files, config) {
  const lines = files
    .filter((f) => countsTowardsSize(f.filename, config))
    .reduce((sum, f) => sum + f.additions + f.deletions, 0);

  if (lines > config.failLines) {
    return { id: 'size', status: FAIL, message: `${lines} changed lines is too big to review well (limit ${config.failLines}). Please split it.` };
  }

  if (lines > config.warnLines) {
    return { id: 'size', status: WARN, message: `${lines} changed lines. Anything above ${config.warnLines} is hard to review, consider splitting it.` };
  }

  return { id: 'size', status: PASS, message: `${lines} changed lines.` };
}

// Removes HTML comments (the hints in a PR template) and markdown headings, and tick boxes.
export function plainText(markdown = '') {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s.*$/gm, '')
    .replace(/^\s*[-*]\s*\[[ xX]\]/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function section(markdown = '', title) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^#{1,6}\\s*${title}\\s*$`, 'i').test(line.trim()));

  if (start === -1) {
    return null;
  }

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}\s/.test(line));

  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

export function descriptionRule(body, config) {
  const text = plainText(body);

  if (text.length < config.minDescription) {
    return { id: 'description', status: FAIL, message: `The description is too short. Say what changes and why (at least ${config.minDescription} characters).` };
  }

  const missing = config.requiredSections.filter((title) => {
    const content = section(body, title);

    return content === null || plainText(content).length === 0;
  });

  if (missing.length > 0) {
    return { id: 'description', status: WARN, message: `Please fill in: ${missing.join(', ')}.` };
  }

  return { id: 'description', status: PASS, message: 'The description is filled in.' };
}

export function testsRule(files, config) {
  const names = files.map((f) => f.filename);
  const changedCode = names.filter((n) => config.codePaths.some((p) => matches(n, p)) && !config.testPaths.some((p) => matches(n, p)));
  const changedTests = names.filter((n) => config.testPaths.some((p) => matches(n, p)));

  if (changedCode.length === 0) {
    return { id: 'tests', status: PASS, message: 'No application code changed.' };
  }

  if (changedTests.length === 0) {
    return { id: 'tests', status: WARN, message: `${changedCode.length} code file(s) changed but no tests were added or changed.` };
  }

  return { id: 'tests', status: PASS, message: `Code and tests changed together (${changedTests.length} test file(s)).` };
}

export function evaluate({ pr, files, config }) {
  return [sizeRule(files, config), descriptionRule(pr.body, config), testsRule(files, config)];
}

export function shouldFail(results, failOn) {
  if (failOn === 'none') {
    return false;
  }

  return results.some((r) => r.status === FAIL || (failOn === 'warn' && r.status === WARN));
}

export const MARKER = '<!-- pr-check -->';

export function renderComment(results) {
  const icon = { pass: '✅', warn: '⚠️', fail: '❌' };
  const lines = results.map((r) => `${icon[r.status]} **${r.id}**: ${r.message}`);
  const worst = results.some((r) => r.status === FAIL) ? 'Needs changes before review.' : results.some((r) => r.status === WARN) ? 'Looks reviewable, with a few things to look at.' : 'All checks pass.';

  return `${MARKER}\n### PR check\n\n${lines.join('\n')}\n\n${worst}`;
}
