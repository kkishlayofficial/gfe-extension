import { http, HttpResponse } from 'msw';

export const githubBaseHandlers = [
  http.get('https://api.github.com/repos/:owner/:repo', () =>
    HttpResponse.json({ owner: { login: 'alice' }, name: 'greatfrontend-solutions' }, { status: 200 }),
  ),
  http.post('https://api.github.com/user/repos', () =>
    HttpResponse.json({ owner: { login: 'alice' }, name: 'greatfrontend-solutions' }, { status: 201 }),
  ),
];