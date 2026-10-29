"use strict";
/* Texte der App auf Deutsch und Englisch. t("schlüssel", ...werte) liefert den Text in der aktuellen Sprache. */
const I18N = (() => {
  const pct = { de: n => `${n} %`, en: n => `${n}%` };
  const STR = {
    de: {
      appTitle: "Artenquiz",
      lead: "Zu jedem Foto bestimmst du Stufe für Stufe, wohin die Art in der Systematik gehört.",
      language: "Sprache",
      stepsQ: "Was willst du bestimmen?",
      from: "Von", to: "Bis",
      previewAria: "Diese Stufen fragt das Quiz ab",
      group: "Gruppe",
      allLife: "Ab dem Reich spielst du mit allen Lebewesen.",
      change: "Ändern",
      groupPh: "Wissenschaftlicher oder deutscher Name",
      searching: "Suche läuft …",
      nothingFound: "Nichts gefunden. Probiere den wissenschaftlichen Namen.",
      lookingUp: x => `${x} wird gesucht …`,
      placeQ: "Wo soll die Art vorkommen?",
      worldwide: "Weltweit",
      placePh: "Anderes Land, Bundesland oder Erdteil",
      nativeOnly: "Nur dort heimische Arten",
      showCommon: "Deutsche Namen bei den Antworten zeigen",
      showWiki: "Nach jeder Art den Wikipedia-Artikel zeigen",
      start: "Quiz starten",
      pickGroupFirst: "Wähle zuerst eine Gruppe aus.",
      stats: (rounds, p, best) => `${rounds} ${rounds === 1 ? "Runde" : "Runden"} gespielt, ${pct.de(p)} richtig, längste Serie ${best}.`,
      checkSource: "Datenquelle prüfen",
      dataBy: "Daten und Fotos: iNaturalist",
      loadingSub: "Die Daten kommen von iNaturalist. Das dauert ein paar Sekunden.",
      cancel: "Abbrechen",
      loadFailed: "Laden hat nicht geklappt",
      retry: "Erneut versuchen",
      toSetup: "Zur Auswahl",
      loadPicking: "Arten werden ausgewählt",
      loadPreparing: "Fragen werden vorbereitet",
      loadNext: "Nächste Art wird geladen",
      emptyPool: "Für diese Auswahl gibt es bei iNaturalist keine Arten mit Foto. Wähle eine größere Gruppe, einen anderen Ort oder schalte „Nur heimische Arten“ aus.",
      photoAlt: "Foto der gesuchten Art. Antippen zum Vergrößern.",
      trailAria: "Bestimmungspfad",
      quit: "Beenden",
      points: n => `${n} ${n === 1 ? "Punkt" : "Punkte"}`,
      noData: "ohne Angabe",
      wikiSearch: "In Wikipedia suchen",
      wikiAria: "Wikipedia-Artikel",
      moreInat: "Mehr Fotos auf iNaturalist",
      skippedHint: "Grau markierte Stufen hatten keine Auswahl und zählen nicht.",
      nextSpecies: "Nächste Art",
      seeResults: "Ergebnis ansehen",
      correct: "Richtig.",
      streak: n => `Richtig, ${n} in Folge.`,
      wrongIs: name => `Richtig wäre ${name}.`,
      continue: "Weiter",
      markRight: "richtig", markWrong: "falsch",
      confirmQuit: "Runde beenden? Diese Runde wird nicht gewertet.",
      wikiLoading: "Wikipedia-Artikel wird geladen …",
      wikiOffline: "Wikipedia ist gerade nicht erreichbar.",
      wikiNone: "Zu dieser Art gibt es keinen Wikipedia-Artikel.",
      wikiOpen: "Artikel in Wikipedia öffnen",
      wikiImgAlt: title => `Bild aus dem Wikipedia-Artikel ${title}`,
      imageBy: "Bild: ",
      wikiOtherLang: "Einen deutschen Artikel gibt es nicht, hier der englische.",
      sourcePre: "Text aus dem Wikipedia-Artikel ",
      quote: s => `„${s}“`,
      sourcePost: ", Lizenz CC BY-SA 4.0. Die Autoren stehen in der Versionsgeschichte des Artikels.",
      zoomAria: "Bild in voller Größe, antippen zum Schließen",
      endGreat: "Stark bestimmt", endOk: "Runde geschafft", endPractice: "Runde geschafft, weiter üben",
      endLead: (s, poss, p, perf, tot) => `${s} von ${poss} Fragen richtig (${pct.de(p)}). ${perf} von ${tot} Arten komplett richtig bestimmt.`,
      repeated: " Diese Auswahl hat nur wenige Arten, deshalb waren einige schon einmal dran.",
      markNoChoice: ": ohne Auswahl", markRightT: ": richtig", markWrongT: ": falsch",
      nextRound: "Nächste Runde",
      changeSetup: "Auswahl ändern",
      missedHint: "Falsch bestimmte Arten kommen in späteren Runden öfter wieder.",
      errTimeout: "iNaturalist antwortet gerade nicht. Versuche es gleich noch einmal.",
      errOffline: "Keine Verbindung zu iNaturalist. Prüfe die Internetverbindung und versuche es erneut.",
      err429: "iNaturalist bremst gerade zu viele Anfragen. Warte eine Minute und versuche es erneut.",
      errHttp: code => `iNaturalist meldet einen Fehler (${code}). Versuche es später erneut.`,
      notFound: name => `${name} wurde bei iNaturalist nicht gefunden.`,
      rank: {
        kingdom: "Reich", phylum: "Abteilung/Stamm", phylumPlant: "Abteilung", phylumAnimal: "Stamm",
        class: "Klasse", order: "Ordnung", family: "Familie", genus: "Gattung", species: "Art"
      },
      ask: {
        kingdom: "Zu welchem Reich gehört diese Art?",
        phylumPlant: "Zu welcher Abteilung gehört diese Art?", phylumAnimal: "Zu welchem Stamm gehört diese Art?",
        class: "Zu welcher Klasse gehört diese Art?", order: "Zu welcher Ordnung gehört diese Art?",
        family: "Zu welcher Familie gehört diese Art?", genus: "Zu welcher Gattung gehört diese Art?",
        species: "Welche Art ist das?"
      },
      within: {
        kingdom: "In welchem Reich?", phylum: "In welcher Abteilung bzw. welchem Stamm?", class: "In welcher Klasse?",
        order: "In welcher Ordnung?", family: "In welcher Familie?", genus: "In welcher Gattung?"
      }
    },
    en: {
      appTitle: "Species Quiz",
      lead: "For each photo, work out step by step where the species belongs in the taxonomy.",
      language: "Language",
      stepsQ: "What do you want to identify?",
      from: "From", to: "To",
      previewAria: "The quiz asks about these ranks",
      group: "Group",
      allLife: "Starting at kingdom, you play with all living things.",
      change: "Change",
      groupPh: "Scientific or English name",
      searching: "Searching …",
      nothingFound: "Nothing found. Try the scientific name.",
      lookingUp: x => `Looking up ${x} …`,
      placeQ: "Where should the species occur?",
      worldwide: "Worldwide",
      placePh: "Other country, state or continent",
      nativeOnly: "Native species only",
      showCommon: "Show English names with the answers",
      showWiki: "Show the Wikipedia article after each species",
      start: "Start quiz",
      pickGroupFirst: "Choose a group first.",
      stats: (rounds, p, best) => `${rounds} ${rounds === 1 ? "round" : "rounds"} played, ${pct.en(p)} correct, longest streak ${best}.`,
      checkSource: "Check data source",
      dataBy: "Data and photos: iNaturalist",
      loadingSub: "The data comes from iNaturalist. This takes a few seconds.",
      cancel: "Cancel",
      loadFailed: "Loading didn't work",
      retry: "Try again",
      toSetup: "Back to selection",
      loadPicking: "Choosing species",
      loadPreparing: "Preparing questions",
      loadNext: "Loading next species",
      emptyPool: "iNaturalist has no species with photos for this selection. Choose a larger group, another place, or turn off “Native species only”.",
      photoAlt: "Photo of the species to identify. Tap to enlarge.",
      trailAria: "Identification path",
      quit: "Quit",
      points: n => `${n} ${n === 1 ? "point" : "points"}`,
      noData: "no data",
      wikiSearch: "Search Wikipedia",
      wikiAria: "Wikipedia article",
      moreInat: "More photos on iNaturalist",
      skippedHint: "Ranks marked grey had no alternatives and don't count.",
      nextSpecies: "Next species",
      seeResults: "See results",
      correct: "Correct.",
      streak: n => `Correct, ${n} in a row.`,
      wrongIs: name => `The answer is ${name}.`,
      continue: "Continue",
      markRight: "correct", markWrong: "wrong",
      confirmQuit: "Quit this round? It won't be scored.",
      wikiLoading: "Loading Wikipedia article …",
      wikiOffline: "Wikipedia can't be reached right now.",
      wikiNone: "There is no Wikipedia article for this species.",
      wikiOpen: "Open article in Wikipedia",
      wikiImgAlt: title => `Image from the Wikipedia article ${title}`,
      imageBy: "Image: ",
      wikiOtherLang: "There is no English article, so here is the German one.",
      sourcePre: "Text from the Wikipedia article ",
      quote: s => `“${s}”`,
      sourcePost: ", licensed CC BY-SA 4.0. The authors are listed in the article's revision history.",
      zoomAria: "Full-size image, tap to close",
      endGreat: "Excellent identifying", endOk: "Round complete", endPractice: "Round complete, keep practising",
      endLead: (s, poss, p, perf, tot) => `${s} of ${poss} questions correct (${pct.en(p)}). ${perf} of ${tot} species identified completely.`,
      repeated: " This selection has only a few species, so some came up again.",
      markNoChoice: ": no alternatives", markRightT: ": correct", markWrongT: ": wrong",
      nextRound: "Next round",
      changeSetup: "Change selection",
      missedHint: "Species you got wrong will come up more often in later rounds.",
      errTimeout: "iNaturalist isn't responding right now. Try again in a moment.",
      errOffline: "No connection to iNaturalist. Check your internet connection and try again.",
      err429: "iNaturalist is limiting requests right now. Wait a minute and try again.",
      errHttp: code => `iNaturalist reported an error (${code}). Try again later.`,
      notFound: name => `${name} wasn't found on iNaturalist.`,
      rank: {
        kingdom: "Kingdom", phylum: "Phylum", phylumPlant: "Phylum", phylumAnimal: "Phylum",
        class: "Class", order: "Order", family: "Family", genus: "Genus", species: "Species"
      },
      ask: {
        kingdom: "Which kingdom does this species belong to?",
        phylumPlant: "Which phylum does this species belong to?", phylumAnimal: "Which phylum does this species belong to?",
        class: "Which class does this species belong to?", order: "Which order does this species belong to?",
        family: "Which family does this species belong to?", genus: "Which genus does this species belong to?",
        species: "Which species is this?"
      },
      within: {
        kingdom: "Within which kingdom?", phylum: "Within which phylum?", class: "Within which class?",
        order: "Within which order?", family: "Within which family?", genus: "Within which genus?"
      }
    }
  };
  const LANGS = [["de", "Deutsch"], ["en", "English"]];
  let lang = "de";
  function detect() {
    const l = (navigator.languages && navigator.languages[0]) || navigator.language || "de";
    return /^de\b/i.test(l) ? "de" : "en";
  }
  function setLang(l) {
    lang = STR[l] ? l : "de";
    document.documentElement.lang = lang;
    document.title = STR[lang].appTitle;
  }
  function t(key, ...args) {
    let v = STR[lang][key];
    if (v === undefined) v = STR.de[key];
    return typeof v === "function" ? v(...args) : v;
  }
  return { t, setLang, detect, LANGS, get lang() { return lang; }, get other() { return lang === "de" ? "en" : "de"; } };
})();
