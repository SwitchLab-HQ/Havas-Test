/* Staging password page (test-havas only). Remove before the client environment:
   delete this file, assets/ui/havas-switzerland.svg and the <script src="…gate.js"> line in each page's <head>.
   Client-side only: it keeps casual visitors out, it is not real security (files stay reachable by direct URL). */
(function () {
  var KEY = 'hg_gate';
  var HASH = '18ec50a22aea4918c0e9c7856f792975f330e0cfc72ac337e589c46984ace4d6';   // SHA-256 of the password, lowercased
  try { if (localStorage.getItem(KEY) === HASH) return; } catch (e) {}

  var base = document.currentScript.src.replace(/gate\.js(\?.*)?$/, '');
  var css = document.createElement('style');
  css.textContent =
    'html.hg-locked, html.hg-locked body { background:#fff !important; overflow:hidden !important; }' +
    'html.hg-locked body > :not(#hg-gate) { display:none !important; }' +
    '#hg-gate { position:fixed; inset:0; z-index:2147483647; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center;' +
    '  gap:28px; padding:24px; font-family:-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color:#1a1a1a; }' +
    '#hg-gate img { width:min(240px, 64vw); height:auto; }' +
    '#hg-gate form { display:flex; flex-direction:column; gap:10px; width:min(280px, 100%); }' +
    '#hg-gate input { font:inherit; font-size:16px; padding:12px 14px; border:1px solid #c8c8c8; border-radius:8px; outline:none; }' +
    '#hg-gate input:focus { border-color:#1a1a1a; }' +
    '#hg-gate button { font:inherit; font-size:16px; font-weight:600; padding:12px 14px; border:0; border-radius:8px; background:#1a1a1a; color:#fff; cursor:pointer; }' +
    '#hg-gate .err { min-height:18px; font-size:13px; color:#e60000; text-align:center; }';
  document.head.appendChild(css);
  document.documentElement.classList.add('hg-locked');

  function sha256(s) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function build() {
    var g = document.createElement('div'); g.id = 'hg-gate';
    g.innerHTML = '<img alt="Havas Switzerland" src="' + base + 'assets/ui/havas-switzerland.svg">' +
      '<form><input type="password" placeholder="Password" autocomplete="current-password" aria-label="Password">' +
      '<button type="submit">Enter</button><div class="err"></div></form>';
    document.body.appendChild(g);
    var input = g.querySelector('input'), err = g.querySelector('.err');
    g.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      sha256(input.value.trim().toLowerCase()).then(function (h) {
        if (h !== HASH) { err.textContent = 'Wrong password'; input.select(); return; }
        try { localStorage.setItem(KEY, HASH); } catch (x) {}
        location.reload();   // start the page fresh, unlocked
      });
    });
    input.focus();
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
