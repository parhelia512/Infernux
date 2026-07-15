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

### Install and touch icons

The install icons are deterministic, project-authored derivatives of the repository-owned `logo.png`; they do not introduce an external artwork source or license. Pillow 12.2.0 in the repository `infernux` environment resized the source with Lanczos sampling, composited it over the site background `#0a0c11`, and wrote optimized 256-color opaque PNGs. The standalone maskable asset keeps the complete emblem inside the Web App Manifest safe-zone circle (radius 40% of the canvas); it is intentionally more padded than the ordinary launcher icons.

| Local file | Role and geometry | Bytes | SHA-256 |
|---|---|---:|---|
| `infernux-icon-192.png` | Chromium install icon; 192×192, opaque | 10,064 | `edfa0d3e709db4ac3100978575147579d4ccdb63c695c3d551e78bc7891c0f4a` |
| `infernux-icon-512.png` | Chromium install/splash icon; 512×512, opaque | 49,570 | `9f73c451f95f09decaf95702971099c1a6237a8e454c293f201dddfc7473e280` |
| `infernux-icon-maskable-512.png` | Adaptive launcher icon; 512×512, opaque, safe-zone padded | 25,603 | `54c43fee25612ce3d2d0fa4f14cff5191149201faa2d97d0b834860bfd3fbcc1` |
| `infernux-apple-touch-icon.png` | Apple home-screen icon; 180×180, opaque | 9,163 | `a4e54a3d319ab3badace561328c94233c07fc3181b116ca137033a68a31de7f5` |

`docs/tools/check-pwa-assets.mjs` locks each file's PNG signature, dimensions, opacity, reviewed hash, manifest role, HTML link, provenance, and Service Worker precache entry. Regenerate and review the complete set together if the emblem or background color changes.

## Font Awesome subsetting

The two Font Awesome files are generated from the official 6.4.0 `webfonts` files with the `pyftsubset` executable provided by the repository's `infernux` environment. The solid subset contains the code points declared by the first `unicode-range` in `css/fontawesome-subset.css`; the brand subset contains `U+F09B` (GitHub) and `U+F3E2` (Python). When a new icon class is introduced, regenerate the matching WOFF2, update its `unicode-range` and checksum, then run the website verifier. The verifier rejects missing CSS mappings, unexpected font hashes, and Font Awesome files large enough to indicate that a complete upstream font was restored.
