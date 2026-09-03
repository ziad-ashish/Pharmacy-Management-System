# Offline barcode dependency

`zxing-browser.min.js` is the unmodified UMD bundle of `@zxing/browser` 0.2.1.

Source: https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js

SHA-256: `066bc34edfcdd4a33f0964aeec967752a0dea1ccaf36e58e319ac9fcb5070f6a`

It is loaded on demand from this local folder, never from a CDN at runtime.
The browser wrapper is MIT licensed (see the adjacent license). Its bundled
ZXing decoding implementation also requires the upstream Apache-2.0 license.
