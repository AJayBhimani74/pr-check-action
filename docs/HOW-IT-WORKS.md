# How pr-check-action works

Read this before an interview. It explains the project in plain words.

## The idea

Reviewers lose time on the same things: a pull request with no description, one with 3,000 changed lines, a change to code with no test. A bot can say that in the first minute so that humans spend their time on the design and the logic. The skills here: automating team rules, the GitHub API, and writing tests for something that talks to a third party.

## Where things live

| File | Job |
|---|---|
| `action.yml` | Tells GitHub how to run it: Node, entry file `src/index.js`, and the inputs. |
| `src/rules.js` | The checks. Pure functions: data in, result out. No network. |
| `src/config.js` | Defaults, and merging in the user's overrides. |
| `src/github.js` | A tiny REST client (list files, list/create/update comments, paging). |
| `src/index.js` | Glues it together: read the event, call the rules, write the comment, set the exit code. |
| `test/rules.test.js`, `test/run.test.js` | Unit tests for the rules, and tests for the whole run with a fake `fetch`. |

## How a run goes

1. GitHub starts the job on a `pull_request` event and writes the event as JSON to a file. The path is in `GITHUB_EVENT_PATH`. The script reads the PR (title, body, number, draft flag) from it.
2. Draft PRs and non-PR events end the run quietly.
3. It asks the API for the changed files (`/pulls/{n}/files`) with their added and deleted line counts. The API returns 100 per page, so it keeps asking for the next page until a page is shorter than 100.
4. It reads `.github/pr-check.json` if there is one and merges it over the defaults.
5. Each rule returns `{id, status, message}`, where status is `pass`, `warn` or `fail`.
6. It builds the comment text, starting with a hidden marker `<!-- pr-check -->`. It looks through the PR's comments for one that contains the marker: if found it **edits** it, otherwise it creates one. That is how it stays at one comment.
7. It also writes the text to the job summary, and sets the exit code to 1 if the result should fail the job (`fail-on`).

## The rules

- **Size.** Sum of additions and deletions of files that are not ignored. Lock files, snapshots and docs are ignored because a huge `package-lock.json` change says nothing about review effort. Matching is deliberately simple: a name ending in `/` is a folder, anything else matches the end of the file name. No glob library needed.
- **Description.** Template hints (`<!-- ... -->`), headings and checklist lines are removed first, because they exist in every untouched template. What is left must have at least 30 characters. Then each required section (default `How to test`) must exist and not be empty. A test makes sure a template where only the tick boxes were ticked still fails.
- **Tests.** Files in `codePaths` that are not also in `testPaths` count as code. If any code changed and nothing in `testPaths` changed, it warns. It is only a heuristic: a refactor with no new tests is a fair reason to ignore it, which is why it warns and does not fail.

## Things I ran into

- **`body` can be `null`.** For a PR with no description GitHub sends `null`, not an empty string. A default parameter (`body = ''`) doesn't catch `null`, only `undefined`, so the rule crashed. A test found it. The fix is `body ?? ''`.
- **An untouched template shouldn't pass.** My first version only removed the tick boxes from checklist lines, so "Tests added or updated" counted as description text. Removing the whole checklist line fixed it, and there's a test.
- **A fake API has to behave like the real one.** My first fake returned the same page forever, so the paging loop ran 30 times. The fake now honours the `page` parameter.
- **Forks.** The token on a fork's PR is read-only. The comment write is wrapped so the run still finishes and applies the result.

## Why plain Node and no packages

An action with `node_modules` has to commit them or build a bundle. With no dependencies the repository *is* the action, there is nothing to audit, and it starts instantly. Node 20+ already has `fetch` and a test runner (`node --test`).

## Questions you may get

**Why edit the comment instead of posting a new one?** A new comment on every push buries the conversation. The marker lets the bot find its own comment.

**Why warn for missing tests but fail for an empty description?** An empty description is never right. Missing tests are sometimes fine (refactor, config), so a human decides.

**Is a line count a good measure?** It is a rough one. It is cheap and gets the "too big to review" cases. The limits are configurable per repo.

**How do you test code that calls an API?** The client takes a `fetch` function as a parameter, so tests pass in a fake that records the calls and returns canned answers. No network, no tokens.

**What is the security situation?** It uses the job's own `GITHUB_TOKEN` with only `pull-requests: write` and `issues: write`. It never runs code from the PR (it only reads file names and counts), so it is safe on pull requests from forks.

**What would you add?** Check linked issues, flag changes to migrations or CI files, label PRs by size, and ping CODEOWNERS.

## Try it yourself

Open a PR in a repo that uses it with an empty description and a code change but no tests, and read the comment. Fill in the description, push a test, and watch the same comment change. Then read `test/run.test.js` to see how the whole run is tested without GitHub.
