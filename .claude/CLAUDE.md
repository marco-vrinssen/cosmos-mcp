# cosmos-mcp

## Rules

- A read-only MCP server for Cosmos (cosmos.so) with three tools: `search`, `collections` and `get_collection`. Others run it with their own Cosmos login.
- Cosmos has no public API and GraphQL introspection is off. The web app's Next.js chunks hold every operation by name, like `GetClusterBySlug`.
- The client started as the `<script id="cosmos">` block of `marco-vrinssen/cosmos-plugin`. A fix to a query there likely applies here too.
- Fetch only `api.www.cosmos.so`. Media on `cdn.cosmos.so` is linked, never fetched. Every request also sends `x-client-name: cosmos-mcp`.
- Errors carry `extensions.code`: `AUTHENTICATION` for a missing or expired token, `NOT_FOUND` for unknown users and collections, `AUTHORIZATION` for someone else's private data. Cosmos sends some as HTTP 200.
- Pass ids as variables. An inline string literal fails the `ClusterId` type (checked 2026-10-26).
- Without a login, `searchElements`, `cluster(input: { slug, ownerUsername })`, `user(username)`, `clusterConnections` on public collections and `searchClusters` work. `clusters`, `userClusters` and `searchClusters` with a `userId` filter need one (checked 2026-10-26).
- The profile page `/<username>/collections` embeds only the first 20 collections, so never scrape it. `collections` with `user` uses `userClusters`, the web app's own profile query.
- The login comes only from `COSMOS_USERNAME` and `COSMOS_PASSWORD` in the environment, the common way for MCP servers run from GitHub. The MCP client config supplies them. No keychain code, login command or token storage. Never log or return the password or token.
- Cosmos offers no OAuth for other apps (checked 2026-10-26): no public API and no OAuth metadata.
- Without credentials the server still starts and public reads work. Only `collections` without a query answers with `SETUP`.

## Checks

- The signed-in live test runs only when `COSMOS_USERNAME` and `COSMOS_PASSWORD` are set. Set them for a release run.
