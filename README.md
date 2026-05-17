# proofsheet

A Claude Code plugin for generating, refining, and theming images. Backed by either **Nano Banana** (Gemini 2.5 Flash Image) or **OpenAI** (gpt-image-1), with the same skill workflow on top of both. Built for blog posts, slides, newsletters, social tiles, mood boards, and anything else that needs one good picture.

The name comes from the photographer's contact sheet, the grid of options you pick from before printing the keeper.

## What it does

| Command | What it does |
|---------|-------------|
| `/image <prompt>` | Generate a new image. Takes a free-form description, proposes 2 to 3 art-directed takes with suggested aspect ratios, and dispatches the chosen one. |
| `/refine <path>` | Refine an existing image. Either tweak the original prompt and regenerate fresh, or do an image-to-image edit (warm the lighting, remove an element, fix a color cast). |
| `/new-theme` | Interactively build a reusable aesthetic. Walks you through medium, palette, composition, references, and what to avoid, then saves a `themes/<slug>.md` file usable in any future `/image` call. |
| `/themes` | List available themes. Shows the 9 seeded ones plus any custom themes you have built. |

Every generated image gets a sidecar JSON written to a `.meta/` subfolder of the output directory. The sidecar holds the prompt, aspect ratio, theme, and timestamp, so any image is refinable months later even if the chat history is long gone.

## Why prompts get enriched first

Nano Banana follows direction extremely well. A thin prompt produces a thin image. proofsheet's whole value is the art direction work it does before dispatching: turning "an image of a fisherman" into a structured prompt with subject, environment, composition, lighting, medium, texture, mood, negative cues, and aspect ratio.

The `image-generation` skill bakes in rules like:

* Medium is the single biggest stylistic lever. Oil painting versus Polaroid snapshot versus risograph print produces three genuinely different images. Adjective swaps produce nearly identical ones.
* Specificity beats abstraction every time. "A weathered fisherman in a yellow oilskin" gives the model 10x the direction of "a man."
* Aspect ratio belongs in prose at the very end of the prompt, because Gemini's REST API has no ratio parameter.
* Counts above three are unreliable. Say "a small handful" instead of "exactly seven."
* Negative cues prevent typical AI tells (no text overlays, no watermarks, no brand logos, no glossy CGI).
* Stacking adjectives is noise. Six concrete phrases beat thirty weak qualifiers.

## Seeded themes

Nine starter themes ship with the plugin. Use any of them via `/image <prompt> --theme <slug>`.

| Theme | Aesthetic | Best for |
|-------|-----------|----------|
| `editorial-photography` | Medium-format film, soft window light, muted earth tones. | Blog headers, editorial. |
| `risograph-print` | Two-color screen print, slight registration offset, flat shapes. | Zine art, retro posters. |
| `moody-cinematic` | Low-key dramatic lighting, deep shadows, anamorphic widescreen feel. | Film stills, dark headers. |
| `studio-still-life` | Seamless backdrop, controlled softbox, sharp focus. | Product shots, isolated subjects. |
| `polaroid-snapshot` | Casual SX-70 aesthetic, slightly overexposed, faded color. | Nostalgic personal blog imagery. |
| `oil-painting` | Visible brushstrokes, painterly blending, gallery feel. | Editorial illustration, book covers. |
| `charcoal-sketch` | Loose charcoal lines, smudged shading, paper texture. | Sketchbook visuals, essays. |
| `corporate-clean` | Bright even lighting, neutral palette, no drama. | Business decks, LinkedIn banners. |
| `portfolio-gouache` | Hand-painted gouache in the Maira Kalman observational style. | Personal portfolios, intimate editorial. |

Build your own with `/new-theme`. Themes live in `themes/<slug>.md` as plain markdown, so you can edit them by hand anytime.

## Refining works months later

Every generation writes a sidecar JSON containing the original prompt and any flags used. A year from now you can run `/refine ./old-blog-header.png` and the skill reads the sidecar, shows you what was generated, and asks how to refine.

There are two refinement modes:

1. **Prompt tweak.** Edit one clause of the original prompt and generate a fresh image. Best for direction changes like "same idea but at golden hour" or "swap the medium to risograph." Produces a new image; subject identity will not carry over.
2. **Image-to-image.** Pass the existing image plus a short edit instruction to Gemini, get back a modified version. Best for surgical fixes like "warmer lighting" or "remove the dock railing." Keeps the same composition, edits in place.

If you point `/refine` at a foreign image with no sidecar, only image-to-image mode is available.

## Two providers

You can pick a provider per call via `--provider gemini|openai`. They have different strengths and you'll want both around.

| | Gemini (Nano Banana) | OpenAI (gpt-image-1) |
|---|---|---|
| Aspect ratios | Flexible via prose (anything reads, even if model often drifts to square) | Three discrete sizes only: 1024×1024, 1024×1536, 1536×1024 |
| Strength | Painterly, illustrated, and editorial photographic styles | Legible text-in-image, tight compositional control, very clean product photography |
| Quality tiers | None | `auto` (default), `low`, `medium`, `high` |
| Cost per image | About $0.04 | About $0.04 standard, up to about $0.17 high quality |
| Image-to-image | Yes | Yes |
| API auth | `GEMINI_API_KEY` | `OPENAI_API_KEY` (subscription does not cover API) |

Default is `gemini`. Set neither key and the corresponding provider just isn't available. Set both and you can switch per call.

## Setup

1. Node 18 or higher (for built-in `fetch` and `FormData`).
2. `tsx`, pulled in automatically by the plugin's `devDependencies`.
3. At least one of:
   - `GEMINI_API_KEY` with billing enabled on the AI Studio account. Nano Banana has no free tier (roughly $0.04 per image).
   - `OPENAI_API_KEY` from https://platform.openai.com/api-keys. Pay-per-image, separate from any ChatGPT subscription you may have.

Get a Gemini key at https://aistudio.google.com/apikey. On Windows PowerShell:

```powershell
[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'YOUR-KEY', 'User')
[System.Environment]::SetEnvironmentVariable('OPENAI_API_KEY', 'YOUR-KEY', 'User')
```

Restart your terminal after setting.

## Install

### Option A: open this repo directly in Claude Code

```powershell
git clone https://github.com/Tosccony/proofsheet.git
cd proofsheet
npm install
claude .
```

The `.claude/` folder at the project root makes `/image`, `/refine`, `/new-theme`, and `/themes` immediately available.

### Option B: install as a plugin into another project

Point Claude Code at this repo as a plugin source from any other project. Claude Code sets `$env:CLAUDE_PLUGIN_ROOT` to the install location, and the skills resolve the bin script and seeded themes against that path. You still need `npm install` in this repo so `tsx` is available.

## Using the CLI directly

The scripts behind the skills work on their own if you ever want to bypass Claude Code. There are two parallel scripts with the same shape, one per provider:

```powershell
# Gemini text-to-image
tsx bin/gemini-image.ts "a single white tulip on raw linen, soft window light, shot on medium-format film, 4:3 aspect ratio, no text overlays, no watermarks" "out.png" --ratio 4:3

# Gemini image-to-image (refinement)
tsx bin/gemini-image.ts "Warm the lighting to a golden afternoon tone. Keep subject and composition unchanged. No text, no watermarks." "out-refined.png" --input "out.png"

# OpenAI text-to-image, high quality
tsx bin/openai-image.ts "a single white tulip on raw linen, soft window light, 1:1 aspect ratio" "out-openai.png" --ratio 1:1 --quality high

# OpenAI image-to-image
tsx bin/openai-image.ts "Warm the lighting to a golden afternoon tone. Keep composition unchanged." "out-openai-edit.png" --input "out-openai.png"
```

Each call writes a sidecar to `<dir>/.meta/<basename>.json` including a `provider` field, so `/refine` later knows which backend to use.

## File layout

```
proofsheet/
  .claude-plugin/plugin.json
  .claude/
    skills/
      image-generation/SKILL.md
      image-refinement/SKILL.md
      theme-builder/SKILL.md
    commands/
      image.md
      refine.md
      new-theme.md
      themes.md
  bin/
    gemini-image.ts
    openai-image.ts
  themes/
    (9 seeded themes)
  README.md
  LICENSE
  package.json
  tsconfig.json
```

Custom themes built via `/new-theme` are saved to `./themes/` in the user's current working directory rather than the plugin install dir, so themes travel with whatever project the images are for.

## License

MIT. See [LICENSE](LICENSE) for the full text.
