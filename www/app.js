"use strict";
/* Artenquiz – Daten von iNaturalist (Taxonomie, Fotos, Verbreitung, Wikipedia-Links) */

const API = "https://api.inaturalist.org/v1";
const LIFE_ID = 48460;                 // Wurzel „Life“
const PLANT_LIKE = [47126, 47170];     // Plantae, Fungi → „Abteilung“ statt „Stamm“
const ROUND_SIZE = 15;
const MAX_POOL_PAGES = 4;              // höchstens 4 × 500 Arten pro Auswahl

const RANKS = ["kingdom", "phylum", "class", "order", "family", "genus", "species"];
const RANK = {
  kingdom: { label: "Reich", ask: "Zu welchem Reich gehört diese Art?", within: "In welchem Reich?" },
  phylum: { label: "Abteilung/Stamm", within: "In welcher Abteilung bzw. welchem Stamm?" },
  class: { label: "Klasse", ask: "Zu welcher Klasse gehört diese Art?", within: "In welcher Klasse?" },
  order: { label: "Ordnung", ask: "Zu welcher Ordnung gehört diese Art?", within: "In welcher Ordnung?" },
  family: { label: "Familie", ask: "Zu welcher Familie gehört diese Art?", within: "In welcher Familie?" },
  genus: { label: "Gattung", ask: "Zu welcher Gattung gehört diese Art?", within: "In welcher Gattung?" },
  species: { label: "Art", ask: "Welche Art ist das?" }
};
const ITALIC = new Set(["genus", "species", "subspecies", "variety", "form"]);
const PLACE_DE = {
  "deutschland": "Germany", "österreich": "Austria", "schweiz": "Switzerland", "europa": "Europe",
  "afrika": "Africa", "asien": "Asia", "nordamerika": "North America", "südamerika": "South America",
  "australien": "Australia", "ozeanien": "Oceania", "frankreich": "France", "italien": "Italy",
  "spanien": "Spain", "polen": "Poland", "tschechien": "Czech Republic", "niederlande": "Netherlands",
  "belgien": "Belgium", "dänemark": "Denmark", "schweden": "Sweden", "norwegen": "Norway",
  "finnland": "Finland", "großbritannien": "United Kingdom", "vereinigtes königreich": "United Kingdom",
  "griechenland": "Greece", "kroatien": "Croatia", "ungarn": "Hungary", "türkei": "Turkey",
  "russland": "Russia", "china": "China", "japan": "Japan", "indien": "India", "brasilien": "Brazil",
  "kanada": "Canada", "mexiko": "Mexico", "neuseeland": "New Zealand", "südafrika": "South Africa",
  "sachsen-anhalt": "Sachsen-Anhalt", "sachsen": "Sachsen", "thüringen": "Thüringen", "bayern": "Bayern"
};
const QUICK_PLACES = [["Deutschland", "Germany"], ["Europa", "Europe"]];

// ---------- kleine Helfer ----------
const $app = document.getElementById("app");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const slim = t => ({ id: t.id, name: t.name, rank: t.rank, common: t.preferred_common_name || null });
const groupRankFor = oben => RANKS[RANKS.indexOf(oben) - 1] || null;

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
function taxonEl(t, showCommon = true) {
  return h("span", { class: "taxon" },
    h("span", { class: "sci" + (ITALIC.has(t.rank) ? " it" : ""), text: t.name }),
    showCommon && t.common ? h("span", { class: "common", text: t.common }) : null);
}
function rankLabel(rank, plantLike) {
  if (rank === "phylum") return plantLike === undefined ? RANK.phylum.label : plantLike ? "Abteilung" : "Stamm";
  return RANK[rank].label;
}
function rankAsk(rank, plantLike) {
  if (rank === "phylum") return plantLike ? "Zu welcher Abteilung gehört diese Art?" : "Zu welchem Stamm gehört diese Art?";
  return RANK[rank].ask;
}
const photoUrl = (p, size) => p && p.url ? p.url.replace(/\/(square|small|medium|large|original)\./, `/${size}.`) : null;

const store = {
  get(k, d) { try { const v = localStorage.getItem("artenquiz." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("artenquiz." + k, JSON.stringify(v)); } catch { /* ohne Speicher weiterspielen */ } }
};

// ---------- Capacitor (nur in der App vorhanden) ----------
const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
function openExternal(url) {
  try { if (Plugins.Browser) return Plugins.Browser.open({ url }); } catch { /* fällt auf window.open zurück */ }
  window.open(url, "_blank", "noopener");
}

// ---------- Netz: höchstens ~1 Anfrage pro Sekunde, mit Wiederholung ----------
let queue = Promise.resolve(), lastReq = 0;
function friendly(e) {
  if (e && e.userMessage) return e.userMessage;
  if (e && e.name === "AbortError") return "iNaturalist antwortet gerade nicht. Versuche es gleich noch einmal.";
  return "Keine Verbindung zu iNaturalist. Prüfe die Internetverbindung und versuche es erneut.";
}
function api(path, params = {}) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = Math.max(0, lastReq + 1050 - Date.now());
      if (wait) await sleep(wait);
      lastReq = Date.now();
      const u = new URL(API + path);
      for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
      u.searchParams.set("locale", "de");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch(u, { signal: ctrl.signal });
        if (r.ok) return await r.json();
        const retry = r.status === 429 || r.status >= 500;
        const err = new Error("HTTP " + r.status);
        err.userMessage = r.status === 429
          ? "iNaturalist bremst gerade zu viele Anfragen. Warte eine Minute und versuche es erneut."
          : `iNaturalist meldet einen Fehler (${r.status}). Versuche es später erneut.`;
        err.retry = retry;
        throw err;
      } catch (e) {
        const retry = e.retry !== false;
        if (!retry || attempt >= 2) throw e;
        await sleep(2500 * (attempt + 1));
      } finally {
        clearTimeout(timer);
      }
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
async function fetchTaxa(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const d = await api("/taxa/" + chunk.join(","), { per_page: 30 });
    for (const t of d.results || []) out.set(t.id, t);
  }
  return out;
}

// ---------- Zustand ----------
const DEFAULTS = { oben: "family", unten: "species", group: null, place: null, native: true, showCommon: true };
let settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
if (settings.group && settings.group.rank !== groupRankFor(settings.oben)) settings.group = null;
let stats = Object.assign({ rounds: 0, answered: 0, correct: 0 }, store.get("stats", {}));
let screen = "setup";
let gen = 0;           // jede neue Runde / Rückkehr zur Auswahl stoppt alte Vorlade-Schleifen
let session = null;    // Artenpool und Caches für die aktuelle Eingrenzung
let round = null;
let zoomEl = null;

function saveSettings() { store.set("settings", settings); }
function levelsNow() { return RANKS.slice(RANKS.indexOf(settings.oben), RANKS.indexOf(settings.unten) + 1); }
function groupTaxon() {
  return groupRankFor(settings.oben) ? settings.group : { id: LIFE_ID, name: "Life", rank: "stateofmatter", common: "Alle Lebewesen" };
}

// ---------- Auswahl-Bildschirm ----------
function searchBox({ placeholder, search, onPick, render }) {
  const input = h("input", { type: "search", placeholder, autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search" });
  const note = h("div", { class: "hint" });
  const list = h("div", { class: "suggest" });
  let timer = null, token = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.replaceChildren(); note.textContent = ""; token++; return; }
    timer = setTimeout(async () => {
      const my = ++token;
      note.textContent = "Suche läuft …";
      try {
        const items = await search(q);
        if (my !== token) return;
        list.replaceChildren(...items.map(it => h("button", { type: "button", class: "suggest-item", onclick: () => onPick(it) }, render(it))));
        note.textContent = items.length ? "" : "Nichts gefunden. Probiere den wissenschaftlichen Namen.";
      } catch (e) {
        if (my === token) note.textContent = friendly(e);
      }
    }, 350);
  });
  return h("div", { class: "searchbox" }, input, note, list);
}

async function searchGroup(q, rank) {
  const a = await api("/taxa/autocomplete", { q, rank, is_active: "true", per_page: 15 });
  let items = (a.results || []).filter(t => t.rank === rank);
  if (!items.length) {
    const b = await api("/taxa", { q, rank, is_active: "true", per_page: 10 });
    items = (b.results || []).filter(t => t.rank === rank);
  }
  return items.slice(0, 8).map(slim);
}
async function searchPlace(q) {
  const mapped = PLACE_DE[q.toLowerCase()] || q;
  const d = await api("/places/autocomplete", { q: mapped, per_page: 8 });
  return (d.results || []).map(p => ({ id: p.id, name: p.display_name || p.name }));
}
async function quickPlace(label, query) {
  const cache = store.get("places", {});
  if (cache[query]) return { id: cache[query], name: label };
  const d = await api("/places/autocomplete", { q: query, per_page: 5 });
  const res = d.results || [];
  const p = res.find(x => (x.name || "").toLowerCase() === query.toLowerCase()) || res[0];
  if (!p) throw Object.assign(new Error("not found"), { userMessage: `${label} wurde bei iNaturalist nicht gefunden.` });
  cache[query] = p.id; store.set("places", cache);
  return { id: p.id, name: label };
}

function showSetup(message) {
  screen = "setup"; gen++; closeZoom();
  const gr = groupRankFor(settings.oben);
  const iO = RANKS.indexOf(settings.oben), iU = RANKS.indexOf(settings.unten);

  const ladder = h("div", { class: "ladder" },
    h("span", { class: "lbl", text: "von" }),
    h("div", { class: "chips" }, RANKS.map((r, i) => h("button", {
      type: "button", class: "chip" + (i === iO ? " on" : i > iO && i <= iU ? " inrange" : ""),
      "aria-pressed": String(i === iO),
      onclick: () => {
        settings.oben = r;
        if (RANKS.indexOf(settings.unten) < i) settings.unten = r;
        if (settings.group && settings.group.rank !== groupRankFor(r)) settings.group = null;
        saveSettings(); showSetup();
      }
    }, rankLabel(r)))),
    h("span", { class: "lbl", text: "bis" }),
    h("div", { class: "chips" }, RANKS.map((r, i) => h("button", {
      type: "button", class: "chip" + (i === iU ? " on" : i >= iO && i < iU ? " inrange" : ""),
      disabled: i < iO, "aria-pressed": String(i === iU),
      onclick: () => { settings.unten = r; saveSettings(); showSetup(); }
    }, rankLabel(r))))
  );

  let groupField;
  if (!gr) {
    groupField = h("div", { class: "field" }, h("h2", { text: "Gruppe" }), h("p", { class: "hint", text: "Ab dem Reich wird über alle Lebewesen gespielt." }));
  } else if (settings.group) {
    groupField = h("div", { class: "field" }, h("h2", { text: RANK[gr].within }),
      h("div", { class: "picked" }, taxonEl(settings.group),
        h("button", { type: "button", class: "textbtn", onclick: () => { settings.group = null; saveSettings(); showSetup(); } }, "Ändern")));
  } else {
    groupField = h("div", { class: "field" }, h("h2", { text: RANK[gr].within }),
      searchBox({
        placeholder: gr === "order" ? "z. B. Poales oder Süßgrasartige" : "wissenschaftlicher oder deutscher Name",
        search: q => searchGroup(q, gr),
        onPick: t => { settings.group = t; saveSettings(); showSetup(); },
        render: t => taxonEl(t)
      }));
  }

  const placeNote = h("div", { class: "hint" });
  const placeChips = h("div", { class: "chips" },
    h("button", { type: "button", class: "chip" + (!settings.place ? " on" : ""), onclick: () => { settings.place = null; saveSettings(); showSetup(); } }, "Weltweit"),
    QUICK_PLACES.map(([label, query]) => h("button", {
      type: "button", class: "chip" + (settings.place && settings.place.name === label ? " on" : ""),
      onclick: async () => {
        placeNote.textContent = "Ort wird gesucht …";
        try { settings.place = await quickPlace(label, query); saveSettings(); if (screen === "setup") showSetup(); }
        catch (e) { placeNote.textContent = friendly(e); }
      }
    }, label))
  );
  const otherPlace = settings.place && !QUICK_PLACES.some(([l]) => l === settings.place.name);
  const placeField = h("div", { class: "field" }, h("h2", { text: "Wo soll die Art vorkommen?" }), placeChips,
    otherPlace ? h("div", { class: "picked", style: "margin-top:10px" }, h("span", { text: settings.place.name }),
      h("button", { type: "button", class: "textbtn", onclick: () => { settings.place = null; saveSettings(); showSetup(); } }, "Entfernen")) : null,
    h("div", { style: "margin-top:10px" }, searchBox({
      placeholder: "Anderes Land, Bundesland oder Erdteil",
      search: searchPlace,
      onPick: p => { settings.place = p; saveSettings(); showSetup(); },
      render: p => h("span", { text: p.name })
    })),
    placeNote,
    h("label", { class: "check" + (settings.place ? "" : " off") },
      h("input", { type: "checkbox", checked: settings.native, disabled: !settings.place, onchange: e => { settings.native = e.target.checked; saveSettings(); } }),
      "Nur dort heimische Arten")
  );

  const optionsField = h("div", { class: "field" },
    h("label", { class: "check" },
      h("input", { type: "checkbox", checked: settings.showCommon, onchange: e => { settings.showCommon = e.target.checked; saveSettings(); } }),
      "Deutsche Namen bei den Antworten zeigen"));

  const ready = !gr || settings.group;
  const pct = stats.answered ? Math.round(100 * stats.correct / stats.answered) : null;
  $app.replaceChildren(h("main", { class: "setup" },
    h("h1", { text: "Artenquiz" }),
    h("p", { class: "lead", text: "Zu jedem Foto bestimmst du Stufe für Stufe, wohin die Art in der Systematik gehört." }),
    h("div", { class: "field" }, h("h2", { text: "Welche Stufen willst du bestimmen?" }), ladder),
    groupField, placeField, optionsField,
    message ? h("p", { class: "error-text", text: message }) : null,
    pct !== null ? h("p", { class: "stats", text: `Bisher ${stats.rounds} ${stats.rounds === 1 ? "Runde" : "Runden"} gespielt, ${pct} % der Fragen richtig beantwortet.` }) : null,
    h("button", { type: "button", class: "btn", disabled: !ready, onclick: () => startRound() }, `${ROUND_SIZE} Arten laden`),
    !ready ? h("p", { class: "hint", style: "margin-top:8px", text: "Wähle zuerst eine Gruppe aus." }) : null
  ));
}

// ---------- Laden, Fehler ----------
function showLoading(text) {
  screen = "loading";
  $app.replaceChildren(h("main", { class: "center" },
    h("div", { class: "pulse" }), h("h1", { text: text }),
    h("p", { text: "Die Daten kommen von iNaturalist. Das dauert ein paar Sekunden." }),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, "Abbrechen")));
}
function showError(e, retry) {
  screen = "error";
  $app.replaceChildren(h("main", { class: "center" },
    h("h1", { text: "Laden hat nicht geklappt" }), h("p", { text: friendly(e) }),
    h("button", { type: "button", class: "btn", onclick: retry }, "Erneut versuchen"),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, "Zur Auswahl")));
}

// ---------- Artenpool ----------
function sessionKey() {
  const g = groupTaxon();
  return JSON.stringify([g && g.id, settings.place && settings.place.id, !!(settings.place && settings.native)]);
}
async function loadPoolPage() {
  session.page++;
  const d = await api("/observations/species_counts", {
    taxon_id: session.group.id,
    place_id: settings.place && settings.place.id,
    native: settings.place && settings.native ? "true" : undefined,
    quality_grade: "research", per_page: 500, page: session.page
  });
  const res = d.results || [];
  for (const r of res) {
    const t = r.taxon;
    if (!t || t.rank !== "species" || !t.default_photo) continue;
    session.pool.push({ count: r.count, taxon: t });
    session.regional.add(t.id);
    if (Array.isArray(t.ancestor_ids)) { session.poolHasAnc = true; t.ancestor_ids.forEach(id => session.regional.add(id)); }
  }
  if (res.length < 500 || session.page >= MAX_POOL_PAGES) session.poolDone = true;
}
// gewichtete Zufallsauswahl: häufig beobachtete Arten kommen öfter dran
function weightedSample(arr, n) {
  return arr.map(p => ({ p, k: Math.pow(Math.random(), 1 / Math.sqrt(Math.max(1, p.count))) }))
    .sort((a, b) => b.k - a.k).slice(0, n).map(x => x.p);
}

async function startRound() {
  const my = ++gen;
  const key = sessionKey();
  if (!session || session.key !== key) {
    session = { key, group: groupTaxon(), pool: [], page: 0, poolDone: false, seen: new Set(), regional: new Set(), poolHasAnc: false, sib: new Map(), anc: new Map() };
  }
  let restarted = false;
  showLoading("Arten werden ausgewählt");
  try {
    let avail = session.pool.filter(p => !session.seen.has(p.taxon.id));
    while (avail.length < ROUND_SIZE && !session.poolDone) {
      await loadPoolPage();
      if (my !== gen) return;
      avail = session.pool.filter(p => !session.seen.has(p.taxon.id));
    }
    if (!session.pool.length) {
      return showSetup("Für diese Auswahl gibt es bei iNaturalist keine Arten mit Foto. Wähle eine größere Gruppe oder einen anderen Ort.");
    }
    // kleine Auswahl: mit schon gespielten Arten auffüllen
    let picked = weightedSample(avail, ROUND_SIZE);
    if (picked.length < ROUND_SIZE && session.pool.length > picked.length) {
      const ids = new Set(picked.map(p => p.taxon.id));
      picked = picked.concat(weightedSample(session.pool.filter(p => !ids.has(p.taxon.id)), ROUND_SIZE - picked.length));
      restarted = true;
      session.seen.clear();
    }
    picked.forEach(p => session.seen.add(p.taxon.id));

    showLoading("Systematik wird geladen");
    const details = await fetchTaxa(picked.map(p => p.taxon.id));
    if (my !== gen) return;
    const need = new Set();
    for (const p of picked) {
      const t = details.get(p.taxon.id) || p.taxon;
      const anc = t.ancestor_ids || [];
      const gi = anc.indexOf(session.group.id);
      for (const id of gi >= 0 ? anc.slice(gi + 1) : anc) if (id !== t.id && !session.anc.has(id)) need.add(id);
    }
    if (need.size) {
      const got = await fetchTaxa([...need]);
      got.forEach((t, id) => session.anc.set(id, slim(t)));
    }
    if (my !== gen) return;

    const levels = levelsNow();
    round = { gen: my, levels, idx: 0, score: 0, possible: 0, restarted, items: picked.map(p => buildItem(p, details.get(p.taxon.id) || p.taxon, levels)) };
    prefetchAll(round);
    await prepare(round.items[0]);
    if (my !== gen) return;
    showItem();
  } catch (e) {
    if (my === gen) showError(e, () => startRound());
  }
}

function buildItem(p, t, levels) {
  const chain = {};
  for (const id of t.ancestor_ids || []) {
    const a = session.anc.get(id);
    if (a && levels.includes(a.rank)) chain[a.rank] = a;
  }
  chain.species = slim(t);
  const photo = t.default_photo || p.taxon.default_photo;
  return {
    taxon: slim(t), count: p.count, chain, levels,
    plantLike: (t.ancestor_ids || p.taxon.ancestor_ids || []).some(id => PLANT_LIKE.includes(id)),
    photo: photo ? { url: photo.medium_url || photo.url, attribution: photo.attribution, license: photo.license_code } : null,
    wikipedia: t.wikipedia_url || null,
    questions: null, step: 0, prep: null
  };
}

// ---------- Fragen vorbereiten (Falschantworten) ----------
async function siblings(parentId, rank) {
  const key = parentId + "|" + rank;
  if (!session.sib.has(key)) {
    const d = await api("/taxa", { taxon_id: parentId, rank, is_active: "true", per_page: 200 });
    session.sib.set(key, (d.results || []).filter(t => t.rank === rank).map(slim));
  }
  return session.sib.get(key);
}
function prepare(item) {
  if (!item.prep) {
    item.prep = (async () => {
      const qs = [];
      let parent = session.group;
      for (const L of item.levels) {
        const correct = item.chain[L];
        if (!correct) { qs.push({ rank: L, skip: "missing" }); continue; }
        let others = [];
        if (L === "species" && session.poolHasAnc) {
          others = session.pool.map(p => p.taxon)
            .filter(t => t.id !== correct.id && (t.ancestor_ids || []).includes(parent.id))
            .map(t => ({ ...slim(t), regional: true }));
        }
        if (others.length < 3) {
          const have = new Set(others.map(o => o.id));
          const sib = await siblings(parent.id, L);
          others = others.concat(sib.filter(s => s.id !== correct.id && !have.has(s.id)).map(s => ({ ...s, regional: session.regional.has(s.id) })));
        }
        if (!others.length) {
          qs.push({ rank: L, skip: "only", correct });
        } else {
          const chosen = shuffle(others.filter(o => o.regional)).concat(shuffle(others.filter(o => !o.regional))).slice(0, 3);
          qs.push({ rank: L, correct, options: shuffle([{ ...correct, isCorrect: true }, ...chosen]), answer: null });
        }
        parent = correct;
      }
      item.questions = qs;
      item.step = firstOpen(item, 0);
      const pre = new Image(); pre.src = photoUrl(item.photo, "large") || "";
      return item;
    })().catch(e => { item.prep = null; throw e; });
  }
  return item.prep;
}
function firstOpen(item, from) {
  let s = from;
  while (s < item.questions.length && item.questions[s].skip) s++;
  return s;
}
async function prefetchAll(r) {
  for (const it of r.items) {
    if (r.gen !== gen) return;
    try { await prepare(it); } catch { /* wird beim Anzeigen erneut versucht */ }
  }
}

// ---------- Quiz-Bildschirm ----------
async function showItem() {
  const r = round, item = r.items[r.idx];
  if (!item.questions) {
    showLoading("Nächste Art wird geladen");
    try { await prepare(item); } catch (e) { return showError(e, () => showItem()); }
    if (r !== round || r.gen !== gen) return;
  }
  screen = "quiz";
  const img = h("img", { alt: "Foto der gesuchten Art", src: photoUrl(item.photo, "large"), onclick: () => openZoom(item) });
  img.addEventListener("error", () => { if (img.src !== item.photo.url) img.src = item.photo.url; }, { once: true });
  const trail = h("ol", { class: "trail", "aria-label": "Bestimmungspfad" });
  const panel = h("section", { class: "panel" });
  const score = h("span", { class: "score" });
  $app.replaceChildren(h("main", {},
    h("div", { class: "bar" },
      h("button", { type: "button", class: "textbtn", onclick: confirmQuit }, "Beenden"),
      h("span", { class: "count", text: `Art ${r.idx + 1} von ${r.items.length}` }),
      score),
    h("figure", { class: "photo" }, img),
    item.photo && item.photo.attribution ? h("div", { class: "credit", text: item.photo.attribution + (item.photo.license ? ` (${item.photo.license.toUpperCase()})` : "") }) : null,
    trail, panel));
  window.scrollTo(0, 0);
  updateQuiz(item, trail, panel, score);
}

function updateQuiz(item, trail, panel, scoreEl) {
  const r = round;
  scoreEl.textContent = `${r.score} ${r.score === 1 ? "Punkt" : "Punkte"}`;
  const done = item.step >= item.questions.length;

  trail.replaceChildren(...item.questions.map((q, i) => {
    let cls = "later", value = "…", it = false;
    if (q.skip === "missing") { cls = "free"; value = "fehlt"; }
    else if (q.skip === "only") { if (i < item.step) { cls = "free"; value = q.correct.name; it = ITALIC.has(q.rank); } }
    else if (q.answer != null) { cls = q.answer === q.correct.id ? "ok" : "bad"; value = q.correct.name; it = ITALIC.has(q.rank); }
    else if (i === item.step) { cls = "now"; value = "?"; }
    return h("li", { class: cls },
      h("span", { class: "dot" }),
      h("span", { class: "r", text: rankLabel(q.rank, item.plantLike) }),
      h("span", { class: "v" + (it ? " it" : ""), text: value }));
  }));
  const nowLi = trail.querySelector(".now");
  if (nowLi) nowLi.scrollIntoView({ block: "nearest", inline: "center" });

  if (done) {
    const last = r.idx >= r.items.length - 1;
    panel.replaceChildren(h("div", { class: "reveal" },
      h("h2", { text: item.taxon.name }),
      item.taxon.common ? h("p", { class: "common-big", text: item.taxon.common }) : null,
      item.questions.some(q => q.skip === "only") ? h("p", { class: "hint", text: "Grau markierte Stufen hatten keine Alternative und wurden übersprungen." }) : null,
      item.wikipedia ? h("button", { type: "button", class: "btn secondary", onclick: () => openExternal(item.wikipedia) }, "Auf Wikipedia nachlesen") : null,
      h("button", { type: "button", class: "btn", onclick: () => { if (last) showEnd(); else { r.idx++; showItem(); } } }, last ? "Ergebnis ansehen" : "Nächste Art")));
    return;
  }

  const q = item.questions[item.step];
  const answered = q.answer != null;
  const list = h("div", { class: "options" + (answered ? " answered" : ""), role: "group", "aria-label": rankAsk(q.rank, item.plantLike) },
    q.options.map(o => {
      const chosen = answered && o.id === q.answer;
      const cls = "option" + (o.isCorrect ? " correct" : "") + (chosen ? " chosen" : "") + (chosen && !o.isCorrect ? " wrongpick" : "");
      return h("button", {
        type: "button", class: cls, disabled: answered || null,
        onclick: () => answer(item, q, o, trail, panel, scoreEl)
      }, taxonEl(o, settings.showCommon || answered), answered && (o.isCorrect || chosen) ? h("span", { class: "mark", text: o.isCorrect ? "✓" : "✗" }) : null);
    }));
  const right = answered && q.answer === q.correct.id;
  panel.replaceChildren(
    h("h2", { class: "ask", text: rankAsk(q.rank, item.plantLike) }),
    list,
    answered ? h("p", { class: "feedback " + (right ? "good" : "bad"), "aria-live": "polite",
      text: right ? "Richtig." : `Leider falsch. Richtig ist ${q.correct.name}${q.correct.common ? ` (${q.correct.common})` : ""}.` }) : null,
    answered && !right ? h("button", { type: "button", class: "btn", onclick: () => next(item, trail, panel, scoreEl) }, "Weiter") : null
  );
}

function answer(item, q, o, trail, panel, scoreEl) {
  if (q.answer != null) return;
  q.answer = o.id;
  round.possible++;
  stats.answered++;
  if (o.isCorrect) { round.score++; stats.correct++; }
  store.set("stats", stats);
  updateQuiz(item, trail, panel, scoreEl);
  if (o.isCorrect) {
    const r = round, step = item.step;
    setTimeout(() => { if (round === r && screen === "quiz" && item.step === step) next(item, trail, panel, scoreEl); }, 750);
  }
}
function next(item, trail, panel, scoreEl) {
  item.step = firstOpen(item, item.step + 1);
  updateQuiz(item, trail, panel, scoreEl);
}
function confirmQuit() {
  if (window.confirm("Runde beenden? Die Punkte dieser Runde werden nicht gezählt.")) showSetup();
}

function openZoom(item) {
  closeZoom();
  zoomEl = h("div", { class: "zoom", role: "dialog", "aria-label": "Foto in voller Größe", onclick: closeZoom },
    h("img", { src: photoUrl(item.photo, "large"), alt: "Foto der gesuchten Art" }));
  document.body.append(zoomEl);
}
function closeZoom() { if (zoomEl) { zoomEl.remove(); zoomEl = null; } }

// ---------- Rundenende ----------
function showEnd() {
  screen = "end";
  const r = round;
  stats.rounds++;
  store.set("stats", stats);
  const pct = r.possible ? Math.round(100 * r.score / r.possible) : 0;
  $app.replaceChildren(h("main", { class: "end" },
    h("h1", { text: "Runde geschafft" }),
    h("p", { class: "lead", text: `Du hast ${r.score} von ${r.possible} Fragen richtig beantwortet (${pct} %).` +
      (r.restarted ? " Diese Auswahl hat nur wenige Arten, deshalb waren einige schon einmal dran." : "") }),
    h("ol", { class: "results" }, r.items.map(it => h("li", {},
      h("img", { src: photoUrl(it.photo, "square") || "", alt: "", loading: "lazy" }),
      h("div", { class: "info" }, taxonEl(it.taxon),
        h("div", { class: "marks", "aria-label": "Ergebnis je Stufe" }, (it.questions || []).map(q =>
          h("span", { class: "m" + (q.skip ? "" : q.answer === q.correct.id ? " ok" : " bad"), title: rankLabel(q.rank, it.plantLike) }))))))),
    h("button", { type: "button", class: "btn", onclick: () => startRound() }, `Weitere ${ROUND_SIZE} Arten`),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, "Auswahl ändern")));
  window.scrollTo(0, 0);
}

// ---------- Zurück-Taste unter Android ----------
try {
  if (Plugins.App) Plugins.App.addListener("backButton", () => {
    if (zoomEl) closeZoom();
    else if (screen === "quiz") confirmQuit();
    else if (screen !== "setup") showSetup();
    else Plugins.App.exitApp();
  });
} catch { /* im Browser gibt es keine Zurück-Taste-Schnittstelle */ }

showSetup();
