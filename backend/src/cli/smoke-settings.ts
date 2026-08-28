const BASE = 'http://127.0.0.1:3000/api';

async function main(): Promise<void> {
  const login = await fetch(`${BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const setCookies = login.headers.getSetCookie?.() ?? [];
  let cookie = setCookies[0]?.split(';')[0] ?? '';
  if (!cookie) {
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  }
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };

  const thresholds = await (await fetch(`${BASE}/v1/settings/thresholds`, { headers })).json();
  console.log('thresholds', thresholds.code, thresholds.data);

  const updated = await (
    await fetch(`${BASE}/v1/settings/thresholds`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        lowScoreRatio: 0.4,
        passRatio: 0.6,
        excellentRatio: 0.85,
        rankJumpThreshold: 8,
      }),
    })
  ).json();
  console.log('update', updated.code, updated.data);

  const backup = await (
    await fetch(`${BASE}/v1/backup/run`, { method: 'POST', headers })
  ).json();
  console.log('backup', backup.code, backup.data);

  const list = await (await fetch(`${BASE}/v1/backup/list`, { headers })).json();
  console.log(
    'list',
    list.code,
    Array.isArray(list.data) ? list.data.length : list,
  );

  const logs = await (
    await fetch(`${BASE}/v1/settings/audit-logs?page=1&pageSize=5`, { headers })
  ).json();
  console.log('audit', logs.code, logs.data?.total, logs.data?.items?.[0]?.action);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
