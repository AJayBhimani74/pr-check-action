# pr-check-action

A small GitHub Action that looks at every pull request and leaves **one comment** that says whether it is easy to review. It checks three things that make reviews slow when they go wrong:

| Check | What it looks at | Result |
|---|---|---|
| **size** | Changed lines (additions + deletions), ignoring lock files, snapshots and docs. | warns above 400, fails above 1000 |
| **description** | The PR text after removing template hints, headings and checklist lines. Must have some real content, and the `How to test` section must not be empty. | fails if (almost) empty, warns if a required section is missing |
| **tests** | If files under `src/`, `app/` or `lib/` changed, did anything under `tests/`, `test/` or `__tests__/` change too? | warns if not |

The comment is updated on every push instead of adding a new one each time, drafts are skipped, and no packages are installed: the action is plain Node.

It is the kind of rule set I would put in place when leading a team (see my [team-playbook](https://github.com/AJayBhimani74/team-playbook) for the human side). It does not replace review, it just removes the first round of "please add a description and split this up".

## Use it

```yaml
name: PR check
on:
  pull_request:
    types: [opened, edited, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AJayBhimani74/pr-check-action@main
```

Inputs:

| Input | Default | |
|---|---|---|
| `fail-on` | `fail` | `fail` fails the job only for failed checks, `warn` fails for warnings too, `none` never fails (comment only). |
| `config-path` | `.github/pr-check.json` | Optional JSON file that overrides the defaults. |
| `github-token` | `github.token` | Used to read the PR and write the comment. |

Settings you can override in `.github/pr-check.json` (anything you leave out keeps its default):

```json
{
  "warnLines": 300,
  "failLines": 800,
  "ignore": ["package-lock.json", ".lock", "docs/"],
  "codePaths": ["app/"],
  "testPaths": ["tests/"],
  "minDescription": 40,
  "requiredSections": ["How to test", "Risks"]
}
```

To make the check block merging, mark the job as a required status check in the branch protection settings.

## Pull requests from forks

GitHub gives workflows on fork PRs a read-only token, so the comment can't be written. The action prints a warning and still applies the pass/fail result.

## Tests

```bash
node --test
```

23 tests (Node 22 or newer, no dependencies): the rules, the description parsing, and the whole run with a fake GitHub API (creating and updating the comment, drafts, forks, paging, config file).

For how it works and what to say about it, read [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).
