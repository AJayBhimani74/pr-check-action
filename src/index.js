import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mergeConfig } from './config.js';
import { client } from './github.js';
import { MARKER, evaluate, renderComment, shouldFail } from './rules.js';

function readConfig(env) {
  const path = `${env.GITHUB_WORKSPACE || '.'}/${env['INPUT_CONFIG-PATH'] || '.github/pr-check.json'}`;

  return mergeConfig(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
}

export async function run(env, fetchImpl = fetch, log = console) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;

  if (!pr) {
    log.log('Not a pull request event, nothing to check.');

    return { skipped: true };
  }

  if (pr.draft) {
    log.log('Draft pull request, skipping.');

    return { skipped: true };
  }

  const github = client({ token: env['INPUT_GITHUB-TOKEN'], repo: env.GITHUB_REPOSITORY, fetchImpl, apiUrl: env.GITHUB_API_URL });
  const config = readConfig(env);
  const files = await github.files(pr.number);
  const results = evaluate({ pr, files, config });
  const comment = renderComment(results);

  try {
    const existing = (await github.comments(pr.number)).find((c) => c.body?.includes(MARKER));

    if (existing) {
      await github.updateComment(existing.id, comment);
    } else {
      await github.createComment(pr.number, comment);
    }
  } catch (error) {
    // pull requests from forks get a read-only token, so the comment cannot be written
    log.warn(`Could not write the comment: ${error.message}`);
  }

  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${comment}\n`);
  }

  const failed = shouldFail(results, env['INPUT_FAIL-ON'] || 'fail');
  log.log(results.map((r) => `${r.status.toUpperCase()} ${r.id}: ${r.message}`).join('\n'));

  return { skipped: false, results, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.env)
    .then((outcome) => {
      if (outcome.failed) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
