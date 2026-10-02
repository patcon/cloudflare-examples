# portal-explore: a short reply to a group conversation, when asked

Work in progress. A port of the dembrane portal's Explore feature, based on [`polis-statement-extraction`](../polis-statement-extraction). See [`tasks/plan.md`](tasks/plan.md) for the plan.

## Run it

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set GOOGLE_CLOUD_PROJECT
pnpm google-token                # puts `gcloud auth print-access-token` in .dev.vars
pnpm dev
```

Then open <http://localhost:8795>, pick a project name such as `demo`, and start a session.
