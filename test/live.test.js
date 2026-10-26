import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collections, readCollection, search } from '../src/cosmos.js';

// The live checks read Cosmos itself, so they fail when an API shape the client relies on changes.

const ELEMENT = /\n- .+\n {2}https:\/\/www\.cosmos\.so\/e\/\d+\n {2}(image|GIF|video) \d+x\d+.*: https:\/\/cdn\.cosmos\.so\//;
const nextCursor = (text) => text.match(/cursor "(.+)"\.$/)?.[1];
const elementIds = (text) => [...text.matchAll(/cosmos\.so\/e\/(\d+)/g)].map((match) => match[1]);

test('search finds elements on all of Cosmos, and its cursor gives the next ones', async () => {
  const first = await search({ query: 'brutalist concrete staircase', limit: 5 });
  assert.match(first, /^\d+ results for "brutalist concrete staircase" in all of Cosmos, most relevant first\. Showing 5:/);
  assert.match(first, ELEMENT);
  const second = await search({ query: 'brutalist concrete staircase', limit: 5, cursor: nextCursor(first) });
  assert.equal(elementIds(second).filter((id) => elementIds(first).includes(id)).length, 0);
});

test('a profile link reads its public elements page by page', async () => {
  const first = await readCollection({ link: 'https://www.cosmos.so/cosmos', limit: 3 });
  assert.match(first, /^# Cosmos \(@cosmos\)\nhttps:\/\/www\.cosmos\.so\/cosmos\nPublic elements of this profile\.\n\nShowing 3 of \d+ elements:/);
  assert.match(first, ELEMENT);
  const second = await readCollection({ link: 'https://www.cosmos.so/cosmos', limit: 3, cursor: nextCursor(first) });
  assert.equal(elementIds(second).filter((id) => elementIds(first).includes(id)).length, 0);
});

test('found collections open and search by their links', async () => {
  const found = await collections({ query: 'references' });
  assert.match(found, /^Collections on Cosmos matching "references", most relevant first:\n- .+ by .+, \d+ elements?/);
  const url = found.match(/https:\/\/www\.cosmos\.so\/[\w.-]+\/[\w-]+/)[0];
  assert.match(await readCollection({ link: url, limit: 2 }), /^# .+\nhttps:\/\/www\.cosmos\.so\/.+\nPublic collection by .+ with \d+ elements?\./);
  assert.match(await search({ query: 'texture', within: url, limit: 2 }), new RegExp(`^\\d+ results for "texture" in ${url}, `));
});

test('signed in, collections lists your own', { skip: !process.env.COSMOS_PASSWORD && 'COSMOS_USERNAME and COSMOS_PASSWORD not set' }, async () => {
  assert.match(await collections({}), /^Collections of @[\w.-]+ \(https:\/\/www\.cosmos\.so\/[\w.-]+\), private ones included:/);
});
