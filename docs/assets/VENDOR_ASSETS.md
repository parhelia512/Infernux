# Website vendor assets

These files are committed so the GitHub Pages experience does not depend on third-party font or icon CDNs at runtime.

| Local file | Upstream | Version/source | SHA-256 |
|---|---|---|---|
| `fonts/inter-latin.woff2` | Google Fonts / Inter | `fonts.gstatic.com/s/inter/v20` | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| `fonts/jetbrains-mono-latin.woff2` | Google Fonts / JetBrains Mono | `fonts.gstatic.com/s/jetbrainsmono/v24` | `83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be` |
| `fonts/space-grotesk-latin.woff2` | Google Fonts / Space Grotesk | `fonts.gstatic.com/s/spacegrotesk/v22` | `0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d` |
| `fonts/fa-solid-subset-900.woff2` | Font Awesome Free | `6.4.0`; 31-glyph site subset | `1ab0dea7613a56456bd30de51fee7d0fccb6def013fe1f46862e2eb204fba343` |
| `fonts/fa-brands-subset-400.woff2` | Font Awesome Free | `6.4.0`; GitHub + Python subset | `7d7c0b8449df96bbfdc8b4e6c6740ce2337af2c90363a5213713977df3e7ae76` |

Font license texts are preserved in `vendor-licenses/`. When any asset changes, update its version/source, checksum, license, and the static-site verifier in the same change.

## Project-authored visual assets

`infernux-social-card-0.2.1.jpg` is the reviewed 1200×630 Open Graph/X card for release 0.2.1. It is an AI-assisted raster composition made on 2026-07-16 from the repository-owned `logo.png` and the real `demo.png` editor capture. The card is presentation artwork, not benchmark evidence; the original capture remains the evidence-linked screenshot used on the homepage. Its SHA-256 is `8c3a0500bf39b50c53e0ab97c1937c6a3bb61657b328bef18f420b962fae7594`. The site verifier locks its format, dimensions, release-scoped filename, and reviewed content hash.

The homepage runtime evidence keeps `demo.png` as the canonical, structured-data and legacy-browser source, and offers two release-scoped delivery variants through `<picture>`:

| Local file | Encoding and review evidence | Bytes | SHA-256 |
|---|---|---:|---|
| `demo.png` | Original 1245×653 repository-owned editor capture | 362,447 | `e987d0ac1477896c97dae00b642df2ace4b6de06c59268528650252e831155bf` |
| `demo-0.2.1.webp` | Sharp 0.34.5 / WebP 1.6.0 lossless; decoded MAE and maximum channel error are both zero | 193,060 | `bf5cdbc260331e75ccf1519b1cc582cb4764ae101ccdbda27feb3082d71b66df` |
| `demo-0.2.1.avif` | Sharp 0.34.5 / AOM 3.13.1, quality 80, 4:4:4; decoded PSNR 47.03 dB, MAE 0.3971 and maximum channel error 20; visually reviewed against the PNG | 53,764 | `cf88c7f49c3da599003066d6059249de02a6c92cf288cd7bee2f07316a63e82d` |

AVIF is preferred, lossless WebP is the modern fallback, and PNG remains last. The image gate locks the byte content and dimensions, requires at least 80% AVIF and 40% WebP savings, verifies source ordering and preserves lazy loading. The performance budget counts the largest mutually exclusive representation, so adding fallback formats cannot hide a heavier delivered path or falsely charge one visitor for all three files.

## Font Awesome subsetting

The two Font Awesome files are generated from the official 6.4.0 `webfonts` files with the `pyftsubset` executable provided by the repository's `infernux` environment. The solid subset contains the code points declared by the first `unicode-range` in `css/fontawesome-subset.css`; the brand subset contains `U+F09B` (GitHub) and `U+F3E2` (Python). When a new icon class is introduced, regenerate the matching WOFF2, update its `unicode-range` and checksum, then run the website verifier. The verifier rejects missing CSS mappings, unexpected font hashes, and Font Awesome files large enough to indicate that a complete upstream font was restored.
