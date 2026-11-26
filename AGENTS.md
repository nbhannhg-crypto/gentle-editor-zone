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

- Phone voice comparison profiles live in a browser-safe helper; the legacy profile stays the default, and natural TTS uses a separate vault synthesis profile so comparison never reuses legacy audio.

- Direct server-fn calls from components (not via useServerFn) must wrap the payload: `myFn({ data: payload })` — plain `myFn(payload)` reaches inputValidator as undefined and fails with "expected object, received undefined".

- External AI keys (GEMINI_KEYS rotation, then OPENROUTER_KEY) live in src/lib/ai-keys.server.ts; all text/vision/transcription AI (queen brain, suggestions, reports, studio, brain factory, WhatsApp, media) never falls back to the built-in gateway (show a busy message / stay silent instead) — why: the owner forbids platform-credit spend. Only the `speak` TTS still uses the gateway.

- Image/video design generation (DesignStudio) calls fal.ai server-side via FAL_KEY in src/lib/design.functions.ts; results are saved to the existing media-library bucket/table — why: owner chose fal.ai and forbids platform-credit spend.

- Phone preview and calls share synthesis settings; preview audio goes only to a local monitor gain, independent of the call destination, so testing never sends audio to a customer.
- Incoming phone audio and local previews use a Web Audio monitor gain instead of relying on mobile HTML audio volume; microphone gain stays zero until the call is active.
- Phone calls use a cloned direct microphone track normally and switch the negotiated RTP sender to a mono mixer for synthesized or saved audio; keep capture separate, recreate stopped mixer destinations, and restore the direct track afterward — SDK teardown must not kill recognition or strand generated audio on an ended track.
- Phone recognition and SDK callbacks must belong to the current recognizer/client; recover detached audio senders through their audio transceiver — late callbacks must not generate or reroute speech after stopping or reconnecting.
- Phone push-to-talk records a clone of the existing capture track during calls and uses authenticated external-key transcription; cancellation invalidates late results and never stops the underlying call capture — avoid competing microphone recognition sessions.

- SMS uses a shared browser-safe segment/number helper and an authenticated owner-only module; save store-scoped drafts before submission, atomically claim them, and use carrier idempotency keys — prevent duplicate billing and preserve uncertain outcomes without automatic retries.
- SMS senders come from carrier messaging settings, not voice caller IDs; validate domestic/international capabilities before submission, and derive estimates only from delivered messages to the same recipient/sender — avoid unsupported routes and fabricated prices.
