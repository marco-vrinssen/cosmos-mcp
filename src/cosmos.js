import pkg from '../package.json' with { type: 'json' };

// Cosmos has no public API, so every query to the GraphQL API behind its web app stays in this file.
const API = 'https://api.www.cosmos.so/graphql';
const SITE = 'https://www.cosmos.so';

// Cosmos sees who is asking, so it can tell this traffic apart and reach the maintainer instead of blocking blindly.
const HEADERS = {
  'content-type': 'application/json',
  'user-agent': `cosmos-mcp/${pkg.version} (+https://github.com/marco-vrinssen/cosmos-mcp)`,
  'x-client-name': 'cosmos-mcp',
};

export const SETUP = [
  'Not signed in to Cosmos, so your own collections are not readable. Public elements and collections work without a sign-in.',
  'To sign in, set COSMOS_USERNAME (your email or username) and COSMOS_PASSWORD in the env of this MCP server, then restart the MCP host.',
].join('\n');

const LOGIN = `mutation Login($input: LoginInput!) { auth { login(input: $input) { accessToken } } }`;

const ME = `query Me { me { id username } }`;

const ELEMENT = `id
  generatedCaption { text }
  source { url }
  ... on ElementWithMediaTile { media { __typename url width height ... on Video { duration } } }`;

// Without filters it searches all of Cosmos. A user id narrows it to that profile, plus a collection id to that collection.
const SEARCH = `query Search($searchTerm: String!, $userId: UserId, $clusterId: ClusterId, $pageSize: Int, $pageCursor: String) {
  searchElements(
    searchTerm: $searchTerm
    filters: { userId: $userId, clusterId: $clusterId }
    searchOrigin: SEARCH_BOX
    meta: { pageSize: $pageSize, pageCursor: $pageCursor }
  ) {
    results { element { ${ELEMENT} } }
    meta { nextPageCursor count }
  }
}`;

// A collection's own elements. Its subcollections hold elements of their own that this list leaves out.
const ITEMS = `query Items($clusterId: ClusterId, $pageSize: Int, $pageCursor: String) {
  clusterConnections(clusterId: $clusterId, meta: { pageSize: $pageSize, pageCursor: $pageCursor }) {
    items { element { ${ELEMENT} } }
    meta { nextPageCursor count }
  }
}`;

const CLUSTER = 'id name slug description isPrivate numberOfElements ownerId owner { username fullName }';

// Cosmos finds a collection by owner and slug, like its link. A subcollection is found through its parent.
const COLLECTION = `query Collection($slug: String!, $username: String!, $subSlug: String, $isSub: Boolean!) {
  cluster(input: { slug: $slug, ownerUsername: $username }) {
    ${CLUSTER}
    subClusters { items { name slug isPrivate numberOfElements } }
    subCluster(slug: $subSlug) @include(if: $isSub) { ${CLUSTER} }
  }
}`;

const PROFILE = `query Profile($username: String!) {
  user(username: $username) { id username fullName publicElementsCluster { id } }
}`;

const LIST = `items { name slug isPrivate numberOfElements subClusters { items { name slug isPrivate numberOfElements } } }
    meta { nextPageCursor }`;

// Listing collections needs a sign-in, even for public ones. Private ones come back because the request carries the session.
const MY_COLLECTIONS = `query MyCollections($userId: UserId!, $pageCursor: String) {
  list: clusters(filters: { ownerId: $userId }, meta: { pageSize: 20, pageCursor: $pageCursor }) { ${LIST} }
}`;

// The query the web app's profile pages use for anyone's public collections. Cosmos answers it only to a signed-in caller.
const USER_COLLECTIONS = `query UserCollections($userId: UserId!, $pageCursor: String) {
  list: userClusters(userId: $userId, meta: { pageSize: 20, pageCursor: $pageCursor }) { ${LIST} }
}`;

const FIND_COLLECTIONS = `query FindCollections($searchTerm: String!) {
  searchClusters(searchTerm: $searchTerm, meta: { pageSize: 20 }) {
    items { name slug numberOfElements followersCount parentCluster { slug } owner { username fullName } }
  }
}`;

// The web app routes /<username>, /<username>/<collection> and /<username>/<collection>/<subcollection>, plus tabs like /search.
const PROFILE_TABS = new Set(['elements', 'all-elements', 'collections', 'search', 'organize']);
const COLLECTION_TABS = new Set(['search', 'canvas', 'organize']);

const KINDS = { StaticImage: 'image', AnimatedImage: 'GIF', Video: 'video' };

// { token, userId, username } once signed in. Cosmos tokens last about five days.
let session = null;
let signingIn = null;

async function gql(query, variables, token) {
  const headers = token ? { ...HEADERS, authorization: `Bearer ${token}` } : HEADERS;
  let response;
  try {
    response = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new Error(`Cosmos did not answer (${error.name === 'TimeoutError' ? 'timeout' : error.message}). Try again.`);
  }

  // Cosmos sends GraphQL errors with a code, some as HTTP 200 and some with a matching status like 401 or 404.
  const body = await response.json().catch(() => ({}));
  const [error] = body.errors ?? [];
  if (error) throw Object.assign(new Error(error.message), { code: error.extensions?.code });
  if (!body.data) throw new Error(`Cosmos answered ${response.status} without data. Try again in a minute.`);
  return body.data;
}

async function signIn() {
  const { COSMOS_USERNAME: username, COSMOS_PASSWORD: password } = process.env;
  if (!username || !password) return null;
  let token;
  try {
    token = (await gql(LOGIN, { input: { identifier: username, password } })).auth.login.accessToken;
  } catch (error) {
    if (!error.code) throw error;
    throw new Error(`Cosmos refused the sign-in as ${username}: ${error.message}`);
  }
  const { me } = await gql(ME, undefined, token);
  return { token, userId: String(me.id), username: me.username };
}

// Parallel calls share one sign-in.
async function signedIn() {
  if (session) return session;
  signingIn ||= signIn().finally(() => { signingIn = null; });
  session = await signingIn;
  return session;
}

// Signed in, every call also sees the user's private collections. A rejected token signs in again once.
async function request(query, variables) {
  const current = await signedIn();
  try {
    return await gql(query, variables, current?.token);
  } catch (error) {
    if (error.code !== 'AUTHENTICATION' || !current) throw error;
    if (session === current) session = null;
    return gql(query, variables, (await signedIn())?.token);
  }
}

function pageUrl(...parts) {
  return [SITE, ...parts].filter(Boolean).join('/');
}

function who(user) {
  return user.fullName ? `${user.fullName} (@${user.username})` : `@${user.username}`;
}

function count(n) {
  return `${n} element${n === 1 ? '' : 's'}`;
}

function more(cursor) {
  return cursor ? `More: call again with cursor "${cursor}".` : null;
}

// Captions come from Cosmos's own image model and mark names with <n> tags.
function elementText({ id, generatedCaption, source, media }) {
  const lines = [`- ${generatedCaption?.text?.replace(/<[^>]+>/g, '').trim() || 'No caption'}`, `  ${pageUrl('e', id)}`];
  if (media?.url) {
    const size = media.width && media.height ? ` ${media.width}x${media.height}` : '';
    const length = media.duration ? `, ${Math.round(media.duration)} s` : '';
    lines.push(`  ${KINDS[media.__typename] ?? 'file'}${size}${length}: ${media.url}`);
  }
  if (source?.url) lines.push(`  Source: ${source.url}`);
  return lines.join('\n');
}

export function parseLink(link) {
  let url = null;
  try {
    url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
  } catch {}
  if (!url || !/^(www\.)?cosmos\.so$/i.test(url.hostname)) throw new Error(`${link} is not a cosmos.so link.`);
  const [username, slug, subSlug] = url.pathname.split('/').filter(Boolean);
  if (!username || username === 'e') {
    throw new Error(`${link} is not a profile or collection. Pass a link like ${SITE}/<username> or ${SITE}/<username>/<collection>.`);
  }
  if (!slug || PROFILE_TABS.has(slug)) return { username };
  return { username, slug, subSlug: COLLECTION_TABS.has(subSlug) ? undefined : subSlug };
}

// A profile stands for the user's public elements, which Cosmos keeps as a collection of its own.
async function resolve(link) {
  const { username, slug, subSlug } = parseLink(link);
  try {
    if (!slug) {
      const { user } = await request(PROFILE, { username });
      return { url: pageUrl(user.username), name: who(user), elementsId: user.publicElementsCluster?.id, scope: { userId: String(user.id) } };
    }
    const { cluster } = await request(COLLECTION, { slug, username, subSlug, isSub: Boolean(subSlug) });
    const found = subSlug ? cluster.subCluster : cluster;
    if (!found) throw Object.assign(new Error('Subcollection not found'), { code: 'NOT_FOUND' });
    return {
      ...found,
      url: pageUrl(found.owner.username, cluster.slug, subSlug && found.slug),
      subClusters: subSlug ? [] : cluster.subClusters.items,
      elementsId: found.id,
      scope: { userId: String(found.ownerId), clusterId: String(found.id) },
    };
  } catch (error) {
    if (error.code !== 'NOT_FOUND' && error.code !== 'AUTHORIZATION') throw error;
    throw new Error(`Cosmos shows nothing at ${link}. Check the link. A private collection opens only for its owner.`);
  }
}

export async function search({ query, within, limit, cursor }) {
  const target = within ? await resolve(within) : null;
  const variables = { searchTerm: query, ...target?.scope, pageSize: limit, pageCursor: cursor };
  const { searchElements: page } = await request(SEARCH, variables);
  const place = target?.url ?? 'all of Cosmos';
  const elements = page.results.slice(0, limit).map((result) => result.element);
  if (!elements.length) return `Nothing in ${place} matches "${query}". Try other words.`;
  return [
    `${page.meta.count ?? elements.length} results for "${query}" in ${place}, most relevant first. Showing ${elements.length}:`,
    ...elements.map(elementText),
    more(page.meta.nextPageCursor),
  ].filter(Boolean).join('\n');
}

export async function readCollection({ link, limit, cursor }) {
  const target = await resolve(link);
  const header = target.slug
    ? [
      `# ${target.name}`,
      target.url,
      `${target.isPrivate ? 'Private' : 'Public'} collection by ${who(target.owner)} with ${count(target.numberOfElements)}.`,
      target.description,
      ...(target.subClusters.length ? ['', 'Subcollections, each with elements of its own:'] : []),
      ...target.subClusters.map((sub) => `- ${sub.name}, ${count(sub.numberOfElements)}${sub.isPrivate ? ', private' : ''}: ${target.url}/${sub.slug}`),
    ]
    : [`# ${target.name}`, target.url, 'Public elements of this profile.'];
  if (!target.elementsId) return [...header, '', 'No public elements yet.'].join('\n');

  const { clusterConnections: page } = await request(ITEMS, { clusterId: String(target.elementsId), pageSize: limit, pageCursor: cursor });
  const elements = page.items.map((item) => item.element);
  return [
    ...header,
    '',
    elements.length ? `Showing ${elements.length} of ${count(page.meta.count)}:` : 'No elements of its own.',
    ...elements.map(elementText),
    more(page.meta.nextPageCursor),
  ].filter((line) => line != null).join('\n');
}

export async function collections({ query, user }) {
  if (query && !user) {
    const { searchClusters } = await request(FIND_COLLECTIONS, { searchTerm: query });
    if (!searchClusters.items.length) return `No collection on Cosmos matches "${query}".`;
    return [
      `Collections on Cosmos matching "${query}", most relevant first:`,
      ...searchClusters.items.map((cluster) => {
        const followers = cluster.followersCount ? `, ${cluster.followersCount} followers` : '';
        const url = pageUrl(cluster.owner.username, cluster.parentCluster?.slug, cluster.slug);
        return `- ${cluster.name} by ${who(cluster.owner)}, ${count(cluster.numberOfElements)}${followers}: ${url}`;
      }),
    ].join('\n');
  }

  const current = await signedIn();
  if (!current) {
    throw new Error(`${SETUP}\nSigned out, pass only a query to find public collections on all of Cosmos, or read a profile link with get_collection.`);
  }
  const { username } = user ? parseLink(user.includes('cosmos.so') ? user : pageUrl(user.replace(/^@/, ''))) : current;
  const owner = user ? await resolve(pageUrl(username)) : { url: pageUrl(username), name: `@${username}`, scope: { userId: current.userId } };
  const own = owner.scope.userId === current.userId;
  const found = [];
  let pageCursor = null;
  do {
    const { list } = await request(own ? MY_COLLECTIONS : USER_COLLECTIONS, { userId: owner.scope.userId, pageCursor });
    found.push(...list.items);
    pageCursor = list.meta.nextPageCursor;
  } while (pageCursor);

  const named = query ? ` named like "${query}"` : '';
  const shown = found.filter((cluster) => !query || cluster.name.toLowerCase().includes(query.toLowerCase()));
  const line = (cluster, url) => `${cluster.name}, ${count(cluster.numberOfElements)}${cluster.isPrivate ? ', private' : ''}: ${url}`;
  if (!shown.length) return `No collections${named} on ${owner.url}.`;
  return [
    `Collections${named} of ${owner.name} (${owner.url})${own ? ', private ones included' : ''}:`,
    ...shown.flatMap((cluster) => [
      `- ${line(cluster, `${owner.url}/${cluster.slug}`)}`,
      ...cluster.subClusters.items.map((sub) => `  - ${line(sub, `${owner.url}/${cluster.slug}/${sub.slug}`)}`),
    ]),
  ].join('\n');
}
