"use strict";
/* Artenquiz – Oberfläche. Daten kommen aus data.js (QuizData). */

const { RANKS, ITALIC } = QuizData;
const ROUND_SIZE = 15;
const RANK = {
  kingdom: { label: "Reich", ask: "Zu welchem Reich gehört diese Art?", within: "In welchem Reich?" },
  phylum: { label: "Abteilung/Stamm", within: "In welcher Abteilung bzw. welchem Stamm?" },
  class: { label: "Klasse", ask: "Zu welcher Klasse gehört diese Art?", within: "In welcher Klasse?" },
  order: { label: "Ordnung", ask: "Zu welcher Ordnung gehört diese Art?", within: "In welcher Ordnung?" },
  family: { label: "Familie", ask: "Zu welcher Familie gehört diese Art?", within: "In welcher Familie?" },
  genus: { label: "Gattung", ask: "Zu welcher Gattung gehört diese Art?", within: "In welcher Gattung?" },
  species: { label: "Art", ask: "Welche Art ist das?" }
};
// Vorschläge je Rang der Gruppe: [wissenschaftlicher Name, deutsche Bezeichnung]
const SUGGEST = {
  kingdom: [["Animalia", "Tiere"], ["Plantae", "Pflanzen"], ["Fungi", "Pilze"]],
  phylum: [["Chordata", "Chordatiere"], ["Arthropoda", "Gliederfüßer"], ["Mollusca", "Weichtiere"], ["Tracheophyta", "Gefäßpflanzen"], ["Basidiomycota", "Ständerpilze"]],
  class: [["Aves", "Vögel"], ["Mammalia", "Säugetiere"], ["Insecta", "Insekten"], ["Magnoliopsida", "Zweikeimblättrige"], ["Agaricomycetes", "Agaricomycetes (Pilze)"]],
  order: [["Poales", "Süßgrasartige"], ["Lepidoptera", "Schmetterlinge"], ["Coleoptera", "Käfer"], ["Passeriformes", "Sperlingsvögel"], ["Agaricales", "Champignonartige"], ["Boletales", "Dickröhrlingsartige"]],
  family: [["Asteraceae", "Korbblütler"], ["Orchidaceae", "Orchideen"], ["Carabidae", "Laufkäfer"], ["Anatidae", "Entenvögel"], ["Boletaceae", "Dickröhrlingsverwandte"]],
  genus: [["Carex", "Seggen"], ["Quercus", "Eichen"], ["Bombus", "Hummeln"], ["Amanita", "Wulstlinge"]]
};
const QUICK_PLACES = [["Deutschland", "Germany"], ["Europa", "Europe"]];

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
  if (rank === "phylum") return plantLike === undefined ? RANK.phylum.label : plantLike ? "Abteilung" : "Stamm";
  return RANK[rank].label;
}
function rankAsk(rank, plantLike) {
  if (rank === "phylum") return plantLike ? "Zu welcher Abteilung gehört diese Art?" : "Zu welchem Stamm gehört diese Art?";
  return RANK[rank].ask;
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
const DEFAULTS = { oben: "family", unten: "species", group: null, place: null, native: true, showCommon: true };
let settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
if (!RANKS.includes(settings.oben) || !RANKS.includes(settings.unten)) Object.assign(settings, { oben: DEFAULTS.oben, unten: DEFAULTS.unten });
if (settings.group && settings.group.rank !== groupRankFor(settings.oben)) settings.group = null;
let stats = Object.assign({ rounds: 0, answered: 0, correct: 0, best: 0 }, store.get("stats", {}));
let missed = store.get("missed", {});
let screen = "setup", gen = 0, session = null, sessionKey = null, round = null, zoomEl = null;

const saveSettings = () => store.set("settings", settings);
const levelsNow = () => RANKS.slice(RANKS.indexOf(settings.oben), RANKS.indexOf(settings.unten) + 1);
const groupNow = () => groupRankFor(settings.oben) ? settings.group : QuizData.LIFE;

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
      note.textContent = "Suche läuft …";
      try {
        const items = await search(q);
        if (my !== token) return;
        list.replaceChildren(...items.map(it => h("button", { type: "button", class: "suggest-item", onclick: () => onPick(it) }, render(it))));
        note.textContent = items.length ? "" : "Nichts gefunden. Probiere den wissenschaftlichen Namen.";
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
    h("h2", { text: "Was willst du bestimmen?" }),
    h("div", { class: "range" },
      h("label", {}, h("span", { text: "Von" }), rankSelect("oben", settings.oben, 0, r => {
        settings.oben = r;
        if (RANKS.indexOf(settings.unten) < RANKS.indexOf(r)) settings.unten = r;
        if (settings.group && settings.group.rank !== groupRankFor(r)) settings.group = null;
        saveSettings(); showSetup();
      })),
      h("label", {}, h("span", { text: "Bis" }), rankSelect("unten", settings.unten, RANKS.indexOf(settings.oben), r => {
        settings.unten = r; saveSettings(); showSetup();
      }))),
    h("ol", { class: "trail preview", "aria-label": "Diese Stufen fragt das Quiz ab" },
      levels.map(r => h("li", { class: "later" }, h("span", { class: "dot" }), h("span", { class: "v", text: rankLabel(r) })))));

  let groupField;
  if (!gr) {
    groupField = h("section", { class: "field" }, h("h2", { text: "Gruppe" }),
      h("p", { class: "hint", text: "Ab dem Reich spielst du mit allen Lebewesen." }));
  } else if (settings.group) {
    groupField = h("section", { class: "field" }, h("h2", { text: RANK[gr].within }),
      h("div", { class: "picked" }, taxonEl(settings.group),
        h("button", { type: "button", class: "textbtn", onclick: () => { settings.group = null; saveSettings(); showSetup(); } }, "Ändern")));
  } else {
    const note = h("div", { class: "hint", "aria-live": "polite" });
    groupField = h("section", { class: "field" }, h("h2", { text: RANK[gr].within }),
      searchBox({
        placeholder: "Wissenschaftlicher oder deutscher Name",
        search: q => QuizData.searchGroup(q, gr),
        onPick: t => { settings.group = t; saveSettings(); showSetup(); },
        render: t => taxonEl(t)
      }),
      SUGGEST[gr] ? h("div", { class: "chips", style: "margin-top:4px" }, SUGGEST[gr].map(([sci, de]) =>
        h("button", {
          type: "button", class: "chip",
          onclick: async () => {
            note.textContent = `${de} wird gesucht …`;
            try {
              const t = await QuizData.findTaxon(sci, gr);
              if (screen !== "setup") return;
              settings.group = t; saveSettings(); showSetup();
            } catch (e) { note.textContent = QuizData.friendly(e); }
          }
        }, de))) : null,
      note);
  }

  const placeNote = h("div", { class: "hint", "aria-live": "polite" });
  const other = settings.place && !QUICK_PLACES.some(([l]) => l === settings.place.name);
  const placeField = h("section", { class: "field" }, h("h2", { text: "Wo soll die Art vorkommen?" }),
    h("div", { class: "chips" },
      h("button", { type: "button", class: "chip" + (!settings.place ? " on" : ""), "aria-pressed": String(!settings.place), onclick: () => { settings.place = null; saveSettings(); showSetup(); } }, "Weltweit"),
      QUICK_PLACES.map(([label, query]) => {
        const on = settings.place && settings.place.name === label;
        return h("button", {
          type: "button", class: "chip" + (on ? " on" : ""), "aria-pressed": String(!!on),
          onclick: async () => {
            const cache = store.get("places", {});
            try {
              if (!cache[query]) { placeNote.textContent = `${label} wird gesucht …`; cache[query] = (await QuizData.findPlace(query, label)).id; store.set("places", cache); }
              if (screen !== "setup") return;
              settings.place = { id: cache[query], name: label }; saveSettings(); showSetup();
            } catch (e) { placeNote.textContent = QuizData.friendly(e); }
          }
        }, label);
      }),
      other ? h("button", { type: "button", class: "chip on", "aria-pressed": "true" }, settings.place.name) : null),
    h("div", { style: "margin-top:10px" }, searchBox({
      placeholder: "Anderes Land, Bundesland oder Erdteil",
      search: QuizData.searchPlace,
      onPick: p => { settings.place = p; saveSettings(); showSetup(); },
      render: p => h("span", { text: p.name })
    })),
    placeNote,
    h("label", { class: "check" + (settings.place ? "" : " off") },
      h("input", { type: "checkbox", checked: settings.native, disabled: !settings.place, onchange: e => { settings.native = e.target.checked; saveSettings(); } }),
      "Nur dort heimische Arten"));

  const extraField = h("section", { class: "field" },
    h("label", { class: "check" },
      h("input", { type: "checkbox", checked: settings.showCommon, onchange: e => { settings.showCommon = e.target.checked; saveSettings(); } }),
      "Deutsche Namen bei den Antworten zeigen"));

  const ready = !gr || !!settings.group;
  const pct = stats.answered ? Math.round(100 * stats.correct / stats.answered) : null;
  $app.replaceChildren(h("main", { class: "setup" },
    h("header", { class: "masthead" },
      h("h1", { text: "Artenquiz" }),
      h("p", { class: "lead", text: "Zu jedem Foto bestimmst du Stufe für Stufe, wohin die Art in der Systematik gehört." })),
    stepsField, groupField, placeField, extraField,
    message ? h("p", { class: "error-text", role: "alert", text: message }) : null,
    h("button", { type: "button", class: "btn", disabled: !ready, onclick: () => startRound() }, "Quiz starten"),
    !ready ? h("p", { class: "hint center-text", text: "Wähle zuerst eine Gruppe aus." }) : null,
    pct !== null ? h("p", { class: "stats", text: `${stats.rounds} ${stats.rounds === 1 ? "Runde" : "Runden"} gespielt, ${pct} % richtig, längste Serie ${stats.best}.` }) : null,
    h("p", { class: "footer" }, h("a", { href: "selbsttest.html" }, "Datenquelle prüfen"), " · Daten und Fotos: iNaturalist")));
}

// ---------- Laden, Fehler ----------
function showLoading(text) {
  screen = "loading";
  $app.replaceChildren(h("main", { class: "center" },
    h("div", { class: "pulse", "aria-hidden": "true" }), h("h1", { text }),
    h("p", { text: "Die Daten kommen von iNaturalist. Das dauert ein paar Sekunden." }),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, "Abbrechen")));
}
function showError(e, retry) {
  screen = "error";
  $app.replaceChildren(h("main", { class: "center" },
    h("h1", { text: "Laden hat nicht geklappt" }), h("p", { role: "alert", text: QuizData.friendly(e) }),
    h("button", { type: "button", class: "btn", onclick: retry }, "Erneut versuchen"),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, "Zur Auswahl")));
}

// ---------- Runde ----------
async function startRound() {
  const my = ++gen;
  const key = JSON.stringify([groupNow().id, settings.place && settings.place.id, !!(settings.place && settings.native)]);
  if (!session || sessionKey !== key) {
    session = QuizData.newSession({ group: groupNow(), place: settings.place, native: settings.native });
    sessionKey = key;
  }
  showLoading("Arten werden ausgewählt");
  try {
    const res = await QuizData.newRound(session, { levels: levelsNow(), size: ROUND_SIZE, missed, isStale: () => my !== gen });
    if (!res || my !== gen) return;
    if (res.empty) return showSetup("Für diese Auswahl gibt es bei iNaturalist keine Arten mit Foto. Wähle eine größere Gruppe, einen anderen Ort oder schalte „Nur heimische Arten“ aus.");
    round = { gen: my, items: res.items, repeated: res.repeated, idx: 0, score: 0, possible: 0, streak: 0 };
    prefetch(round);
    showLoading("Fragen werden vorbereitet");
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
    showLoading("Nächste Art wird geladen");
    try { await QuizData.prepare(session, item); } catch (e) { return showError(e, () => showItem()); }
    if (r !== round || r.gen !== gen) return;
  }
  screen = "quiz";
  const img = h("img", { alt: "Foto der gesuchten Art. Antippen zum Vergrößern.", src: photoUrl(item.photo, "large"), onclick: () => openZoom(item) });
  img.addEventListener("error", () => { if (item.photo && img.src !== item.photo.url) img.src = item.photo.url; }, { once: true });
  const progress = h("div", { class: "progress", "aria-hidden": "true" },
    r.items.map((it, i) => h("span", { class: i < r.idx ? (it.allRight ? "ok" : "bad") : i === r.idx ? "now" : "" })));
  const trail = h("ol", { class: "trail", "aria-label": "Bestimmungspfad" });
  const panel = h("section", { class: "panel" });
  const score = h("span", { class: "score" });
  $app.replaceChildren(h("main", { class: "quiz" },
    h("div", { class: "bar" },
      h("button", { type: "button", class: "textbtn", onclick: confirmQuit }, "Beenden"),
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
  ui.score.textContent = `${r.score} ${r.score === 1 ? "Punkt" : "Punkte"}`;
  const done = item.step >= item.questions.length;

  ui.trail.replaceChildren(...item.questions.map((q, i) => {
    let cls = "later", value = "", it = false;
    if (q.skip === "missing") { if (i < item.step || done) { cls = "free"; value = "ohne Angabe"; } }
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
    ui.panel.replaceChildren(h("div", { class: "reveal" },
      h("h2", { text: item.taxon.name }),
      item.taxon.common ? h("p", { class: "common-big", text: item.taxon.common }) : null,
      item.questions.some(q => q.skip) ? h("p", { class: "hint", text: "Grau markierte Stufen hatten keine Auswahl und zählen nicht." }) : null,
      h("div", { class: "links" },
        h("button", { type: "button", class: "textbtn", onclick: () => openExternal(item.wikipedia) }, "Wikipedia"),
        h("button", { type: "button", class: "textbtn", onclick: () => openExternal(item.inat) }, "Mehr Fotos auf iNaturalist")),
      h("button", { type: "button", class: "btn", onclick: () => { if (last) showEnd(); else { r.idx++; showItem(); } } }, last ? "Ergebnis ansehen" : "Nächste Art")));
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
          answered && (o.isCorrect || chosen) ? h("span", { class: "mark", "aria-label": o.isCorrect ? "richtig" : "falsch", text: o.isCorrect ? "✓" : "✗" }) : null);
      })),
    answered ? h("p", { class: "feedback " + (right ? "good" : "bad"), role: "status",
      text: right ? (r.streak >= 3 ? `Richtig, ${r.streak} in Folge.` : "Richtig.")
        : `Richtig wäre ${q.correct.name}${q.correct.common ? ` (${q.correct.common})` : ""}.` }) : null,
    answered && !right ? h("button", { type: "button", class: "btn", onclick: () => next(item, ui) }, "Weiter") : null);
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
  else if (missed[id]) { missed[id]--; if (!missed[id]) delete missed[id]; }
  const keys = Object.keys(missed);
  if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(k => delete missed[k]);
  store.set("missed", missed);
}
function confirmQuit() {
  if (window.confirm("Runde beenden? Diese Runde wird nicht gewertet.")) showSetup();
}
function openZoom(item) {
  closeZoom();
  zoomEl = h("div", { class: "zoom", role: "dialog", "aria-label": "Foto in voller Größe, antippen zum Schließen", onclick: closeZoom },
    h("img", { src: photoUrl(item.photo, "large"), alt: "" }));
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
    h("h1", { text: pct >= 90 ? "Stark bestimmt" : pct >= 60 ? "Runde geschafft" : "Runde geschafft, weiter üben" }),
    h("p", { class: "lead", text: `${r.score} von ${r.possible} Fragen richtig (${pct} %). ${perfect} von ${r.items.length} Arten komplett richtig bestimmt.` +
      (r.repeated ? " Diese Auswahl hat nur wenige Arten, deshalb waren einige schon einmal dran." : "") }),
    h("ol", { class: "results" }, r.items.map(it => h("li", {},
      h("img", { src: photoUrl(it.photo, "square"), alt: "", loading: "lazy" }),
      h("div", { class: "info" }, taxonEl(it.taxon),
        h("div", { class: "marks" }, (it.questions || []).map(q => h("span", {
          class: "m" + (q.skip ? "" : q.answer === q.correct.id ? " ok" : " bad"),
          title: rankLabel(q.rank, it.plantLike) + (q.skip ? ": ohne Auswahl" : q.answer === q.correct.id ? ": richtig" : ": falsch")
        }))))))),
    h("button", { type: "button", class: "btn", onclick: () => startRound() }, "Nächste Runde"),
    h("button", { type: "button", class: "btn secondary", onclick: () => showSetup() }, "Auswahl ändern"),
    Object.keys(missed).length ? h("p", { class: "hint center-text", text: "Falsch bestimmte Arten kommen in späteren Runden öfter wieder." }) : null));
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
