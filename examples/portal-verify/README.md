# portal-verify: an outcome of a group conversation, revised and approved by the group

> **Work in progress.** This example is a copy of [`portal-explore`](../portal-explore) for now. [`PLAN.md`](PLAN.md) has the design, and [`tasks/todo.md`](tasks/todo.md) has the steps.

A group sits around one phone, which records their conversation, and Gemini transcribes it live. When someone presses **Verify** and picks a topic, Gemini writes an **outcome** from the conversation. The group reads it aloud and says what is wrong, then **Revise** writes it again, and **Approve** keeps it.

It's a port of the **Verify** feature of the dembrane portal, from `dembrane-echo`.

## Run it

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set GOOGLE_CLOUD_PROJECT
pnpm google-token                # puts `gcloud auth print-access-token` in .dev.vars
pnpm dev
```

Then open <http://localhost:8796>, pick a project name such as `demo`, and start a session.
