export function client({ token, repo, fetchImpl = fetch, apiUrl = 'https://api.github.com' }) {
  async function request(method, path, body) {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = new Error(`GitHub API ${method} ${path} answered ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.status === 204 ? null : response.json();
  }

  async function all(path) {
    const items = [];

    for (let page = 1; page <= 30; page++) {
      const batch = await request('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      items.push(...batch);

      if (batch.length < 100) {
        break;
      }
    }

    return items;
  }

  return {
    files: (number) => all(`/repos/${repo}/pulls/${number}/files`),
    comments: (number) => all(`/repos/${repo}/issues/${number}/comments`),
    createComment: (number, body) => request('POST', `/repos/${repo}/issues/${number}/comments`, { body }),
    updateComment: (id, body) => request('PATCH', `/repos/${repo}/issues/comments/${id}`, { body }),
  };
}
