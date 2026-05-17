# proofsheet

An MCP server for image generation, refinement, and reusable themes. Backed by either **Nano Banana** (Gemini 2.5 Flash Image) or **OpenAI** (gpt-image-1), with provider picked per call. Built for blog posts, slides, newsletters, social tiles, mood boards, and anything else that needs one good picture.

Because proofsheet speaks the Model Context Protocol, it works in **Claude desktop, ChatGPT desktop, Claude Code, Codex, Cursor, Cline**, and any other MCP-compatible client. One server, many homes.

The name comes from the photographer's contact sheet, the grid of options you pick from before printing the keeper.

## What you get

| Tool | What it does |
|---|---|
| `generate_image` | Turn a free-form prompt into an image. Returns the PNG inline so the client renders it in chat, plus writes to disk with sidecar metadata. |
| `refine_image` | Either tweak the original prompt and regenerate (`mode: "tweak"`) or do an image-to-image edit (`mode: "edit"`). Reads sidecar metadata so refinement works months later. |
| `list_themes` | Show all available themes shipped with proofsheet. |
| `read_theme` | Fetch a theme body to weave into a generation prompt. |

| Prompt template | What it does |
|---|---|
| `art_direction` | The prompt-enrichment recipe. Tells the model how to turn "an image of a fisherman" into a structured prompt with subject, environment, composition, lighting, medium, texture, mood, and negative cues. Apply before calling `generate_image`. |
| `refinement_picker` | Decision guide for whether to use `mode: "tweak"` vs `mode: "edit"` on `refine_image`. |
| `theme_builder` | Guided conversation flow for building a custom theme and saving it as `themes/<slug>.md`. |

Every generated or refined image gets a sidecar JSON written to `<dir>/.meta/<basename>.json` containing the prompt, ratio, theme, provider, and timestamp. So `refine_image` works on any image you have, even from a year ago, even after the original chat is gone.

## Two providers

Pick per call via the `provider` argument on `generate_image` or `refine_image`. They have different strengths.

| | Gemini (Nano Banana) | OpenAI (gpt-image-1) |
|---|---|---|
| Aspect ratios | Flexible via prose | Three discrete sizes only: 1024×1024, 1024×1536, 1536×1024 |
| Strength | Painterly, illustrated, editorial photographic | Legible text in image, tight compositional control, clean product photography |
| Quality tiers | None | `auto` (default), `low`, `medium`, `high` |
| Cost per image | About $0.04 | About $0.04 standard, up to about $0.17 high quality |
| API auth | `GEMINI_API_KEY` | `OPENAI_API_KEY` (ChatGPT subscription does **not** cover API) |

Default is `gemini`. Set neither key and the corresponding provider just isn't available. Set both and you can switch per call.

## Seeded themes

Nine themes ship with proofsheet. Use any via the `theme` argument: `generate_image(prompt: "...", theme: "editorial-photography")`.

| Theme | Aesthetic | Best for |
|---|---|---|
| `editorial-photography` | Medium-format film, soft window light, muted earth tones. | Blog headers, editorial. |
| `risograph-print` | Two-color screen print, slight registration offset, flat shapes. | Zine art, retro posters. |
| `moody-cinematic` | Low-key dramatic lighting, deep shadows, anamorphic widescreen feel. | Film stills, dark headers. |
| `studio-still-life` | Seamless backdrop, controlled softbox, sharp focus. | Product shots, isolated subjects. |
| `polaroid-snapshot` | Casual SX-70 aesthetic, slightly overexposed, faded color. | Nostalgic personal-blog imagery. |
| `oil-painting` | Visible brushstrokes, painterly blending, gallery feel. | Editorial illustration, book covers. |
| `charcoal-sketch` | Loose charcoal lines, smudged shading, paper texture. | Sketchbook visuals, essays. |
| `corporate-clean` | Bright even lighting, neutral palette, no drama. | Business decks, LinkedIn banners. |
| `portfolio-gouache` | Hand-painted gouache in the Maira Kalman observational style. | Personal portfolios, intimate editorial. |

Build your own with the `theme_builder` prompt template. Themes live in `themes/<slug>.md` as plain markdown frontmatter + a body fragment.

## Setup

You need:

1. **Node 18 or higher** (for built-in `fetch` and `FormData`).
2. **At least one API key**:
   - `GEMINI_API_KEY` with billing enabled on the AI Studio account.
   - `OPENAI_API_KEY` from https://platform.openai.com/api-keys. Pay-per-image, separate from any ChatGPT subscription.

On Windows PowerShell:

```powershell
[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'YOUR-KEY', 'User')
[System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'YOUR-KEY', 'User')
```

On macOS / Linux:

```bash
echo 'export GEMINI_API_KEY="..."' >> ~/.zshrc
echo 'export OPENAI_API_KEY="..."' >> ~/.zshrc
```

Restart your terminal after setting. The proofsheet server reads keys from the environment of whatever process launches it.

## Install (local)

Clone the repo and you're done. The `bin/mcp-server.js` ships precompiled and bundled with all dependencies, so there is no `npm install` needed to run it.

```bash
git clone https://github.com/Tosccony/proofsheet
cd proofsheet
node bin/mcp-server.js   # stdio mode, ready for desktop apps to launch
```

If you want to hack on the TypeScript source in `src/`, then you do need to install dev dependencies:

```bash
npm install
npm run build   # rebuilds bin/mcp-server.js
```

## Connecting clients

### Claude desktop

Edit your config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "proofsheet": {
      "command": "node",
      "args": ["/absolute/path/to/proofsheet/bin/mcp-server.js"],
      "env": {
        "GEMINI_API_KEY": "...",
        "OPENAI_API_KEY": "..."
      }
    }
  }
}
```

Restart Claude desktop. The four tools and three prompt templates show up under the proofsheet server. Ask Claude to "generate an image of X" and it'll call `generate_image` and render the result inline.

### ChatGPT desktop

ChatGPT desktop supports custom MCP connectors via the developer/connectors feature (Plus or Pro required). Add a new connector pointing at the same `mcp-server.js` script. ChatGPT's flow is currently more polished for remote (HTTPS) MCP than local stdio, so you may want to host proofsheet on a server (see [`deploy/`](./deploy/)) for the most reliable ChatGPT desktop integration.

### Claude Code (CLI)

Claude Code reads the same MCP config format as the desktop app. Add proofsheet under `mcpServers` in your Claude Code config (or use the same `claude_desktop_config.json` if shared). After restart, tools become available to invoke in any Claude Code session.

### Codex (CLI)

In `~/.codex/config.toml`:

```toml
[mcp_servers.proofsheet]
command = "node"
args = ["/absolute/path/to/proofsheet/bin/mcp-server.js"]

[mcp_servers.proofsheet.env]
GEMINI_API_KEY = "..."
OPENAI_API_KEY = "..."
```

### Cursor, Cline, and other MCP clients

Same pattern: point them at `node /path/to/proofsheet/bin/mcp-server.js` as the stdio MCP server command. Each client has its own config format; consult their docs for where MCP servers are configured.

## Hosting proofsheet on your own server

For multi-device or remote-MCP-only clients (like ChatGPT desktop on iPad), host proofsheet as an HTTP MCP server on a Linux box. The [`deploy/`](./deploy/) directory has a sample `systemd` unit and a full setup walkthrough including Tailscale, Caddy + bearer token, and Cloudflare Tunnel options.

```bash
node bin/mcp-server.js --transport http --host 127.0.0.1 --port 3000
```

The HTTP transport uses MCP's Streamable HTTP protocol. Clients that only speak stdio (most desktop apps currently) can connect to it via `npx mcp-remote https://your-host:port` as a stdio-to-HTTP bridge. See [`deploy/README.md`](./deploy/README.md) for details.

**Critical**: do not expose the HTTP transport to the public internet without auth. API key abuse will rack up real charges. Use Tailscale, a reverse proxy with bearer tokens, or Cloudflare Access.

## Using the CLI directly (without MCP)

The two engine scripts that the MCP server delegates to are also runnable standalone:

```bash
# Gemini text-to-image
node bin/gemini-image.js "a single white tulip on raw linen, soft window light, shot on medium-format film, 4:3 aspect ratio, no text overlays" "out.png" --ratio 4:3

# Gemini image-to-image refinement
node bin/gemini-image.js "Warm the lighting to a golden afternoon tone. Keep subject and composition unchanged." "out-refined.png" --input "out.png"

# OpenAI text-to-image, high quality
node bin/openai-image.js "a single white tulip on raw linen, 1:1 aspect ratio" "out-openai.png" --ratio 1:1 --quality high
```

Each call writes a sidecar to `<dir>/.meta/<basename>.json`.

## File layout

```
proofsheet/
  .git/
  src/                   TypeScript source
    mcp-server.ts
    gemini-image.ts
    openai-image.ts
  bin/                   compiled JavaScript, shipped with the repo
    mcp-server.js        bundled (includes MCP SDK and deps)
    gemini-image.js      standalone
    openai-image.js      standalone
  themes/                seeded themes (markdown frontmatter + body fragments)
    editorial-photography.md
    moody-cinematic.md
    ...
  deploy/                self-hosting (systemd unit, hosting guide)
    proofsheet.service
    README.md
  README.md
  LICENSE
  package.json
  tsconfig.json
```

Generated images go to `./generated/_images/<slug>-<timestamp>.png` in the current working directory of whichever process launches proofsheet. That's typically your project directory, so images travel with your work.

## License

MIT. See [LICENSE](LICENSE) for the full text.
