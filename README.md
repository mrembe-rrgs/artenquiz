# Artenquiz

Oberfläche auf Deutsch und Englisch (Umschalter oben rechts; beim ersten Start nach Gerätesprache). Die Sprache bestimmt auch die Trivialnamen von iNaturalist und die Wikipedia-Ausgabe.

Android-App zum Üben der Artenkenntnis. Zu jedem Foto bestimmt man Stufe für Stufe, wohin die Art in der Systematik gehört, z. B. Familie → Gattung → Art innerhalb der Ordnung Poales. Taxonomie, Fotos, Verbreitung und Wikipedia-Links kommen live von [iNaturalist](https://www.inaturalist.org).

## Funktionen

- Bestimmen Stufe für Stufe von einer frei wählbaren oberen bis zur unteren Rangstufe, eingegrenzt auf Gruppe, Ort, „nur heimisch“ und optional den aktuellen Monat
- Bestimmen nach Foto (Standardfoto oder echte Beobachtungsfotos, mit „anderes Foto“) oder nach Geräusch (Tonaufnahmen von iNaturalist)
- Schwierigkeit: leicht (Falschantworten aus Geschwistergruppen der Region) oder schwer (bevorzugt häufige Verwechslungen laut iNaturalist)
- Lernstapel mit Wiederholen-Modus, falsch bestimmte Arten kommen öfter wieder
- Wikipedia-Artikel nach jeder Art, Deutsch und Englisch

## Aufbau

- `www/` – die eigentliche App (HTML, CSS, JavaScript). Lässt sich zum Testen direkt im Browser öffnen: `www/index.html`.
  - `data.js` – Abfragen bei iNaturalist, Artenpool, Fragen mit Falschantworten
  - `app.js` – Oberfläche
  - `i18n.js` – alle Texte auf Deutsch und Englisch
  - `selbsttest.html` – prüft mehrere Gruppen aus Pflanzen, Tieren und Pilzen mit echten Daten (in der App unten über „Datenquelle prüfen“)
- `assets/` – App-Icon und Startbild, daraus erzeugt der Build die Android-Grafiken.
- `capacitor.config.json`, `package.json` – verpacken die Web-App mit [Capacitor](https://capacitorjs.com) als Android-App.
- `.github/workflows/android.yml` – baut bei jedem Push auf `main` die APK und legt sie unter **Releases → neueste** ab.
- `signing/debug.keystore` – fester Testschlüssel, damit neue Versionen sich über die alte installieren lassen. Nur für private Testversionen, nicht für den Play Store.

## Installieren

1. Im Repository auf **Releases → neueste** gehen und `artenquiz.apk` auf dem Handy herunterladen.
2. Antippen und installieren. Android fragt beim ersten Mal, ob der Browser Apps installieren darf.

## Datenquelle

Die App fragt die öffentliche iNaturalist-API ab, höchstens etwa eine Anfrage pro Sekunde. Fotos stehen unter den jeweils angezeigten Creative-Commons-Lizenzen.
