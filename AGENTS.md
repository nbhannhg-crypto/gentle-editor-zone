<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Technical decisions

- Direct server-fn calls from components (not via useServerFn) must wrap the payload: `myFn({ data: payload })` — plain `myFn(payload)` reaches inputValidator as undefined and fails with "expected object, received undefined".

- External AI keys (GEMINI_KEYS rotation, then OPENROUTER_KEY) live in src/lib/ai-keys.server.ts and are tried first; brain factory, WhatsApp AI replies and customer media never fall back to the built-in gateway (show a busy message / stay silent instead) — why: the owner forbids platform-credit spend there.
