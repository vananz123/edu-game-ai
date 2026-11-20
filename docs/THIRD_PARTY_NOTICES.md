# Third-party notices

EduGame Studio bundles third-party artwork and fonts so a saved game plays with
no network. Everything listed here ships inside the installer; nothing is
fetched at runtime.

## Microsoft Fluent Emoji — Flat style

- Used for: the 41 question/scene icons (`src/shared/emoji-art.generated.ts`),
  which appear in the editor, the play stage, and inside `.egame` files as ids.
- Source: <https://github.com/microsoft/fluentui-emoji> (`assets/*/Flat/*.svg`)
- Copyright (c) Microsoft Corporation
- Licence: MIT
- Modifications: the SVG body only is embedded (no PNG/3D variants, no emoji
  font); internal SVG ids are prefixed with `e-<icon>-` so the same art can
  appear twice on one page; the root element is re-emitted with
  `stroke="none"` so flat shapes are not outlined by our icon CSS.
- Regenerated with `node scripts/fetch-emoji-art.js` (maintenance only; it is
  the only script that uses the network and it is not part of `npm run build`).

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
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
