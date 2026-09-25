/**
 * Admin site settings -- the web twin of mobile/src/config.ts.
 *
 * API_BASE is a path, not a full URL, so the page finds the API relative to
 * wherever it is being served from. That one value is the only thing that
 * changes between the live domain, devproxy.js and a local PHP server.
 *
 * Your hosting has the PHP files in public_html itself:
 *
 *   public_html/login.php, medicines.php, upload.php, uploads/ ...
 *   public_html/admin/     index.html, admin.js, config.js   <-- you are here
 *
 * so the API is one folder up:  '..'
 *
 * If you ever move the PHP into a subfolder (public_html/api/, the layout the
 * README describes), change this to '../api' and nothing else.
 *
 * Use a full URL only when this page is served from a different host than the
 * API -- e.g. 'http://192.168.1.5:8080' while developing against devproxy.js
 * from another machine.
 *
 * API_KEY must match API_KEY in config.php exactly.
 */
window.MEDISHOP_CONFIG = {
  API_BASE: '..',
  API_KEY: 'med_WLLHUGTdOcmcG3oduG7oDIR0RgdHd620',
};
