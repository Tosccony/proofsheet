# proofsheet

An MCP server for image generation, refinement, and reusable themes. Backed by either **Nano Banana** (Gemini 2.5 Flash Image) or **OpenAI** (gpt-image-1), provider picked per call. Built for blog posts, slides, newsletters, social tiles, mood boards, and anything else that needs one good picture.

Because proofsheet speaks the Model Context Protocol, it works in **Claude desktop, ChatGPT desktop, Claude Code, Codex, Cursor, Cline**, and any other MCP-compatible client. One server, many homes.

The name comes from the photographer's contact sheet, the grid of options you pick from before printing the keeper.

```
npm install -g proofsheet     # optional, or just use npx below
```

## One-command install

```
npx -y proofsheet init
```

The `init` command auto-detects every MCP client you have installed (Claude desktop, Claude Code, Codex, Cursor), prompts for any missing API keys, and safely patches each config to register proofsheet. Backs up every file it touches to `<file>.bak`. Idempotent — running it again is safe.

After it finishes, restart your MCP clients and try:

> "Use proofsheet to generate an image of a coffee mug on a wooden table, editorial-photography theme"

That's the whole install for most users. You only need to read the rest of this README if you want to customize the config by hand, self-host the HTTP server, or develop on proofsheet itself.

### What `init` needs from you

At least one of:

- **Gemini key** ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) with billing enabled. About $0.04 per image. No free tier.
- **OpenAI key** ([platform.openai.com/api-keys](https://platform.openai.com/api-keys)). About $0.04 standard, up to $0.17 high quality. Note: a ChatGPT subscription does **not** cover API usage.

If `GEMINI_API_KEY` or `OPENAI_API_KEY` are already in your environment, `init` detects them and skips the prompt. Otherwise it asks you to paste them (and writes them only to the local config files on your machine, never anywhere else).

## Manual install (if you'd rather not run `init`)

The snippet below is what `init` writes for you. Paste it into your MCP client's config manually if you prefer.

### Claude desktop

Edit your config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "proofsheet": {
      "command": "npx",
      "args": ["-y", "proofsheet"],
      "env": {
        "GEMINI_API_KEY": "your-gemini-key",
        "OPENAI_API_KEY": "your-openai-key"
      }
    }
  }
}
```

Restart Claude desktop. The four proofsheet tools show up under the available tools. Ask Claude to "generate an image of X" and it renders inline in the chat.

### ChatGPT desktop

ChatGPT desktop's MCP support is newer than Claude's and `proofsheet init` cannot auto-configure it because ChatGPT doesn't expose a config file to patch. You'll add proofsheet through the app's settings UI.

**Requirements:**

- ChatGPT **Plus** or **Pro** subscription (custom MCP connectors are not available on the Free tier)
- ChatGPT desktop with **Developer mode** / **Custom connectors** feature enabled

**Steps:**

1. **Open ChatGPT desktop → Settings.**
2. **Enable developer mode** if it isn't already on. Look under "General", "Beta features", or "Advanced" — the exact location depends on your ChatGPT desktop version. You're looking for a "Developer mode" or "Custom connectors" toggle.
3. **Open the Connectors section** (sometimes labeled "Apps", "Integrations", or "MCP Servers"). Click **Add custom connector** or the "+" button.
4. **Fill in the connector form** with these values:

   | Field | Value |
   |---|---|
   | Name | `proofsheet` |
   | Command | `npx` |
   | Arguments | `-y proofsheet` |
   | Environment variables | `GEMINI_API_KEY=<your key>` and/or `OPENAI_API_KEY=<your key>` |

   If ChatGPT's form expects JSON instead of separate fields, use this:

   ```json
   {
     "command": "npx",
     "args": ["-y", "proofsheet"],
     "env": {
       "GEMINI_API_KEY": "your-gemini-key",
       "OPENAI_API_KEY": "your-openai-key"
     }
   }
   ```

5. **Save and restart ChatGPT desktop.**
6. **Verify** by asking in a new chat: *"Use proofsheet to generate an image of a coffee mug on a wooden table, editorial-photography theme."* ChatGPT should call the `generate_image` tool and render the image inline.

**ChatGPT desktop's MCP UI changes between releases.** If the labels above don't match what you see, the general flow is the same: find the connectors / integrations section, add a custom one, give it the same command + args + env. If you can't find anywhere to add a custom connector, your version probably doesn't have the feature yet — wait for an app update or use Claude desktop in the meantime.

**For ChatGPT on iPad/iPhone**, the local-subprocess setup above won't work — those clients can't run `npx`. The path for cross-device ChatGPT is to host proofsheet as an HTTP MCP server reachable over the internet, then point ChatGPT's connector at the HTTPS URL. See [`deploy/`](https://github.com/Tosccony/proofsheet/tree/main/deploy) for the full walkthrough (Tailscale, Caddy + bearer token, or Cloudflare Tunnel).

### Claude Code (CLI)

Same config format as Claude desktop. Add proofsheet to your Claude Code MCP config.

### Codex (CLI)

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.proofsheet]
command = "npx"
args = ["-y", "proofsheet"]

[mcp_servers.proofsheet.env]
GEMINI_API_KEY = "your-gemini-key"
OPENAI_API_KEY = "your-openai-key"
```

### Cursor, Cline, and other MCP clients

Same pattern. Wherever your client lists MCP servers, set:

```
command: npx
args:    -y proofsheet
env:     GEMINI_API_KEY=..., OPENAI_API_KEY=...
```

That's it. `npx -y proofsheet` downloads proofsheet from npm on first run, caches it locally, and launches the MCP server. No clone, no path management, no manual install.

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

Every generated or refined image gets a sidecar JSON at `<dir>/.meta/<basename>.json` containing the prompt, ratio, theme, provider, and timestamp. So `refine_image` works on any image you have, even from a year ago, even after the original chat is gone.

## Two providers

Pick per call via the `provider` argument. They have different strengths.

| | Gemini (Nano Banana) | OpenAI (gpt-image-1) |
|---|---|---|
| Aspect ratios | Flexible via prose | Three discrete sizes only: 1024×1024, 1024×1536, 1536×1024 |
| Strength | Painterly, illustrated, editorial photographic | Legible text in image, tight compositional control, clean product photography |
| Quality tiers | None | `auto` (default), `low`, `medium`, `high` |
| Cost per image | About $0.04 | About $0.04 standard, up to about $0.17 high quality |
| API auth | `GEMINI_API_KEY` | `OPENAI_API_KEY` (ChatGPT subscription does **not** cover API) |

Default is `gemini`. Set neither key and the corresponding provider just isn't available. Set both and switch per call.

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

Build your own with the `theme_builder` prompt template. Themes live in `themes/<slug>.md` as plain markdown frontmatter plus a body fragment.

## Install from source (only if you want to hack on it)

Skip this section unless you're developing proofsheet itself. For normal use, the `npx -y proofsheet` snippet above is all you need.

```bash
git clone https://github.com/Tosccony/proofsheet
cd proofsheet
npm install
npm run build           # compiles src/ -> bin/
npm run mcp             # runs the MCP server via stdio
```

Then in your MCP client config, replace `"command": "npx", "args": ["-y", "proofsheet"]` with `"command": "node", "args": ["/full/path/to/proofsheet/bin/mcp-server.js"]`.

## Using the engine scripts directly

If you want to bypass MCP entirely:

```bash
# Gemini text-to-image
npx proofsheet --help                  # shows the MCP server, not the engine scripts

# After installing from source:
node bin/gemini-image.js "a single white tulip on raw linen, soft window light, shot on medium-format film, 4:3 aspect ratio, no text overlays" "out.png" --ratio 4:3

# Image-to-image refinement
node bin/gemini-image.js "Warm the lighting to a golden afternoon tone. Keep subject and composition unchanged." "out-refined.png" --input "out.png"

# OpenAI text-to-image, high quality
node bin/openai-image.js "a single white tulip on raw linen, 1:1 aspect ratio" "out-openai.png" --ratio 1:1 --quality high
```

Each call writes a sidecar to `<dir>/.meta/<basename>.json`.

## Self-hosting as an HTTP MCP server

The default `proofsheet` command runs in stdio mode. To run it as an HTTP server (for multi-device access via a single instance you host, or for clients that prefer remote MCP):

```bash
npx proofsheet --transport http --port 3000
```

The [`deploy/`](https://github.com/Tosccony/proofsheet/tree/main/deploy) directory in the GitHub repo has a sample `systemd` unit and a setup walkthrough covering Tailscale, Caddy + bearer token, and Cloudflare Tunnel options.

**Critical**: do not expose the HTTP transport to the public internet without auth. Whoever can reach it will burn your API credit. Tailscale or a reverse proxy with bearer tokens are the easy mitigations.

## How proofsheet enriches prompts

A user typing "fisherman on a dock" doesn't produce a good image. The `art_direction` MCP prompt template tells the model how to convert that into a structured prompt with:

- **Subject** — concrete noun phrase ("a weathered fisherman in a yellow oilskin")
- **Environment** — where the subject lives
- **Composition** — framing, angle, placement
- **Lighting** — source + quality + time of day
- **Medium / lens** — the biggest stylistic lever (photographic vs illustrated vs painted)
- **Texture words** — "raw linen, weathered wood, matte ceramic" anchor reality
- **Mood** — one or two atmosphere words
- **Negative cues** — no text overlays, no brand logos, no watermarks
- **Aspect ratio** in prose at the very end

This is the entire value of proofsheet. The image-gen APIs follow direction very well; a thin prompt produces a thin image. The MCP server's job is to do the art-direction work the user didn't write down.

## License

MIT. See [LICENSE](LICENSE) for the full text.
