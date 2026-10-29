"use strict";
/* Datenschicht: iNaturalist-Abfragen, Artenpool, Fragen mit Falschantworten.
   Wird von der App (app.js) und vom Selbsttest (selbsttest.html) benutzt. */
const QuizData = (() => {
  const API = "https://api.inaturalist.org/v1";
  const LIFE = { id: 48460, name: "Life", rank: "stateofmatter", common: "Alle Lebewesen" };
  const PLANT_LIKE = [47126, 47170]; // Plantae, Fungi → „Abteilung“ statt „Stamm“
  const RANKS = ["kingdom", "phylum", "class", "order", "family", "genus", "species"];
  const ITALIC = new Set(["genus", "subgenus", "species", "subspecies", "variety", "form", "hybrid"]);
  const MAX_POOL_PAGES = 4;  // höchstens 4 × 500 Arten pro Auswahl
  const MIN_GAP_MS = 1050;   // iNaturalist möchte höchstens etwa eine Anfrage pro Sekunde

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const slim = t => ({ id: t.id, name: t.name, rank: t.rank, common: t.preferred_common_name || null });
  const userError = msg => Object.assign(new Error(msg), { userMessage: msg, retry: false });

  function friendly(e) {
    if (e && e.userMessage) return e.userMessage;
    if (e && e.name === "AbortError") return "iNaturalist antwortet gerade nicht. Versuche es gleich noch einmal.";
    return "Keine Verbindung zu iNaturalist. Prüfe die Internetverbindung und versuche es erneut.";
  }

  // ---------- Netz: eine Warteschlange, Drosselung, bis zu 3 Versuche ----------
  let queue = Promise.resolve(), lastReq = 0, requests = 0;
  function api(path, params = {}) {
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        const wait = Math.max(0, lastReq + MIN_GAP_MS - Date.now());
        if (wait) await sleep(wait);
        lastReq = Date.now();
        requests++;
        const u = new URL(API + path);
        for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
        u.searchParams.set("locale", "de");
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        try {
          const r = await fetch(u, { signal: ctrl.signal });
          if (r.ok) return await r.json();
          const err = new Error("HTTP " + r.status);
          err.retry = r.status === 429 || r.status >= 500;
          err.userMessage = r.status === 429
            ? "iNaturalist bremst gerade zu viele Anfragen. Warte eine Minute und versuche es erneut."
            : `iNaturalist meldet einen Fehler (${r.status}). Versuche es später erneut.`;
          throw err;
        } catch (e) {
          if (e.retry === false || attempt >= 2) throw e;
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

  // ---------- Suche ----------
  async function searchGroup(q, rank) {
    const a = await api("/taxa/autocomplete", { q, rank, is_active: "true", per_page: 15 });
    let items = (a.results || []).filter(t => t.rank === rank);
    if (!items.length) {
      const b = await api("/taxa", { q, rank, is_active: "true", per_page: 10 });
      items = (b.results || []).filter(t => t.rank === rank);
    }
    return items.slice(0, 8).map(slim);
  }
  async function findTaxon(name, rank) {
    const d = await api("/taxa", { q: name, rank, is_active: "true", per_page: 10 });
    const lc = name.toLowerCase();
    const t = (d.results || []).find(x => x.rank === rank && x.name.toLowerCase() === lc);
    if (!t) throw userError(`${name} wurde bei iNaturalist nicht gefunden.`);
    return slim(t);
  }
  const PLACE_DE = {
    "deutschland": "Germany", "österreich": "Austria", "schweiz": "Switzerland", "europa": "Europe",
    "afrika": "Africa", "asien": "Asia", "nordamerika": "North America", "südamerika": "South America",
    "australien": "Australia", "ozeanien": "Oceania", "frankreich": "France", "italien": "Italy",
    "spanien": "Spain", "polen": "Poland", "tschechien": "Czech Republic", "niederlande": "Netherlands",
    "belgien": "Belgium", "dänemark": "Denmark", "schweden": "Sweden", "norwegen": "Norway",
    "finnland": "Finland", "großbritannien": "United Kingdom", "vereinigtes königreich": "United Kingdom",
    "griechenland": "Greece", "kroatien": "Croatia", "ungarn": "Hungary", "türkei": "Turkey",
    "russland": "Russia", "china": "China", "japan": "Japan", "indien": "India", "brasilien": "Brazil",
    "kanada": "Canada", "mexiko": "Mexico", "neuseeland": "New Zealand", "südafrika": "South Africa"
  };
  async function searchPlace(q) {
    const d = await api("/places/autocomplete", { q: PLACE_DE[q.trim().toLowerCase()] || q, per_page: 8 });
    return (d.results || []).map(p => ({ id: p.id, name: p.display_name || p.name }));
  }
  async function findPlace(query, label) {
    const d = await api("/places/autocomplete", { q: query, per_page: 5 });
    const res = d.results || [];
    const p = res.find(x => (x.name || "").toLowerCase() === query.toLowerCase()) || res[0];
    if (!p) throw userError(`${label || query} wurde bei iNaturalist nicht gefunden.`);
    return { id: p.id, name: label || p.display_name || p.name };
  }

  // ---------- Artenpool ----------
  function newSession({ group, place, native }) {
    return {
      group: group || LIFE, place: place || null, native: !!(place && native),
      pool: [], page: 0, poolDone: false, seen: new Set(),
      regional: new Set(), poolHasAnc: false, sib: new Map(), anc: new Map()
    };
  }
  async function loadPoolPage(s) {
    const page = s.page + 1;
    const d = await api("/observations/species_counts", {
      taxon_id: s.group.id, place_id: s.place && s.place.id, native: s.native ? "true" : undefined,
      quality_grade: "research", per_page: 500, page
    });
    s.page = page; // erst nach Erfolg weiterzählen, sonst überspringt „Erneut versuchen“ eine Seite
    const res = d.results || [];
    for (const r of res) {
      const t = r.taxon;
      if (!t || t.rank !== "species" || !t.default_photo) continue;
      s.pool.push({ count: r.count || 1, taxon: t });
      s.regional.add(t.id);
      if (Array.isArray(t.ancestor_ids)) { s.poolHasAnc = true; t.ancestor_ids.forEach(id => s.regional.add(id)); }
    }
    if (res.length < 500 || s.page >= MAX_POOL_PAGES) s.poolDone = true;
  }
  // gewichtete Ziehung ohne Zurücklegen (Efraimidis–Spirakis)
  function weightedSample(arr, n, weight) {
    return arr.map(p => ({ p, k: Math.pow(Math.random(), 1 / Math.max(1e-6, weight(p))) }))
      .sort((a, b) => b.k - a.k).slice(0, n).map(x => x.p);
  }
  /* Neue Runde: zieht Arten, lädt ihre Systematik.
     missed: {taxonId: Anzahl Fehler} – falsch beantwortete Arten kommen öfter wieder. */
  async function newRound(s, { levels, size, missed = {}, isStale = () => false }) {
    let avail = s.pool.filter(p => !s.seen.has(p.taxon.id));
    while (avail.length < size && !s.poolDone) {
      await loadPoolPage(s);
      if (isStale()) return null;
      avail = s.pool.filter(p => !s.seen.has(p.taxon.id));
    }
    if (!s.pool.length) return { empty: true, items: [] };
    const w = p => Math.sqrt(p.count) * (1 + 1.5 * Math.min(3, missed[p.taxon.id] || 0));
    let picked = weightedSample(avail, size, w);
    let repeated = false;
    if (picked.length < size && s.pool.length > picked.length) {
      const ids = new Set(picked.map(p => p.taxon.id));
      picked = picked.concat(weightedSample(s.pool.filter(p => !ids.has(p.taxon.id)), size - picked.length, w));
      repeated = true;
    }

    const details = await fetchTaxa(picked.map(p => p.taxon.id));
    if (isStale()) return null;
    const need = new Set();
    for (const p of picked) {
      const t = details.get(p.taxon.id) || p.taxon;
      const anc = t.ancestor_ids || [];
      const gi = anc.indexOf(s.group.id);
      for (const id of gi >= 0 ? anc.slice(gi + 1) : anc) if (id !== t.id && !s.anc.has(id)) need.add(id);
    }
    if (need.size) {
      const got = await fetchTaxa([...need]);
      got.forEach((t, id) => s.anc.set(id, slim(t)));
    }
    if (isStale()) return null;
    // erst als gespielt markieren, wenn alles geladen ist
    if (repeated) s.seen.clear();
    picked.forEach(p => s.seen.add(p.taxon.id));
    return { items: picked.map(p => buildItem(s, p, details.get(p.taxon.id) || p.taxon, levels)), repeated };
  }
  function buildItem(s, p, t, levels) {
    const chain = {};
    for (const id of t.ancestor_ids || []) {
      const a = s.anc.get(id);
      if (a && levels.includes(a.rank)) chain[a.rank] = a;
    }
    chain.species = slim(t);
    const ph = t.default_photo || p.taxon.default_photo;
    return {
      taxon: slim(t), count: p.count, chain, levels,
      plantLike: (t.ancestor_ids || p.taxon.ancestor_ids || []).some(id => PLANT_LIKE.includes(id)),
      photo: ph ? { url: ph.medium_url || ph.url, attribution: ph.attribution || "", license: ph.license_code || "" } : null,
      wikipedia: "https://de.wikipedia.org/w/index.php?go=Artikel&search=" + encodeURIComponent(t.name),
      inat: "https://www.inaturalist.org/taxa/" + t.id,
      questions: null, step: 0, prep: null
    };
  }

  // ---------- Fragen mit Falschantworten ----------
  async function siblings(s, parentId, rank) {
    const key = parentId + "|" + rank;
    if (!s.sib.has(key)) {
      const d = await api("/taxa", { taxon_id: parentId, rank, is_active: "true", per_page: 200, order_by: "observations_count", order: "desc" });
      s.sib.set(key, (d.results || []).filter(t => t.rank === rank).map(slim));
    }
    return s.sib.get(key);
  }
  function prepare(s, item) {
    if (!item.prep) {
      item.prep = (async () => {
        const qs = [];
        let parent = s.group;
        for (const L of item.levels) {
          const correct = item.chain[L];
          if (!correct) { qs.push({ rank: L, skip: "missing" }); continue; }
          let others = [];
          if (L === "species" && s.poolHasAnc) {
            others = s.pool.map(p => p.taxon)
              .filter(t => t.id !== correct.id && (t.ancestor_ids || []).includes(parent.id))
              .map(t => ({ ...slim(t), regional: true }));
          }
          if (others.length < 3) {
            const have = new Set(others.map(o => o.id));
            const sib = await siblings(s, parent.id, L);
            others = others.concat(sib.filter(x => x.id !== correct.id && !have.has(x.id)).map(x => ({ ...x, regional: s.regional.has(x.id) })));
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
        item.step = nextOpen(item, 0);
        return item;
      })().catch(e => { item.prep = null; throw e; });
    }
    return item.prep;
  }
  function nextOpen(item, from) {
    let i = from;
    while (i < item.questions.length && item.questions[i].skip) i++;
    return i;
  }

  return {
    LIFE, RANKS, ITALIC, api, fetchTaxa, friendly,
    searchGroup, findTaxon, searchPlace, findPlace,
    newSession, newRound, prepare, nextOpen, shuffle,
    requestCount: () => requests
  };
})();
