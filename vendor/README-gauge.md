# Vendored libraries for "Import gauge report"

Self-hosted so the import works offline and makes no off-origin requests. Both are lazy-loaded
(only when a PDF / XLSX is opened) and precached by sw.js.

| Library | Version | Files | Size (bytes) | License | Source |
|---|---|---|---|---|---|
| pdf.js (pdfjs-dist, legacy build) | 5.6.205 | pdfjs/pdf.min.mjs | 491,666 | Apache-2.0 (pdfjs/LICENSE) | https://www.npmjs.com/package/pdfjs-dist — `legacy/build/` |
| | | pdfjs/pdf.worker.min.mjs | 1,298,206 | | |
| fflate | 0.8.3 | fflate/fflate.mjs | 90,922 | MIT (fflate/LICENSE) | https://www.npmjs.com/package/fflate — `esm/browser.js` |

Only `unzipSync` from fflate is used (XLSX is a zip; sheet XML is read by tools/gauge-parse.js).
pdf.js is used only for `getTextContent()`; no cMaps or standard fonts are loaded (no URLs passed).
Files are unmodified from the npm tarballs. Update: replace the files, update this table, bump the cache version.
