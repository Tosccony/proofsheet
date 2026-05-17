---
name: image-generation
description: Generate images via Nano Banana (Gemini 2.5 Flash Image) by taking a free-form user description, proposing 2–3 meaningfully different art-directed takes with suggested aspect ratios, and dispatching the chosen one. Use whenever the user asks for an image, picture, illustration, photo, header, hero shot, mood board, slide visual, blog illustration, social tile, or reference from a prompt — even casually ("give me an image of X", "I need a header for Y", "draw me Z"). Triggers include invoking `/image`. The enrichment is the value: never dispatch a one-line user prompt verbatim, always enrich first.
---

# Image Generation

The recipe for taking a free-form user idea and turning it into a high-quality Nano Banana image. The prompt enrichment is the entire value — Nano Banana follows direction extremely well, and a thin prompt produces a thin image. Your job is to do the art direction work the user didn't.

## When to use

- The user asks for an image from a description ("an image of...", "a photo of...", "draw me...", "I need a visual of...", "header for my blog post about X", "slide visual for Y").
- They invoke `/image <prompt>` or `/image <prompt> --theme <name>`.
- They're working on a blog post, slide deck, newsletter, social tile, mood board, reference image, or anything else needing one good picture.

Don't use for: refining an image that already exists (use the `image-refinement` skill — `/refine <path>`), building a reusable theme (use the `theme-builder` skill — `/new-theme`), or video/motion outputs.

## Prerequisites

- `GEMINI_API_KEY` env var set, with billing enabled on the AI Studio account. Nano Banana has no free tier (~$0.04/image).
- `bin/gemini-image.ts` exists in this plugin/project.

If `GEMINI_API_KEY` is missing, halt with: "GEMINI_API_KEY not set. Generate a key at https://aistudio.google.com/apikey with billing enabled, then set persistently via PowerShell: `[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'YOUR-KEY', 'User')` and restart the terminal."

## The five-step flow

### 1. Read the prompt and any flags

Recognize flags in invocations like `/image <prompt> --ratio <ratio> --theme <name> --out <path> --yolo`:
- `--ratio <ratio>` — pre-pick aspect ratio (16:9, 4:3, 1:1, 3:2, 9:16, 2:3, 21:9). Skip the ratio recommendation step.
- `--theme <name>` — resolve `themes/<name>.md` and inject its body fragment into every direction's enrichment. If the theme doesn't exist, halt with: "Theme `<name>` not found in `themes/`. Run `/themes` to see available themes or `/new-theme` to create one."
- `--out <path>` — override save location. Default is `./generated/_images/<slug>-<YYYYMMDD-HHMMSS>.png` (relative to user's cwd).
- `--yolo` — skip the proposal step entirely; pick the strongest single direction internally and dispatch immediately.

The free-form prompt is everything before the first flag.

If the prompt is one or two words ("a sunset", "shoes"), ask **one** targeted clarifier — typically subject specificity, intended use ("what's this for — blog header? slide?"), or hard constraints. Don't bundle a wall of questions; one beat at most. If the prompt is already specific, skip this step.

### 2. Propose 2–3 directions

Each direction must differ **meaningfully** — different lighting, different angle, different medium, or different mood. Three takes on the same shot with slightly different colors is not three directions; it's one direction with rounding error.

For each direction, output:

- **Name** — a short label that captures the aesthetic (e.g., "Editorial Documentary", "Studio Still Life", "Cinematic Wide", "Risograph Print", "Polaroid Snapshot").
- **Suggested aspect ratio** with one-line reason (don't default to 16:9 for everything — see cheat-sheet below).
- **Enriched prompt** — full prose, structured per the recipe below.
- **Trade-off** — one line on what this take emphasizes vs. sacrifices ("warm and intimate but loses scale" / "graphic and bold but reads less photographic").

When `--theme` is set, every direction's enriched prompt must incorporate the theme fragment — typically the theme replaces or anchors the medium/lighting/mood clauses. Don't just append the theme as a tail clause; weave it in.

Format the directions as a clean numbered list so the user can reply "1" / "2" / "3".

### 3. Wait for the pick

The user replies with a number, asks for a refinement ("2 but at golden hour instead of overcast"), or asks for a fresh round of directions. Honor refinements by editing the chosen prompt's relevant clause; don't rewrite from scratch unless they ask.

When `--yolo` is set, skip steps 2 and 3 — pick the strongest single direction internally, show the enriched prompt as a one-line confirmation, and proceed.

### 4. Dispatch

Run the script with the final enriched prompt, output path, and any of `--theme` / `--ratio` so they get recorded in the sidecar JSON for future refinement.

**Script location.** If the env var `CLAUDE_PLUGIN_ROOT` is set, the script lives at `$env:CLAUDE_PLUGIN_ROOT/bin/gemini-image.ts` (PowerShell) or `${CLAUDE_PLUGIN_ROOT}/bin/gemini-image.ts` (bash). If unset (you opened Claude Code inside this plugin's own directory), use the relative path `bin/gemini-image.ts`. Check `$env:CLAUDE_PLUGIN_ROOT` first.

PowerShell example (plugin context):
```powershell
tsx "$env:CLAUDE_PLUGIN_ROOT/bin/gemini-image.ts" @'
<full enriched prompt here>
'@ "<output-path>" --ratio 4:3 --theme editorial-photography
```

Bash example (plugin context):
```bash
tsx "${CLAUDE_PLUGIN_ROOT}/bin/gemini-image.ts" "<full enriched prompt>" "<output-path>" --ratio 4:3 --theme editorial-photography
```

Direct (running inside this plugin's repo): drop the `$env:CLAUDE_PLUGIN_ROOT/` prefix and use `bin/gemini-image.ts`.

**Output path defaults**: `./generated/_images/<slug>-<YYYYMMDD-HHMMSS>.png` (relative to user's cwd, not the plugin install dir) where `<slug>` is the first 3–4 alphanumeric words of the user's original prompt, kebab-cased and lowercased. Example: prompt "fisherman on a dock at dawn" → `./generated/_images/fisherman-on-a-20260502-143055.png`. The directory is created automatically by the script.

The script writes a sidecar JSON to `<dir>/.meta/<basename>.json` automatically containing the prompt, ratio, theme, timestamp, and model — keeping the image directory itself clean. **Always pass `--ratio` and `--theme` flags when relevant** so the sidecar is complete — that's what makes future `/refine` calls precise.

**Quote handling**: the prompt may contain double quotes, backticks, or `$`. In PowerShell, use a single-quoted here-string (`@'...'@`) to pass the prompt safely — the closing `'@` must be at column 0. In bash, double-quote and backslash-escape any literal `"` or `` ` ``.

### 5. Report

After dispatch, print:
- Absolute path of the saved image
- Sidecar path (so the user knows refinement metadata was captured)
- File size
- The exact prompt that was sent (so the user can copy it for tweaks)

Then offer one of: "regenerate with a tweak?", "try direction 2?", "refine this image directly via `/refine`?", or "done." Don't auto-loop — wait for user direction.

## Prompt-enrichment recipe

Build the enriched prompt by concatenating, in this order:

1. **Subject** — concrete noun phrase. "A weathered fisherman in a yellow oilskin" beats "a man." "A handful of dried lavender on raw linen" beats "some flowers." Ground the image in something specific.
2. **Environment / setting** — where this lives. "Sitting at the end of a wooden pier" / "on a marble counter in a sunlit kitchen" / "against a flat seamless gray studio backdrop." Subject + environment are both load-bearing; one without the other floats.
3. **Composition** — framing (close-up / medium / wide), angle (eye-level / low-angle / top-down / three-quarter), placement (centered / off-center / rule-of-thirds left / negative space on right).
4. **Lighting** — source (window light from camera-left / harsh midday sun / single tungsten bulb / overcast diffused / softbox above), quality (soft / hard / dappled), time of day if it matters (golden hour / blue hour / pre-dawn / midday harsh). Direction + quality together; one without the other reads flat.
5. **Medium / lens** — the single biggest stylistic lever. Photographic ("shot on 35mm film" / "medium-format Hasselblad" / "Polaroid SX-70" / "phone snapshot" / "wet plate") or non-photographic ("oil painting" / "pen and ink crosshatch" / "risograph two-color print" / "charcoal sketch" / "gouache illustration"). Pick deliberately — this is what differentiates directions more than anything else.
6. **Texture words** — "raw linen, weathered wood, matte ceramic, brushed steel" anchor reality and prevent the slick-CGI tell.
7. **Mood** — one or two atmosphere words (quiet, contemplative / chaotic, kinetic / nostalgic, faded / clinical, sterile). Don't stack five.
8. **Negative cues, baked into every prompt**:
   - "No text overlays."
   - "No recognizable brand names, logos, or trademarked products."
   - "No watermarks."
9. **Aspect ratio clause** at the very end: e.g., "16:9 landscape aspect ratio." Nano Banana's REST API has no ratio parameter, so the prompt is the only knob. Be explicit.

## What actually makes prompts work (the rules behind the recipe)

Bake these into your judgment when composing every prompt — they're why the recipe is shaped the way it is:

- **Specificity beats abstraction every time.** Replace nouns with concrete nouns; replace adjectives with concrete adjectives. "A weathered fisherman in a yellow oilskin" is doing the same syntactic job as "a man" — it just gives the model 10x the direction.
- **Medium/lens is the biggest single lever.** Three prompts that differ only in medium ("oil painting" vs. "Polaroid snapshot" vs. "risograph print") produce three genuinely different images. Three prompts that differ only in adjectives ("beautiful" vs. "stunning" vs. "amazing") produce three nearly identical images.
- **Lighting needs both source and quality.** "Good lighting" is noise. "Soft window light from camera-left, late afternoon" is direction. The model needs both a *where* and a *how*.
- **Composition vocabulary from photography works literally.** "Rule of thirds, subject lower-left, negative space upper-right" is parsed and executed. Use the trade terms.
- **Counts above ~3 are unreliable.** Don't ask for "exactly 7 apples." Say "a small handful" or "a cluster." If you need an exact count, generate twice and pick the closer one.
- **Negative cues prevent the typical AI tells.** Brand-name avoidance, no-text-overlay, no-watermark — these aren't optional; they protect against generating something that can't actually be used.
- **Aspect ratio belongs at the very end, in prose.** REST API has no ratio parameter; the prose clause is the only signal. Put it last so it's the last thing the model "reads."
- **Don't stack adjectives or promise quality.** "Beautiful stunning masterpiece 8k photorealistic" is pure noise that dilutes the actual direction. 6–8 strong concrete phrases beats 30 weak qualifiers.
- **Texture anchors reality.** "Raw linen, weathered wood, matte ceramic" prevents the slick-glossy-CGI look that AI models default to.
- **Time of day is more powerful than people realize.** Same scene at golden hour, blue hour, pre-dawn, and midday harsh produces four completely different images. Pick deliberately.
- **Reference artists carefully.** "In the style of Saul Leiter" works but feels lazy and risks copying. Better: extract what makes their work distinctive ("painterly window reflections, blocked-out figures, muted color") and prompt that directly.
- **The negative cues go in every prompt, every time.** No exceptions.

## Aspect ratio cheat-sheet

Pick the ratio that fits the composition, not the other way around.

- **16:9** — wide hero, landscape scene, cinematic establishing shot, blog header that spans the page. Subject must spread horizontally or sit in environment.
- **9:16** — phone wallpaper, vertical poster, IG story, TikTok still. Subject must be vertically composed.
- **4:3** — classic photo, portfolio thumbnail, blog inline image, newsletter image. Honest middle-ground; reads like a "real photo."
- **1:1** — social square, product still, centered single subject, IG feed. Good when the subject is the entire idea.
- **3:2** — DSLR-native, editorial photo. The "looks like a published magazine shot" choice.
- **2:3** — magazine cover, portrait orientation, slide deck portrait insert. Good for full-body or shoulder-up human subjects.
- **21:9** — ultrawide cinematic banner, panoramic. Use sparingly; subject must read at extreme width.

Default by use-case if the user didn't specify:
- Blog post header / hero image → 16:9
- Slide content image → 4:3 or 16:9 depending on slide ratio
- Newsletter inline → 4:3
- Social post → 1:1
- Story / Reel still → 9:16

## Don't

- Don't dispatch before showing the enriched prompt (unless `--yolo`). The enrichment is the value.
- Don't propose three near-identical directions. Different lighting, angle, OR medium between options — preferably more than one of those.
- Don't bake brand names or trademarked subjects into prompts ("an Apple Store interior", "Nike Air Force 1s"). The negative cues are not optional — they protect against generating something the user can't actually use.
- Don't default to 16:9. Match the ratio to the composition or the use-case.
- Don't auto-retry on failure. Surface the error and ask. Quota/billing errors mean the API key needs attention, not another attempt.
- Don't skip `--theme` or `--ratio` flags when dispatching — they go into the sidecar and make `/refine` work properly later.
- Don't stack adjectives. "Beautiful stunning amazing" is noise, not direction.

## What success looks like

The user describes a vague idea; you return three meaningfully different art-directed takes; they pick one; the saved image looks like deliberate art direction, not stock filler. The sidecar JSON next to the PNG captures the prompt so they can refine it months later via `/refine`.
