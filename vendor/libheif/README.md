# libheif (HEIC/HEIF decoder), self-hosted

- Package: [`libheif-js`](https://www.npmjs.com/package/libheif-js) **1.19.8** (npm), file `libheif-wasm/libheif-bundle.mjs`
  - Emscripten build of [libheif](https://github.com/strukturag/libheif) 1.19.x with libde265 (HEVC decoder); the WebAssembly is inlined in the single ES module.
  - Size: 1,461,926 bytes (uncompressed).
- License: **LGPL-3.0** (libheif, libde265 and the libheif-js wrapper). See `LICENSE` (libheif-js) and `LICENSE.libheif` (libheif's license file).
  The file is unmodified; to replace it, download the same file from any newer `libheif-js` release.
- Used by `tools/heic.js`: imported with `import()` only when the picked photo is HEIC/HEIF. It is precached by `sw.js` so it works offline, but it is never loaded for JPEG/PNG photos.
