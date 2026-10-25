# Vendored Tesseract.js (on-device OCR for "Scan data plate")

All OCR runs in the browser. These files are served from this repo (same origin)
and precached by `sw.js`. No CDN is used, and no image ever leaves the phone.

| File | Source (npm, pinned) | Version | License | Size |
|---|---|---|---|---|
| `tesseract.min.js` | `tesseract.js` dist | 7.0.0 | Apache-2.0 (`LICENSE-tesseract.js.md`) | 63 KB |
| `worker.min.js` | `tesseract.js` dist | 7.0.0 | Apache-2.0 | 111 KB |
| `core/tesseract-core-lstm.wasm.js` | `tesseract.js-core` (no SIMD) | 7.0.0 | Apache-2.0 (`LICENSE-tesseract.js-core`) | 3.9 MB |
| `core/tesseract-core-simd-lstm.wasm.js` | `tesseract.js-core` (SIMD) | 7.0.0 | Apache-2.0 | 3.9 MB |
| `core/tesseract-core-relaxedsimd-lstm.wasm.js` | `tesseract.js-core` (relaxed SIMD) | 7.0.0 | Apache-2.0 | 3.9 MB |
| `lang/eng.traineddata.gz` | `@tesseract.js-data/eng` `4.0.0_best_int/` | 1.0.0 (tessdata 4.0.0 best, int-quantized) | package MIT; the model comes from tesseract-ocr/tessdata, Apache-2.0 | 2.9 MB |

Upstream: https://github.com/naptha/tesseract.js, https://github.com/naptha/tesseract.js-core,
https://github.com/naptha/tessdata, https://github.com/tesseract-ocr/tessdata

SHA-256:
```
000c27d9cd0def655f77b36c72a389c0ab13793aa31cb4d7aab56d09c0afbc7e  tesseract.min.js
576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d  worker.min.js
eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680  core/tesseract-core-lstm.wasm.js
c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38  core/tesseract-core-simd-lstm.wasm.js
861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3  core/tesseract-core-relaxedsimd-lstm.wasm.js
45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  lang/eng.traineddata.gz
```

## Why these files only
We run Tesseract in LSTM-only mode (OEM 1), so only the `*-lstm` cores are needed.
The worker picks the variant at runtime from the device's WebAssembly feature
support (relaxed SIMD, then SIMD, then plain), so all three are shipped. Each
`.wasm.js` embeds its wasm, so no separate `.wasm` files are needed.
The non-LSTM cores and the 11 MB legacy+LSTM `4.0.0` language file are left out.

## Size
About 15 MB in total, all precached by the service worker on first visit. That's
roughly 15 MB of phone storage and a one-time 15 MB download (GitHub Pages
gzips the `.js` files over the wire). It's the price of OCR that works offline.

## Updating
`npm pack tesseract.js@X tesseract.js-core@X @tesseract.js-data/eng@Y`, copy the
same files over, update this table and the hashes, and bump `VERSION` and the
`?v=` URLs in `sw.js`.
