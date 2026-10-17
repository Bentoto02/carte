/* jeu-bureau.js : parcours isométrique « compétences » pour la carte de visite.
 * Suppose THREE (build UMD r128) déjà chargé.
 * API : JeuBureau.mount(conteneur, { onStep(index, titre, phrase), onArrive(), onWalk(vers), onQueue() })
 *       → renvoie l'API, ou null si WebGL manque.
 *       JeuBureau.reset()   JeuBureau.stop()   JeuBureau.heroScreen() → {x, y} des pieds du personnage, en px dans le conteneur
 * Un toucher = une étape. 4 stations, puis la porte du bureau.
 * Un toucher pendant la marche est gardé : le personnage repart 0,8 s après son arrivée.
 */
(function () {
  "use strict";

  var C = { bg: 0x070912, cyan: 0x3ee6ff, indigo: 0x7c6cff, mint: 0x5dffb5 };
  var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var ETAPES = [
    { titre: "Automatisation", phrase: "Les tâches répétitives se font toutes seules : mails, devis, relances." },
    { titre: "Agent IA", phrase: "Un assistant qui répond, trie et prépare le travail, 24 h sur 24." },
    { titre: "CRM", phrase: "Tous vos clients et vos projets au même endroit." },
    { titre: "Projet numérique", phrase: "Site, logiciel, jeu, outil sur mesure : on le construit ensemble." }
  ];
  var CONSIGNE = "Touchez l'écran pour avancer";
  var TOP_FREE = 0.30;      // part de la hauteur laissée au titre de la page
  var BOTTOM_FREE = 40;     // px laissés en bas (plus de bouton fixe)
  var VIEW_W = 7.4;         // largeur visible minimale (unités monde)
  var VIEW_H = 10;          // hauteur visible minimale dans la zone du milieu
  var SPEED = 2.7;          // unités / s
  var ZOOM_START = 0.9;     // s après l'arrivée à la porte : début du grand plan
  var ZOOM_T = 1.5;         // durée du zoom dans la porte (s)
  var ZOOM_MAX = 26;        // grossissement final : la porte remplit l'écran
  var S2 = Math.SQRT2;

  var inst = null;

  // (u, v) : u = droite de l'écran, v = « vers le haut de l'écran » sur le sol.
  function P(u, v, y) { return new THREE.Vector3((u - v) / S2, y || 0, (-u - v) / S2); }
  function vOf(p) { return -(p.x + p.z) / S2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function easeBack(x) { x = clamp01(x); var c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }

  function mount(container, opts) {
    if (inst) stop();
    if (!container || typeof THREE === "undefined") return null;
    opts = opts || {};

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;" +
      "touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;outline:none;";
    canvas.setAttribute("aria-label", CONSIGNE);
    canvas.setAttribute("role", "button");
    canvas.tabIndex = 0;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: "low-power" });
    } catch (e) { return null; }
    container.appendChild(canvas);
    // voile en haut : garde les 30 % du haut lisibles pour le titre de la page
    var veil = document.createElement("div");
    veil.style.cssText = "position:absolute;left:0;right:0;top:0;height:36%;pointer-events:none;" +
      "background:linear-gradient(#070912 0%, #070912 62%, rgba(7,9,18,0) 100%);";
    container.appendChild(veil);
    renderer.setClearColor(C.bg, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var S = {
      container: container, canvas: canvas, renderer: renderer, opts: opts,
      rm: !!(mq && mq.matches), mq: mq, raf: 0, last: 0, t: 0, visible: true,
      veil: veil, W: 1, H: 1, ppu: 50, zoneH: 500, anim: [], disposables: []
    };
    inst = S;

    var scene = new THREE.Scene();
    var cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    S.scene = scene; S.cam = cam;
    S.camTarget = new THREE.Vector3();
    S.camV = 0;

    scene.add(new THREE.HemisphereLight(0xbfcaff, 0x0b0d1c, 0.85));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(6, 10, 3);
    scene.add(sun);

    // ---------- matériaux et formes ----------
    function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }
    function bas(c, o) {
      var m = new THREE.MeshBasicMaterial({ color: c });
      if (o) { for (var k in o) m[k] = o[k]; }
      return m;
    }
    function box(w, h, d, mat, x, y, z, parent) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x || 0, y || 0, z || 0);
      (parent || scene).add(m);
      return m;
    }
    function radialTex(inner, outer) {
      var c = document.createElement("canvas"); c.width = c.height = 64;
      var g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }
    var shadowTex = radialTex("rgba(0,0,0,0.6)", "rgba(0,0,0,0)");
    var glowTex = radialTex("rgba(255,255,255,1)", "rgba(255,255,255,0)");
    function flat(size, mat, parent, x, z, y) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x || 0, y || 0.02, z || 0);
      (parent || scene).add(m);
      return m;
    }
    function shadow(parent, size) {
      return flat(size, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), parent, 0, 0, 0.015);
    }
    function pool(parent, size, color) {
      var m = flat(size, new THREE.MeshBasicMaterial({ map: glowTex, color: color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false }), parent, 0, 0, 0.03);
      return m;
    }
    function roundRect(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    }
    // matériau qui passe d'une couleur éteinte à une couleur allumée
    function litMat(dim, lit, extra) {
      var m = bas(dim, extra);
      m.userData.dim = new THREE.Color(dim); m.userData.lit = new THREE.Color(lit);
      return m;
    }
    function setLit(list, k) { for (var i = 0; i < list.length; i++) list[i].color.copy(list[i].userData.dim).lerp(list[i].userData.lit, k); }

    // ---------- sol ----------
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), lam(0x0a0e1f));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    var grid = new THREE.GridHelper(40, 40, C.cyan, C.indigo);
    grid.material.transparent = true; grid.material.opacity = 0.13; grid.material.depthWrite = false;
    grid.position.copy(P(0, 10, 0.01));
    scene.add(grid);

    // ---------- parcours ----------
    var START = P(0, 0);
    var STAND = [P(0.95, 3.2), P(-0.95, 6.4), P(0.95, 9.6), P(-0.95, 12.8)];
    var SPOT = [P(2.4, 3.2), P(-2.4, 6.4), P(2.4, 9.6), P(-2.4, 12.8)];
    var BC = P(0, 17.4);               // centre du bâtiment
    var BW = 3.0, BH = 3.0;
    var doorZ = BC.z + BW / 2;
    var DOOR_GOAL = new THREE.Vector3(BC.x, 0, doorZ + 0.45);
    var DOOR_IN = new THREE.Vector3(BC.x, 0, doorZ - 0.5);
    var WAY = [START].concat(STAND).concat([DOOR_GOAL]);
    S.WAY = WAY;

    // ligne discrète qui relie tout le parcours
    (function () {
      var pts = [];
      for (var i = 0; i < WAY.length; i++) pts.push(new THREE.Vector3(WAY[i].x, 0.025, WAY[i].z));
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: C.indigo, transparent: true, opacity: 0.45 }));
      scene.add(line);
    })();

    // ---------- décor ----------
    var blinkers = [];
    function tower(u, v, w, h, antenna) {
      var g = new THREE.Group(); g.position.copy(P(u, v)); scene.add(g);
      box(w, h, w, lam(0x141936), 0, h / 2, 0, g);
      box(w + 0.04, 0.06, w + 0.04, lam(0x2a3066), 0, h, 0, g);
      var wm = [bas(0x1c5f73), bas(0x3a3480), bas(0x1f6b55)];
      for (var y = 0.45; y < h - 0.2; y += 0.5) {
        for (var k = 0; k < 2; k++) {
          var off = (k ? 0.22 : -0.22) * w;
          box(0.02, 0.18, w * 0.3, wm[(Math.round(y * 2) + k) % 3], w / 2 + 0.01, y, off, g);
          box(w * 0.3, 0.18, 0.02, wm[(Math.round(y * 2) + k + 1) % 3], off, y, w / 2 + 0.01, g);
        }
      }
      if (antenna) {
        box(0.05, 0.9, 0.05, lam(0x8890c0), 0, h + 0.45, 0, g);
        var bm = bas(0xff5a7a);
        var b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bm);
        b.position.set(0, h + 0.95, 0); g.add(b);
        blinkers.push({ m: bm, on: new THREE.Color(0xff5a7a), off: new THREE.Color(0x401520), ph: Math.random() * 6 });
      }
      shadow(g, w * 1.9);
    }
    tower(-4.6, 1.6, 1.3, 2.2, true);
    tower(4.7, 5.0, 1.4, 3.0, true);
    tower(-4.7, 8.6, 1.2, 2.6, false);
    tower(4.6, 12.2, 1.3, 3.4, true);
    tower(-4.4, 15.6, 1.4, 2.4, true);
    tower(4.3, 18.8, 1.6, 2.0, false);
    tower(-3.4, 21.0, 1.4, 2.8, true);
    tower(-4.6, -1.8, 1.2, 1.4, false);
    tower(4.4, -0.8, 1.0, 1.8, true);

    // petit drone qui flotte
    var drone = new THREE.Group(); drone.position.copy(P(3.1, 11.2, 2.3)); scene.add(drone);
    box(0.36, 0.12, 0.36, lam(0x2a2f6a), 0, 0, 0, drone);
    var droneLight = bas(C.mint); box(0.1, 0.06, 0.1, droneLight, 0, -0.08, 0, drone);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
      var r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 8), bas(0x8fe9ff, { transparent: true, opacity: 0.55 }));
      r.position.set(s[0] * 0.26, 0.06, s[1] * 0.26); drone.add(r);
    });
    blinkers.push({ m: droneLight, on: new THREE.Color(C.mint), off: new THREE.Color(0x0f3a2a), ph: 1 });

    // petit robot qui patrouille près du départ
    var rover = new THREE.Group(); scene.add(rover);
    box(0.36, 0.3, 0.3, lam(C.indigo), 0, 0.25, 0, rover);
    box(0.3, 0.2, 0.26, lam(0xdfe4ff), 0, 0.5, 0, rover);
    box(0.24, 0.05, 0.02, bas(C.cyan), 0, 0.52, 0.14, rover);
    shadow(rover, 0.8);
    var roverA = P(-2.6, 0.4), roverB = P(-2.1, 2.4);

    // ---------- stations ----------
    var stations = [];
    function makeStation(i) {
      var g = new THREE.Group(); g.position.copy(SPOT[i]); scene.add(g);
      var st = { g: g, mats: [], k: 0, active: false, actT: 0, update: null };
      st.pool = pool(g, 3.2, i % 2 ? C.indigo : C.cyan);
      return st;
    }

    // 1. Automatisation : tapis, engrenage, colis triés
    (function () {
      var st = makeStation(0), g = st.g;
      box(2.2, 0.14, 0.7, lam(0x1b2140), 0, 0.5, 0, g);
      box(2.2, 0.02, 0.56, bas(0x262d55), 0, 0.58, 0, g);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) { box(0.1, 0.45, 0.1, lam(0x2a3058), s[0] * 1.0, 0.22, s[1] * 0.28, g); });
      var edge = litMat(0x17414c, C.cyan); st.mats.push(edge);
      box(2.2, 0.04, 0.04, edge, 0, 0.59, 0.36, g); box(2.2, 0.04, 0.04, edge, 0, 0.59, -0.36, g);
      var gear = new THREE.Group(); gear.position.set(-1.3, 1.0, 0); g.add(gear);
      var gm = litMat(0x2b2f6b, C.indigo); st.mats.push(gm);
      var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), gm); disc.rotation.x = Math.PI / 2; gear.add(disc);
      for (var t = 0; t < 8; t++) {
        var a = t / 8 * Math.PI * 2, tooth = box(0.13, 0.13, 0.12, gm, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0, gear);
        tooth.rotation.z = a;
      }
      var cap = litMat(0x1d4a55, C.cyan); st.mats.push(cap);
      var capM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), cap); capM.rotation.x = Math.PI / 2; gear.add(capM);
      box(0.08, 0.5, 0.08, lam(0x2a3058), -1.3, 0.55, 0, g);
      var b1 = litMat(0x15414a, C.cyan), b2 = litMat(0x14432f, C.mint); st.mats.push(b1, b2);
      box(0.42, 0.36, 0.34, b1, 1.4, 0.18, 0.21, g); box(0.42, 0.36, 0.34, b2, 1.4, 0.18, -0.21, g);
      var items = [];
      for (var k = 0; k < 4; k++) {
        var it = box(0.32, 0.07, 0.22, lam(k % 2 ? 0xe8ecff : 0xffd98a), -1.0 + k * 0.55, 0.63, 0, g);
        it.userData.s = k % 2 ? 1 : -1; items.push(it);
      }
      shadow(g, 3.2);
      st.update = function (dt, t, running) {
        if (!running) return;
        gear.rotation.z -= dt * 2.2;
        for (var j = 0; j < items.length; j++) {
          var it = items[j], x = it.position.x + dt * 0.75;
          if (x > 1.45) { x = -1.05; it.userData.s = -it.userData.s; }
          it.position.x = x;
          var f = clamp01((x - 0.7) / 0.5);
          it.position.z = it.userData.s * 0.21 * ease(f);
          it.position.y = x > 1.15 ? 0.63 - (x - 1.15) * 1.2 : 0.63;
        }
      };
      stations.push(st);
    })();

    // 2. Agent IA : robot sur socle, anneau holographique, bulle « … »
    (function () {
      var st = makeStation(1), g = st.g;
      box(1.1, 0.25, 1.1, lam(0x1b2140), 0, 0.125, 0, g);
      var ringM = litMat(0x1b2a55, C.cyan, { transparent: true, opacity: 0.9 }); st.mats.push(ringM);
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 24), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.26; g.add(ring);
      var bot = new THREE.Group(); bot.position.y = 0.25; bot.rotation.y = Math.PI / 2; g.add(bot);
      box(0.46, 0.5, 0.36, lam(C.indigo), 0, 0.3, 0, bot);
      box(0.5, 0.36, 0.4, lam(0xe8ecff), 0, 0.75, 0, bot);
      var visor = litMat(0x1d4a55, C.cyan); st.mats.push(visor);
      box(0.38, 0.1, 0.02, visor, 0, 0.77, 0.21, bot);
      box(0.04, 0.22, 0.04, lam(0x8890c0), 0, 1.04, 0, bot);
      var tip = litMat(0x1f4a38, C.mint); st.mats.push(tip);
      var tipM = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tip); tipM.position.y = 1.17; bot.add(tipM);
      var armL = new THREE.Group(), armR = new THREE.Group();
      armL.position.set(-0.29, 0.5, 0); armR.position.set(0.29, 0.5, 0); bot.add(armL); bot.add(armR);
      box(0.1, 0.36, 0.12, lam(0x5a4fd0), 0, -0.16, 0, armL); box(0.1, 0.36, 0.12, lam(0x5a4fd0), 0, -0.16, 0, armR);
      var holoM = new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
      var holo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 32), holoM); holo.rotation.x = Math.PI / 2; holo.position.y = 1.0; g.add(holo);
      var talk = new THREE.Group(); talk.position.set(0.15, 1.85, 0.15); g.add(talk);
      var talkM = litMat(0x2a3058, 0xeef2ff); st.mats.push(talkM);
      box(0.7, 0.4, 0.04, talkM, 0, 0, 0, talk);
      var dots = [];
      for (var d = 0; d < 3; d++) {
        var dm = bas(0x3a3f70); dots.push(dm);
        var dd = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), dm); dd.position.set(-0.18 + d * 0.18, 0, 0.04); talk.add(dd);
      }
      st.talk = talk;
      shadow(g, 2.2);
      st.update = function (dt, t, running) {
        holoM.opacity = 0.1 + 0.75 * st.k;
        for (var j = 0; j < 3; j++) dots[j].color.setHex(st.k > 0.5 ? ((running ? Math.floor(t * 4) % 3 === j : j === 1) ? C.indigo : 0xc8ccff) : 0x3a3f70);
        if (!running) return;
        holo.rotation.z += dt * 1.4;
        holo.position.y = 1.0 + Math.sin(t * 2) * 0.12;
        bot.position.y = 0.25 + Math.sin(t * 3) * 0.03;
        armR.rotation.z = -2.4 + Math.sin(t * 7) * 0.4;
      };
      st.onActivateStatic = function () { armR.rotation.z = -2.4; };
      stations.push(st);
    })();

    // 3. CRM : mur de fiches clients qui s'allument
    (function () {
      var st = makeStation(2), g = st.g;
      box(2.4, 0.2, 0.5, lam(0x1b2140), 0, 0.1, 0, g);
      box(2.2, 1.75, 0.18, lam(0x161b36), 0, 1.07, 0, g);
      var trim = litMat(0x2b2f6b, C.indigo); st.mats.push(trim);
      box(2.24, 0.06, 0.22, trim, 0, 1.97, 0, g);
      var cc = document.createElement("canvas"); cc.width = 128; cc.height = 110;
      var cg = cc.getContext("2d");
      cg.fillStyle = "#ffffff"; roundRect(cg, 4, 4, 120, 102, 14); cg.fill();
      cg.fillStyle = "#3b4170"; cg.beginPath(); cg.arc(34, 40, 18, 0, Math.PI * 2); cg.fill();
      cg.fillRect(62, 28, 52, 9); cg.fillRect(62, 46, 38, 7); cg.fillRect(16, 72, 96, 7); cg.fillRect(16, 86, 70, 7);
      var cardTex = new THREE.CanvasTexture(cc); S.disposables.push(cardTex);
      var cardGeo = new THREE.PlaneGeometry(0.44, 0.38);
      var cards = [], tints = [C.cyan, C.mint, 0xdcd6ff, C.cyan, 0xffffff, C.mint];
      for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) {
        var m = litMat(0x262b4d, tints[(r * 4 + c) % tints.length], { map: cardTex });
        var p = new THREE.Mesh(cardGeo, m); p.position.set(-0.75 + c * 0.5, 1.55 - r * 0.46, 0.095); g.add(p);
        cards.push(m);
      }
      shadow(g, 3.0);
      st.update = function (dt, t, running) {
        for (var j = 0; j < cards.length; j++) {
          var kj = st.active ? (running ? ease((st.actT - j * 0.1) / 0.25) : 1) : 0;
          var scan = (running && st.actT > 1.6 && Math.floor(t * 3) % cards.length === j) ? 0.35 : 0;
          cards[j].color.copy(cards[j].userData.dim).lerp(cards[j].userData.lit, kj * (1 - scan));
        }
      };
      stations.push(st);
    })();

    // 4. Projet numérique : écran qui assemble une page
    (function () {
      var st = makeStation(3), g = st.g;
      box(0.9, 0.08, 0.6, lam(0x1b2140), 0, 0.04, 0, g);
      box(0.14, 0.8, 0.14, lam(0x2a3058), 0, 0.45, 0, g);
      box(0.12, 1.32, 2.04, lam(0x161b36), 0, 1.45, 0, g);
      var scr = litMat(0x0b0f26, 0x121c45); st.mats.push(scr);
      var sp = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.16), scr); sp.rotation.y = Math.PI / 2; sp.position.set(0.065, 1.45, 0); g.add(sp);
      var frame = litMat(0x2b2f6b, C.cyan); st.mats.push(frame);
      box(0.02, 0.04, 2.04, frame, 0.07, 2.12, 0, g);
      // pièces : [largeur(z), hauteur(y), y, z, couleur]
      var spec = [
        [1.7, 0.16, 1.88, 0, C.indigo],
        [0.8, 0.5, 1.5, 0.42, C.cyan],
        [0.66, 0.07, 1.68, -0.4, 0xdfe4ff], [0.66, 0.07, 1.56, -0.4, 0xdfe4ff], [0.5, 0.07, 1.44, -0.48, 0xdfe4ff],
        [0.34, 0.13, 1.2, -0.25, C.mint], [0.34, 0.13, 1.2, -0.65, C.indigo],
        [1.7, 0.07, 1.0, 0, 0x3a4380]
      ];
      var pieces = [];
      for (var k = 0; k < spec.length; k++) {
        var s = spec[k];
        var m = box(0.03, s[1], s[0], bas(s[4]), 0, 0, 0, g);
        var a = k / spec.length * Math.PI * 2;
        m.userData.from = new THREE.Vector3(0.6 + Math.cos(a) * 0.45, 0.05 + (k % 3) * 0.05, Math.sin(a) * 1.1);
        m.userData.fromR = new THREE.Euler(0, 0, Math.PI / 2);
        m.userData.to = new THREE.Vector3(0.09, s[2], s[3]);
        pieces.push(m);
      }
      function place(p) {
        for (var j = 0; j < pieces.length; j++) {
          var pc = pieces[j], f = ease(p === 1 ? 1 : (st.actT - j * 0.12) / 0.55);
          if (!st.active) f = 0;
          pc.position.copy(pc.userData.from).lerp(pc.userData.to, f);
          pc.position.y += Math.sin(f * Math.PI) * 0.6;
          pc.rotation.z = (1 - f) * Math.PI / 2;
        }
      }
      place(0);
      shadow(g, 2.6);
      st.update = function (dt, t, running) { place(running ? 0 : 1); };
      stations.push(st);
    })();

    // ---------- bâtiment du bureau ----------
    var bld = new THREE.Group(); bld.position.copy(BC); scene.add(bld);
    box(BW, BH, BW, lam(0x1a1f3d), 0, BH / 2, 0, bld);
    box(BW + 0.1, 0.12, BW + 0.1, lam(0x2a3066), 0, BH + 0.02, 0, bld);
    box(0.05, 0.05, BW + 0.12, bas(C.indigo), BW / 2 + 0.06, BH + 0.1, 0, bld);
    box(BW + 0.12, 0.05, 0.05, bas(C.indigo), 0, BH + 0.1, BW / 2 + 0.06, bld);
    box(BW + 0.04, 0.06, BW + 0.04, bas(C.cyan), 0, 0.03, 0, bld);
    var winM = [bas(0x2a7f92), bas(0x4a3fa0), bas(0x25805f)];
    for (var wy = 0; wy < 3; wy++) for (var wx = 0; wx < 4; wx++) {
      box(0.03, 0.36, 0.42, winM[(wx + wy) % 3], BW / 2 + 0.01, 0.9 + wy * 0.75, -1.0 + wx * 0.66, bld);
      if (wy > 0 && (wx === 0 || wx === 3 || wy === 2)) box(0.42, 0.36, 0.03, winM[(wx + wy + 1) % 3], -1.0 + wx * 0.66, 0.9 + wy * 0.75, BW / 2 + 0.01, bld);
    }
    // porte (face +z)
    var fz = BW / 2;
    var doorFrame = bas(C.mint);
    box(0.1, 1.8, 0.1, doorFrame, -0.6, 0.9, fz + 0.02, bld);
    box(0.1, 1.8, 0.1, doorFrame, 0.6, 0.9, fz + 0.02, bld);
    box(1.3, 0.1, 0.1, doorFrame, 0, 1.82, fz + 0.02, bld);
    var inner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.75), bas(0xbff8ff)); inner.position.set(0, 0.88, fz + 0.006); bld.add(inner);
    var hinge = new THREE.Group(); hinge.position.set(-0.55, 0, fz + 0.04); bld.add(hinge);
    var doorM = bas(0x2a2f6a), doorLit = new THREE.Color(C.indigo);
    box(1.1, 1.75, 0.05, doorM, 0.55, 0.88, 0, hinge);
    box(0.08, 0.08, 0.04, bas(C.mint), 0.95, 0.88, 0.04, hinge);
    var doorPool = flat(2.6, new THREE.MeshBasicMaterial({ map: glowTex, color: C.cyan, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false }), bld, 0, fz + 0.9, 0.03);
    // enseigne
    box(0.08, 0.9, 0.08, lam(0x8890c0), -1.1, BH + 0.45, 0, bld);
    box(0.08, 0.9, 0.08, lam(0x8890c0), 1.1, BH + 0.45, 0, bld);
    var signTex = (function () {
      var c = document.createElement("canvas"); c.width = 1024; c.height = 400;
      var g = c.getContext("2d");
      g.fillStyle = "rgba(9,12,30,0.96)"; roundRect(g, 20, 20, 984, 360, 48); g.fill();
      g.shadowColor = "#3ee6ff"; g.shadowBlur = 28; g.strokeStyle = "#3ee6ff"; g.lineWidth = 9;
      roundRect(g, 24, 24, 976, 352, 46); g.stroke();
      g.textAlign = "center"; g.textBaseline = "middle";
      var fs = 132; g.font = "800 " + fs + "px " + FONT;
      while (g.measureText("Benjamin Huteau").width > 900 && fs > 60) { fs -= 4; g.font = "800 " + fs + "px " + FONT; }
      g.shadowBlur = 22; g.fillStyle = "#f2fdff"; g.fillText("Benjamin Huteau", 512, 150);
      g.shadowBlur = 0;
      var lg = g.createLinearGradient(200, 0, 824, 0); lg.addColorStop(0, "#3ee6ff"); lg.addColorStop(1, "#7c6cff");
      g.fillStyle = lg; g.fillRect(200, 236, 624, 6);
      g.shadowColor = "#5dffb5"; g.shadowBlur = 16; g.fillStyle = "#5dffb5";
      g.font = "700 88px " + FONT; g.fillText("Consultant IA", 512, 310);
      return new THREE.CanvasTexture(c);
    })();
    S.disposables.push(signTex);
    var SIGN_W = 5.4;
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_W * 400 / 1024),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.position.set(BC.x, BH + 1.85, BC.z);
    scene.add(sign);
    shadow(bld, BW * 1.7);

    // ---------- personnage ----------
    var hero = new THREE.Group(); scene.add(hero);
    var body = new THREE.Group(); hero.add(body);
    var legM = lam(0x2b2f6b), jacket = lam(C.mint), sleeve = lam(0x3fcf93);
    var legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(-0.13, 0.62, 0); legR.position.set(0.13, 0.62, 0); body.add(legL); body.add(legR);
    box(0.17, 0.6, 0.2, legM, 0, -0.3, 0, legL); box(0.17, 0.6, 0.2, legM, 0, -0.3, 0, legR);
    box(0.52, 0.62, 0.32, jacket, 0, 0.93, 0, body);
    box(0.12, 0.12, 0.01, bas(C.indigo), 0.13, 1.08, 0.165, body);
    var armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.34, 1.2, 0); armR.position.set(0.34, 1.2, 0); body.add(armL); body.add(armR);
    box(0.14, 0.55, 0.16, sleeve, 0, -0.27, 0, armL); box(0.14, 0.55, 0.16, sleeve, 0, -0.27, 0, armR);
    box(0.4, 0.4, 0.38, lam(0xf1dcc8), 0, 1.47, 0, body);
    box(0.42, 0.14, 0.4, lam(0x1b1e3a), 0, 1.68, -0.01, body);
    box(0.06, 0.06, 0.02, bas(0x1b1e3a), -0.09, 1.5, 0.195, body);
    box(0.06, 0.06, 0.02, bas(0x1b1e3a), 0.09, 1.5, 0.195, body);
    var heroShadow = shadow(hero, 1.0);

    // ---------- indices : points lumineux + flèche ----------
    var dotGeo = new THREE.CircleGeometry(0.1, 10);
    var dots = [];
    for (var di = 0; di < 26; di++) {
      var dm = new THREE.MeshBasicMaterial({ color: C.mint, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      var dmesh = new THREE.Mesh(dotGeo, dm); dmesh.rotation.x = -Math.PI / 2; dmesh.visible = false; scene.add(dmesh);
      dots.push(dmesh);
    }
    var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), bas(C.mint));
    arrow.rotation.x = Math.PI; scene.add(arrow);

    // ---------- bulle de compétence ----------
    var bubbleCanvas = document.createElement("canvas"); bubbleCanvas.width = 1024; bubbleCanvas.height = 420;
    var bubbleTex = new THREE.CanvasTexture(bubbleCanvas); S.disposables.push(bubbleTex);
    var bubble = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: bubbleTex, transparent: true, depthTest: false, depthWrite: false }));
    bubble.renderOrder = 10; bubble.visible = false; scene.add(bubble);
    S.bubbleAspect = 420 / 1024;
    function drawBubble(i) {
      var e = ETAPES[i], g = bubbleCanvas.getContext("2d"), W = 1024, pad = 56;
      g.font = "500 56px " + FONT;
      var words = e.phrase.split(" "), lines = [], cur = "";
      for (var w = 0; w < words.length; w++) {
        var test = cur ? cur + " " + words[w] : words[w];
        if (g.measureText(test).width > W - pad * 2 && cur) { lines.push(cur); cur = words[w]; } else cur = test;
      }
      if (cur) lines.push(cur);
      var H = pad + 84 + 22 + lines.length * 70 + pad * 0.8 + 44;
      bubbleCanvas.height = Math.ceil(H);
      g = bubbleCanvas.getContext("2d");
      var bodyH = H - 44;
      g.fillStyle = "rgba(12,16,40,0.95)"; roundRect(g, 6, 6, W - 12, bodyH - 12, 40); g.fill();
      var tailX = 512 + (i % 2 ? -1 : 1) * 300;
      g.beginPath(); g.moveTo(tailX - 34, bodyH - 8); g.lineTo(tailX, H - 4); g.lineTo(tailX + 34, bodyH - 8); g.closePath(); g.fill();
      g.strokeStyle = i % 2 ? "#7c6cff" : "#3ee6ff"; g.lineWidth = 7; roundRect(g, 8, 8, W - 16, bodyH - 16, 38); g.stroke();
      g.beginPath(); g.moveTo(tailX - 30, bodyH - 9); g.lineTo(tailX, H - 8); g.lineTo(tailX + 30, bodyH - 9); g.stroke();
      g.textBaseline = "top"; g.textAlign = "left";
      g.fillStyle = i % 2 ? "#a99dff" : "#3ee6ff"; g.font = "800 84px " + FONT; g.fillText(e.titre, pad, pad - 6);
      g.textAlign = "left"; g.fillStyle = "#eef2ff"; g.font = "500 56px " + FONT;
      for (var l = 0; l < lines.length; l++) g.fillText(lines[l], pad, pad + 84 + 22 + l * 70);
      bubbleTex.needsUpdate = true;
      S.bubbleAspect = H / W;
    }

    // ---------- particules ----------
    var NP = 70, pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pVel = [];
    var pal = [new THREE.Color(C.cyan), new THREE.Color(C.mint), new THREE.Color(C.indigo), new THREE.Color(0x9ff3ff)];
    for (var pi = 0; pi < NP; pi++) { var pc = pal[pi % 4]; pCol[pi * 3] = pc.r; pCol[pi * 3 + 1] = pc.g; pCol[pi * 3 + 2] = pc.b; pVel.push(new THREE.Vector3()); }
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
    var pMat = new THREE.PointsMaterial({ size: 4 * renderer.getPixelRatio(), vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false });
    var parts = new THREE.Points(pGeo, pMat); parts.frustumCulled = false; parts.visible = false; scene.add(parts);
    function burst() {
      var o = new THREE.Vector3(BC.x, 1.0, doorZ + 0.3);
      for (var i = 0; i < NP; i++) {
        pPos[i * 3] = o.x; pPos[i * 3 + 1] = o.y; pPos[i * 3 + 2] = o.z;
        var a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 2.2;
        pVel[i].set(Math.cos(a) * s, 2 + Math.random() * 3.5, Math.sin(a) * s + 0.8);
      }
      pGeo.attributes.position.needsUpdate = true;
      parts.visible = true; pMat.opacity = 1;
    }

    // ---------- état du parcours ----------
    var G = { state: "idle", idx: 0, from: null, to: null, walkT: 0, walkLen: 1, phase: 0, enterT: 0, bubbleT: 0, bubbleIdx: -1, firstTap: false, queued: false, waitT: 0 };
    function call(name, a) {
      if (typeof S.opts[name] === "function") { try { S.opts[name](a); } catch (e) { setTimeout(function () { throw e; }); } }
    }
    S.G = G;

    function face(dx, dz) { if (dx * dx + dz * dz > 1e-6) hero.rotation.y = Math.atan2(dx, dz); }

    function updateHint() {
      var show = G.state === "idle" && G.idx < WAY.length - 1;
      if (!show) { for (var i = 0; i < dots.length; i++) dots[i].visible = false; arrow.visible = false; return; }
      var a = WAY[G.idx], b = WAY[G.idx + 1], len = a.distanceTo(b), n = Math.min(dots.length, Math.floor(len / 0.32));
      for (var j = 0; j < dots.length; j++) {
        var d = dots[j];
        if (j < n && j > 0) { var f = j / n; d.position.set(a.x + (b.x - a.x) * f, 0.035, a.z + (b.z - a.z) * f); d.visible = true; d.userData.i = j; }
        else d.visible = false;
      }
      var nxt = G.idx + 1;
      if (nxt <= 4) { arrow.position.copy(SPOT[nxt - 1]); arrow.position.y = 2.55; }
      else { arrow.position.set(BC.x, 2.45, doorZ + 0.25); }
      arrow.userData.y = arrow.position.y;
      arrow.visible = true;
    }

    function startWalk() {
      G.from = WAY[G.idx].clone(); G.to = WAY[G.idx + 1].clone();
      G.walkLen = Math.max(0.01, G.from.distanceTo(G.to)); G.walkT = 0; G.state = "walk";
      face(G.to.x - G.from.x, G.to.z - G.from.z);
      bubble.visible = false; G.bubbleIdx = -1;
      updateHint();
      call("onWalk", G.idx + 1);
    }

    function arriveAt(i) {
      G.idx = i; G.state = "idle";
      if (i >= 1 && i <= 4) {
        var st = stations[i - 1];
        if (!st.active) { st.active = true; st.actT = 0; if (S.rm && st.onActivateStatic) st.onActivateStatic(); }
        face(SPOT[i - 1].x - hero.position.x, SPOT[i - 1].z - hero.position.z);
        drawBubble(i - 1); G.bubbleIdx = i - 1; G.bubbleT = 0; bubble.visible = true;
        bubble.position.copy(P(0, vOf(STAND[i - 1]), 3.6));
        if (typeof S.opts.onStep === "function") { try { S.opts.onStep(i - 1, ETAPES[i - 1].titre, ETAPES[i - 1].phrase); } catch (e) { setTimeout(function () { throw e; }); } }
      }
      if (i === WAY.length - 1) { G.state = "enter"; G.enterT = 0; G.arrived = false; burstDone = false; G.queued = false; }
      else if (G.queued) { G.queued = false; G.waitT = 0.8; }   // toucher gardé : on laisse lire la bulle, puis on repart
      updateHint();
    }
    var burstDone = false;

    function advance() {
      if (G.state === "done") { reset(); return; }
      if (G.state === "walk") { if (!G.queued && G.idx + 1 < WAY.length - 1) { G.queued = true; call("onQueue"); } return; }
      if (G.state !== "idle" || G.idx >= WAY.length - 1) return;
      G.firstTap = true; G.waitT = 0;
      startWalk();
    }
    S.advance = advance;

    function resetState() {
      G.state = "idle"; G.idx = 0; G.firstTap = false; G.bubbleIdx = -1; G.queued = false; G.waitT = 0;
      hero.visible = true; hero.scale.setScalar(1); hero.position.copy(START); face(-1, -1);
      body.position.y = 0; legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0;
      for (var i = 0; i < stations.length; i++) { stations[i].active = false; stations[i].actT = 0; stations[i].k = 0; setLit(stations[i].mats, 0); stations[i].pool.material.opacity = 0; stations[i].update(0, S.t, false); }
      hinge.rotation.y = 0; doorPool.material.opacity = 0;
      parts.visible = false; bubble.visible = false;
      S.camV = vOf(START); updateHint();
    }
    S.resetState = resetState;

    // position du personnage à l'écran (px, dans le conteneur), pour poser la main d'aide
    var tmpV = new THREE.Vector3();
    S.heroScreen = function () {
      tmpV.copy(hero.position); tmpV.project(cam);   // aux pieds
      return { x: (tmpV.x + 1) / 2 * S.W, y: (1 - tmpV.y) / 2 * S.H };
    };

    // ---------- boucle ----------
    function update(dt) {
      var t = S.t, rm = S.rm;
      // toucher gardé en mémoire : départ après le temps de lecture
      if (G.state === "idle" && G.waitT > 0) {
        G.waitT -= dt;
        if (G.waitT <= 0) { G.waitT = 0; G.firstTap = true; startWalk(); }
      }
      // marche
      if (G.state === "walk") {
        G.walkT += dt * SPEED;
        var f = Math.min(1, G.walkT / G.walkLen);
        hero.position.lerpVectors(G.from, G.to, f);
        G.phase += dt * 11;
        var sw = Math.sin(G.phase);
        legL.rotation.x = sw * 0.6; legR.rotation.x = -sw * 0.6;
        armL.rotation.x = -sw * 0.5; armR.rotation.x = sw * 0.5;
        body.position.y = Math.abs(Math.cos(G.phase)) * 0.06;
        if (f >= 1) arriveAt(G.idx + 1);
      } else {
        var k = 1 - Math.exp(-dt * 12);
        legL.rotation.x += (0 - legL.rotation.x) * k; legR.rotation.x += (0 - legR.rotation.x) * k;
        armL.rotation.x += (0 - armL.rotation.x) * k; armR.rotation.x += (0 - armR.rotation.x) * k;
        body.position.y += (0 - body.position.y) * k;
      }
      // entrée dans le bureau
      if (G.state === "enter" || G.state === "done") {
        G.enterT += dt;
        var e = G.enterT;
        hinge.rotation.y = -1.7 * ease(e / 0.5);
        doorPool.material.opacity = 0.9;
        if (G.state === "enter") {
          if (e > 0.35) {
            var f2 = ease((e - 0.35) / 0.6);
            hero.position.lerpVectors(DOOR_GOAL, DOOR_IN, f2);
            hero.scale.setScalar(1 - 0.5 * f2);
            if (!rm) { G.phase += dt * 11; legL.rotation.x = Math.sin(G.phase) * 0.5; legR.rotation.x = -Math.sin(G.phase) * 0.5; }
            if (!burstDone && !rm) { burst(); burstDone = true; }
          }
          if (e > 1.0) hero.visible = false;
          // puis grand plan : la caméra plonge dans la porte (sauf mouvement réduit)
          if (e > (rm ? 1.0 : ZOOM_START + ZOOM_T)) {
            G.state = "done";
            if (typeof S.opts.onArrive === "function") { try { S.opts.onArrive(); } catch (err) { setTimeout(function () { throw err; }); } }
          }
        }
      } else {
        // la porte s'éclaire quand elle est la prochaine étape
        var nextDoor = G.idx === 4;
        var target = nextDoor ? (rm ? 0.7 : 0.55 + 0.35 * Math.sin(t * 3)) : 0;
        doorPool.material.opacity += (target - doorPool.material.opacity) * Math.min(1, dt * 4);
      }
      doorM.color.setHex(0x2a2f6a).lerp(doorLit, clamp01(doorPool.material.opacity));
      // particules
      if (parts.visible) {
        for (var i = 0; i < NP; i++) {
          pVel[i].y -= 6 * dt;
          pPos[i * 3] += pVel[i].x * dt; pPos[i * 3 + 1] += pVel[i].y * dt; pPos[i * 3 + 2] += pVel[i].z * dt;
        }
        pGeo.attributes.position.needsUpdate = true;
        pMat.opacity -= dt * 0.7;
        if (pMat.opacity <= 0) parts.visible = false;
      }
      // stations
      for (var s = 0; s < stations.length; s++) {
        var st = stations[s];
        if (st.active) { st.actT += dt; st.k = rm ? 1 : clamp01(st.actT / 0.5); }
        setLit(st.mats, st.k);
        st.pool.material.opacity = 0.45 * st.k;
        st.update(dt, t, st.active && !rm);
      }
      // bulle
      if (bubble.visible) {
        G.bubbleT += dt;
        var sc = rm ? 1 : 0.6 + 0.4 * easeBack(G.bubbleT / 0.35);
        var bw = Math.min(7.0, S.visW * 0.92);
        bubble.scale.set(bw * sc, bw * S.bubbleAspect * sc, 1);
        bubble.quaternion.copy(cam.quaternion);
      }
      // indices
      if (dots[1].visible) {
        var weak = G.firstTap ? 0.75 : 1;
        for (var j = 0; j < dots.length; j++) {
          if (!dots[j].visible) continue;
          dots[j].material.opacity = weak * (rm ? 0.7 : 0.25 + 0.75 * Math.max(0, Math.sin(t * 5 - dots[j].userData.i * 0.55)));
        }
      }
      if (arrow.visible) {
        arrow.position.y = arrow.userData.y + (rm ? 0 : Math.sin(t * 4) * 0.15);
        if (!rm) arrow.rotation.y += dt * 1.5;
      }
      // décor
      if (!rm) {
        for (var b = 0; b < blinkers.length; b++) {
          var bl = blinkers[b], on = Math.sin(t * 3 + bl.ph) > 0.3;
          bl.m.color.copy(on ? bl.on : bl.off);
        }
        drone.position.y = 2.3 + Math.sin(t * 1.6) * 0.2;
        drone.rotation.y += dt * 0.6;
        var rf = 0.5 - 0.5 * Math.cos(t * 0.6);
        rover.position.lerpVectors(roverA, roverB, rf);
        var dir = Math.sin(t * 0.6) >= 0 ? 1 : -1;
        rover.rotation.y = Math.atan2((roverB.x - roverA.x) * dir, (roverB.z - roverA.z) * dir);
      }
      // caméra : grand plan dans la porte à la fin, sinon elle suit le personnage
      var zf = (!rm && (G.state === "enter" || G.state === "done")) ? clamp01((G.enterT - ZOOM_START) / ZOOM_T) : 0;
      if (zf > 0) { zoomCamera(zf); return; }
      if (S.zoom0) { S.zoom0 = null; cam.zoom = 1; cam.updateProjectionMatrix(); veil.style.opacity = ""; }
      var want = vOf(hero.position) + ((G.idx >= 5 || (G.state === "walk" && G.idx === 4)) ? -3.4 : 0);
      S.camV += (want - S.camV) * (1 - Math.exp(-dt * 3));
      placeCamera();
    }

    // Zoom avant dans la porte : la porte glisse vers le centre de l'écran et grossit jusqu'à le remplir.
    var DOOR_C = new THREE.Vector3(BC.x, 0.9, doorZ + 0.01);
    function zoomCamera(zf) {
      if (!S.zoom0) {
        cam.updateMatrixWorld();
        var n = DOOR_C.clone().project(cam);   // position de la porte à l'écran (−1…1) au début du plan
        S.zoom0 = {
          target: S.camTarget.clone(),
          dx: n.x * (cam.right - cam.left) / 2, dy: n.y * (cam.top - cam.bottom) / 2,
          right: new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion),
          up: new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
        };
      }
      var z0 = S.zoom0, g = ease(zf), z = Math.pow(ZOOM_MAX, g * g);
      var k = 1 - (1 - g) / z;   // part du décalage porte → centre déjà rattrapée
      var look = z0.target.clone().addScaledVector(z0.right, z0.dx * k).addScaledVector(z0.up, z0.dy * k);
      cam.position.set(look.x + 30, look.y + 30, look.z + 30);
      cam.lookAt(look);
      cam.zoom = z; cam.updateProjectionMatrix();
      veil.style.opacity = String(1 - g);
    }

    function placeCamera() {
      // le personnage se tient à 25 % au-dessus du bas de la zone du milieu
      var d = 0.25 * S.zoneH / S.ppu;
      var v = S.camV + d / 0.57735;
      S.camTarget.copy(P(0, v));
      cam.position.set(S.camTarget.x + 30, 30, S.camTarget.z + 30);
      cam.lookAt(S.camTarget);
    }

    function resize() {
      var r = container.getBoundingClientRect();
      var W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
      S.W = W; S.H = H;
      renderer.setSize(W, H, false);
      var zoneTop = H * TOP_FREE, zoneBot = H - BOTTOM_FREE;
      S.zoneH = Math.max(120, zoneBot - zoneTop);
      S.ppu = Math.min(W / VIEW_W, S.zoneH / VIEW_H);
      var zc = (zoneTop + zoneBot) / 2;
      cam.left = -W / 2 / S.ppu; cam.right = W / 2 / S.ppu;
      cam.top = zc / S.ppu; cam.bottom = -(H - zc) / S.ppu;
      cam.updateProjectionMatrix();
      S.visW = W / S.ppu;
      placeCamera();
      sign.quaternion.copy(cam.quaternion);
      if (!S.raf) renderer.render(scene, cam);
    }
    S.resize = resize;

    function frame(now) {
      S.raf = requestAnimationFrame(frame);
      var dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 0.016;
      S.last = now; S.t += dt;
      update(dt);
      renderer.render(scene, cam);
    }
    S.play = function () { if (!S.raf && S.visible && !document.hidden) { S.last = 0; S.raf = requestAnimationFrame(frame); } };
    S.pause = function () { if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; } };

    // ---------- entrées : un toucher = une étape ----------
    var down = null;
    S.on = [];
    function on(target, type, fn, o) { target.addEventListener(type, fn, o); S.on.push([target, type, fn, o]); }
    on(canvas, "pointerdown", function (e) { if (e.isPrimary === false) return; down = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; });
    on(canvas, "pointermove", function (e) {
      if (!down || e.pointerId !== down.id) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (dx * dx + dy * dy > 144) down.moved = true;
    });
    on(canvas, "pointerup", function (e) { if (down && e.pointerId === down.id && !down.moved) advance(); down = null; });
    on(canvas, "pointercancel", function () { down = null; });
    on(canvas, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advance(); } });
    on(document, "visibilitychange", function () { if (document.hidden) S.pause(); else S.play(); });
    if (mq) {
      var mqf = function () { S.rm = mq.matches; };
      if (mq.addEventListener) mq.addEventListener("change", mqf); else if (mq.addListener) mq.addListener(mqf);
      S.mqf = mqf;
    }
    if (window.ResizeObserver) { S.ro = new ResizeObserver(resize); S.ro.observe(container); }
    else on(window, "resize", resize);
    if (window.IntersectionObserver) {
      S.io = new IntersectionObserver(function (en) {
        S.visible = en[en.length - 1].isIntersecting;
        if (S.visible) S.play(); else S.pause();
      });
      S.io.observe(container);
    }

    resize();
    resetState();
    S.play();
    return api;
  }

  function reset() { if (inst) inst.resetState(); }

  function stop() {
    var S = inst; if (!S) return;
    inst = null;
    S.pause();
    if (S.io) S.io.disconnect();
    if (S.ro) S.ro.disconnect();
    for (var i = 0; i < S.on.length; i++) S.on[i][0].removeEventListener(S.on[i][1], S.on[i][2], S.on[i][3]);
    if (S.mq && S.mqf) { if (S.mq.removeEventListener) S.mq.removeEventListener("change", S.mqf); else if (S.mq.removeListener) S.mq.removeListener(S.mqf); }
    S.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    S.disposables.forEach(function (t) { t.dispose(); });
    S.renderer.dispose();
    if (S.canvas.parentNode) S.canvas.parentNode.removeChild(S.canvas);
    if (S.veil && S.veil.parentNode) S.veil.parentNode.removeChild(S.veil);
  }

  var api = {
    mount: mount, reset: reset, stop: stop,
    CONSIGNE: CONSIGNE, ETAPES: ETAPES,
    heroScreen: function () { return inst ? inst.heroScreen() : null; },
    // aide aux tests : état courant, sans effet sur le jeu
    _etat: function () { return inst ? { etat: inst.G.state, index: inst.G.idx, enAttente: inst.G.queued || inst.G.waitT > 0, t: Math.round(inst.G.enterT * 100) / 100 } : null; }
  };
  window.JeuBureau = api;
})();
