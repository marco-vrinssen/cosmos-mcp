import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import pkg from '../package.json' with { type: 'json' };
import { collections, readCollection, search } from './cosmos.js';

const CACHE_MS = 5 * 60 * 1000;
const CACHE_SIZE = 200;
const cache = new Map();

const hints = { readOnlyHint: true, openWorldHint: true };

// Cosmos has no public API, so repeated questions are answered from memory to keep traffic low.
async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_MS) return hit.value;
  const value = await load();
  cache.delete(key);
  cache.set(key, { time: Date.now(), value });
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return value;
}

function text(value) {
  return { content: [{ type: 'text', text: value }] };
}

// Every host puts these into the model's context on connect, so they carry the usage rules and stay short.
const INSTRUCTIONS = [
  'Cosmos (cosmos.so) is a library of images, GIFs and videos that people save into collections for visual inspiration.',
  'Search works by meaning, so describe what to find in plain words, like "brutalist concrete staircase" or "warm minimal packaging".',
  'A profile link looks like https://www.cosmos.so/<username> and a collection link like https://www.cosmos.so/<username>/<collection>. '
    + 'Pass them to search as within, or to get_collection.',
  'Captions are written by Cosmos and can be wrong or missing. Say so when an answer rests on a caption instead of the file.',
  'An answer that ends with a cursor has more. Call the same tool again with that cursor.',
  'Link the cosmos.so pages you used.',
].join('\n');

const link = z.string().trim().min(1).max(300);
const cursor = z.string().max(1000).optional().describe('Cursor from the end of the previous answer, for the next page');

// Other hosts, such as a Cloudflare Worker, can connect the same tools without stdio.
export function createServer() {
  const server = new McpServer({ name: 'cosmos-mcp', version: pkg.version }, { instructions: INSTRUCTIONS });

  server.registerTool('search', {
    title: 'Search Cosmos',
    description: 'Find images, GIFs and videos on Cosmos by meaning, most relevant first. Searches all of Cosmos, or only one profile '
      + 'or collection when within names its cosmos.so link. Returns each element\'s caption, page link, media file with size and source.',
    inputSchema: z.object({
      query: z.string().trim().min(1).max(200).describe('What to find, in plain words'),
      within: link.optional().describe('Profile or collection link to search inside, like https://www.cosmos.so/<username>/<collection>'),
      limit: z.number().int().min(1).max(100).default(20).describe('How many elements to return'),
      cursor,
    }),
    annotations: hints,
  }, async (input) => text(await cached(`search:${JSON.stringify(input)}`, () => search(input))));

  server.registerTool('collections', {
    title: 'Cosmos collections',
    description: 'With only a query: public collections on all of Cosmos that match it, with owners and follower counts. '
      + 'With a user: that user\'s public collections with their subcollections, optionally only those named like the query. '
      + 'With neither: the signed-in user\'s own collections, private ones included. Listing by user needs a sign-in. Returns collection links.',
    inputSchema: z.object({
      query: z.string().trim().min(1).max(100).optional().describe('Topic or name to find collections by'),
      user: link.optional().describe('Username or profile link whose collections to list, like https://www.cosmos.so/<username>'),
    }),
    annotations: hints,
  }, async (input) => text(await cached(`collections:${JSON.stringify(input)}`, () => collections(input))));

  server.registerTool('get_collection', {
    title: 'Read a Cosmos collection',
    description: 'Read a collection, subcollection or profile by its cosmos.so link: name, owner, description, subcollections and a page of '
      + 'its elements with captions, page links, media files and sources. A profile link reads that user\'s public elements.',
    inputSchema: z.object({
      url: link.describe('Collection or profile link, like https://www.cosmos.so/<username>/<collection>'),
      limit: z.number().int().min(1).max(100).default(50).describe('How many elements to return'),
      cursor,
    }),
    annotations: hints,
  }, async ({ url, limit, cursor }) => text(await cached(`collection:${url}:${limit}:${cursor}`, () => readCollection({ link: url, limit, cursor }))));

  return server;
}
