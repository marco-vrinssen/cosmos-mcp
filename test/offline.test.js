import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

import { SETUP } from '../src/cosmos.js';

// The offline checks replace fetch with Cosmos-shaped answers.

// Each test loads its own copy of the client, so a session never leaks from one test into the next.
let copies = 0;
function freshClient() {
  copies += 1;
  return import(`../src/cosmos.js?copy=${copies}`);
}

function signInAs(username, password) {
  process.env.COSMOS_USERNAME = username;
  process.env.COSMOS_PASSWORD = password;
}

async function withFetch(answer, run) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.www.cosmos.so/graphql');
    const { query, variables } = JSON.parse(init.body);
    const call = { op: query.match(/^(?:query|mutation) (\w+)/)[1], variables, headers: init.headers, token: init.headers.authorization?.slice(7) };
    calls.push(call);
    const [status, body] = answer(call);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// Answers like Cosmos: a new token per sign-in, the user for me, and the given answers for everything else.
function cosmos(answers) {
  let tokens = 0;
  return (call) => {
    if (call.op === 'Login') return [200, { data: { auth: { login: { accessToken: `t${(tokens += 1)}` } } } }];
    if (call.op === 'Me') return [200, { data: { me: { id: 7, username: 'marco' } } }];
    return answers[call.op](call);
  };
}

const authError = [401, { errors: [{ message: 'You are unauthenticated. Sign in first.', extensions: { code: 'AUTHENTICATION' } }], data: null }];

test('links name a profile, a collection or a subcollection', async () => {
  const { parseLink } = await freshClient();
  assert.deepEqual(parseLink('https://www.cosmos.so/cosmos'), { username: 'cosmos' });
  assert.deepEqual(parseLink('cosmos.so/ant/collections'), { username: 'ant' });
  assert.deepEqual(parseLink('https://cosmos.so/ant/references?x=1'), { username: 'ant', slug: 'references', subSlug: undefined });
  assert.deepEqual(parseLink('https://www.cosmos.so/ant/references/search/angel'), { username: 'ant', slug: 'references', subSlug: undefined });
  assert.deepEqual(parseLink('https://www.cosmos.so/ant/references/angels-icon/canvas'), { username: 'ant', slug: 'references', subSlug: 'angels-icon' });
  assert.throws(() => parseLink('https://www.cosmos.so/e/123'), /is not a profile or collection/);
  assert.throws(() => parseLink('https://evilcosmos.so/ant'), /is not a cosmos.so link/);
  assert.throws(() => parseLink('not a link'), /is not a cosmos.so link/);
});

test('elements show their caption, page link, media file and source', async () => {
  const { search } = await freshClient();
  signInAs('', '');
  const results = [
    { id: 1, generatedCaption: { text: 'A <n>chair</n> by <n>Eames</n>.' }, source: { url: 'https://example.com/chair' },
      media: { __typename: 'StaticImage', url: 'https://cdn.cosmos.so/a', width: 1600, height: 1200 } },
    { id: 2, generatedCaption: null, source: null, media: { __typename: 'AnimatedImage', url: 'https://cdn.cosmos.so/g', width: 498, height: 266 } },
    { id: 3, generatedCaption: { text: 'Loop' }, source: null,
      media: { __typename: 'Video', url: 'https://cdn.cosmos.so/v.mp4', width: 1920, height: 1080, duration: 7.4 } },
    { id: 4, generatedCaption: { text: '' }, source: null },
  ].map((element) => ({ element }));
  const answer = cosmos({ Search: () => [200, { data: { searchElements: { results, meta: { nextPageCursor: null, count: 4 } } } }] });

  await withFetch(answer, async (calls) => {
    assert.equal(await search({ query: 'chair', limit: 4 }), [
      '4 results for "chair" in all of Cosmos, most relevant first. Showing 4:',
      '- A chair by Eames.',
      '  https://www.cosmos.so/e/1',
      '  image 1600x1200: https://cdn.cosmos.so/a',
      '  Source: https://example.com/chair',
      '- No caption',
      '  https://www.cosmos.so/e/2',
      '  GIF 498x266: https://cdn.cosmos.so/g',
      '- Loop',
      '  https://www.cosmos.so/e/3',
      '  video 1920x1080, 7 s: https://cdn.cosmos.so/v.mp4',
      '- No caption',
      '  https://www.cosmos.so/e/4',
    ].join('\n'));
    assert.deepEqual(calls[0].variables, { searchTerm: 'chair', pageSize: 4 });
    assert.equal(calls[0].token, undefined);
    assert.equal(calls[0].headers['x-client-name'], 'cosmos-mcp');
    assert.match(calls[0].headers['user-agent'], /^cosmos-mcp\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/marco-vrinssen\/cosmos-mcp\)$/);

    // A collection search can answer with more than asked for, so the list is cut to the limit.
    assert.match(await search({ query: 'chair', limit: 2 }), /Showing 2:\n[\s\S]*e\/2\n.*$/);
  });
});

test('a search inside a collection passes its owner and id, and a cursor marks the next page', async () => {
  const { search } = await freshClient();
  signInAs('', '');
  const answer = cosmos({
    Collection: () => [200, { data: { cluster: {
      id: 42, name: 'Chairs', slug: 'chairs', description: null, isPrivate: false, numberOfElements: 3, ownerId: 9,
      owner: { username: 'ant', fullName: 'Ant' }, subClusters: { items: [] },
    } } }],
    Search: () => [200, { data: { searchElements: { results: [{ element: { id: 5 } }], meta: { nextPageCursor: 'next', count: 3 } } } }],
  });
  await withFetch(answer, async (calls) => {
    const text = await search({ query: 'oak', within: 'https://www.cosmos.so/ant/chairs', limit: 1 });
    assert.deepEqual(calls[0].variables, { slug: 'chairs', username: 'ant', isSub: false });
    assert.deepEqual(calls[1].variables, { searchTerm: 'oak', userId: '9', clusterId: '42', pageSize: 1 });
    assert.match(text, /^3 results for "oak" in https:\/\/www\.cosmos\.so\/ant\/chairs, /);
    assert.match(text, /\nMore: call again with cursor "next"\.$/);
  });
});

test('signed in, requests carry the token and a rejected token signs in again once', async () => {
  const { collections } = await freshClient();
  signInAs('marco@example.com', 'secret');
  let rejected = false;
  const answer = cosmos({
    MyCollections: (call) => {
      if (call.token === 't1' && !rejected) {
        rejected = true;
        return authError;
      }
      return [200, { data: { list: {
        items: [{ name: 'Chairs', slug: 'chairs', isPrivate: false, numberOfElements: 12,
          subClusters: { items: [{ name: 'Eames', slug: 'eames', isPrivate: true, numberOfElements: 1 }] } }],
        meta: { nextPageCursor: null },
      } } }];
    },
  });

  await withFetch(answer, async (calls) => {
    assert.equal(await collections({}), [
      'Collections of @marco (https://www.cosmos.so/marco), private ones included:',
      '- Chairs, 12 elements: https://www.cosmos.so/marco/chairs',
      '  - Eames, 1 element, private: https://www.cosmos.so/marco/chairs/eames',
    ].join('\n'));
    assert.deepEqual(calls.map((call) => [call.op, call.token]), [
      ['Login', undefined], ['Me', 't1'], ['MyCollections', 't1'], ['Login', undefined], ['Me', 't2'], ['MyCollections', 't2'],
    ]);
    assert.deepEqual(calls[0].variables, { input: { identifier: 'marco@example.com', password: 'secret' } });
    assert.deepEqual(calls[5].variables, { userId: '7', pageCursor: null });
  });
});

test('parallel calls share one sign-in', async () => {
  const { search } = await freshClient();
  signInAs('marco@example.com', 'secret');
  const answer = cosmos({ Search: () => [200, { data: { searchElements: { results: [], meta: { nextPageCursor: null, count: 0 } } } }] });
  await withFetch(answer, async (calls) => {
    await Promise.all([search({ query: 'a', limit: 1 }), search({ query: 'b', limit: 1 })]);
    assert.deepEqual(calls.map((call) => call.op).sort(), ['Login', 'Me', 'Search', 'Search']);
    assert.ok(calls.filter((call) => call.op === 'Search').every((call) => call.token === 't1'));
  });
});

test('someone else\'s collections list through the profile query, optionally filtered by name', async () => {
  const { collections } = await freshClient();
  signInAs('marco@example.com', 'secret');
  const answer = cosmos({
    Profile: () => [200, { data: { user: { id: 9, username: 'ant', fullName: 'Ant', publicElementsCluster: { id: 1 } } } }],
    UserCollections: (call) => [200, { data: { list: {
      items: call.variables.pageCursor ? [{ name: 'Lamps', slug: 'lamps', isPrivate: false, numberOfElements: 1, subClusters: { items: [] } }] : [
        { name: 'References', slug: 'references', isPrivate: false, numberOfElements: 680,
          subClusters: { items: [{ name: 'Angels icon', slug: 'angels-icon', isPrivate: false, numberOfElements: 29 }] } },
        { name: 'Chairs', slug: 'chairs', isPrivate: false, numberOfElements: 3, subClusters: { items: [] } },
      ],
      meta: { nextPageCursor: call.variables.pageCursor ? null : 'p2' },
    } } }],
  });

  await withFetch(answer, async (calls) => {
    assert.equal(await collections({ user: '@ant', query: 'refer' }), [
      'Collections named like "refer" of Ant (@ant) (https://www.cosmos.so/ant):',
      '- References, 680 elements: https://www.cosmos.so/ant/references',
      '  - Angels icon, 29 elements: https://www.cosmos.so/ant/references/angels-icon',
    ].join('\n'));
    assert.deepEqual(calls.map((call) => call.op), ['Login', 'Me', 'Profile', 'UserCollections', 'UserCollections']);
    assert.deepEqual(calls[3].variables, { userId: '9', pageCursor: null });
    assert.deepEqual(calls[2].variables, { username: 'ant' });
  });
});

test('a wrong password reports the refusal, and missing credentials explain the setup', async () => {
  signInAs('marco@example.com', 'wrong');
  const refused = await freshClient();
  const answer = () => [400, { errors: [{ message: 'Invalid credentials.', extensions: { code: 'BAD_USER_INPUT' } }], data: null }];
  await withFetch(answer, () => assert.rejects(refused.collections({}), /^Error: Cosmos refused the sign-in as marco@example.com: Invalid credentials\.$/));

  signInAs('', '');
  const signedOut = await freshClient();
  await withFetch(() => assert.fail('no request without credentials'), async () => {
    await assert.rejects(signedOut.collections({}), (error) => error.message.startsWith(SETUP));
    await assert.rejects(signedOut.collections({ user: 'ant' }), (error) => error.message.startsWith(SETUP));
  });
});

test('a link to nothing says so instead of passing on Cosmos\'s error', async () => {
  const { readCollection } = await freshClient();
  signInAs('', '');
  const answer = cosmos({ Collection: () => [404, { errors: [{ message: 'Collection not found', extensions: { code: 'NOT_FOUND' } }], data: null }] });
  await withFetch(answer, () => assert.rejects(
    readCollection({ link: 'https://www.cosmos.so/ant/gone', limit: 5 }),
    /^Error: Cosmos shows nothing at https:\/\/www\.cosmos\.so\/ant\/gone\. Check the link\./,
  ));
});

test('the stdio server lists three read-only tools with usage instructions and explains a missing sign-in', async () => {
  const env = { ...process.env };
  delete env.COSMOS_USERNAME;
  delete env.COSMOS_PASSWORD;
  const child = spawn(process.execPath, ['src/index.js'], { env, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      replies.get(message.id)?.(message);
    }
  });
  const call = (id, method, params) => new Promise((done) => {
    replies.set(id, done);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  try {
    const { result: init } = await call(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.match(init.instructions, /^Cosmos \(cosmos\.so\) is a library/);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const { result: list } = await call(2, 'tools/list', {});
    assert.deepEqual(list.tools.map((tool) => tool.name).sort(), ['collections', 'get_collection', 'search']);
    for (const tool of list.tools) assert.deepEqual(tool.annotations, { readOnlyHint: true, openWorldHint: true });
    const { result } = await call(3, 'tools/call', { name: 'collections', arguments: {} });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.startsWith(SETUP));
  } finally {
    child.kill();
  }
});
