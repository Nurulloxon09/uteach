# Web fonts

Self-hosted so `next build` never downloads fonts (the Google Fonts fetch made CI builds flaky). Loaded with
`next/font/local` in `src/app/[locale]/layout.tsx`.

| File                             | Family                            | Subsets           | Source                                                                                         |
| -------------------------------- | --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `PlusJakartaSans-Variable.woff2` | Plus Jakarta Sans, the app's font | latin + latin-ext | `google/fonts` `ofl/plusjakartasans/PlusJakartaSans[wght].ttf` (v2.071), subset with fontTools |
| `Manrope-Variable.woff2`         | Manrope, fallback for Cyrillic    | cyrillic          | Google Fonts `cyrillic` file (Manrope v20, font version 4.504), unchanged                      |

Both are variable fonts (`wght` 200–800; the app uses 400–800). Plus Jakarta Sans has no basic Cyrillic, which is
why Manrope is in the stack for Russian (05-ui §3). The `unicode-range` set in the layout matches Google's subsets.

`fallback.css` declares the metric-adjusted Arial fallbacks with the exact numbers `next/font/google` used
(`adjustFontFallback` is off; `next/font/local` would measure the files and get ~0.7% wider Cyrillic). Known gap,
kept on purpose so this switch changes nothing: the Jakarta fallback face covers every code point and comes before
Manrope, so Cyrillic text is drawn by the adjusted Arial and Manrope never loads.

Licenses: SIL Open Font License, Version 1.1 — `OFL-PlusJakartaSans.txt` (Copyright 2020 The Plus Jakarta Sans
Project Authors) and `OFL-Manrope.txt` (Copyright 2018 The Manrope Project Authors). The OFL allows bundling and
redistributing the fonts with software; the license text must travel with them, and modified versions may not
use the Reserved Font Names (neither font declares one).

To rebuild the Jakarta file:

```sh
pyftsubset "PlusJakartaSans[wght].ttf" --flavor=woff2 --layout-features='*' \
  --unicodes="<latin + latin-ext ranges from layout.tsx>" --output-file=PlusJakartaSans-Variable.woff2
```
