# Cosmos MCP

Lets AI agents search and read [Cosmos](https://www.cosmos.so), the visual inspiration library: images, GIFs and videos by meaning, public collections and profiles, and your own private collections when you sign in. It is a read-only MCP server that runs on your own computer.

Unofficial and not affiliated with Cosmos.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search` | `query`, `within`, `limit`, `cursor` | Elements ranked by meaning, from all of Cosmos or inside one profile or collection, each with caption, page link, media file and source |
| `collections` | `query`, `user` | With only a query, matching public collections on all of Cosmos. With a user, that user's collections with their subcollections. With neither, your own, private ones included |
| `get_collection` | `url`, `limit`, `cursor` | A collection, subcollection or profile: owner, description, subcollections and a page of its elements |

- `limit` defaults to 20 for `search` and 50 for `get_collection`, at most 100.
- An answer that ends with a `cursor` has more. Pass it back for the next page.

## Links

Every profile and collection is addressed by its cosmos.so link, the way the web app shows it.

| Link | Example | `get_collection` reads | `search` with `within` searches |
|---|---|---|---|
| Profile | `https://www.cosmos.so/<username>` | The user's public elements | Everything the user saved |
| Collection | `https://www.cosmos.so/<username>/<collection>` | Its own elements and its subcollections | The collection |
| Subcollection | `https://www.cosmos.so/<username>/<collection>/<subcollection>` | Its elements | The subcollection |

Element links like `https://www.cosmos.so/e/<id>` appear in every answer.

## Sign in

Searching all of Cosmos, finding collections by a query and reading any public collection or profile need no account. Listing a user's collections and your private ones need your Cosmos login in the server's environment:

| Variable | Value |
|---|---|
| `COSMOS_USERNAME` | Your Cosmos email or username |
| `COSMOS_PASSWORD` | Your Cosmos password |

## Install

Requires Node 22 or later and git.

### Claude Code

With your login:

```sh
claude mcp add --scope user --env COSMOS_USERNAME=<login> --env COSMOS_PASSWORD=<password> cosmos -- npx -y github:marco-vrinssen/cosmos-mcp#semver:^1
```

For public content only, leave out both `--env` options.

### Claude desktop app

In Settings, Developer, Edit Config, add the server and restart the app. Leave out `env` for public content only:

```json
{
  "mcpServers": {
    "cosmos": {
      "command": "npx",
      "args": ["-y", "github:marco-vrinssen/cosmos-mcp#semver:^1"],
      "env": { "COSMOS_USERNAME": "<login>", "COSMOS_PASSWORD": "<password>" }
    }
  }
}
```

Then ask something like "find brutalist staircases on Cosmos" or "what is in my Cosmos collection Packaging?".

### Other agents

Cursor, VS Code, Codex and other MCP clients run the same command as a stdio server: `npx -y github:marco-vrinssen/cosmos-mcp#semver:^1`, with `COSMOS_USERNAME` and `COSMOS_PASSWORD` in its environment.

### Your own Worker

`src/worker.js` serves the same tools at `/mcp` on Cloudflare Workers. Callers from the internet get 30 requests a minute per IP. Your other Workers can call it through a service binding, which skips that limit.

`wrangler.jsonc` keeps the Worker private, with `workers_dev` and `preview_urls` off. For a public copy, change `name` and set `workers_dev` to `true`, then deploy without a login, so it serves public content only:

```sh
npm install
npx wrangler deploy
```

A public copy also works in claude.ai and the Claude apps: Settings, Connectors, Add custom connector, then paste its URL. Every request counts against your Cloudflare account's free daily requests.

Give a Worker your login only while it stays private, or anyone with its URL reads your private collections:

```sh
npx wrangler secret put COSMOS_USERNAME
npx wrangler secret put COSMOS_PASSWORD
```

### Your own code

Import `createServer` from `cosmos-mcp/src/server.js` and connect it to any MCP transport.

## How it behaves

- Tells agents how to use it when they connect: search in plain words, pass cosmos.so links, treat generated captions with care and follow cursors.
- Uses the GraphQL API behind cosmos.so, the same one the web app uses. Every request names this repo in its User-Agent and sends `x-client-name: cosmos-mcp`, so Cosmos can tell this traffic apart.
- Signs in once per start and keeps the token in memory only. When Cosmos rejects it, it signs in again once. The password is never stored or printed.
- Caches answers for 5 minutes.
- Fetches only `api.www.cosmos.so`. Media files on `cdn.cosmos.so` are linked, never downloaded.

## Limits

- Cosmos has no public API. When it changes the API behind its web app, the live tests fail and the client needs an update.
- Listing a user's collections needs a sign-in, because Cosmos answers that query only to signed-in callers. Signed out, find collections with a query or open their links.
- A collection's own elements leave out those of its subcollections. `get_collection` lists the subcollections with their links.
- Captions are generated by Cosmos and can be wrong or missing.
- Signing in needs a Cosmos password.
- For personal use. The content belongs to Cosmos and the people who saved it, and Cosmos's terms apply.

## Develop

```sh
npm install
npm test
```

The offline tests replace `fetch` with answers shaped like Cosmos's. The live tests read Cosmos without a login, plus your own collections when a login is set. Try the tools by hand with `npx @modelcontextprotocol/inspector node src/index.js`.

## For the Cosmos team

I built this for my own work, next to the [Cosmos Unofficial](https://github.com/marco-vrinssen/cosmos-figma-plugin) Figma plugin. I am happy to move it to an official API or OAuth, rename it, change it or take it down. Open an issue here or reach me on [GitHub](https://github.com/marco-vrinssen).

The Cosmos name belongs to Cosmos.
