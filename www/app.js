"use strict";
/* Artenquiz – Oberfläche. Daten kommen aus data.js (QuizData). */

const { RANKS, ITALIC } = QuizData;
const ROUND_SIZE = 15;
const t = I18N.t;
// Vorschläge je Rang der Gruppe: [wissenschaftlicher Name, deutsch, englisch]
const SUGGEST = {
  kingdom: [["Animalia", "Tiere", "Animals"], ["Plantae", "Pflanzen", "Plants"], ["Fungi", "Pilze", "Fungi"]],
  phylum: [["Chordata", "Chordatiere", "Chordates"], ["Arthropoda", "Gliederfüßer", "Arthropods"], ["Mollusca", "Weichtiere", "Molluscs"], ["Tracheophyta", "Gefäßpflanzen", "Vascular plants"], ["Basidiomycota", "Ständerpilze", "Basidiomycetes"]],
  class: [["Aves", "Vögel", "Birds"], ["Mammalia", "Säugetiere", "Mammals"], ["Insecta", "Insekten", "Insects"], ["Magnoliopsida", "Zweikeimblättrige", "Dicots"], ["Agaricomycetes", "Agaricomycetes (Pilze)", "Agaricomycetes (fungi)"]],
  order: [["Poales", "Süßgrasartige", "Grasses and sedges"], ["Lepidoptera", "Schmetterlinge", "Butterflies and moths"], ["Coleoptera", "Käfer", "Beetles"], ["Passeriformes", "Sperlingsvögel", "Perching birds"], ["Agaricales", "Champignonartige", "Gilled mushrooms"], ["Boletales", "Dickröhrlingsartige", "Boletes"]],
  family: [["Asteraceae", "Korbblütler", "Daisy family"], ["Orchidaceae", "Orchideen", "Orchids"], ["Carabidae", "Laufkäfer", "Ground beetles"], ["Anatidae", "Entenvögel", "Ducks, geese and swans"], ["Boletaceae", "Dickröhrlingsverwandte", "Boletes"]],
  genus: [["Carex", "Seggen", "Sedges"], ["Quercus", "Eichen", "Oaks"], ["Bombus", "Hummeln", "Bumblebees"], ["Amanita", "Wulstlinge", "Amanitas"]]
};
// Schnellwahl Orte: [Suchbegriff bei iNaturalist, deutsch, englisch]
const QUICK_PLACES = [["Germany", "Deutschland", "Germany"], ["Europe", "Europa", "Europe"]];
const byLang = (de, en) => I18N.lang === "en" ? en : de;

// ---------- Helfer ----------
const $app = document.getElementById("app");
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
  const R = t("rank");
  if (rank === "phylum") return plantLike === undefined ? R.phylum : plantLike ? R.phylumPlant : R.phylumAnimal;
  return R[rank];
}
function rankAsk(rank, plantLike) {
  const A = t("ask");
  if (rank === "phylum") return plantLike ? A.phylumPlant : A.phylumAnimal;
  return A[rank];
}
const photoUrl = (p, size) => p && p.url ? p.url.replace(/\/(square|small|medium|large|original)\./, `/${size}.`) : "";
const store = {
  get(k, d) { try { const v = localStorage.getItem("artenquiz." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("artenquiz." + k, JSON.stringify(v)); } catch { /* ohne Speicher weiterspielen */ } }
};
const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
function openExternal(url) {
  try { if (Plugins.Browser) return Plugins.Browser.open({ url }); } catch { /* weiter mit window.open */ }
  window.open(url, "_blank", "noopener");
}

// ---------- Zustand ----------
const DEFAULTS = { oben: "family", unten: "species", group: null, place: null, native: true, showCommon: true, wiki: true, lang: null, mode: "all" };
let settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
if (!settings || typeof settings !== "object") settings = Object.assign({}, DEFAULTS);
if (settings.lang !== "de" && settings.lang !== "en") settings.lang = I18N.detect();
I18N.setLang(settings.lang);
QuizData.setLang(settings.lang);
if (!RANKS.includes(settings.oben) || !RANKS.includes(settings.unten)) Object.assign(settings, { oben: DEFAULTS.oben, unten: DEFAULTS.unten });
if (settings.group && settings.group.rank !== groupRankFor(settings.oben)) settings.group = null;
let stats = Object.assign({ rounds: 0, answered: 0, correct: 0, best: 0 }, store.get("stats", {}));
let missed = store.get("missed", {});
if (settings.mode !== "repeat") settings.mode = "all";
// Lernstapel: { taxonId: { n: Name, c: Trivialname, a: Vorfahren-IDs, t: Zeitpunkt } }
let stack = store.get("stack", {});
if (!stack || typeof stack !== "object" || Array.isArray(stack)) stack = {};
let stackVersion = 0;
let screen = "setup", gen = 0, session = null, sessionKey = null, round = null, zoomEl = null;

const saveSettings = () => store.set("settings", settings);
const levelsNow = () => RANKS.slice(RANKS.indexOf(settings.oben), RANKS.indexOf(settings.unten) + 1);
const groupNow = () => groupRankFor(settings.oben) ? settings.group : QuizData.LIFE;

// ---------- Lernstapel ----------
function stackIdsIn(group) {
  if (!group) return [];
  return Object.entries(stack)
    .filter(([, e]) => group.id === QuizData.LIFE.id || (Array.isArray(e.a) && e.a.includes(group.id)))
    .map(([id]) => +id);
}
function setStacked(item, on) {
  const id = item.taxon.id;
  if (on) stack[id] = { n: item.taxon.name, c: item.taxon.common, a: item.ancestors || [], t: Date.now() };
  else delete stack[id];
  const ids = Object.keys(stack);
  if (ids.length > 2000) ids.sort((x, y) => stack[x].t - stack[y].t).slice(0, ids.length - 2000).forEach(k => delete stack[k]);
  store.set("stack", stack);
  stackVersion++;
}

// ---------- Sprache ----------
async function switchLang(l) {
  if (l === settings.lang) return;
  settings.lang = l;
  I18N.setLang(l); QuizData.setLang(l);
  saveSettings(); showSetup();
  // Trivialname der gewählten Gruppe in der neuen Sprache nachladen
  const g = settings.group;
  if (g) {
    try {
      const fresh = await QuizData.findTaxon(g.name, g.rank);
      if (settings.group && settings.group.id === g.id && settings.lang === l) {
        settings.group = fresh; saveSettings();
        if (screen === "setup") showSetup();
      }
    } catch { /* alter Name bleibt stehen */ }
  }
}
function langSwitch() {
  return h("div", { class: "langs", role: "group", "aria-label": t("language") },
    I18N.LANGS.map(([code, name]) => h("button", {
      type: "button", class: "chip small" + (settings.lang === code ? " on" : ""), lang: code,
      "aria-pressed": String(settings.lang === code), onclick: () => switchLang(code)
    }, name)));
}

// ---------- Auswahl ----------
function searchBox({ placeholder, search, onPick, render }) {
  const input = h("input", { type: "search", placeholder, autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", "aria-label": placeholder });
  const note = h("div", { class: "hint", "aria-live": "polite" });
  const list = h("div", { class: "suggest" });
  let timer = null, token = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    token++;
    if (q.length < 2) { list.replaceChildren(); note.textContent = ""; return; }
    timer = setTimeout(async () => {
      const my = ++token;
      note.textContent = t("searching");
      try {
        const items = await search(q);
        if (my !== token) return;
        list.replaceChildren(...items.map(it => h("button", { type: "button", class: "suggest-item", onclick: () => onPick(it) }, render(it))));
        note.textContent = items.length ? "" : t("nothingFound");
      } catch (e) {
        if (my === token) note.textContent = QuizData.friendly(e);
      }
    }, 350);
  });
  return h("div", { class: "searchbox" }, input, note, list);
}

function rankSelect(id, value, minIdx, onChange) {
  return h("select", { id, onchange: e => onChange(e.target.value) },
    RANKS.map((r, i) => h("option", { value: r, selected: r === value, disabled: i < minIdx }, rankLabel(r))));
}

function showSetup(message) {
  screen = "setup"; gen++; closeZoom();
  const gr = groupRankFor(settings.oben);
  const levels = levelsNow();

  const stepsField = h("section", { class: "field" },
    h("h2", { text: t("stepsQ") }),
    h("div", { class: "range" },
      h("label", {}, h("span", { text: t("from") }), rankSelect("oben", settings.oben, 0, r => {
        settings.oben = r;
        if (RANKS.indexOf(settings.unten) < RANKS.indexOf(r)) settings.unten = r;
        if (settings.group && settings.group.rank !== groupRankFor(r)) settings.group = null;
        saveSettings(); showSetup();
      })),
      h("label", {}, h("span", { text: t("to") }), rankSelect("unten", settings.unten, RANKS.indexOf(settings.oben), r => {
        settings.unten = r; saveSettings(); showSetup();
      }))),
    h("ol", { class: "trail preview", "aria-label": t("previewAria") },
      levels.map(r => h("li", { class: "later" }, h("span", { class: "dot" }), h("span", { class: "v", text: rankLabel(r) })))));

  let groupField;
  if (!gr) {
    groupField = h("section", { class: "field" }, h("h2", { text: t("group") }),
      h("p", { class: "hint", text: t("allLife") }));
  } else if (settings.group) {
    groupField = h("section", { class: "field" }, h("h2", { text: t("within")[gr] }),
      h("div", { class: "picked" }, taxonEl(settings.group),
        h("button", { type: "button", class: "textbtn", onclick: () => { settings.group = null; saveSettings(); showSetup(); } }, t("change"))));
  } else {
    const note = h("div", { class: "hint", "aria-live": "polite" });
    groupField = h("section", { class: "field" }, h("h2", { text: t("within")[gr] }),
      searchBox({
        placeholder: t("groupPh"),
        search: q => QuizData.searchGroup(q, gr),
        onPick: tx => { settings.group = tx; saveSettings(); showSetup(); },
        render: tx => taxonEl(tx)
      }),
      SUGGEST[gr] ? h("div", { class: "chips", style: "margin-top:4px" }, SUGGEST[gr].map(([sci, de, en]) =>
        h("button", {
          type: "button", class: "chip",
          onclick: async () => {
            note.textContent = t("lookingUp", byLang(de, en));
            try {
              const tx = await QuizData.findTaxon(sci, gr);
              if (screen !== "setup") return;
              settings.group = tx; saveSettings(); showSetup();
            } catch (e) { note.textContent = QuizData.friendly(e); }
          }
        }, byLang(de, en)))) : null,
      note);
  }

  const placeNote = h("div", { class: "hint", "aria-live": "polite" });
  const quickOn = q => !!settings.place && (settings.place.quick === q[0] || settings.place.name === q[1] || settings.place.name === q[2]);
  const other = settings.place && !QUICK_PLACES.some(quickOn);
  const placeField = h("section", { class: "field" }, h("h2", { text: t("placeQ") }),
    h("div", { class: "chips" },
      h("button", { type: "button", class: "chip" + (!settings.place ? " on" : ""), "aria-pressed": String(!settings.place), onclick: () => { settings.place = null; saveSettings(); showSetup(); } }, t("worldwide")),
      QUICK_PLACES.map(qp => {
        const [query, de, en] = qp, label = byLang(de, en);
        const on = quickOn(qp);
        return h("button", {
          type: "button", class: "chip" + (on ? " on" : ""), "aria-pressed": String(!!on),
          onclick: async () => {
            const cache = store.get("places", {});
            try {
              if (!cache[query]) { placeNote.textContent = t("lookingUp", label); cache[query] = (await QuizData.findPlace(query, label)).id; store.set("places", cache); }
              if (screen !== "setup") return;
              settings.place = { id: cache[query], name: label, quick: query }; saveSettings(); showSetup();
            } catch (e) { placeNote.textContent = QuizData.friendly(e); }
          }
        }, label);
      }),
      other ? h("button", { type: "button", class: "chip on", "aria-pressed": "true" }, settings.place.name) : null),
    h("div", { style: "margin-top:10px" }, searchBox({
      placeholder: t("placePh"),
      search: QuizData.searchPlace,
      onPick: p => { settings.place = p; saveSettings(); showSetup(); },
      render: p => h("span", { text: p.name })
    })),
    placeNote,
    h("label", { class: "check" + (settings.place ? "" : " off") },
      h("input", { type: "checkbox", checked: settings.native, disabled: !settings.place, onchange: e => { settings.native = e.target.checked; saveSettings(); } }),
      t("nativeOnly")));

  const stackCount = (!gr || settings.group) ? stackIdsIn(groupNow()).length : 0;
  const repeat = settings.mode === "repeat";
  const modeField = h("section", { class: "field" }, h("h2", { text: t("whichSpecies") }),
    h("div", { class: "chips" },
      h("button", { type: "button", class: "chip" + (!repeat ? " on" : ""), "aria-pressed": String(!repeat), onclick: () => { settings.mode = "all"; saveSettings(); showSetup(); } }, t("modeAll")),
      h("button", { type: "button", class: "chip" + (repeat ? " on" : ""), "aria-pressed": String(repeat), onclick: () => { settings.mode = "repeat"; saveSettings(); showSetup(); } }, t("modeRepeat", stackCount))),
    repeat ? h("p", { class: "hint", style: "margin-top:8px", text: stackCount ? t("repeatHint") : t("stackEmptyGroup") }) : null);

  const extraField = h("section", { class: "field" },
    h("label", { class: "check" },
      h("input", { type: "checkbox", checked: settings.showCommon, onchange: e => { settings.showCommon = e.target.checked; saveSettings(); } }),
      t("showCommon")),
    h("label", { class: "check" },
      h("input", { type: "checkbox", checked: settings.wiki, onchange: e => { settings.wiki = e.target.checked; saveSettings(); } }),
      t("showWiki")));

  const ready = (!gr || !!settings.group) && !(repeat && stackCount === 0);
  const pct = stats.answered ? Math.round(100 * stats.correct / stats.answered) : null;
  $app.replaceChildren(h("main", { class: "setup" },
    h("header", { class: "masthead" },
      h("div", { class: "masthead-row" }, h("h1", { text: t("appTitle") }), langSwitch()),
      h("p", { class: "lead", text: t("lead") })),
    stepsField, groupField, placeField, modeField, extraField,
    message ? h("p", { class: "error-text", role: "alert", text: message }) : null,
    h("button", { type: "button", class: "btn", disabled: !ready, onclick: () => startRound() }, t("start")),
    gr && !settings.group ? h("p", { class: "hint center-text", text: t("pickGroupFirst") }) : null,
    pct !== null ? h("p", { class: "stats", text: t("stats", stats.rounds, pct, stats.best) }) : null,
    h("p", { class: "footer" }, h("a", { href: "selbsttest.html" }, t("checkSource")), " · " + t("dataBy"))));
}

// ---------- Laden, Fehler ----------
function showLoading(text) {
  screen = "loading";
  $app.replaceChildren(h("main", { class: "center" },
    h("div", { class: "pulse", "aria-hidden": "true" }), h("h1", { text }),
    h("p", { text: t("loadingSub") }),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, t("cancel"))));
}
function showError(e, retry) {
  screen = "error";
  $app.replaceChildren(h("main", { class: "center" },
    h("h1", { text: t("loadFailed") }), h("p", { role: "alert", text: QuizData.friendly(e) }),
    h("button", { type: "button", class: "btn", onclick: retry }, t("retry")),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, t("toSetup"))));
}

// ---------- Runde ----------
async function startRound() {
  const my = ++gen;
  // Sprache gehört zum Schlüssel: Trivialnamen im Artenpool sind sprachabhängig
  const repeat = settings.mode === "repeat";
  const onlyIds = repeat ? stackIdsIn(groupNow()) : null;
  if (repeat && !onlyIds.length) return showSetup(t("stackEmptyGroup"));
  const key = JSON.stringify([groupNow().id, settings.place && settings.place.id, !!(settings.place && settings.native), settings.lang,
    settings.mode, repeat ? stackVersion : 0]);
  if (!session || sessionKey !== key) {
    session = QuizData.newSession({ group: groupNow(), place: settings.place, native: settings.native, onlyIds });
    sessionKey = key;
  }
  showLoading(t("loadPicking"));
  try {
    const res = await QuizData.newRound(session, { levels: levelsNow(), size: ROUND_SIZE, missed, isStale: () => my !== gen });
    if (!res || my !== gen) return;
    if (res.empty) return showSetup(repeat ? t("stackNoneHere") : t("emptyPool"));
    round = { gen: my, items: res.items, repeated: res.repeated, idx: 0, score: 0, possible: 0, streak: 0 };
    prefetch(round);
    showLoading(t("loadPreparing"));
    await QuizData.prepare(session, round.items[0]);
    if (my !== gen) return;
    showItem();
  } catch (e) {
    if (my === gen) showError(e, () => startRound());
  }
}
async function prefetch(r) {
  for (const it of r.items) {
    if (r.gen !== gen) return;
    try {
      await QuizData.prepare(session, it);
      if (it.photo) { const img = new Image(); img.src = photoUrl(it.photo, "large"); }
    } catch { /* wird beim Anzeigen erneut versucht */ }
  }
}

// ---------- Quiz ----------
async function showItem() {
  const r = round, item = r.items[r.idx];
  if (!item.questions) {
    showLoading(t("loadNext"));
    try { await QuizData.prepare(session, item); } catch (e) { return showError(e, () => showItem()); }
    if (r !== round || r.gen !== gen) return;
  }
  screen = "quiz";
  if (settings.wiki) QuizData.wikipedia(item.taxon).catch(() => {}); // schon während der Fragen laden
  const img = h("img", { alt: t("photoAlt"), src: photoUrl(item.photo, "large"), onclick: () => openZoom(photoUrl(item.photo, "large")) });
  img.addEventListener("error", () => { if (item.photo && img.src !== item.photo.url) img.src = item.photo.url; }, { once: true });
  const progress = h("div", { class: "progress", "aria-hidden": "true" },
    r.items.map((it, i) => h("span", { class: i < r.idx ? (it.allRight ? "ok" : "bad") : i === r.idx ? "now" : "" })));
  const trail = h("ol", { class: "trail", "aria-label": t("trailAria") });
  const panel = h("section", { class: "panel" });
  const score = h("span", { class: "score" });
  $app.replaceChildren(h("main", { class: "quiz" },
    h("div", { class: "bar" },
      h("button", { type: "button", class: "textbtn", onclick: confirmQuit }, t("quit")),
      h("span", { class: "count", text: `${r.idx + 1} / ${r.items.length}` }),
      score),
    progress,
    h("figure", { class: "photo" }, img,
      item.photo && item.photo.attribution ? h("figcaption", { text: item.photo.attribution + (item.photo.license ? ` (${item.photo.license.toUpperCase()})` : "") }) : null),
    trail, panel));
  window.scrollTo(0, 0);
  update(item, { trail, panel, score });
}

function update(item, ui) {
  const r = round;
  ui.score.textContent = t("points", r.score);
  const done = item.step >= item.questions.length;

  ui.trail.replaceChildren(...item.questions.map((q, i) => {
    let cls = "later", value = "", it = false;
    if (q.skip === "missing") { if (i < item.step || done) { cls = "free"; value = t("noData"); } }
    else if (q.skip === "only") { if (i < item.step || done) { cls = "free"; value = q.correct.name; it = ITALIC.has(q.rank); } }
    else if (q.answer != null) { cls = q.answer === q.correct.id ? "ok" : "bad"; value = q.correct.name; it = ITALIC.has(q.rank); }
    else if (i === item.step) { cls = "now"; value = "?"; }
    return h("li", { class: cls },
      h("span", { class: "dot" }),
      h("span", { class: "r", text: rankLabel(q.rank, item.plantLike) }),
      h("span", { class: "v" + (it ? " it" : ""), text: value || " " }));
  }));
  const now = ui.trail.querySelector(".now");
  if (now && now.scrollIntoView) now.scrollIntoView({ block: "nearest", inline: "center" });
  ui.trail.classList.toggle("scrolls", ui.trail.scrollWidth > ui.trail.clientWidth + 2);

  if (done) {
    const last = r.idx >= r.items.length - 1;
    const wikiLink = h("button", { type: "button", class: "textbtn", onclick: () => openExternal(QuizData.wikiSearchUrl(item.taxon.name)) }, t("wikiSearch"));
    const article = settings.wiki ? h("section", { class: "article", "aria-label": t("wikiAria"), "aria-live": "polite" }) : null;
    ui.panel.replaceChildren(h("div", { class: "reveal" },
      h("h2", { text: item.taxon.name }),
      item.taxon.common ? h("p", { class: "common-big", text: item.taxon.common }) : null,
      item.questions.some(q => q.skip) ? h("p", { class: "hint", text: t("skippedHint") }) : null,
      h("label", { class: "check stackcheck" },
        h("input", { type: "checkbox", checked: !!stack[item.taxon.id], onchange: e => setStacked(item, e.target.checked) }),
        t("onStack")),
      h("div", { class: "links" }, wikiLink,
        h("button", { type: "button", class: "textbtn", onclick: () => openExternal(item.inat) }, t("moreInat"))),
      article,
      // bleibt beim Lesen des Artikels am unteren Rand
      h("div", { class: "nextbar" },
        h("button", { type: "button", class: "btn", onclick: () => { if (last) showEnd(); else { r.idx++; showItem(); } } }, last ? t("seeResults") : t("nextSpecies")))));
    if (article) fillArticle(item, article, wikiLink);
    return;
  }

  const q = item.questions[item.step];
  const answered = q.answer != null;
  const right = answered && q.answer === q.correct.id;
  ui.panel.replaceChildren(
    h("h2", { class: "ask", text: rankAsk(q.rank, item.plantLike) }),
    h("div", { class: "options" + (answered ? " answered" : ""), role: "group", "aria-label": rankAsk(q.rank, item.plantLike) },
      q.options.map(o => {
        const chosen = answered && o.id === q.answer;
        return h("button", {
          type: "button", disabled: answered || null,
          class: "option" + (o.isCorrect ? " correct" : "") + (chosen ? " chosen" : "") + (chosen && !o.isCorrect ? " wrongpick" : ""),
          onclick: () => answer(item, q, o, ui)
        }, taxonEl(o, settings.showCommon || answered),
          answered && (o.isCorrect || chosen) ? h("span", { class: "mark", "aria-label": o.isCorrect ? t("markRight") : t("markWrong"), text: o.isCorrect ? "✓" : "✗" }) : null);
      })),
    answered ? h("p", { class: "feedback " + (right ? "good" : "bad"), role: "status",
      text: right ? (r.streak >= 3 ? t("streak", r.streak) : t("correct"))
        : t("wrongIs", q.correct.name + (q.correct.common ? ` (${q.correct.common})` : "")) }) : null,
    answered && !right ? h("button", { type: "button", class: "btn", onclick: () => next(item, ui) }, t("continue")) : null);
}

function answer(item, q, o, ui) {
  if (q.answer != null) return;
  const r = round;
  q.answer = o.id;
  r.possible++; stats.answered++;
  if (o.isCorrect) {
    r.score++; r.streak++; stats.correct++;
    stats.best = Math.max(stats.best, r.streak);
  } else {
    r.streak = 0;
    item.anyWrong = true;
  }
  store.set("stats", stats);
  update(item, ui);
  if (o.isCorrect) {
    const step = item.step;
    setTimeout(() => { if (round === r && screen === "quiz" && item.step === step) next(item, ui); }, 750);
  }
}
function next(item, ui) {
  item.step = QuizData.nextOpen(item, item.step + 1);
  if (item.step >= item.questions.length) finishItem(item);
  update(item, ui);
}
// merkt sich falsch bestimmte Arten, damit sie öfter wiederkommen
function finishItem(item) {
  item.allRight = !item.anyWrong;
  const id = item.taxon.id;
  if (item.anyWrong) missed[id] = Math.min(3, (missed[id] || 0) + 1);
  if (item.anyWrong && !stack[id]) setStacked(item, true); // Haken ist vorgesetzt, lässt sich abwählen
  else if (missed[id]) { missed[id]--; if (!missed[id]) delete missed[id]; }
  const keys = Object.keys(missed);
  if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(k => delete missed[k]);
  store.set("missed", missed);
}
function confirmQuit() {
  if (window.confirm(t("confirmQuit"))) showSetup();
}
async function fillArticle(item, el, wikiLink) {
  el.replaceChildren(h("p", { class: "hint", text: t("wikiLoading") }));
  let w;
  try { w = await QuizData.wikipedia(item.taxon); }
  catch { if (el.isConnected) el.replaceChildren(h("p", { class: "hint", text: t("wikiOffline") })); return; }
  if (!el.isConnected) return;
  if (!w) { el.replaceChildren(h("p", { class: "hint", text: t("wikiNone") })); return; }
  wikiLink.replaceWith(h("button", { type: "button", class: "textbtn", onclick: () => openExternal(w.url) }, t("wikiOpen")));
  let fig = null;
  if (w.image && w.image.url) {
    const img = h("img", { src: w.image.url, alt: t("wikiImgAlt", w.title), loading: "lazy", onclick: () => openZoom(w.image.url) });
    const credit = [w.image.artist, w.image.license].filter(Boolean).join(", ");
    fig = h("figure", {}, img, credit ? h("figcaption", { text: t("imageBy") + credit }) : null);
    img.addEventListener("error", () => fig.remove(), { once: true });
  }
  el.replaceChildren(...[
    h("h3", { class: "article-title", text: w.title }),
    w.lang !== settings.lang ? h("p", { class: "hint", text: t("wikiOtherLang") }) : null,
    fig,
    h("div", { class: "article-body", lang: w.lang }, w.body.cloneNode(true)),
    h("p", { class: "article-source" }, t("sourcePre"),
      h("button", { type: "button", class: "textbtn inline", onclick: () => openExternal(w.url) }, t("quote", w.title)),
      t("sourcePost"))
  ].filter(Boolean));
}

function openZoom(src) {
  closeZoom();
  zoomEl = h("div", { class: "zoom", role: "dialog", "aria-label": t("zoomAria"), onclick: closeZoom },
    h("img", { src, alt: "" }));
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
  const perfect = r.items.filter(it => it.allRight).length;
  $app.replaceChildren(h("main", { class: "end" },
    h("h1", { text: pct >= 90 ? t("endGreat") : pct >= 60 ? t("endOk") : t("endPractice") }),
    h("p", { class: "lead", text: t("endLead", r.score, r.possible, pct, perfect, r.items.length) + (r.repeated ? t("repeated") : "") }),
    h("ol", { class: "results" }, r.items.map(it => h("li", {},
      h("img", { src: photoUrl(it.photo, "square"), alt: "", loading: "lazy" }),
      h("div", { class: "info" }, taxonEl(it.taxon),
        h("div", { class: "marks" }, (it.questions || []).map(q => h("span", {
          class: "m" + (q.skip ? "" : q.answer === q.correct.id ? " ok" : " bad"),
          title: rankLabel(q.rank, it.plantLike) + (q.skip ? t("markNoChoice") : q.answer === q.correct.id ? t("markRightT") : t("markWrongT"))
        }))))))),
    h("button", { type: "button", class: "btn", onclick: () => startRound() }, t("nextRound")),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, t("changeSetup")),
    Object.keys(missed).length ? h("p", { class: "hint center-text", text: t("missedHint") }) : null,
    Object.keys(stack).length ? h("p", { class: "hint center-text", text: t("stackTotal", Object.keys(stack).length) }) : null));
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
} catch { /* nur in der App vorhanden */ }

showSetup();
