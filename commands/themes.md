List available image themes — both the seeded defaults shipped with this tool and any custom themes the user has built via `/proofsheet:new-theme`.

## What to do

1. Look in two places:
   - **Seeded themes** at `$env:CLAUDE_PLUGIN_ROOT/themes/` (PowerShell) or `${CLAUDE_PLUGIN_ROOT}/proofsheet:themes/` (bash). If unset, fall back to `./themes/` in this plugin's repo.
   - **User themes** at `./themes/` in the user's current working directory.
2. Read each `.md` file's frontmatter (`name`, `description`, `best-for`).
3. Print a compact table:

```
SEEDED THEMES
- editorial-photography — Medium-format film, soft window light, muted earth tones. Best for: blog headers, editorial photography.
- risograph-print — Two-color screen-printed look, flat shapes, slight registration offset. Best for: zine art, retro graphic posters.
- moody-cinematic — Low-key dramatic lighting, deep shadows, anamorphic widescreen feel. Best for: film stills, dark blog headers.
- studio-still-life — Seamless backdrop, controlled softbox lighting, product photography clean. Best for: product shots, isolated subjects.
- polaroid-snapshot — Slight overexposure, square frame, casual snapshot framing, faded color. Best for: nostalgic personal-blog imagery.
- oil-painting — Visible brushstrokes, painterly color blending, classical composition. Best for: editorial illustration, book covers.
- charcoal-sketch — Loose charcoal lines, smudged shading, paper texture, monochrome. Best for: editorial illustration, sketchbook visuals.
- corporate-clean — Bright even lighting, neutral palette, sharp digital photography, no styling drama. Best for: business deck imagery, LinkedIn banners.

USER THEMES
(none yet — create one with /proofsheet:new-theme)
```

If a theme has malformed frontmatter, skip it but note "skipped: <filename> (bad frontmatter)" at the bottom.

If there are no user themes, say so cleanly. If there are no seeded themes either (unusual), say "Seeded themes not found — `$CLAUDE_PLUGIN_ROOT/themes/` is missing or empty."

After the listing, prompt: "Use one via `/proofsheet:image <prompt> --theme <slug>`, or build your own with `/proofsheet:new-theme`."
