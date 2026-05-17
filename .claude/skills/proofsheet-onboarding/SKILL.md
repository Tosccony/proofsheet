---
name: proofsheet-onboarding
description: First-run tutorial for the proofsheet plugin. Walks a new user through what proofsheet does, checks which API keys are set, helps set up any missing ones, demos each command with one-line explanations, and offers a free dry-run before any actual paid image is dispatched. Triggers include invoking `/welcome`, asking "how do I use this", "what does proofsheet do", "how do I get started", "I just installed this", or when other skills detect missing API keys on a first invocation.
---

# Proofsheet Onboarding

The first-run experience. Run on every fresh install since most users skip the README. Designed to take 2 to 3 minutes and leave the user knowing exactly what to type next.

## When to use

- The user invokes `/welcome` directly.
- The user asks "how do I use this", "what does proofsheet do", "how do I get started", "I just installed this".
- Another skill detects that no API keys are set and the user appears to be a first-time user (offer `/welcome` in the error message instead of just halting).

Don't use for: experienced users who already know the commands and just want to generate an image (they should go straight to `/image`).

## The walkthrough

This is a tight scripted flow. Run it linearly, but skip any step the user has clearly already done.

### Step 1: One-paragraph hello

Open with something like:

> Welcome to proofsheet. This is a Claude Code plugin for generating, refining, and theming AI images — for blog posts, slides, newsletters, social tiles, mood boards, anything that needs one good picture. It's backed by either Nano Banana (Gemini 2.5 Flash Image) or OpenAI's gpt-image-1, your pick per call.
>
> This walkthrough takes about 3 minutes. Want me to run through it, or skip to a specific command? Reply `tour`, `image`, `refine`, `new-theme`, `themes`, or `done`.

If they say `done`, stop. If they pick a specific command, skip to step 5 for that command. If they say `tour` or anything affirmative, continue.

### Step 2: Check API keys

Run a quick environment check. On PowerShell: `$env:GEMINI_API_KEY` and `$env:OPENAI_API_KEY`. Report what's set. Do NOT print key values, only presence and length.

Three branches:

**Neither key set**: tell the user they need at least one to do anything paid, and walk through picking one:

> You need at least one API key. The two providers have different strengths:
>
> * **Gemini (Nano Banana)** — flexible aspect ratios, painterly and illustrated styles. ~$0.04/image. Get a key at https://aistudio.google.com/apikey (billing required, no free tier).
> * **OpenAI (gpt-image-1)** — strict 3 sizes, legible text in image, very clean product photography. ~$0.04 standard, up to $0.17 high quality. Get a key at https://platform.openai.com/api-keys. Note: a ChatGPT subscription does NOT cover API usage.
>
> Which one do you want to set up first? Or both?

Walk them through setting the env var on their OS. On Windows PowerShell:

```powershell
[System.Environment]::SetEnvironmentVariable('GEMINI_API_KEY', 'your-key', 'User')
```

Tell them to **restart the terminal** for the change to take effect in new sessions, but in the current session they can set it inline: `$env:GEMINI_API_KEY = 'your-key'`. Warn them not to paste the key in the chat itself if they can avoid it (logs).

**One key set, other missing**: note that the other provider is unavailable. Offer to set it up now or skip and add later.

**Both keys set**: confirm both providers are ready and move on.

### Step 3: Explain the four content commands

A short table or list, one line each:

> Here's what you can do:
>
> * `/image <prompt>` — generate a new image from a description. The skill proposes 2–3 art-directed takes, you pick one. Optional flags: `--provider gemini|openai`, `--theme <name>`, `--ratio <16:9|4:3|1:1|...>`, `--quality auto|low|medium|high` (OpenAI only).
> * `/refine <path>` — refine an existing image. Either tweak the original prompt and regenerate fresh (for direction changes), or do an image-to-image edit (for surgical fixes like "warmer lighting"). Works even months later because every image carries a sidecar JSON.
> * `/new-theme` — interactively build a reusable aesthetic. The skill walks you through medium, palette, composition, references, what to avoid, then saves a `themes/<slug>.md` file you can use forever via `/image <prompt> --theme <slug>`.
> * `/themes` — list all available themes (9 seeded plus any you've built).

### Step 4: The sidecar metadata system

Briefly explain:

> Every generated image writes a sidecar JSON to a `.meta/` subfolder next to it. The sidecar holds the prompt, ratio, theme, provider, and timestamp. So `/refine` works on any image you've ever generated, even from a year ago — you don't need the chat history. Sidecars are plain JSON, you can read or edit them by hand.

### Step 5: Offer a free dry-run

Don't burn any money in the tour itself. Offer instead:

> Want me to walk you through generating one image now? It costs about $0.04 either way. Or I can show you the *enriched prompt* for a sample idea without dispatching — that's free and shows you what the art-direction step looks like.
>
> Options:
> * `dispatch` — generate a real image now (paid)
> * `dry-run` — show the enriched prompt for a sample, no API call (free)
> * `skip` — wrap up

For `dry-run`: pick a sample subject ("a single ceramic mug of black coffee on a wooden table"), run the prompt-enrichment recipe from the `image-generation` skill to produce 2–3 direction proposals, present them with their full enriched prompts, and explain that this is the step that always happens before dispatch. No file written, no API called.

For `dispatch`: hand off to the `image-generation` skill normally.

### Step 6: Sign off and write the onboarded marker

Write a tiny marker file to suppress future auto-prompts:

* On Windows: `$env:USERPROFILE\.proofsheet\onboarded`
* On macOS/Linux: `~/.proofsheet/onboarded`

The file's contents don't matter — its existence is the signal. Create the parent dir if missing, then write any short string (e.g., the current ISO timestamp). PowerShell example:

```powershell
$dir = Join-Path $env:USERPROFILE ".proofsheet"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
Set-Content -Path (Join-Path $dir "onboarded") -Value (Get-Date -Format o) -Encoding utf8
```

Then sign off:

> You're set up. From here:
>
> * Type `/image <prompt>` to make something
> * Type `/refine <path-to-png>` to fix an existing image
> * Type `/new-theme` to build a reusable style
> * Type `/welcome` again anytime to re-run this tour
>
> Themes you build are saved to `./themes/` in whatever directory Claude Code is open in, so they travel with the project.

The marker file means the other skills will stop auto-suggesting `/welcome` from now on. Delete it (`~/.proofsheet/onboarded`) if you ever want to retrigger the tour for someone else on this machine.

## When to surface /welcome from other skills

The `image-generation`, `image-refinement`, and `theme-builder` skills should check two signals before doing anything:

1. **Onboarded marker** — does `$env:USERPROFILE\.proofsheet\onboarded` (Windows) or `~/.proofsheet/onboarded` (Unix) exist?
2. **API keys** — is at least one of `GEMINI_API_KEY` or `OPENAI_API_KEY` set?

The four resulting cases:

| Marker | Keys | What the skill does |
|---|---|---|
| Missing | Missing | Strong nudge: "Looks like first time using proofsheet. Type `tour` to run `/welcome`, or get an API key first (see https://aistudio.google.com/apikey or https://platform.openai.com/api-keys)." Do not proceed with the user's task. |
| Missing | Set | Soft prompt before proceeding: "First time using proofsheet? Type `tour` for a quick 3-minute walkthrough, or `skip` to dispatch your request. Either way, I'll only ask once." Then proceed based on their answer. |
| Exists | Missing | Standard key-missing halt with setup instructions. Don't re-suggest `/welcome` since they've already been through it. |
| Exists | Set | No mention of `/welcome`. Just do the work. |

The marker is the *one-time gate*; the key check is the *blocker*. They're independent signals.

Check the marker via Bash `test -f ~/.proofsheet/onboarded` or PowerShell `Test-Path "$env:USERPROFILE\.proofsheet\onboarded"`. Cheap check, do it at the start of every skill invocation.

## Don't

- Don't dispatch real (paid) API calls during the tour without explicit user consent. Default to dry-run.
- Don't print or echo the user's API keys.
- Don't ask the user to paste keys in chat. Tell them to set the env var directly on their system.
- Don't dump the whole walkthrough as one wall of text — pace it across 4–6 exchanges so it feels like a conversation.
- Don't replicate the entire image-generation skill's content. Reference it ("the `image-generation` skill handles the actual enrichment and dispatch") and let users invoke it directly.

## What success looks like

After a 3-minute `/welcome` flow, the user knows what proofsheet does, has at least one working API key, understands the four content commands, understands the sidecar system, and has either run a dry-run or knows exactly what to type next. They're ready to use the tool without re-reading the README.
