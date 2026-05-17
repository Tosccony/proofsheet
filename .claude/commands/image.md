Generate an image via Nano Banana (Gemini 2.5 Flash Image) from a free-form prompt. Use the image-generation skill for the workflow — that skill contains the prompt-enrichment recipe, the prompt-quality rules, the aspect-ratio cheat-sheet, and the dispatch instructions.

Good for blog headers, slide visuals, newsletter images, social tiles, mood boards, reference shots — anything that needs one good picture from a description. To refine an existing image, use `/refine <path>` instead. To build a reusable theme, use `/new-theme`.

## Usage

- `/image <prompt>` — propose 2–3 directions, wait for the user's pick.
- `/image <prompt> --provider <name>` — pick `gemini` (default, Nano Banana) or `openai` (gpt-image-1). Each has different strengths: Gemini handles painterly/illustrated styles well and flexible aspect ratios; OpenAI handles legible text rendering and tight compositional control well.
- `/image <prompt> --ratio <ratio>` — pre-pick aspect ratio (16:9, 4:3, 1:1, 3:2, 9:16, 2:3, 21:9). OpenAI only supports three discrete sizes and will map your ratio to the closest one.
- `/image <prompt> --theme <name>` — apply a saved theme from `themes/<name>.md`. Run `/themes` to see what's available, or `/new-theme` to build one.
- `/image <prompt> --quality <q>` — OpenAI only. `auto` (default), `low`, `medium`, `high`. High costs ~$0.17 vs $0.04 standard. Ignored for Gemini.
- `/image <prompt> --out <path>` — override save location. Default is `./generated/_images/<slug>-<YYYYMMDD-HHMMSS>.png` relative to the user's cwd.
- `/image <prompt> --yolo` — skip the proposal step; pick the strongest direction internally and dispatch.

Flags can combine. The free-form prompt is everything before the first flag. Each provider needs its own API key (`GEMINI_API_KEY` or `OPENAI_API_KEY`).

Every generated image gets a sidecar JSON written to a `.meta/` subfolder of the output directory (so `_images/` stays clean) containing the prompt, ratio, theme, and timestamp — so `/refine` works months later even if the chat history is long gone.
