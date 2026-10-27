Real HEIC (HEVC, x265, quality 97) made from `../plates/*.jpg` with pillow-heif 1.8.1 (libheif):
`Image.open(jpg).save(out.heic, format="HEIF", quality=97, exif=...)`. The JPEG's EXIF orientation 6 is
stored as a HEIF `irot` rotation, like a phone does, so the decoded image is upright 934×2000.

At quality 80/90 the HEVC re-encode itself changes one OCR'd field (the in-browser decode still matches
pillow-heif's decode of the same file exactly); at 97 the HEIC reads the same as the source JPEG.
