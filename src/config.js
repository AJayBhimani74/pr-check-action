export const defaults = {
  // changed lines (additions + deletions) before a warning, and before a failure
  warnLines: 400,
  failLines: 1000,
  // files that do not count towards size, matched by folder prefix or file ending
  ignore: ['package-lock.json', 'composer.lock', 'yarn.lock', '.lock', '.snap', 'docs/'],
  // changes under these folders should come with a change under a test folder
  codePaths: ['app/', 'src/', 'lib/'],
  testPaths: ['tests/', 'test/', '__tests__/'],
  // the description must have at least this many characters once comments and headings are removed
  minDescription: 30,
  // sections of the PR template that must not be empty
  requiredSections: ['How to test'],
};

export function mergeConfig(overrides = {}) {
  return { ...defaults, ...overrides };
}
