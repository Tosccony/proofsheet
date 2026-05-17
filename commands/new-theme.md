Build a new reusable image theme interactively. Use the theme-builder skill for the workflow — it walks you through medium, lighting, palette, composition, references, and what-to-avoid, optionally tests with 1–2 sample images, and saves a `themes/<slug>.md` file you can use forever via `/proofsheet:image <prompt> --theme <slug>`.

A theme is the difference between getting 10 random images that share a subject and getting 10 cohesive images that share a *style*. Worth doing once if you're working on a blog series, slide deck, brand, or anything that needs visual consistency.

## Usage

- `/proofsheet:new-theme` — start a guided conversation. The skill asks questions one or two at a time, builds toward a draft, optionally tests, and saves.
- `/proofsheet:new-theme <name>` — pre-fill the theme name (the skill still walks the aesthetic discovery).

The result lands in `themes/<slug>.md` in your current working directory.

To see what themes already exist, run `/proofsheet:themes`. To use one, run `/proofsheet:image <prompt> --theme <slug>`.
