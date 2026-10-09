# Where these files come from

Everything here is at the path it has under `dembrane/frontend/src/` in [dembrane-echo](https://github.com/Dembrane/echo), so echo's `@/` imports resolve as they are. There are three kinds of file.

## Copied from echo, as they are

[`scripts/echo-files.sh`](../../../scripts/echo-files.sh) lists them, and copies them from the commit in [`scripts/echo-ref`](../../../scripts/echo-ref). `scripts/echo-files.sh diff` shows any difference from echo; there's none, except in `tailwind.config.js` (at the example's root, as in echo's frontend), whose import of `./src/colors` and `content` paths are marked `// example:`.

Biome skips them (`biome.jsonc`), so they keep echo's formatting.

The packages these copies need are pinned to echo's versions, in `package.json`:

- `@types/hast` 3.0.4, through `pnpm.overrides`: Markdown.tsx's footnote options don't typecheck against 3.0.5.
- `zod` 3.24.2, and `pnpm.packageExtensions` giving `@hookform/resolvers` it as a peer, since `agents` brings in zod 4, which the resolver's types would otherwise find.
- `react-markdown` 9, whose `className` prop Markdown.tsx uses.

## Ours, at echo's paths

Each starts with `// example: ours`. They stand in for echo's files that need its API, its router, its languages or its workspace, with only what the copied files use:

| File | Stands in for |
|---|---|
| `config.ts` | Deployment values. `USE_PARTICIPANT_ROUTER` is picked by path, since echo builds the portal as its own app and this app is one |
| `components/participant/hooks/index.ts` | echo's participant queries. The project comes from this app's `ProjectAgent`; the session page puts its transcript and Explore's replies in echo's query keys |
| `lib/api.ts` | echo's API client: `initiateConversation` picks a session ID and keeps its name for the session page. Deleting a response throws; this app keeps everything said |
| `lib/types.d.ts`, `lib/typesDirectus.d.ts` | The few API and Directus types the copies use, as globals, as in echo |
| `hooks/useLanguage.ts`, `components/layout/I18nProvider.tsx` | Languages: English only |
| `hooks/useI18nNavigate.ts`, `components/common/i18nLink.tsx` | Links that keep the language in the path: plain links here |
| `hooks/useWhitelabelLogo.tsx`, `lib/avatar.ts` | A workspace's own logo: there's none |
| `components/participant/ParticipantShareModal.tsx` | The share modal, without echo's QR code |
| `components/participant/DembraneEventCta.tsx` | The invitation to dembrane's events: nothing |
| `components/error/ErrorNotice.tsx` | echo's explained API errors: the error's message |

## Shims

`shims/` stands in for packages, through aliases in `vite.config.ts` and `tsconfig.client.json`:

- `@lingui/core/macro`, `@lingui/react/macro`: every message is its English source text.
- `react-router`: reads the URL; navigating loads the page. `OutletProvider` puts a page in echo's layout's `<Outlet />`.
- `posthog-js`: sends nothing.

## Left out

- echo's recording screen, `ParticipantConversationAudio.tsx`, is too tied to its chunked upload recorder to copy. Its record bar is rebuilt from its markup in `src/client/pages/Session.tsx`, around this app's recorder.
- Text input, the verify and refine routes, the S3 connectivity check, the interruption modal, tags, email opt-in, and dark mode.
