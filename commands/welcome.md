First-run tutorial for proofsheet. Use the `proofsheet-onboarding` skill for the workflow.

Walks you through what proofsheet does, checks which API keys are set on your machine, helps set up missing ones, demos each command (`/proofsheet:image`, `/proofsheet:refine`, `/proofsheet:new-theme`, `/proofsheet:themes`), and offers a free dry-run before any actual paid image. Takes about 3 minutes.

Re-run `/proofsheet:welcome` anytime to see the tour again, or to retrigger it on a fresh install delete the marker file at `~/.proofsheet/onboarded` (Unix) or `$env:USERPROFILE\.proofsheet\onboarded` (Windows).

## Usage

- `/proofsheet:welcome` — run the full tour
- `/proofsheet:welcome image` — skip ahead to the `/proofsheet:image` section
- `/proofsheet:welcome refine` — skip ahead to `/proofsheet:refine`
- `/proofsheet:welcome themes` — skip ahead to themes
