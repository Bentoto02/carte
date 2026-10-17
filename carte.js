/* carte.js : la carte de visite (panneaux, parcours, questionnaire « Votre projet »). Chargé en defer par carte.html. */
/* ===================================================================================================
   ADRESSE DE RÉCEPTION DU QUESTIONNAIRE « Votre projet »
   Coller ici l'URL de l'application web Google Apps Script (elle finit par /exec),
   voir formulaire/MODE-EMPLOI.md. Tant que c'est vide, le questionnaire dit clairement
   que rien n'a été envoyé.
   =================================================================================================== */
var FORM_ENDPOINT = "";

var PAGE_URL = "https://bentoto02.github.io/carte/";
var VCF_URL = "https://bentoto02.github.io/carte/benjamin-huteau.vcf";
var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
var feu = function () {};   // gerbe d'étincelles (remplie plus bas, sauf mouvement réduit)

function qr(id, text) {
  try {
    new QRCode(document.getElementById(id), {
      text: text, width: 256, height: 256,
      colorDark: "#070912", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M
    });
  } catch (e) {}
}

/* ---------- Panneaux plein écran (Ma carte, Votre projet, Vos données) ----------
   Chaque ouverture ajoute une entrée d'historique : le geste « retour » du téléphone ferme le panneau
   au lieu de quitter la carte. */
var pile = [], ignorerPop = 0;
function ouvrir(id) {
  var p = document.getElementById(id);
  if (!p.hidden) return;
  var h = { p: p, depuis: document.activeElement, hist: false };
  p.hidden = false;
  var d = p.querySelector(".p-defile"); if (d) d.scrollTop = 0;
  pile.push(h);
  document.documentElement.classList.add("verrou");
  try { history.pushState({ panneau: id }, ""); h.hist = true; } catch (e) {}
  var f = p.querySelector("[data-focus]");
  if (f) try { f.focus({ preventScroll: true }); } catch (e) {}
}
function masquerHaut() {
  var h = pile.pop(); if (!h) return null;
  h.p.hidden = true;
  if (!pile.length) document.documentElement.classList.remove("verrou");
  if (h.depuis && h.depuis.focus) try { h.depuis.focus({ preventScroll: true }); } catch (e) {}
  return h;
}
function fermer() {
  var h = masquerHaut();
  if (h && h.hist) { ignorerPop++; history.back(); }
}
window.addEventListener("popstate", function () {
  if (ignorerPop) { ignorerPop--; return; }
  masquerHaut();
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && pile.length) fermer(); });
document.querySelectorAll("[data-fermer]").forEach(function (b) { b.addEventListener("click", fermer); });
document.querySelectorAll("[data-donnees]").forEach(function (b) { b.addEventListener("click", function () { ouvrir("p-donnees"); }); });

/* ---------- La porte : « Et vous, quel est votre projet ? » ---------- */
var porteScene = document.getElementById("porte"), played = false;
function playCard() { if (!played && !calm) { played = true; decodeName(); typeRole(); } }
function ouvrirCarte() { ouvrir("p-carte"); playCard(); }
document.getElementById("ouvrir-carte").addEventListener("click", ouvrirCarte);
document.getElementById("ouvrir-projet").addEventListener("click", function () { ouvrirProjet(); });
document.getElementById("carte-projet").addEventListener("click", function () { ouvrirProjet(); });   // s'ouvre par-dessus la carte
function allerPorte(doux) { porteScene.scrollIntoView({ behavior: doux && !calm ? "smooth" : "auto", block: "start" }); }
document.getElementById("passer").addEventListener("click", function () { allerPorte(true); });

/* Entrée dans le bureau : fondu, puis on se retrouve devant la porte */
function entrerBureau(apres) {
  var f = document.getElementById("fondu");
  function arrive() {
    allerPorte(false);
    if (apres) apres();
    setTimeout(function () { feu(window.innerWidth / 2, window.innerHeight * .96, 2); }, 120);   // en bas : ne cache pas le titre
  }
  if (calm) { arrive(); return; }
  f.classList.add("on");
  setTimeout(function () { arrive(); setTimeout(function () { f.classList.remove("on"); }, 60); }, 380);
}
var rejouer = function () {};
document.getElementById("rejouer").addEventListener("click", function () {
  fermer();
  rejouer();
  document.querySelector(".s-jeu").scrollIntoView({ behavior: "auto", block: "start" });
});

/* ---------- Le parcours : la méthode en 4 étapes. Barre de progression, consigne, flèche ; 3D si possible, sinon 4 cartes ---------- */
var ETAPES_SECOURS = [
  { titre: "Comprendre", phrase: "On commence par un échange : votre métier, vos outils, ce qui vous fait perdre du temps." },
  { titre: "Proposer", phrase: "Je vous présente une ou deux solutions claires, avec un devis détaillé. Vous choisissez." },
  { titre: "Mettre en place", phrase: "Je construis, je teste avec vous, et je vous montre comment vous en servir.",
    tags: ["Automatisation", "Agent IA", "CRM", "Site", "Logiciel", "Jeu", "Outil sur mesure"] },
  { titre: "Accompagner", phrase: "30 jours d'accompagnement inclus : corrections, réglages et bilan. Au-delà, on décide ensemble." }
];
function startParcours() {
  var box = document.getElementById("jeu"), scene = document.querySelector(".s-jeu");
  var phrase = document.getElementById("jeu-phrase"), barre = document.getElementById("jeu-progres");
  var fleche = document.getElementById("jeu-fleche"), cibleFleche = null, timer = 0;

  function consigne(t) { phrase.textContent = t; }
  function progres(n) { barre.firstChild.style.width = (n * 20) + "%"; barre.setAttribute("aria-valuenow", n); }
  /* La flèche : posée sur une cible (fonction qui renvoie {x, y} dans la scène), suivie à chaque image */
  function montrer(cible, delai, gauche) {   // gauche : la flèche pointe vers la gauche ; sinon elle pointe vers le haut, sous la cible
    clearTimeout(timer);
    timer = setTimeout(function () {
      cibleFleche = cible; fleche.hidden = false; fleche.classList.toggle("gauche", !!gauche); fleche.classList.toggle("haut", !gauche);
      (function suivre() {
        if (cibleFleche !== cible) return;
        var p = cible();
        if (p) fleche.style.transform = gauche
          ? "translate(" + Math.round(p.x) + "px," + Math.round(p.y - 28) + "px)"
          : "translate(" + Math.round(p.x - 24) + "px," + Math.round(p.y + 6) + "px)";
        requestAnimationFrame(suivre);
      })();
    }, delai || 0);
  }
  function cacher() { clearTimeout(timer); cibleFleche = null; fleche.hidden = true; }

  /* 1. Le parcours 3D */
  var ok = null;
  if (window.THREE && window.JeuBureau && box) {
    try {
      ok = JeuBureau.mount(box, {
        onWalk: function (vers) { cacher(); consigne(vers === 5 ? "On entre…" : "En route…"); },
        onQueue: function () { consigne("C'est noté : on continue juste après !"); },
        onStep: function (i) {
          var n = i + 1;
          progres(n);
          consigne(n === 4 ? "Dernier toucher : entrez dans mon bureau !" : "Touchez pour continuer");
          var e = JeuBureau._etat();
          if (!(e && e.enAttente)) montrer(JeuBureau.heroScreen, 700);
        },
        onArrive: function () {
          progres(5);
          entrerBureau(function () { JeuBureau.reset(); depart(); });
        }
      });
    } catch (e) { ok = null; }
  }
  function depart() { progres(0); consigne("Touchez le personnage pour découvrir ma méthode"); if (ok) montrer(JeuBureau.heroScreen, 300); }
  if (ok) { rejouer = function () { JeuBureau.reset(); depart(); }; depart(); return; }

  /* 2. Secours (pas de WebGL, ou Three.js absent) : 4 cartes qui s'allument une par une, puis le bureau */
  var etapes = (window.JeuBureau && JeuBureau.ETAPES) || ETAPES_SECOURS;
  var plan = document.createElement("div"); plan.className = "plan"; plan.id = "plan";
  var cartes = [], faites = 0;
  etapes.forEach(function (e) {
    var b = document.createElement("button"); b.type = "button"; b.className = "etape";
    var t = document.createElement("span"), s = document.createElement("small");
    t.textContent = e.titre; s.textContent = e.phrase.replace(/ ([:;!?])/g, " $1");
    if (e.tags) { var em = document.createElement("em"); em.textContent = e.tags.join(" · "); s.appendChild(em); }
    b.appendChild(t); b.appendChild(s);
    plan.appendChild(b); cartes.push(b);
  });
  var porte = document.createElement("button"); porte.type = "button"; porte.className = "etape bureau";
  porte.textContent = "Entrer dans mon bureau";
  plan.appendChild(porte); cartes.push(porte);
  box.appendChild(plan);
  function cible(el) {
    return function () {
      var a = el.getBoundingClientRect(), s = scene.getBoundingClientRect();
      return { x: a.right - s.left - 46, y: a.top - s.top + a.height / 2 };
    };
  }
  function etat() {
    cartes.forEach(function (c, i) {
      c.classList.toggle("on", i < faites && i < 4);
      c.classList.toggle("cur", i === faites);
      c.disabled = i !== faites;
    });
    progres(faites);
    if (faites < 5) montrer(cible(cartes[faites]), 250, true); else cacher();
    consigne(faites === 0 ? "Touchez la première étape" : faites < 4 ? "Touchez l'étape suivante" :
      faites === 4 ? "Dernier toucher : entrez dans mon bureau !" : "");
  }
  cartes.forEach(function (c, i) {
    c.addEventListener("click", function () {
      if (i !== faites) return;
      faites++; etat();
      if (faites === 5) entrerBureau(function () { faites = 0; etat(); });
    });
  });
  rejouer = function () { faites = 0; etat(); };
  etat();
}

/* ---------- Le questionnaire « Votre projet » (questions : recherche-parcours-client.md, Priorité 1) ---------- */
var QUESTIONS = [
  { id: "profil", titre: "Vous êtes…", type: "un",
    choix: ["Indépendant", "Commerçant ou artisan", "Petite entreprise (2 à 10 personnes)", "Entreprise (plus de 10)", "Association", "Particulier"] },
  { id: "secteur", titre: "Votre métier ou secteur ?", type: "un", autre: "Autre",
    choix: ["Commerce", "Artisanat / bâtiment", "Santé / bien-être", "Conseil / services", "Restauration / tourisme", "Immobilier", "Autre"] },
  { id: "projet", titre: "Votre projet, c'est plutôt…", type: "plusieurs", aide: "Plusieurs choix possibles.", seul: "Je ne sais pas encore",
    choix: ["Gagner du temps (automatiser des tâches)", "Un assistant IA (répondre, trier, rédiger)", "Mieux suivre mes clients (CRM)", "Un site internet",
      "Un logiciel ou un outil sur mesure", "Un jeu ou une expérience interactive", "Je ne sais pas encore"] },
  { id: "perte_temps", titre: "Ce qui vous fait perdre du temps aujourd'hui ?", type: "texte", facultatif: true,
    aide: "Ex. : je recopie les devis à la main, je réponds aux mêmes mails…" },
  { id: "outils", titre: "Vos outils actuels", type: "plusieurs", aide: "Plusieurs choix possibles.", seul: "Rien de particulier",
    choix: ["Papier / carnet", "Excel ou Google Sheets", "Gmail / Outlook", "Un logiciel métier", "Un CRM", "Rien de particulier"] },
  { id: "quand", titre: "Pour quand ?", type: "un",
    choix: ["Dès que possible", "Dans 1 à 3 mois", "Plus tard", "Je me renseigne"] },
  { id: "budget", titre: "Budget indicatif ?", type: "un", aide: "Juste pour vous proposer une solution adaptée.",
    choix: ["Moins de 500 €", "500 à 2 000 €", "2 000 à 5 000 €", "Plus de 5 000 €", "Je ne sais pas encore"] },
  { id: "contact", titre: "Comment vous recontacter ?", type: "contact" }
];
var MAX = { court: 100, texte: 1000 };
var R = { profil: "", secteur: "", secteur_autre: "", projet: [], perte_temps: "", outils: [], quand: "", budget: "",
  prenom: "", telephone: "", email: "", preference: "", consentement: false, site_web: "" };
var qi = 0, qEnvoye = false, qAuto = 0, qEnCours = false;
var qEcran = document.getElementById("q-ecran"), qBarre = document.getElementById("q-progres"), qRetour = document.getElementById("q-retour");

function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function barreQ(f) { qBarre.firstChild.style.width = Math.round(f * 100) + "%"; qBarre.setAttribute("aria-valuenow", Math.round(f * 100)); }
function ouvrirProjet() {
  ouvrir("p-projet");
  if (qEnvoye) merci(); else afficher(qi);
}
qRetour.addEventListener("click", function () {
  clearTimeout(qAuto);
  if (qEnvoye || qi === 0) fermer(); else afficher(qi - 1);
});
function titreQ(q) {
  var h = el("h2", "q-titre", q.titre); h.id = "q-titre"; h.tabIndex = -1;
  if (q.facultatif) h.appendChild(el("span", "q-fac", " (facultatif)"));
  return h;
}
function afficher(i) {
  clearTimeout(qAuto);
  qi = i; qEcran.innerHTML = ""; qRetour.hidden = false;
  barreQ((i + 1) / (QUESTIONS.length + 1));
  var q = QUESTIONS[i];
  var h = titreQ(q); qEcran.appendChild(h);
  if (q.aide) qEcran.appendChild(el("p", "q-aide", q.aide));
  if (q.type === "texte") ecranTexte(q); else if (q.type === "contact") ecranContact(); else ecranChoix(q);
  document.getElementById("q-defile").scrollTop = 0;
  try { h.focus({ preventScroll: true }); } catch (e) {}
}
function suivant() { if (qi < QUESTIONS.length - 1) afficher(qi + 1); }

function ecranChoix(q) {
  var multi = q.type === "plusieurs";
  var liste = el("div", "q-choix"); liste.setAttribute("role", "group"); liste.setAttribute("aria-labelledby", "q-titre");
  var err = el("p", "q-err"); err.setAttribute("role", "alert");
  var suite = el("button", "q-suite", "Continuer"); suite.type = "button";
  var boutons = [], autreBox = null, autreIn = null;
  function choisi(c) { return multi ? R[q.id].indexOf(c) >= 0 : R[q.id] === c; }
  function maj() {
    boutons.forEach(function (b) { b.setAttribute("aria-pressed", String(choisi(b.dataset.v))); });
    if (!multi) suite.hidden = !R[q.id];
    if (autreBox) autreBox.hidden = R[q.id] !== q.autre;
  }
  q.choix.forEach(function (c) {
    var b = el("button", "q-opt" + (multi ? " multi" : "")); b.type = "button"; b.dataset.v = c;
    b.appendChild(el("span", "q-coche")); b.appendChild(el("span", "", c));
    b.addEventListener("click", function () {
      err.textContent = "";
      if (multi) {
        var a = R[q.id], k = a.indexOf(c);
        if (k >= 0) a.splice(k, 1);
        else {
          if (c === q.seul) a.length = 0;
          else { var s = a.indexOf(q.seul); if (s >= 0) a.splice(s, 1); }
          a.push(c);
        }
        maj();
      } else {
        R[q.id] = c; maj();
        clearTimeout(qAuto);
        if (c === q.autre) { try { autreIn.focus(); } catch (e) {} }
        else qAuto = setTimeout(suivant, calm ? 120 : 320);   // un toucher suffit : on passe à la question suivante
      }
    });
    boutons.push(b); liste.appendChild(b);
  });
  qEcran.appendChild(liste);
  if (q.autre) {
    autreBox = el("div", "q-champ");
    var lb = el("label", "", "Précisez "); lb.appendChild(el("span", "", "(facultatif)")); lb.htmlFor = "q-autre";
    autreIn = el("input", "q-in"); autreIn.id = "q-autre"; autreIn.type = "text"; autreIn.maxLength = 80; autreIn.autocomplete = "off";
    autreIn.value = R.secteur_autre;
    autreIn.addEventListener("input", function () { R.secteur_autre = autreIn.value; });
    autreBox.appendChild(lb); autreBox.appendChild(autreIn); qEcran.appendChild(autreBox);
  }
  qEcran.appendChild(err);
  suite.addEventListener("click", function () {
    if (multi ? !R[q.id].length : !R[q.id]) { err.textContent = multi ? "Choisissez au moins une réponse." : "Choisissez une réponse."; return; }
    suivant();
  });
  qEcran.appendChild(suite);
  maj();
}

function ecranTexte(q) {
  var t = el("textarea", "q-texte"); t.id = "q-texte"; t.maxLength = MAX.texte; t.rows = 4;
  t.setAttribute("aria-labelledby", "q-titre"); t.value = R[q.id];
  t.addEventListener("input", function () { R[q.id] = t.value; });
  qEcran.appendChild(t);
  var suite = el("button", "q-suite", "Continuer"); suite.type = "button";
  suite.addEventListener("click", suivant);
  qEcran.appendChild(suite);
}

function telOk(v) { var d = v.replace(/[\s.\-()]/g, ""); return /^\+?\d{9,15}$/.test(d); }
function mailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

function ecranContact() {
  var f = el("form"); f.noValidate = true; f.id = "q-form";
  function champ(id, label, opt, attrs) {
    var w = el("div", "q-champ"), lb = el("label", "", label); lb.htmlFor = id;
    if (opt) lb.appendChild(el("span", "", " " + opt));
    var i = el("input", "q-in"); i.id = id; i.name = id;
    for (var k in attrs) i.setAttribute(k, attrs[k]);
    var e = el("p", "q-err"); e.id = id + "-err"; i.setAttribute("aria-describedby", e.id);
    w.appendChild(lb); w.appendChild(i); w.appendChild(e); f.appendChild(w);
    return i;
  }
  var prenom = champ("q-prenom", "Prénom", "", { type: "text", autocomplete: "given-name", maxlength: "60", autocapitalize: "words" });
  f.appendChild(el("p", "q-note", "Votre téléphone ou votre e-mail : au moins l'un des deux."));
  var tel = champ("q-tel", "Téléphone", "", { type: "tel", autocomplete: "tel", inputmode: "tel", maxlength: "30" });
  var mail = champ("q-mail", "E-mail", "", { type: "email", autocomplete: "email", inputmode: "email", maxlength: "120", autocapitalize: "off", spellcheck: "false" });
  prenom.value = R.prenom; tel.value = R.telephone; mail.value = R.email;

  var pw = el("div", "q-champ"), pl = el("span", "q-label", "Je préfère être recontacté par"); pl.id = "q-pref-l";
  var prefs = el("div", "q-choix q-prefs"); prefs.setAttribute("role", "group"); prefs.setAttribute("aria-labelledby", "q-pref-l");
  var pe = el("p", "q-err"); pe.id = "q-pref-err";
  ["Appel", "SMS", "E-mail"].forEach(function (c) {
    var b = el("button", "q-opt petit"); b.type = "button"; b.dataset.v = c;
    b.appendChild(el("span", "q-coche")); b.appendChild(el("span", "", c));
    b.setAttribute("aria-pressed", String(R.preference === c));
    b.addEventListener("click", function () {
      R.preference = c; pe.textContent = "";
      prefs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.v === c)); });
    });
    prefs.appendChild(b);
  });
  pw.appendChild(pl); pw.appendChild(prefs); pw.appendChild(pe); f.appendChild(pw);

  var cl = el("label", "q-consent"), cb = el("input"); cb.type = "checkbox"; cb.id = "q-consent"; cb.checked = R.consentement;
  var ct = el("span", "", "J'accepte d'être recontacté au sujet de mon projet. ");
  var lien = el("button", "lien lien-ligne", "Vos données"); lien.type = "button";
  lien.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); ouvrir("p-donnees"); });
  ct.appendChild(lien);
  cl.appendChild(cb); cl.appendChild(ct); f.appendChild(cl);
  var ce = el("p", "q-err"); ce.id = "q-consent-err"; cb.setAttribute("aria-describedby", ce.id); f.appendChild(ce);
  cb.addEventListener("change", function () { R.consentement = cb.checked; if (cb.checked) { ce.textContent = ""; cl.classList.remove("invalide"); } });

  /* Champ piège : invisible pour une personne, souvent rempli par les robots. Un envoi qui le remplit est ignoré. */
  var pg = el("div", "piege"); pg.setAttribute("aria-hidden", "true");
  var pgl = el("label", "", "Ne pas remplir ce champ"); pgl.htmlFor = "q-site";
  var pgi = el("input"); pgi.type = "text"; pgi.id = "q-site"; pgi.name = "site_web"; pgi.tabIndex = -1; pgi.autocomplete = "off"; pgi.value = R.site_web;
  pgi.addEventListener("input", function () { R.site_web = pgi.value; });
  pg.appendChild(pgl); pg.appendChild(pgi); f.appendChild(pg);

  var go = el("button", "q-suite", "Envoyer"); go.type = "submit"; go.id = "q-envoyer"; f.appendChild(go);
  var st = el("div", "q-statut"); st.id = "q-statut"; st.setAttribute("role", "status"); st.hidden = true; f.appendChild(st);
  var mention = el("p", "q-mention", "Vos réponses servent uniquement à vous recontacter au sujet de votre projet. Elles sont gardées dans mon compte Google. ");
  var l2 = el("button", "lien lien-ligne", "Vos données"); l2.type = "button";
  l2.addEventListener("click", function () { ouvrir("p-donnees"); });
  mention.appendChild(l2); f.appendChild(mention);
  qEcran.appendChild(f);

  function lire() {
    R.prenom = prenom.value.trim(); R.telephone = tel.value.trim(); R.email = mail.value.trim();
    R.consentement = cb.checked; R.site_web = pgi.value;
  }
  [prenom, tel, mail].forEach(function (i) { i.addEventListener("input", function () { lire(); }); });
  function erreur(input, msg) {
    var e = document.getElementById(input.getAttribute("aria-describedby"));
    if (e) e.textContent = msg || "";
    if (input.tagName === "INPUT" && input.type !== "checkbox") input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  /* Vérification quand on quitte un champ, pas pendant la frappe */
  tel.addEventListener("blur", function () { lire(); erreur(tel, R.telephone && !telOk(R.telephone) ? "Ce numéro semble incomplet." : ""); });
  mail.addEventListener("blur", function () { lire(); erreur(mail, R.email && !mailOk(R.email) ? "Cette adresse e-mail semble incomplète." : ""); });
  prenom.addEventListener("blur", function () { if (prenom.value.trim()) erreur(prenom, ""); });

  function valider() {
    lire();
    var premier = null;
    function ko(input, msg, cible) { erreur(input, msg); if (!premier) premier = cible || input; }
    erreur(prenom, ""); erreur(tel, ""); erreur(mail, ""); pe.textContent = ""; ce.textContent = ""; cl.classList.remove("invalide");
    if (!R.prenom) ko(prenom, "Indiquez votre prénom.");
    if (!R.telephone && !R.email) ko(tel, "Indiquez un téléphone ou un e-mail (au moins l'un des deux).");
    if (R.telephone && !telOk(R.telephone)) ko(tel, "Ce numéro semble incomplet.");
    if (R.email && !mailOk(R.email)) ko(mail, "Cette adresse e-mail semble incomplète.");
    if (!R.preference) { pe.textContent = "Choisissez comment je vous recontacte."; if (!premier) premier = prefs.firstChild; }
    else if ((R.preference === "Appel" || R.preference === "SMS") && !R.telephone) { pe.textContent = "Pour un appel ou un SMS, indiquez votre téléphone."; if (!premier) premier = tel; }
    else if (R.preference === "E-mail" && !R.email) { pe.textContent = "Pour une réponse par e-mail, indiquez votre e-mail."; if (!premier) premier = mail; }
    if (!R.consentement) { ce.textContent = "Cochez la case pour que je puisse vous recontacter."; cl.classList.add("invalide"); if (!premier) premier = cb; }
    if (premier) { try { premier.focus(); premier.scrollIntoView({ block: "center" }); } catch (e) {} return false; }
    return true;
  }
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    if (qEnCours) return;
    st.hidden = true;
    if (valider()) envoyer(go, st);
  });
}

function statut(st, titre, texte, reessayer) {
  st.innerHTML = ""; st.hidden = false;
  var p = el("p"); p.appendChild(el("strong", "", titre)); st.appendChild(p);
  st.appendChild(el("p", "", texte));
  if (reessayer) {
    var b = el("button", "q-suite", "Réessayer"); b.type = "button";
    b.addEventListener("click", function () { document.getElementById("q-envoyer").click(); });
    st.appendChild(b);
  }
  var a = el("a", "q-suite second", "Enregistrer mon contact"); a.href = VCF_URL; a.target = "_blank"; a.rel = "noopener";
  a.style.cssText = "display:flex;align-items:center;justify-content:center;text-decoration:none";
  st.appendChild(a);
  try { st.scrollIntoView({ block: "nearest" }); } catch (e) {}
}

function envoyer(go, st) {
  /* Pas encore relié : on le dit, on ne fait pas semblant */
  if (!FORM_ENDPOINT) {
    statut(st, "Vos réponses n'ont pas été envoyées.",
      "Le formulaire n'est pas encore relié à ma boîte de réception. Vos réponses restent ici. Pour me joindre dès maintenant, enregistrez mon contact.", false);
    return;
  }
  /* Envoi « simple » (formulaire encodé, sans en-tête ajouté) : le navigateur ne fait pas de pré-requête OPTIONS,
     qu'Apps Script ne sait pas traiter. Apps Script répond par une redirection vers googleusercontent.com,
     que fetch suit, et dont la réponse JSON est lisible : on sait vraiment si c'est arrivé. */
  var d = new URLSearchParams();
  d.append("profil", R.profil);
  d.append("secteur", R.secteur);
  d.append("secteur_autre", R.secteur === "Autre" ? R.secteur_autre.trim() : "");
  d.append("projet", R.projet.join(" · "));
  d.append("perte_temps", R.perte_temps.trim());
  d.append("outils", R.outils.join(" · "));
  d.append("quand", R.quand);
  d.append("budget", R.budget);
  d.append("prenom", R.prenom);
  d.append("telephone", R.telephone);
  d.append("email", R.email);
  d.append("preference", R.preference);
  d.append("consentement", R.consentement ? "oui" : "non");
  d.append("page", location.href.slice(0, 500));
  d.append("site_web", R.site_web);

  qEnCours = true; go.disabled = true; go.textContent = "Envoi en cours…";
  var ctrl = window.AbortController ? new AbortController() : null;
  var minuteur = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
  fetch(FORM_ENDPOINT, { method: "POST", body: d, redirect: "follow", credentials: "omit", signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) { if (!j || j.ok !== true) throw new Error("refus"); fin(); qEnvoye = true; merci(); })
    .catch(function () {
      fin();
      statut(st, "L'envoi n'a pas abouti.", "Vos réponses sont toujours là. Vérifiez votre connexion, puis réessayez.", true);
    });
  function fin() { clearTimeout(minuteur); qEnCours = false; go.disabled = false; go.textContent = "Envoyer"; }
}

function merci() {
  clearTimeout(qAuto);
  qEcran.innerHTML = ""; barreQ(1); qRetour.hidden = true;
  var box = el("div", "q-merci");
  var h = el("h2", "q-titre", "Merci " + R.prenom + "."); h.tabIndex = -1; box.appendChild(h);
  box.appendChild(el("p", "", "Je vous recontacte sous 48 h pour un appel de 20 minutes, gratuit et sans engagement."));
  var a = el("a", "save"); a.href = VCF_URL; a.target = "_blank"; a.rel = "noopener";
  a.appendChild(el("span", "save-ico", "+")).setAttribute("aria-hidden", "true");
  var t = el("span", "save-txt"); t.appendChild(el("strong", "", "Enregistrer mon contact")); t.appendChild(document.createTextNode("Téléphone et mail dans votre répertoire"));
  a.appendChild(t); box.appendChild(a);
  var b = el("button", "q-suite second", "Fermer"); b.type = "button"; b.addEventListener("click", fermer); box.appendChild(b);
  qEcran.appendChild(box);
  try { h.focus({ preventScroll: true }); } catch (e) {}
}

document.addEventListener("DOMContentLoaded", function () {
  qr("qr-page", PAGE_URL);
  startParcours();
});

/* La vidéo démarre seule, sans le son ; relance si le téléphone l'a bloquée */
(function () {
  var v = document.getElementById("vid");
  function go() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  go(); document.addEventListener("touchstart", go, { once: true, passive: true });
})();

var decodeName = function () {}, typeRole = function () {};

if (!calm) {
  /* Nom qui se décode */
  decodeName = function () {
    var el = document.getElementById("name-anim"), final = document.getElementById("name").getAttribute("data-text");
    var glyphs = "01<>/{}#$%&*+=?ABCDEFXYZ", frame = 0, total = 38;
    function tick() {
      var out = "";
      for (var i = 0; i < final.length; i++) {
        var reveal = (frame / total) * final.length * 1.4 - i * .4;
        out += final[i] === " " ? " " : (reveal > 1 ? final[i] : glyphs[(Math.random() * glyphs.length) | 0]);
      }
      el.textContent = out;
      if (++frame <= total) requestAnimationFrame(tick); else el.textContent = final;
    }
    setTimeout(tick, 250);
  };

  /* Rôle qui s'écrit, puis fait défiler les spécialités */
  typeRole = function () {
    var el = document.getElementById("type");
    var words = ["Consultant développeur IA", "Jeux et logiciels", "CRM et automatisations", "Assistants IA sur mesure", "Consultant développeur IA"];
    var w = 0, c = words[0].length, del = false;
    function step() {
      var word = words[w];
      if (!del) {
        c++; el.textContent = word.slice(0, c);
        if (c >= word.length) { if (w === words.length - 1) return; del = true; return setTimeout(step, 1600); }
      } else {
        c--; el.textContent = word.slice(0, c);
        if (c <= 0) { del = false; w++; }
      }
      setTimeout(step, del ? 28 : 55);
    }
    setTimeout(function () { del = true; step(); }, 2600);
  };

  /* Toucher l'écran : gerbe d'étincelles et onde de choc */
  (function () {
    var cv = document.getElementById("fx"), ctx = cv.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W, H, parts = [], rings = [], running = false;
    function size() { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size(); window.addEventListener("resize", size);
    var cols = ["#3ee6ff", "#7c6cff", "#5dffb5", "#ffffff"];
    function burst(x, y, force) {
      var n = force ? 46 * force : 46, sp = force ? 1 + force * .4 : 1;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283, s = (1.5 + Math.random() * 6) * sp;
        parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: cols[i % 4], r: 1 + Math.random() * 2.4 });
      }
      rings.push({ x: x, y: y, r: 4, life: 1 });
      if (!running) { running = true; requestAnimationFrame(loop); }
    }
    feu = burst;
    function loop() {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.x += p.vx; p.y += p.vy; p.vx *= .955; p.vy = p.vy * .955 + .06; p.life -= .018;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      for (var k = rings.length - 1; k >= 0; k--) {
        var g = rings[k]; g.r += 7; g.life -= .03;
        if (g.life <= 0) { rings.splice(k, 1); continue; }
        ctx.globalAlpha = g.life * .8; ctx.strokeStyle = "#3ee6ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 6.283); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      if (parts.length || rings.length) requestAnimationFrame(loop); else running = false;
    }
    document.getElementById("show").addEventListener("pointerdown", function (e) {
      burst(e.clientX, e.clientY);
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {}
    });
  })();

  /* Carte qui s'incline et reflet qui suit le doigt */
  (function () {
    var frame = document.getElementById("frame"), card = document.getElementById("card");
    function move(x, y) {
      var r = frame.getBoundingClientRect();
      if (!r.width) return;
      var px = (x - r.left) / r.width, py = (y - r.top) / r.height;
      frame.style.transform = "rotateY(" + ((px - .5) * 8) + "deg) rotateX(" + ((.5 - py) * 8) + "deg)";
      card.style.setProperty("--mx", (px * 100) + "%");
      card.style.setProperty("--my", (py * 100) + "%");
    }
    window.addEventListener("pointermove", function (e) { move(e.clientX, e.clientY); });
    window.addEventListener("pointerleave", function () { frame.style.transform = ""; });
  })();

  /* Réseau de neurones en fond */
  (function () {
    var cv = document.getElementById("net"), ctx = cv.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2), W, H, pts = [], mouse = { x: -999, y: -999 };
    function size() {
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(90, (W * H) / 14000));
      pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, p: Math.random() * 6.28 });
    }
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
    var pulses = [];
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var L = 130;
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i];
        a.x += a.vx; a.y += a.vy; a.p += .03;
        if (a.x < 0 || a.x > W) a.vx *= -1;
        if (a.y < 0 || a.y > H) a.vy *= -1;
        var dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dm < 160) { a.x += (a.x - mouse.x) / dm * .6; a.y += (a.y - mouse.y) / dm * .6; }
        for (var j = i + 1; j < pts.length; j++) {
          var b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < L) {
            ctx.strokeStyle = "rgba(124,108,255," + (1 - d / L) * .35 + ")";
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            if (Math.random() < .0008 && pulses.length < 14) pulses.push({ a: a, b: b, t: 0 });
          }
        }
        ctx.fillStyle = "rgba(62,230,255," + (.45 + Math.sin(a.p) * .3) + ")";
        ctx.beginPath(); ctx.arc(a.x, a.y, 1.6, 0, 6.28); ctx.fill();
      }
      /* Impulsions qui voyagent le long des liens */
      for (var k = pulses.length - 1; k >= 0; k--) {
        var q = pulses[k]; q.t += .025;
        if (q.t >= 1) { pulses.splice(k, 1); continue; }
        var x = q.a.x + (q.b.x - q.a.x) * q.t, y = q.a.y + (q.b.y - q.a.y) * q.t;
        ctx.fillStyle = "rgba(93,255,181,.9)"; ctx.shadowColor = "#5dffb5"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
      }
      requestAnimationFrame(draw);
    }
    size(); draw();
  })();
}
