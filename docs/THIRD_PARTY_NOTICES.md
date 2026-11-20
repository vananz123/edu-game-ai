# Third-party notices

EduGame Studio bundles third-party artwork and fonts so a saved game plays with
no network. Everything listed here ships inside the installer; nothing is
fetched at runtime.

## Twemoji

- Used for: the 41 question/scene icons (`src/shared/emoji-art.generated.ts`),
  which appear in the editor, the play stage, and inside `.egame` files as ids.
- Source: <https://github.com/jdecked/twemoji> (`assets/svg/<codepoint>.svg`)
- Copyright 2020 Twitter, Inc and other contributors
- Licence: graphics **CC BY 4.0**, code MIT
- Modifications: the SVG body only is embedded; internal SVG ids are prefixed
  with `e-<icon>-` so the same art can appear twice on one page; the root
  element is re-emitted with `stroke="none"` so flat shapes are not outlined by
  our icon CSS. Bodies are otherwise unchanged.
- Regenerated with `node scripts/fetch-emoji-art.js` (maintenance only; it is
  the only script that uses the network and it is not part of `npm run build`).

```
Twemoji graphics are licensed under the Creative Commons Attribution 4.0
International licence: https://creativecommons.org/licenses/by/4.0/

Copyright 2020 Twitter, Inc and other contributors.
```

## Lucide — interface icons

- Used for: every non-scene icon (toolbar, buttons, status chips) —
  `src/shared/icon-registry.ts`.
- Source: <https://lucide.dev>, `lucide@1.61.0`
- Copyright (c) Lucide Contributors
- Licence: ISC
- Modifications: only the SVG node arrays are reproduced; no Lucide runtime
  code is vendored and Lucide is not a project dependency.

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part
of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
Contributors 2022-2026.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```
