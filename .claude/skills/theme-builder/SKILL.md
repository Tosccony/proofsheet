---
name: theme-builder
description: Interactively help a user compose a reusable image theme — a saved aesthetic that injects into future /image calls via the --theme flag. Walks them through medium, lighting, palette, composition, references, and what-to-avoid, optionally generates 1–2 test images to validate the theme, then saves it to themes/<slug>.md. Use when the user wants to create, design, build, or define their own image style. Triggers include "make a theme", "I want to build a style for my blog images", "design a theme for our brand", "create a look", or invoking `/new-theme`.
---

# Theme Builder

The recipe for taking a user's vague aesthetic instinct ("I want my blog images to feel like 70s film photography") and turning it into a saved, reusable theme file. The output is a `themes/<slug>.md` file with a frontmatter header and a prompt fragment that the `image-generation` skill weaves into every future `/image` call.

A good theme is the difference between getting 5 cohesive blog headers across a series and getting 5 random images that happen to share a subject.

## When to use

- User says "I want to build a theme", "create a style", "make a look", "compose an aesthetic", "set up a visual identity for my images".
- They invoke `/new-theme`.
- They've been generating images and notice they want a consistent style they can reuse.

Don't use for: a single one-off image (use `/image`), refining an existing image (use `/refine`), or editing an already-saved theme (just edit the file in `themes/` directly — themes are plain markdown).

## First-run check (do this before anything else)

Check the onboarded marker at `$env:USERPROFILE\.proofsheet\onboarded` (Windows) or `~/.proofsheet/onboarded` (Unix), plus API keys. Branch per the table in the `proofsheet-onboarding` skill:

- Marker missing + keys missing → strong nudge to run `/welcome`, do not proceed.
- Marker missing + keys set → soft prompt: "First time using proofsheet? Type `tour` for `/welcome`, or `skip` to start building your theme. I'll only ask once."
- Marker exists → just proceed (any test-image dispatch later in the flow handles the per-provider key check separately).

## The flow

This is a guided conversation, not a form. Ask one or two questions at a time, listen, build on what they say. Don't dump all the questions at once. Total exchange should feel like a brief design chat (~5–8 turns), not an interrogation.

### 1. Get the use case

Open with: "What's this theme for? Blog post headers? Slide visuals? Product photography? Newsletter imagery? Knowing the *use* shapes everything downstream."

If they say something vague ("just images"), probe: "What's the context they'll show up in? A personal blog reads different than a corporate deck."

### 2. Anchor the medium

The medium is the single biggest lever for style. Ask:

> Photographic, illustrated, painted, or mixed? And within that — what flavor?
>
> - **Photographic**: 35mm film, medium-format, Polaroid, digital editorial, phone snapshot, wet plate, large-format slow exposure
> - **Illustrated**: pen-and-ink, risograph, vector flat, gouache, watercolor, charcoal, woodcut
> - **Painted**: oil, acrylic, watercolor, gouache
> - **Mixed / stylized**: 3D render, isometric, vaporwave, low-poly, anime, comic
>
> Or describe a reference — "like a New Yorker illustration" or "like an old National Geographic photo" — and I'll pick the closest.

Get them concrete before moving on. Vague answers ("kind of photographic, kind of illustrated") need a follow-up — themes that try to be both usually feel like neither.

### 3. Lighting and mood

Ask in one short prompt:

> What's the lighting mood — warm or cool, soft or hard, bright or dim? Any specific time of day that feels right (golden hour, blue hour, overcast, harsh midday, indoor lamplight, studio softbox)?

Translate their answer into trade vocabulary. If they say "kind of moody", come back with: "Moody like *low-key dramatic with deep shadows*, or moody like *soft overcast quiet*? Both read as moody but produce wildly different images."

### 4. Color and palette

> Palette tendencies? A few options to react to:
>
> - **Muted / desaturated** — earthy, washed, faded
> - **Saturated / punchy** — bold, primary-color forward
> - **Monochrome** — single color family, plus black/white
> - **Duotone** — two anchor colors (e.g., risograph pink-and-navy)
> - **Warm-dominant** — ambers, reds, ochres
> - **Cool-dominant** — blues, greens, slate
> - **High-contrast** — deep blacks against bright whites
>
> Or name 2–3 specific colors that should always be present.

### 5. Composition preferences

> How do you like things composed? Centered and symmetrical? Off-center with negative space? Tight close-ups? Wide environmental shots? Any compositional signatures you keep coming back to?

This is the question users find hardest to answer abstractly, so if they shrug, offer: "Should subjects fill the frame or sit in a lot of environment?" / "Tighter or wider?"

### 6. References (optional but powerful)

> Any artists, photographers, magazines, films, or specific images you'd point at and say 'more like that'?

If they name a reference: extract what makes it distinctive (don't just bake the name in — see prompt-quality rules in the image-generation skill). E.g., "in the style of Saul Leiter" becomes "painterly window reflections, blocked-out silhouetted figures, muted color, urban observational" — concrete patterns, not the name.

### 7. What to avoid

> Anything you specifically *don't* want? Common ones: no 3D render look, no glossy CGI, no text/typography in the image, no human faces, no specific colors, no brand logos.

This is high-leverage — explicit "don'ts" prevent the most common AI-generated tells from creeping in.

### 8. Compose the theme draft

Synthesize their answers into a `themes/<slug>.md` draft:

```markdown
---
name: <slug>
description: <one-line summary of the aesthetic — appears in /themes listing>
best-for: <use cases, comma-separated: blog headers, editorial photography>
---

<prompt fragment — 2–4 sentences of concrete art direction that gets injected into every /image call using this theme>
```

The body is the meat. Write it as a fragment that fits naturally into a larger prompt — not a complete prompt itself. Example body:

> Shot on medium-format film with a slight grain, soft window light from camera-left, muted earthy palette of ochres and faded blues, off-center composition with generous negative space, documentary editorial sensibility. No glossy CGI, no text overlays, no recognizable brand names.

Show the draft to the user. Ask: "Read this back to me — does it match the aesthetic you described?"

### 9. Validate with test images (optional)

Offer: "Want to test the theme with 1–2 sample images before saving? Costs ~$0.04 each, takes a moment."

If yes, ask them for a subject to test against (anything generic — "a coffee cup on a wooden table", "a person walking down a street"), then dispatch through the `image-generation` skill with `--theme <draft-slug>` flag. **Pass the draft theme as an inline param** — don't save the file yet, just feed the body fragment into the prompt-enrichment step.

Show the resulting image(s). Ask: "Does this match the theme you wanted? If not, what's off?"

Iterate the theme body based on their feedback — usually 1–2 tweaks. Re-test if needed.

### 10. Save

When the user is happy, save the file to `themes/<slug>.md` in the user's cwd (NOT the plugin install dir). The slug is kebab-case derived from the theme's name — confirm the slug with the user before writing if it's unclear.

If `themes/` doesn't exist in the user's cwd, create it.

Print:
- Saved path
- One-line confirmation of how to use it: `Use it via /image <prompt> --theme <slug>`
- A note that they can edit the file directly anytime in `themes/<slug>.md`.

## What makes a good theme body

The body is a prompt fragment, 2–4 sentences. It should:

- **Specify the medium concretely.** "Medium-format film, slight grain" > "kinda photographic."
- **Lock in lighting.** Source + quality + time of day.
- **Define palette in trade terms.** "Muted earth tones with desaturated greens" beats "kind of natural colors."
- **Mention composition tendencies.** "Off-center with generous negative space" / "tight close-ups, subject fills frame."
- **Include theme-specific negative cues.** "No glossy CGI, no high-saturation primaries, no text overlays" — whatever's hostile to this aesthetic.

The body should **not**:
- Include a subject (themes are subject-agnostic — `/image` provides the subject).
- Include an aspect ratio (that's per-image).
- Be longer than ~4 sentences (themes should ride alongside the prompt, not dominate it).

## Editing existing themes

If the user wants to refine a theme that already exists, they can just edit the markdown file. But if they ask you to help, treat it like step 8–10 of this flow — read the existing body, ask what's not landing, propose tweaks, optionally re-test, save.

## Don't

- Don't bundle all the questions into one wall of text. Conversation, not form.
- Don't accept "kind of photographic, kind of illustrated" — push for concrete.
- Don't bake artist names into the theme body. Extract patterns instead.
- Don't include a subject in the body. The theme is the *how*, not the *what*.
- Don't save the file before showing the user the draft body.
- Don't put themes in the plugin install dir. They live in the user's cwd `themes/` so they travel with the project.

## What success looks like

The user starts with a vague instinct, gets walked through 5–8 questions, sees a theme body that captures what they meant, optionally validates it with a test image, and ends with a saved file they can use across every future `/image` call. Six months later, they generate a new blog header with `--theme my-blog-style` and it lands looking cohesive with the dozen previous headers.
