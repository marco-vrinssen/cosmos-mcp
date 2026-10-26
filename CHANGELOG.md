# Changelog

## 1.0.1 (2026-10-26)

- The login comes only from `COSMOS_USERNAME` and `COSMOS_PASSWORD` in the environment. The macOS keychain item `cosmos.so` is no longer read.

## 1.0.0 (2026-10-26)

- First release, built on the Cosmos client of the Cosmos Unofficial Figma plugin.
- `search` finds images, GIFs and videos by meaning on all of Cosmos, or inside one profile or collection.
- `collections` lists your own collections with their subcollections, private ones included, or finds public collections by a query.
- `get_collection` reads a collection, subcollection or profile by its cosmos.so link, page by page.
- Signs in with `COSMOS_USERNAME` and `COSMOS_PASSWORD`, or on macOS with the keychain item `cosmos.so`. Public content works without a login.
- `src/worker.js` serves the same tools on Cloudflare Workers.
