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
  const userError = (key, ...args) => Object.assign(new Error(key), { userKey: key, userArgs: args, retry: false });

  // Sprache für Trivialnamen (iNaturalist) und Wikipedia; Texte kommen aus i18n.js
  let lang = "de";
  const tr = (key, ...a) => (typeof I18N !== "undefined" ? I18N.t(key, ...a) : key);
  function setLang(l) { lang = l === "en" ? "en" : "de"; }
  function friendly(e) {
    if (e && e.userKey) return tr(e.userKey, ...(e.userArgs || []));
    if (e && e.name === "AbortError") return tr("errTimeout");
    return tr("errOffline");
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
        u.searchParams.set("locale", lang);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        try {
          const r = await fetch(u, { signal: ctrl.signal });
          if (r.ok) return await r.json();
          const err = new Error("HTTP " + r.status);
          err.retry = r.status === 429 || r.status >= 500;
          if (r.status === 429) err.userKey = "err429";
          else { err.userKey = "errHttp"; err.userArgs = [r.status]; }
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
    if (!t) throw userError("notFound", name);
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
    if (!p) throw userError("notFound", label || query);
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

  // ---------- Wikipedia ----------
  // Abschnitte ab hier werden nicht mehr angezeigt (Quellen, Linklisten)
  const WIKI_STOP = /^(literatur|weblinks|einzelnachweise|anmerkungen|quellen|belege|siehe auch|fußnoten|references|external links|further reading|see also|notes|bibliography|sources|footnotes)$/i;
  const WIKI_TAGS = new Set(["P", "H2", "H3", "H4", "UL", "OL", "LI", "B", "I", "EM", "STRONG", "SUB", "SUP", "BR", "DL", "DT", "DD"]);
  const WIKI_DROP = new Set(["SCRIPT", "STYLE", "TABLE", "FIGURE", "IMG", "MATH", "SVG", "IFRAME", "OBJECT", "NOSCRIPT", "TEMPLATE"]);

  async function wikiFetch(lang, params) {
    const u = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    const all = { action: "query", format: "json", formatversion: "2", origin: "*", ...params };
    for (const [k, v] of Object.entries(all)) u.searchParams.set(k, v);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(u, { signal: ctrl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }
  async function wikiPage(lang, title, mustContain) {
    const d = await wikiFetch(lang, {
      titles: title, redirects: "1", prop: "extracts|pageimages|pageprops|info",
      inprop: "url", ppprop: "disambiguation", piprop: "thumbnail|name", pithumbsize: "900"
    });
    const p = d.query && d.query.pages && d.query.pages[0];
    if (!p || p.missing || p.invalid || !p.extract) return null;
    if (p.pageprops && "disambiguation" in p.pageprops) return null;
    if (mustContain && !p.extract.toLowerCase().includes(mustContain.toLowerCase())) return null;
    return {
      lang, title: p.title,
      url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
      extract: p.extract, thumb: p.thumbnail ? p.thumbnail.source : null, imageName: p.pageimage || null
    };
  }
  const plainText = html => html ? new DOMParser().parseFromString(html, "text/html").body.textContent.replace(/\s+/g, " ").trim() : "";
  async function wikiImage(lang, name) {
    const d = await wikiFetch(lang, {
      titles: "File:" + name, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "900",
      iiextmetadatafilter: "Artist|LicenseShortName"
    });
    const p = d.query && d.query.pages && d.query.pages[0];
    const ii = p && p.imageinfo && p.imageinfo[0];
    if (!ii) return null;
    const m = ii.extmetadata || {};
    return {
      url: ii.thumburl || ii.url, page: ii.descriptionurl || null,
      artist: plainText(m.Artist && m.Artist.value), license: plainText(m.LicenseShortName && m.LicenseShortName.value)
    };
  }
  // Artikel-HTML auf harmlose Textauszeichnung reduzieren, Quellenabschnitte abschneiden
  function cleanArticle(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const out = document.createElement("div");
    const copy = (from, into) => {
      for (const n of from.childNodes) {
        if (n.nodeType === 3) { into.append(n.textContent); continue; }
        if (n.nodeType !== 1 || WIKI_DROP.has(n.tagName)) continue;
        if (WIKI_TAGS.has(n.tagName)) { const e = document.createElement(n.tagName.toLowerCase()); copy(n, e); into.append(e); }
        else copy(n, into);
      }
    };
    copy(doc.body, out);
    let stop = false;
    for (const n of [...out.childNodes]) {
      if (!stop && n.nodeType === 1 && /^H[2-4]$/.test(n.tagName) && WIKI_STOP.test(n.textContent.trim())) stop = true;
      if (stop) n.remove();
      else if (n.nodeType === 3 && !n.textContent.trim()) n.remove();
      else if (n.nodeType === 1 && !n.textContent.trim() && n.tagName !== "BR") n.remove();
    }
    // Überschriften ohne Inhalt bis zur nächsten gleich- oder höherrangigen Überschrift entfernen
    const kids = [...out.children];
    kids.forEach((n, i) => {
      if (!/^H[2-4]$/.test(n.tagName)) return;
      const lvl = +n.tagName[1], next = kids[i + 1];
      if (!next || (/^H[2-4]$/.test(next.tagName) && +next.tagName[1] <= lvl)) n.remove();
    });
    return out;
  }
  const wikiCache = new Map();
  const wikiSearchUrl = name => `https://${lang}.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;
  /* Sucht den Artikel in der eingestellten Sprache: zum wissenschaftlichen Namen, dann zum Trivialnamen
     (nur wenn der Gattungsname im Text vorkommt), dann in der anderen Sprache. null = keiner gefunden. */
  function wikipedia(taxon) {
    const key = lang + "|" + taxon.id;
    const main = lang, other = lang === "de" ? "en" : "de";
    if (!wikiCache.has(key)) {
      const p = (async () => {
        let page = await wikiPage(main, taxon.name);
        if (!page && taxon.common) page = await wikiPage(main, taxon.common, taxon.name.split(" ")[0]);
        if (!page) page = await wikiPage(other, taxon.name);
        if (!page) return null;
        let image = null;
        if (page.imageName) { try { image = await wikiImage(page.lang, page.imageName); } catch { /* Bild ohne Angaben */ } }
        if (!image && page.thumb) image = { url: page.thumb, page: null, artist: "", license: "" };
        const body = cleanArticle(page.extract);
        if (!body.textContent.trim()) return null;
        return { lang: page.lang, title: page.title, url: page.url, image, body };
      })();
      p.catch(() => wikiCache.delete(key));
      wikiCache.set(key, p);
    }
    return wikiCache.get(key);
  }

  return {
    LIFE, RANKS, ITALIC, api, fetchTaxa, friendly, wikipedia, wikiSearchUrl, setLang,
    searchGroup, findTaxon, searchPlace, findPlace,
    newSession, newRound, prepare, nextOpen, shuffle,
    requestCount: () => requests
  };
})();
