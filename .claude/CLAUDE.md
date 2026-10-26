# cosmos-mcp

## Rules

- A read-only MCP server for Cosmos (cosmos.so) with three tools: `search`, `collections` and `get_collection`. Others run it from GitHub with their own Cosmos login. It ships as a plain MCP server, never wrapped in a plugin.
- Cosmos has no public API and GraphQL introspection is off. Every query stays in `src/cosmos.js`. When a call breaks, compare it with the requests the cosmos.so web app sends. Its Next.js chunks hold every operation by name, like `GetClusterBySlug`.
- The client started as the `<script id="cosmos">` block of `marco-vrinssen/cosmos-figma-plugin`. A fix to a query there likely applies here too.
- Fetch only `api.www.cosmos.so`. Media on `cdn.cosmos.so` is linked, never fetched. Every request sends the User-Agent naming this repo and `x-client-name: cosmos-mcp`.
- Errors carry `extensions.code`: `AUTHENTICATION` for a missing or expired token, `NOT_FOUND` for unknown users and collections, `AUTHORIZATION` for someone else's private data. Cosmos sends some as HTTP 200.
- Pass ids as variables. An inline string literal fails the `ClusterId` type (checked 2026-10-26).
- Without a login, `searchElements`, `cluster(input: { slug, ownerUsername })`, `user(username)`, `clusterConnections` on public collections and `searchClusters` work. `clusters`, `userClusters` and `searchClusters` with a `userId` filter need one (checked 2026-10-26).
- Credentials come from `COSMOS_USERNAME` and `COSMOS_PASSWORD`, else on macOS from the keychain service `cosmos.so` with the login as account, read through `execFile` without a shell. Never log or return the password or token.
- Without credentials the server still starts and public reads work. Only `collections` without a query answers with `SETUP`.
- Tool output stays plain text. The server instructions in `src/server.js` reach every model's context, so keep them short.
- `wrangler.jsonc` keeps the Worker private. No Worker is deployed, because none of the owner's Workers calls it yet.
- MCP users follow `#semver:^1`. A breaking tool change needs a major version and the README updated to the new range.

## Checks

- `npm test` after every change to `src/`. The offline tests mock `fetch`. The live tests read Cosmos, and the signed-in one runs only when credentials are set.
- Try the tools by hand with `npx @modelcontextprotocol/inspector node src/index.js`.

## Release

1. Bump `version` in `package.json` and `package-lock.json` to the same value.
2. Run `npm test` with credentials set, so the signed-in test runs too.
3. Add the changes to `CHANGELOG.md`.
4. Push to `main`, tag `vX.Y.Z` and create a GitHub release. `#semver:^1` resolves tags, so untagged commits never reach users.
5. Once a private Worker serves one of the owner's Workers, run `npx wrangler deploy`.
