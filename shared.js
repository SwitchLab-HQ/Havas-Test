// shared.js — Hasbro · The Mini Games
// Session (players + scores, sessionStorage), settings (localStorage), points, ranking,
// sound, feedback, i18n, and the in-game shell shared by all 4 games
// (header X · logo · ❚❚, G1 Loading, How to play, G2 Up next, G3 Leaderboard update,
// G4 Pause, G5 Quit, G6 Rotate). Spec: Figma "-- Wireframes - 01", board 03 - Game Shell.

var HG = (function () {
  var PLAYERS_KEY = 'hg_players';   // sessionStorage: ['Léa','Sam',…] (player-list order)
  var SCORES_KEY  = 'hg_scores';    // sessionStorage: { name: { twister: n, … } }
  var LAST_KEY    = 'hg_last_round';// sessionStorage: what G3 animates
  var SOUND_KEY   = 'hg_sound';     // localStorage: '1' | '0'
  var LANG_KEY    = 'hg_lang';      // localStorage: manual language pick
  var TERMS_KEY   = 'hg_terms';     // localStorage: accepted terms version
  var TERMS_VERSION = 'v1';         // bump to re-ask (route ④)
  var MAX_TOTAL = 9999;

  var GAMES = {
    cluedo:    { name: 'Cluedo',    path: 'games/cluedo/' },
    connect4:  { name: 'Connect 4', path: 'games/connect4/' },
    twister:   { name: 'Twister',   path: 'games/twister/' },
    operation: { name: 'Operation', path: 'games/operation/' }
  };

  function sGet(store, key, fallback) {
    try { var v = store.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function sSet(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // ── Players ──────────────────────────────────────────────
  function getPlayers() { return sGet(sessionStorage, PLAYERS_KEY, []); }
  function hasPlayers() { return getPlayers().length >= 1; }

  // renames: { oldName: newName } — rename keeps the points. Removed players lose theirs.
  function setPlayers(names, renames) {
    var scores = getScores(), next = {};
    renames = renames || {};
    names.forEach(function (n) {
      var from = null;
      Object.keys(renames).forEach(function (old) { if (renames[old] === n) from = old; });
      next[n] = scores[from !== null ? from : n] || {};
    });
    sSet(sessionStorage, PLAYERS_KEY, names);
    sSet(sessionStorage, SCORES_KEY, next);
  }

  function sameName(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }

  // ── Scores ───────────────────────────────────────────────
  function getScores() { return sGet(sessionStorage, SCORES_KEY, {}); }

  function totalOf(name, scores) {
    scores = scores || getScores();
    var per = scores[name] || {}, t = 0;
    Object.keys(per).forEach(function (g) { t += per[g]; });
    return Math.min(MAX_TOTAL, Math.round(t));
  }

  function totals() {
    var scores = getScores(), out = {};
    getPlayers().forEach(function (n) { out[n] = totalOf(n, scores); });
    return out;
  }

  function anyScore() {
    var t = totals();
    return Object.keys(t).some(function (n) { return t[n] > 0; });
  }

  // Commit a COMPLETE round: points = { name: 0–100 }. Every play adds (never overwrites).
  // Called once per round, at the game's results screen. An abandoned round never gets here.
  function commitRound(game, points) {
    var before = totals();
    var scores = getScores();
    Object.keys(points).forEach(function (name) {
      if (!scores[name]) scores[name] = {};
      var pts = Math.max(0, Math.min(100, points[name]));
      scores[name][game] = (scores[name][game] || 0) + pts;
    });
    sSet(sessionStorage, SCORES_KEY, scores);
    sSet(sessionStorage, LAST_KEY, { game: game, before: before, gained: points });
  }

  // Legacy single-score API, kept for compatibility: adds, never overwrites.
  function recordScore(name, game, value) {
    var p = {}; p[name] = value; commitRound(game, p);
  }

  function getLastRound() { return sGet(sessionStorage, LAST_KEY, null); }

  // Clear leaderboard (05e): everyone back to 0, players kept.
  function clearScores() {
    var next = {};
    getPlayers().forEach(function (n) { next[n] = {}; });
    sSet(sessionStorage, SCORES_KEY, next);
    try { sessionStorage.removeItem(LAST_KEY); } catch (e) {}
  }

  // ── Points & ranking ─────────────────────────────────────
  // Speed curve, same in every timed game: 1 at or under par, 0 at the slow time.
  function speed(t, par, slow) {
    return Math.max(0, Math.min(1, (slow - t) / (slow - par)));
  }

  // Dense ranking with shared places: 1, 2, 3, 3, 4.
  // items keep their incoming order among equals (pass them in play order / player-list order).
  // cmp(a, b) < 0 means a ranks above b; 0 means a tie.
  function rank(items, cmp) {
    var sorted = items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) { return cmp(a.it, b.it) || (a.i - b.i); });
    var place = 0, prev = null;
    return sorted.map(function (s) {
      if (prev === null || cmp(prev, s.it) !== 0) place++;
      prev = s.it;
      return { item: s.it, place: place };
    });
  }

  function ordinal(n) {
    if (getLang() === 'fr') return n === 1 ? '1er' : n + 'e';
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function fmtSec(ms) { return (ms / 1000).toFixed(1) + ' s'; }

  // ── Settings ─────────────────────────────────────────────
  function soundOn() { return sGet(localStorage, SOUND_KEY, 1) !== 0; }
  function setSound(on) { sSet(localStorage, SOUND_KEY, on ? 1 : 0); }

  function termsAccepted() { return sGet(localStorage, TERMS_KEY, null) === TERMS_VERSION; }
  function termsOutdated() {
    var v = sGet(localStorage, TERMS_KEY, null); return v !== null && v !== TERMS_VERSION;
  }
  function acceptTerms() { sSet(localStorage, TERMS_KEY, TERMS_VERSION); }

  // How to play is auto-shown the first time a game is opened in a session.
  function seen(game) { return sGet(sessionStorage, 'hg_seen_' + game, false); }
  function markSeen(game) { sSet(sessionStorage, 'hg_seen_' + game, true); }

  // ── i18n ─────────────────────────────────────────────────
  // Supported languages. Add one here + its dictionary below.
  var LANGUAGES = [
    { code: 'en', native: 'English',  names: { en: 'English', fr: 'Anglais' } },
    { code: 'fr', native: 'Français', names: { en: 'French',  fr: 'Français' } }
  ];

  var STRINGS = {
    en: {
      quit_title: 'Quit?', quit_body: 'All rounds and scores from this game will be lost.',
      keep_playing: 'Keep playing', quit: 'Quit',
      paused: 'Paused', timer_stopped: 'timer stopped', turn_of: "{name}'s turn",
      resume: 'Resume', sound: 'Sound', on: 'On', off: 'Off', how_to_play: 'How to play',
      got_it: 'Got it', close: 'Close',
      rotate_title: 'Turn your phone upright', rotate_body: 'The game is paused.',
      loading_game: 'Loading {game}…', load_fail: "Couldn't load the game",
      retry: 'Retry', back_home: 'Back to home',
      up_next: 'Up next:', turn_x_of_y: 'Turn {x} of {y}', lets_play: "Let's play!", pts: 'pts',
      lb_after: 'Leaderboard · after {game}', play_again_game: 'Play {game} again', back_to_games: 'Back to games',
      leaderboard: 'Leaderboard', finish: 'Finish', play_again: 'Play again', next: 'Next', see_leaderboard: 'See leaderboard',
      step: 'Step {n}'
    },
    fr: {
      quit_title: 'Quitter ?', quit_body: 'Toutes les manches et les points de ce jeu seront perdus.',
      keep_playing: 'Continuer', quit: 'Quitter',
      paused: 'Pause', timer_stopped: 'chrono arrêté', turn_of: 'Au tour de {name}',
      resume: 'Reprendre', sound: 'Son', on: 'Oui', off: 'Non', how_to_play: 'Comment jouer',
      got_it: 'Compris', close: 'Fermer',
      rotate_title: 'Remets ton téléphone droit', rotate_body: 'Le jeu est en pause.',
      loading_game: 'Chargement de {game}…', load_fail: 'Impossible de charger le jeu',
      retry: 'Réessayer', back_home: "Retour à l'accueil",
      up_next: 'À TOI :', turn_x_of_y: 'Tour {x} sur {y}', lets_play: "C'est parti !", pts: 'pts',
      lb_after: 'Classement · après {game}', play_again_game: 'Rejouer à {game}', back_to_games: 'Retour aux jeux',
      leaderboard: 'Classement', finish: 'Terminer', play_again: 'Rejouer', next: 'Suivant', see_leaderboard: 'Voir le classement',
      step: 'Étape {n}'
    }
  };
  var extra = {}; // pages register their own dictionaries with HG.addStrings

  function detectLang() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i]).slice(0, 2).toLowerCase();
      if (LANGUAGES.some(function (l) { return l.code === code; })) return code;
    }
    return 'en';
  }
  function manualLang() { return sGet(localStorage, LANG_KEY, null); }
  function getLang() {
    var m = manualLang();
    return (m && LANGUAGES.some(function (l) { return l.code === m; })) ? m : detectLang();
  }
  function setLang(code) {
    if (code === null) { try { localStorage.removeItem(LANG_KEY); } catch (e) {} }
    else sSet(localStorage, LANG_KEY, code);
    document.documentElement.lang = getLang();
  }
  function addStrings(dicts) {
    Object.keys(dicts).forEach(function (l) {
      extra[l] = extra[l] || {};
      Object.keys(dicts[l]).forEach(function (k) { extra[l][k] = dicts[l][k]; });
    });
  }
  function t(key, vars) {
    var l = getLang();
    var s = (extra[l] && extra[l][key]) || (STRINGS[l] && STRINGS[l][key]) ||
            (extra.en && extra.en[key]) || STRINGS.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  // ── Device ───────────────────────────────────────────────
  function isMobile() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || navigator.maxTouchPoints > 1;
  }

  // ── Utils ────────────────────────────────────────────────
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // Fires on touchend or click, once. Works while another finger is already down
  // (iOS doesn't synthesise click for a 2nd-finger tap).
  // A touch that moved (a swipe / scroll) is not a tap: scrolling a list never opens what's under the finger.
  var TAP_SLOP = 10;
  function onTap(node, fn) {
    var lastTouch = 0, start = null;
    node.addEventListener('touchstart', function (e) {
      var t = e.changedTouches[0], sc = e.target.closest && e.target.closest('.hg-scroll');
      start = { id: t.identifier, x: t.clientX, y: t.clientY, moved: false, sc: sc, top: sc ? sc.scrollTop : 0 };
    }, { passive: true });
    node.addEventListener('touchmove', function (e) {
      if (!start) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === start.id && Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_SLOP) start.moved = true;
      }
    }, { passive: true });
    node.addEventListener('touchend', function (e) {
      lastTouch = Date.now();
      var s = start; start = null;
      if (s && (s.moved || (s.sc && Math.abs(s.sc.scrollTop - s.top) > 2))) return;   // it was a swipe
      e.preventDefault(); e.stopPropagation();
      fn(e);
    }, { passive: false });
    node.addEventListener('touchcancel', function () { start = null; lastTouch = Date.now(); }, { passive: true });
    node.addEventListener('click', function (e) {
      if (Date.now() - lastTouch < 600) return;
      fn(e);
    });
  }

  // Wall-clock stopwatch that can be frozen (G4 / G5 / G6).
  function Clock() {
    var start = 0, acc = 0, running = false;
    return {
      start: function () { acc = 0; start = performance.now(); running = true; },
      pause: function () { if (running) { acc += performance.now() - start; running = false; } },
      resume: function () { if (!running) { start = performance.now(); running = true; } },
      stop: function () { this.pause(); },
      ms: function () { return acc + (running ? performance.now() - start : 0); },
      running: function () { return running; }
    };
  }

  // ── Sound (synthesised, no files) ────────────────────────
  var actx = null;
  function audio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  var SOUNDS = {
    tick:    [[880, 0.06, 'square', 0.05]],
    go:      [[1320, 0.18, 'square', 0.06]],
    step:    [[660, 0.07, 'triangle', 0.12], [990, 0.09, 'triangle', 0.12]],
    success: [[523, 0.1, 'triangle', 0.14], [659, 0.1, 'triangle', 0.14], [784, 0.18, 'triangle', 0.14]],
    fail:    [[300, 0.14, 'sawtooth', 0.08], [200, 0.22, 'sawtooth', 0.08]],
    buzz:    [[110, 0.28, 'sawtooth', 0.12]],
    drop:    [[440, 0.05, 'triangle', 0.1]],
    swap:    [[720, 0.05, 'sine', 0.12]]
  };
  function play(name) {
    if (!soundOn()) return;
    var ctx = audio(); if (!ctx) return;
    var tm = ctx.currentTime;
    (SOUNDS[name] || []).forEach(function (n) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = n[2]; o.frequency.value = n[0];
      g.gain.setValueAtTime(n[3], tm);
      g.gain.exponentialRampToValueAtTime(0.0001, tm + n[1]);
      o.connect(g); g.connect(ctx.destination);
      o.start(tm); o.stop(tm + n[1] + 0.02);
      tm += n[1];
    });
  }
  function unlockAudio() { audio(); }

  // Feedback: vibration where supported (Android); shake + colour flash + sound everywhere.
  function feedback(kind, target) {
    kind = kind || 'fail';
    play(kind === 'buzz' ? 'buzz' : 'fail');
    if (navigator.vibrate) { try { navigator.vibrate(kind === 'buzz' ? 120 : [80, 40, 80]); } catch (e) {} }
    var node = target || document.body;
    node.classList.remove('hg-shake'); void node.offsetWidth; node.classList.add('hg-shake');
    var flash = document.getElementById('hg-flash');
    if (!flash) { flash = el('div'); flash.id = 'hg-flash'; document.body.appendChild(flash); }
    flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
  }

  // Multi-touch safe page: no pinch, no double-tap zoom, no rubber-band scroll.
  function lockGestures() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove', function (e) {
      var s = e.target.closest && e.target.closest('.hg-scroll');
      if (!s || e.touches.length > 1) e.preventDefault();
    }, { passive: false });
  }

  // ── UI building blocks (Design UI) ───────────────────────
  // Root of the site, so pages at any depth can reach assets/ui/…
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.getAttribute('src') || 'shared.js';
    return s.replace(/shared\.js.*$/, '');
  })();
  function asset(p) { return ROOT + p; }

  // Mini monsters, one per player by player-list position (Figma order of the Players screen).
  var MONSTERS = [
    ['08', '#0094da'], ['07', '#ee6ba3'], ['22', '#a7c919'], ['18', '#ffdd00'],
    ['09', '#4ec6e0'], ['06', '#ffdd00'], ['03', '#4ec6e0'], ['15', '#ee6ba3'], ['12', '#ffdd00']
  ];
  function monsterOf(name) {
    var i = getPlayers().indexOf(name);
    if (i < 0) { i = 0; for (var k = 0; k < name.length; k++) i += name.charCodeAt(k); }
    return MONSTERS[i % MONSTERS.length];
  }
  function avatar(name, cls, index) {
    var m = index !== undefined ? MONSTERS[index % MONSTERS.length] : monsterOf(name);
    var a = el('span', 'hg-avatar' + (cls ? ' ' + cls : ''));
    a.style.background = m[1];
    var img = el('img'); img.src = asset('assets/ui/monsters/monster-' + m[0] + '.webp'); img.alt = '';
    a.appendChild(img);
    return a;
  }
  // Dark name tag. opts: { pts, big }
  function tag(name, opts) {
    opts = opts || {};
    var t = el('div', 'hg-tag' + (opts.big ? ' lg' : ''));
    if (opts.big) {
      t.appendChild(avatar(name));
      var txt = el('div', 'hg-tag-txt');
      txt.appendChild(el('div', 'hg-tag-name', name));
      if (opts.pts !== undefined) {
        var p = el('div', 'hg-tag-pts', String(opts.pts)); p.appendChild(el('small', null, 'pts')); txt.appendChild(p);
      }
      t.appendChild(txt);
    } else {
      t.appendChild(el('div', 'hg-tag-name', name));
      if (opts.pts !== undefined) { var q = el('div', 'hg-tag-pts', String(opts.pts)); q.appendChild(el('small', null, 'pts')); t.appendChild(q); }
    }
    return t;
  }
  // Ranked row. right: array of [className|null, text] or a Node. place null → empty badge.
  function rankRow(place, name, right, opts) {
    opts = opts || {};
    var r = el('div', 'hg-rank' + (place === null ? ' dim' : ''));
    var row = el('div', 'hg-rank-row');
    row.appendChild(avatar(name, 'sm'));
    var nm = el('div', 'hg-rank-name', name);
    if (opts.pts !== undefined) { var sm = el('small', null, String(opts.pts)); sm.appendChild(el('i', null, 'pts')); nm.appendChild(sm); }
    row.appendChild(nm);
    if (right) {
      var rt = el('div', 'hg-rank-right');
      if (right.nodeType) rt.appendChild(right);
      else right.forEach(function (part) { rt.appendChild(el(part[0] === 'b' ? 'b' : 'span', part[0] === 'w' ? 'w' : null, part[1])); });
      row.appendChild(rt);
    }
    r.appendChild(row);
    r.appendChild(el('div', 'hg-rank-badge', place === null ? '' : String(place)));
    return r;
  }
  function moveBadge(n) {
    var m = el('span', 'hg-move ' + (n > 0 ? 'up' : n < 0 ? 'down' : 'same'), (n > 0 ? '+' : '') + n);
    m.appendChild(el('i', null, n > 0 ? '▲' : n < 0 ? '▼' : '='));
    return m;
  }
  // Timer disc with a progress ring. Returns { set(fraction, text) }.
  function timerRing(cls) {
    var w = el('div', 'hg-timer' + (cls ? ' ' + cls : ''));
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 58 58');
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '29'); c.setAttribute('cy', '29'); c.setAttribute('r', '26.5');
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '3'); c.setAttribute('stroke-linecap', 'round');
    c.setAttribute('stroke-dasharray', '166.5'); c.setAttribute('stroke', '#a7c919');
    svg.appendChild(c); w.appendChild(svg);
    var v = el('div', 'val'); w.appendChild(v);
    return {
      el: w,
      set: function (f, text, unit, color) {
        c.setAttribute('stroke-dashoffset', String(166.5 * (1 - Math.max(0, Math.min(1, f)))));
        if (color) c.setAttribute('stroke', color);
        clear(v); v.appendChild(document.createTextNode(text));
        if (unit) v.appendChild(el('small', null, unit));
      }
    };
  }
  function confetti() {
    var box = el('div', 'hg-confetti'), cols = ['#ffdd00', '#ea3557', '#0094da', '#a7c919', '#ee6ba3', '#4ec6e0', '#f68a1e'];
    for (var i = 0; i < 60; i++) {
      var p = el('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
      p.style.borderRadius = i % 2 ? '50%' : '2px';
      p.style.animationDuration = (1.6 + Math.random() * 2) + 's'; p.style.animationDelay = Math.random() * 0.6 + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 4500);
  }

  // ── In-game shell ────────────────────────────────────────
  // opts: { game, logo, howTo: { steps:[…3], line }, tip,
  //         hasProgress(): bool  — false = X quits without G5
  //         onPause(), onResume(), onQuit() }
  var shell = (function () {
    var o = null, paused = false, layer = null, header = null, pauseSheet = null, quitSheet = null,
        rotateEl = null, howEl = null, rotated = false;

    function home() { window.location.replace('../../index.html'); }

    function init(opts) {
      o = opts;
      document.documentElement.lang = getLang();
      document.body.classList.add('hg-game', 'theme-' + o.game);
      lockGestures();
      buildHeader();
      layer = el('div', 'hg-layer'); document.body.appendChild(layer);
      buildPause(); buildQuit(); buildRotate();

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) pause();
      });
      window.addEventListener('pagehide', function () { pause(); });
      var mq = window.matchMedia('(orientation: landscape)');
      var onOrient = function () { checkRotate(); };
      if (mq.addEventListener) mq.addEventListener('change', onOrient); else mq.addListener(onOrient);
      window.addEventListener('resize', onOrient);
      checkRotate();
    }

    function buildHeader() {
      header = el('header', 'hg-header');
      var x = el('button', 'hg-hbtn hg-x'); x.setAttribute('aria-label', 'Quit');
      var xi = el('img'); xi.src = asset('assets/ui/icon-back.svg'); xi.alt = ''; x.appendChild(xi);
      var logo = el('div', 'hg-hlogo');
      if (o.headerLogo) {          // logo × Nestlé already combined in one file
        var c = el('img', 'combined'); c.src = o.headerLogo; c.alt = GAMES[o.game].name + ' × Nestlé'; logo.appendChild(c);
      } else {
        var img = el('img', 'logo'); img.src = o.logo; img.alt = GAMES[o.game].name; logo.appendChild(img);
        var xx = el('img', 'x'); xx.src = asset('assets/ui/x-white.svg'); xx.alt = '×'; logo.appendChild(xx);
        var ne = el('img', 'nestle'); ne.src = asset('assets/ui/nestle-logo-white.svg'); ne.alt = 'Nestlé'; logo.appendChild(ne);
      }
      logo.appendChild(el('span', 'hg-hname', GAMES[o.game].name));
      var p = el('button', 'hg-hbtn hg-p'); p.setAttribute('aria-label', 'Pause');
      var pi = el('img'); pi.src = asset('assets/ui/icon-pause.svg'); pi.alt = ''; p.appendChild(pi);
      header.appendChild(x); header.appendChild(logo); header.appendChild(p);
      document.body.insertBefore(header, document.body.firstChild);
      onTap(x, function () { if (!header.classList.contains('inert')) askQuit(); });
      onTap(p, function () { if (!header.classList.contains('inert')) pause(); });
    }

    function sheet(id) {
      var wrap = el('div', 'hg-modal'); wrap.id = id;
      var card = el('div', 'hg-card'); wrap.appendChild(card);
      layer.appendChild(wrap);
      return { wrap: wrap, card: card };
    }

    function buildPause() {
      pauseSheet = sheet('hg-pause');
      var c = pauseSheet.card;
      c.appendChild(el('div', 'hg-card-title', t('paused')));
      var sub = el('div', 'hg-card-sub'); sub.id = 'hg-pause-sub'; c.appendChild(sub);
      // Design UI - 02: sound switch, this game's rules inline, Resume, then Quit (→ G5 confirmation).
      var snd = el('button', 'hg-switch-row'); snd.id = 'hg-sound-btn';
      snd.appendChild(el('span', null, t('sound'))); snd.appendChild(el('span', 'hg-switch'));
      c.appendChild(snd);
      c.appendChild(el('div', 'hg-card-rule'));
      c.appendChild(el('div', 'hg-card-h', t('how_to_play')));
      var ul = el('ul', 'hg-bullets sm');
      o.howTo.lines.forEach(function (l) { ul.appendChild(el('li', null, l)); });
      c.appendChild(ul);
      var resume = el('button', 'hg-btn hg-btn-primary', t('resume'));
      var quit = el('button', 'hg-btn hg-btn-quit', t('quit'));
      c.appendChild(resume); c.appendChild(quit);
      onTap(resume, function () { resumeGame(); });
      onTap(snd, function () { setSound(!soundOn()); renderSound(); });
      onTap(quit, function () { askQuit(); });
    }
    function renderSound() {
      document.getElementById('hg-sound-btn').classList.toggle('on', soundOn());
    }

    function buildQuit() {
      quitSheet = sheet('hg-quit');
      var c = quitSheet.card;
      c.appendChild(el('div', 'hg-card-title', t('quit_title')));
      c.appendChild(el('div', 'hg-card-sub', t('quit_body')));
      c.appendChild(el('div', 'hg-card-rule'));
      var keep = el('button', 'hg-btn hg-btn-primary', t('keep_playing'));
      var quit = el('button', 'hg-btn hg-btn-quit', t('quit'));
      c.appendChild(keep); c.appendChild(quit);
      onTap(keep, function () { quitSheet.wrap.classList.remove('open'); resumeGame(); });
      onTap(quit, function () { if (o.onQuit) o.onQuit(); home(); });
    }

    function buildRotate() {
      // G6 (Design UI - 02): "Paused · Turn your phone upright" card over the dimmed game.
      rotateEl = el('div', 'hg-rotate');
      var card = el('div', 'hg-card');
      card.appendChild(el('div', 'hg-card-title', t('paused')));
      card.appendChild(el('div', 'hg-card-rule'));
      card.appendChild(el('div', 'hg-card-h', t('rotate_title')));
      var icon = el('div', 'hg-rotate-icon');
      icon.innerHTML = '<svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><rect x="17" y="4" width="17" height="32" rx="3"/><path d="M13 12H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/></svg>';
      card.appendChild(icon);
      var r = el('button', 'hg-btn hg-btn-primary', t('resume'));
      card.appendChild(r);
      onTap(r, function () { if (!isLandscape()) checkRotate(); });
      rotateEl.appendChild(card);
      document.body.appendChild(rotateEl);
    }

    function isLandscape() {
      return isMobile() && window.innerWidth > window.innerHeight && window.innerHeight < 600;
    }
    function checkRotate() {
      var land = isLandscape();
      if (land && !rotated) { rotated = true; rotateEl.classList.add('open'); pause(); }
      else if (!land && rotated) { rotated = false; rotateEl.classList.remove('open'); }
    }

    function freeze() {
      if (paused) return false;
      paused = true;
      if (o.onPause) o.onPause();
      return true;
    }

    function pause() {
      if (!o) return;
      if (quitSheet.wrap.classList.contains('open')) return; // G5 already freezes the game
      freeze();
      var sub = document.getElementById('hg-pause-sub');
      var who = o.currentPlayer ? o.currentPlayer() : null;
      sub.textContent = who ? t('turn_of', { name: who }) + ' · ' + t('timer_stopped') : '';
      renderSound();
      pauseSheet.wrap.classList.add('open');
    }

    function askQuit() {
      if (!o.hasProgress || !o.hasProgress()) { if (o.onQuit) o.onQuit(); home(); return; }
      pauseSheet.wrap.classList.remove('open');
      freeze();
      quitSheet.wrap.classList.add('open');
    }

    function resumeGame() {
      if (rotated) return;
      pauseSheet.wrap.classList.remove('open');
      if (!paused) return;
      paused = false;
      if (o.onResume) o.onResume();
    }

    // How to play (T0 · C0 · O0 · K0): title + "→" lines + CTA (Design UI Twister_00 …).
    // mode 'start' → CTA (NEXT / LET'S GO / GOT IT) then done(); mode 'pause' → "Close" back to G4.
    function showHowTo(mode, done) {
      if (howEl) howEl.remove();
      howEl = el('div', 'hg-howto hg-scroll');
      howEl.appendChild(el('div', 'hg-title', t('how_to_play')));
      var ul = el('ul', 'hg-bullets');
      o.howTo.lines.forEach(function (l) { ul.appendChild(el('li', null, l)); });
      howEl.appendChild(ul);
      var cta = el('button', 'hg-btn hg-btn-primary hg-howto-cta',
        mode === 'pause' ? t('close') : (o.howTo.cta || t('got_it')));
      howEl.appendChild(cta);
      document.body.appendChild(howEl);
      if (mode === 'pause') { header.classList.add('inert'); howEl.classList.add('from-pause'); }
      onTap(cta, function () {
        howEl.remove(); howEl = null;
        header.classList.remove('inert');
        if (mode === 'start') { markSeen(o.game); if (done) done(); }
      });
    }

    // G1 · Game loading. Preloads images; shown only if it takes > 400 ms.
    function load(urls, done) {
      var screen = null, tipTimer = null, showTimer, finished = false;
      function build() {
        screen = el('div', 'hg-loading');
        var logo = el('img', 'hg-loading-logo'); logo.src = o.logo; screen.appendChild(logo);
        screen.appendChild(el('div', 'hg-loading-txt', t('loading_game', { game: GAMES[o.game].name })));
        var tip = el('div', 'hg-loading-tip'); screen.appendChild(tip);
        document.body.appendChild(screen);
        tipTimer = setTimeout(function () { if (o.tip) tip.textContent = o.tip; }, 3000);
      }
      function fail() {
        if (!screen) build();
        clearTimeout(tipTimer); clear(screen);
        screen.appendChild(el('div', 'hg-card-title', t('load_fail')));
        var r = el('button', 'hg-btn hg-btn-primary', t('retry'));
        var b = el('button', 'hg-btn hg-btn-ghost', t('back_home'));
        screen.appendChild(r); screen.appendChild(b);
        onTap(r, function () { window.location.reload(); });
        onTap(b, home);
      }
      showTimer = setTimeout(function () { if (!finished) build(); }, 400);
      var left = urls.length, failed = false;
      if (!left) return finish();
      urls.forEach(function (u) {
        var img = new Image();
        img.onload = function () { if (--left === 0 && !failed) finish(); };
        img.onerror = function () { failed = true; clearTimeout(showTimer); fail(); };
        img.src = u;
      });
      function finish() {
        finished = true; clearTimeout(showTimer); clearTimeout(tipTimer);
        if (screen) screen.remove();
        done();
      }
    }

    // Start of a game: G1 → How to play (first time this session) → start().
    function begin(urls, start) {
      load(urls, function () {
        if (!seen(o.game)) showHowTo('start', start); else start();
      });
    }

    // G2 · Up next (Design UI Twister_01): white card, current player tag, queue fading out, CTA below.
    function upNext(container, queue, index, onGo) {
      clear(container);
      var tot = totals();
      var card = el('div', 'hg-upnext');
      card.appendChild(el('div', 'hg-upnext-label', t('up_next')));
      card.appendChild(tag(queue[index], { big: true, pts: tot[queue[index]] || 0 }));
      var list = el('div', 'hg-queue'), rest = [];
      for (var k = 1; k < queue.length; k++) rest.push(queue[(index + k) % queue.length]);
      rest.forEach(function (n, i) {
        var row = el('div', 'hg-queue-row');
        row.style.opacity = String(Math.max(0.15, 0.85 - i * 0.16));
        row.appendChild(el('b', null, n));
        var pts = el('span', null, String(tot[n] || 0)); pts.appendChild(el('i', null, t('pts'))); row.appendChild(pts);
        list.appendChild(row);
      });
      card.appendChild(list);
      card.appendChild(el('div', 'hg-upnext-turn', t('turn_x_of_y', { x: index + 1, y: queue.length })));
      container.appendChild(card);
      var go = el('button', 'hg-btn hg-btn-primary hg-upnext-cta', t('lets_play'));
      container.appendChild(go);
      onTap(go, function () { unlockAudio(); onGo(); });
    }

    // G3 · Leaderboard update (Design UI Twister_13): totals, rank movement, re-sort after ≈ 1 s.
    function leaderboard(container, onPlayAgain) {
      clear(container);
      var last = getLastRound() || { before: {}, gained: {} };
      var players = getPlayers(), now = totals();
      var cmp = function (key) { return function (a, b) { return (key[b] || 0) - (key[a] || 0); }; };
      var beforeRank = {}, nowRank = {};
      var oldOrder = rank(players, cmp(last.before));
      oldOrder.forEach(function (r) { beforeRank[r.item] = r.place; });
      var after = rank(players, cmp(now));
      after.forEach(function (r) { nowRank[r.item] = r.place; });
      var hadScores = players.some(function (n) { return (last.before[n] || 0) > 0; });

      container.appendChild(el('div', 'hg-titlebar', t('leaderboard')));
      var list = el('div', 'hg-ranks'); container.appendChild(list);
      var rows = {};
      oldOrder.forEach(function (r) {
        var n = r.item, g = Math.round(last.gained[n] || 0);
        var right = el('span');
        right.appendChild(el('span', 'w', '+' + g + ' ' + t('pts')));
        var row = rankRow(r.place, n, right, { pts: last.before[n] || 0 });
        rows[n] = { row: row, right: right };
        list.appendChild(row);
      });
      setTimeout(function () {
        var first = {};
        players.forEach(function (n) { first[n] = rows[n].row.getBoundingClientRect().top; });
        after.forEach(function (r) {
          var n = r.item, R = rows[n];
          R.row.querySelector('.hg-rank-badge').textContent = String(r.place);
          var sm = R.row.querySelector('.hg-rank-name small'); clear(sm);
          sm.appendChild(document.createTextNode(String(now[n]))); sm.appendChild(el('i', null, t('pts')));
          if (hadScores) { clear(R.right); R.right.appendChild(moveBadge(beforeRank[n] - nowRank[n])); }
          list.appendChild(R.row);
        });
        players.forEach(function (n) {
          var dy = first[n] - rows[n].row.getBoundingClientRect().top;
          if (!dy) return;
          var r = rows[n].row;
          r.style.transition = 'none'; r.style.transform = 'translateY(' + dy + 'px)';
          requestAnimationFrame(function () { r.style.transition = 'transform 0.6s ease'; r.style.transform = ''; });
        });
      }, 900);

      var back = el('button', 'hg-btn hg-btn-primary', t('finish'));
      var again = el('button', 'hg-btn hg-btn-ghost', t('play_again'));
      container.appendChild(back); container.appendChild(again);
      onTap(back, home);
      onTap(again, onPlayAgain);
    }

    return {
      init: init, begin: begin, pause: pause, isPaused: function () { return paused; },
      showHowTo: showHowTo, upNext: upNext, leaderboard: leaderboard, home: home
    };
  })();

  return {
    GAMES: GAMES, MAX_TOTAL: MAX_TOTAL,
    getPlayers: getPlayers, setPlayers: setPlayers, hasPlayers: hasPlayers, sameName: sameName,
    getScores: getScores, totals: totals, totalOf: totalOf, anyScore: anyScore,
    commitRound: commitRound, recordScore: recordScore, getLastRound: getLastRound, clearScores: clearScores,
    speed: speed, rank: rank, ordinal: ordinal, fmtSec: fmtSec,
    soundOn: soundOn, setSound: setSound,
    termsAccepted: termsAccepted, termsOutdated: termsOutdated, acceptTerms: acceptTerms,
    seen: seen, markSeen: markSeen,
    LANGUAGES: LANGUAGES, getLang: getLang, manualLang: manualLang, detectLang: detectLang,
    setLang: setLang, addStrings: addStrings, t: t,
    isMobile: isMobile, shuffle: shuffle, el: el, clear: clear, onTap: onTap, Clock: Clock,
    asset: asset, avatar: avatar, tag: tag, rankRow: rankRow, moveBadge: moveBadge, timerRing: timerRing, confetti: confetti,
    play: play, unlockAudio: unlockAudio, feedback: feedback, lockGestures: lockGestures,
    shell: shell
  };
})();
