# Zombie-Apokalypse – Spielspezifikation (Entwurf v2.7)

Stand: 01.11.2026. Arbeitsgrundlage für Claude Code.

Änderungen v2.7 (Leistung): Modelle mit zusammengefassten Teilen und gemeinsamem Skelett, keine Licht- und Schattenwechsel zur Laufzeit, Heldenfeld der Zombies auf 22 m begrenzt (README „Leistung“).
Änderungen v2.7: Spieldauer etwa 20 Minuten für 20 Wellen: Pausen 20 s und 18 s (zum Einkaufen), weniger, dafür härter zuschlagende Zombies (+20 % Leben, +40 % Schaden je Welle), schnellere Kriecher, Messlauf `tests/balance/timing.test.ts`. Verteidigungen lassen sich auch während der Welle bauen und reparieren. Spielzähler (`/stats`, Abschnitt 10c). Zuschauermodus online und lokal (Abschnitt 10). Freie Kamera: Linksklick oder Ziehen auf der Minimap, mittlere Maustaste ziehen, Leertaste (belegbar, Aktion `camera`) zurück zum Helden; die Ego-Sicht hebt sie auf.
Änderungen v2.6: Wellen-Ereignisse (Nebelnacht, Blutmond, Regen), PvP-Varianten (Kiste erobern, Zombies nebenbei, Bots auf leeren Plätzen), Ego-Sicht mit Waffe im Bild und Kopfwippen, Schadenszahlen, Rollen-Kombos.
Änderungen v2.5: Verteidigungen in der Pause (Stacheldraht, Barrikade, Feuerfass), vier neue Helden (Imker, Aurelius, Lotte, Kapitän Tiefe).
Änderungen v2.4: Neuer Held Imker (Support), drei Spieler im Koop, Reichweiten und Durchschlag, Münzen und Buff-Ringe.
Änderungen v2.3: Ton fast still (keine Dauerquellen, Musik nur in Wellen), Ego-Sicht beim ganz Hineinzoomen (Maus fangen, Laufen relativ zum Blick, Fadenkreuz).
Änderungen v2.2: Endstatistik nach Spielende (Podest mit MVP, Auszeichnungen, sortierbare Rangliste, Kills pro Welle).
Änderungen v2.1: Lobby vor dem Spiel (freie Heldenwahl, Bereit, Countdown 15 s), erste Geräusche und Musik (im Code erzeugt) mit Lautstärke-Einstellungen.
Änderungen v2.0: Figuren stehen auf dem Boden, Angriffe synchron zum Treffer, Bienen-/Beete-Kreislauf, Postbote ab Welle 6 ohne Zeitlimit, Landschaft überarbeitet.
Änderungen v1.9: Karte mit mehr Details (Ruine, Stacheldraht, Barrikaden, Feuerstellen, Hochbeete, Bruchsteinwege, Gras), Nordeingang zum Innenhof (ersetzt das Rattenloch), Lager weichen aus. Beschwörerzauber wie in LoL (zwei pro Held, vor dem Spiel gewählt, Tasten F/G), siehe Abschnitt 9b.
Änderungen v1.8: Figuren laufen sichtbar (ein Skelett pro Figur), Schuss-Animationen mit sichtbaren Geschossen, Grafikstufen und Leistungsanzeige, kleinere Zustandspakete, geduldigerer Herzschlag mit Trennungsgrund.
Änderungen v1.7: Neue Mixamo-Figuren für Helden und Zombies, schwere Gegner größer und mit Leucht-Ring, neuer Elite Dämon, Boss-Zähler mit Kill-, Assist- und Erstes-Blut-Gold (Anzeigetafel auf Tab), Bots folgen Pings, Rattenloch zum Innenhof, verdorrte Beete, Nachtstimmung mit vielen Details.
Änderungen v1.6: Karte neu gestaltet (Fachwerkhaus, Bunker als Luke mit Hollywoodschaukel, Garten- und Geländedeko, Grabstätte, Teich, Abendstimmung), Verstecke (Gebüsch, hohes Gras, Schilf), flüssige eigene Bewegung im Mehrspieler.
Änderungen v1.5: Netzcode mit Bewegungsvorhersage, Jitter-Puffer, Wiederverbinden, Absicherung; kostenlose Bereitstellung (Tunnel, Render, Docker).
Änderungen v1.4: Minimap und Pings mit der rechten Maustaste (Ping-Rad wie in LoL).
Änderungen v1.3: M6 Mehrspieler: Node-Server mit Räumen, Beitritt per Link, Bots auf freien Plätzen, Docker.
Änderungen v1.2: Heldennamen Grimm (Hund), Hagedorn (Gärtnerin), Rauchbarth (Pirat), Spike (Libero), Ragnar (Rotschopf), Somnia (Schläferin). Die internen IDs bleiben (`gaertnerin`, `pirat`, `libero`, `rotschopf`, `schlaeferin`, `grimm`).
Änderungen v1.1: Karte um 10 m Gelände erweitert, Zombies kommen von außen durch Tore (West, Süd, Ost), Bunkertür nach Norden. Hornissen ab Welle 1 in wachsenden Schwärmen, mehr Zombies aus Nordwest. Ohne Bienenstock wachsen Beete nicht mehr nach. Sidequests: Zombie-Postbote als Team-Ziel, neutrale Lager (Fledermäuse, Spinnen, Kröte).
Änderungen v1.0: Items kombinierbar wie in LoL (Grundteile, Aufbau, fertige Items; Bauteile werden verbraucht und angerechnet). Animierte Modelle für alle Helden, Zombies, Ratten und Hornissen.
Änderungen v0.9: Herz wird Lebensmittelvorrat (kein Selbstheilen, Ernte der Hochbeete füllt ihn auf). Zombies gehen auf Helden und Vorrat, Ratten auf Hochbeete und Bienenstock, neue Hornissen auf den Bienenstock. Neuer Spawnpunkt Nordwest. Elites langsamer mehr, Wellen neu abgestimmt.
Änderungen v0.8: M5 umgesetzt. Bots in drei Stärken, ausgewogenes Team, Wellen für 4 Helden neu abgestimmt, Pausen 25 s (erste 20 s) mit „Welle starten“ (N).
Änderungen v0.7: M4 umgesetzt. Gold, Shop (Pause + Innenhof), Waffen als Werte-Items, Inventar und Verbrauchsgüter auf R/T. Neue Gegner Kriecher und Ratten, Elites Rattenkönig und Schlächter.
Änderungen v0.6: M3 umgesetzt. Level- und Skillregeln konkret, sechs Helden im Spiel (Grimm, Gärtnerin, Pirat, Libero, Rotschopf, Schläferin), Linksklick-Angriff je Held, Passive für Pirat, Libero und Schläferin (Mondlicht). Fähigkeiten steigern mit Shift + Taste. Gegnerbilder in assets/reference/gegner/, Ratte als Minion-Vorlage.
Änderungen v0.5: Optik der Helden nach den Referenzbildern in assets/reference/helden/ (Libero ist ein Mann mit Runen-Volleyball, die Schläferin eine Magierin mit Kristallstab).
Änderungen v0.4: Karte nach der Skizze (echte Maße, U-Haus mit Innenhof als Herz der Base, Bunker als Zombie-Spawn, Heckenlücke Süd, Hang Ost, Bienenstock als zweites Ziel). Helden-Spawn im Innenhof, tote Helden respawnen.
Änderungen v0.3: Steuerung wie in Supervive (WASD laufen, Maus zielt, Angriff Richtung Mauszeiger, kein Auto-Attack, keine Zielauswahl). Fähigkeiten auf 1–4, Items auf R und T, alle Tasten frei belegbar. Nahkampf-Reichweite 2,5 m im 120°-Bogen.
Änderungen v0.2: Veraltete Verweise auf Sanitäter und Brecher ersetzt.
Mit "Vorschlag" markierte Punkte sind noch nicht entschieden, alles andere ist festgelegt.

## 1. Vision

Koop-Verteidigungsspiel im Browser. Vier Helden verteidigen die "Winterburg" (Haus und Vorgärten, als Karte nachgebaut) gegen Zombiewellen. Perspektive von oben mit LoL-artiger Kamera und Steuerung wie in Supervive (WASD und Maus). Im Innenhof liegt der **Lebensmittelvorrat** der Winterburg: Zombies, die ihn erreichen, plündern ihn. Fällt er auf 0, ist das Spiel verloren. Die Hochbeete versorgen den Vorrat, Bienen verteidigen ihren Stock.

## 2. Festgelegte Entscheidungen

- Browser-Spiel mit 3D-Grafik und fester Schrägkamera von oben, wie in League of Legends und Dota
- Steuerung wie in Supervive:
  - WASD = laufen, der Mauszeiger bestimmt die Blickrichtung
  - Linksklick = Angriff Richtung Mauszeiger (gedrückt halten = Dauerangriff im Takt der Abklingzeit)
  - Kein Auto-Attack und keine Zielauswahl: Man greift in eine Richtung an. Reichweite und Trefferbereich hängen von der Waffe ab.
  - Nahkampf trifft alle Zombies im Bogen vor dem Helden (Testheld: 2,5 m, 120°). Fernkampf schießt ein Projektil geradeaus, das den ersten Zombie trifft, danebengehen kann und an Hindernissen endet.
  - Eine Markierung am Boden (Bogen bzw. Pfeil) zeigt Reichweite und Richtung des Angriffs
  - Fähigkeiten auf 1, 2, 3, 4 (4 = Ultimate), Items auf R und T. Taste halten zeigt eine Vorschau von Reichweite und Wirkfläche, Loslassen löst aus.
  - **Pings** (wie in LoL) mit der rechten Maustaste, für alle Spieler sichtbar: kurz klicken = „Hier!“, halten oder ziehen öffnet ein Ping-Rad mit Angriff (oben), Bin unterwegs (rechts), Hilfe (unten), Gefahr (links); die Mitte bricht ab. Geht auch auf der Minimap. Ping in der Welt (pulsierende Ringe und Symbol, 3 s, durch Wände sichtbar), auf der Minimap und als Meldung „Name: Ping“. Höchstens 3 Pings in 5 s pro Spieler. Läuft als Befehl durch die Simulation, im Mehrspieler also automatisch an alle.
  - **Minimap** unten rechts: Garten, Gelände, Wege, Lager, Vorrat, Bienenstock, Hochbeete, Helden (Heldenfarbe, eigener mit weißem Rand, Gefallene als Kreuz), Zombies (rot, Elites orange), Neutrale (grau), Postbote (golden, blinkend), Pings und der Kameraausschnitt.
  - Skillpunkt setzen: Shift + Fähigkeitstaste oder Klick auf „+“ in der Fähigkeitenleiste (Strg + Zahl wechselt im Browser den Tab und lässt sich nicht abfangen)
  - Alle Tasten sind frei belegbar (Esc öffnet Pause und Tastenbelegung)
- Levelsystem nach League-of-Legends-Vorbild (XP, Level, Skillpunkte)
- Gold sammeln und davon Waffen und Items kaufen
- Zombies kommen in Wellen, werden zahlreicher und stärker, immer wieder stärkere Elite-Zombies
- Das Haus hat Lebenspunkte. Erreicht ein Zombie das Haus (Durchbruch), greift er es an. Ein Durchbruch ist noch keine Niederlage, führt ohne Gegenwehr aber dazu.
- Es gibt immer 4 Heldenslots. Fehlende menschliche Spieler werden durch KI-Bots ersetzt. Die Zombiemenge bleibt dadurch unabhängig von der Spielerzahl gleich. Menschen können jederzeit joinen und übernehmen einen Bot-Slot.
- Langfristig 10 spielbare Helden, im MVP 5
- Karte: Winterburg mit Vorgärten. Das Satellitenbild liegt vor (Haus markiert, drei Zombie-Zugänge aus Norden, Osten und Süden). Maße fehlen noch.

## 3. Technik (Vorschlag)

- Client: TypeScript (oder JavaScript), Three.js mit fester Schrägkamera (Vorschlag: ca. 55° Neigung, kein Drehen), Build mit Vite. 3D-Modelle als glTF.
- Grafik: stilisiert nach LoL-Vorbild (kräftige Farben, handgemalt wirkende Texturen, umgesetzt als Low-Poly). Modelle und Animationen für Helden, Zombies und Garten aus frei lizenzierten Paketen (z. B. CC0-Sammlungen), Lizenzen prüfen. Neben dem Mehrspieler ist das der größte Aufwand.
- Umgesetzt: Die Zombies sind vier Comic-Zombies von Quaternius (CC0): Walker, Runner (einarmig), Kriecher, Brute und Schlächter (dick, Schlächter mit Hackbeil), Postbote (mit Mütze und Paket). Die fünf Menschen-Helden sind animierte Mixamo-Figuren. Zombies: Gehen, Rennen, Kriechen, Stehen, Schlagen, Sterben (Leiche versinkt), Sprung als Schrei. Helden: Laufen, Stehen, Angriff, je eine Animation pro Fähigkeit, Trank benutzen, am Boden liegen bis zum Respawn. Pipeline: FBX-Originale in `assets/models/<name>/`, `npm run models` erzeugt kompakte GLB-Dateien in `public/models/` (Details in `assets/models/README.md`). Grimm (Schäferhund), Ratten, Rattenkönig und Hornissen sind animierte CC0-Modelle von Quaternius. Mausrad zoomt (10–50 m), auch über den Leisten.
- Kamera: feste Neigung, Zoom mit dem Mausrad (10–50 m Abstand)
- Server: Node.js mit Colyseus (oder `ws`), server-autoritativ, 20 Ticks pro Sekunde
- Simulation strikt vom Rendering trennen. Die Spiellogik (Bewegung, Kampf, Zombies, Bots, Wellen) läuft tickbasiert in einem eigenen Modul ohne Browser-Abhängigkeit.
  - Singleplayer: Simulation läuft lokal im Browser, dazu 3 Bots
  - Mehrspieler: dieselbe Simulation läuft auf dem Server
- Eingaben sind ein kompakter Zustand pro Tick (Laufrichtung, Zielpunkt der Maus, Angriff gedrückt, später Fähigkeiten). Genau dieser Zustand geht im Mehrspieler übers Netz.
- Client-seitige Vorhersage für die eigene Bewegung, damit sich die Steuerung bei Latenz direkt anfühlt
- Spieldaten (Helden, Items, Zombietypen, Wellen) in JSON-Dateien, damit Balancing ohne Codeänderung geht
- Hosting: erst bei Meilenstein 6 entscheiden (z. B. Render, Fly.io, oder eigener Rechner zu Hause mit Cloudflare Tunnel). Bis dahin läuft alles lokal.
- Warum Browser: Mitspieler joinen per Link ohne Installation. Godot oder Unity wären starke Engines, brauchen aber Installation oder Web-Export und neue Sprachen.

## 4. Spielablauf

- Wellenphase: Zombies spawnen an den Kartenrändern und laufen zum Haus
- Pausenphase 18 s (vor Welle 1: 20 s; kurzzeitig 12 s und 15 s; bis v2.6 waren es 25 s und 20 s): Shop öffnen, Skillpunkte verteilen, Wiederbeleben. Wer fertig ist, startet die nächste Welle sofort mit N bzw. dem Knopf „Jetzt starten“ (im Mehrspieler später erst, wenn alle Menschen bereit sind).
- Welle n hat mehr und stärkere Zombies als Welle n-1. Ab v2.7 gilt: 10 + 2,6 × (n − 1) einzelne Zombies, Leben ×(1 + 0,2 × (n − 1)), Schaden ×(1 + 0,4 × (n − 1)), Zwischenbosse +2 % Leben je Welle. Ziel: ein erfolgreiches Spiel über 20 Wellen dauert etwa 20 Minuten (Messlauf `tests/balance/timing.test.ts`: 24 bis 25 min mit Bots ohne frühen Start).
- Elite-Zombie alle 5 Wellen, Boss alle 10 Wellen (Vorschlag)
- Ziel (nach LoL-Vorbild): Welle 30 überstehen, das dauert ca. 30 bis 40 Minuten wie ein LoL-Spiel. Danach optionaler Endlos-Modus mit Highscore.

## 5. Level und Skills (LoL-Vorbild)

Umgesetzt in M3, Zahlen in `data/progression.json` und `data/heroes.json`:
- Level 1 bis 18, ein Skillpunkt pro Level (Start mit 1 Punkt)
- Fähigkeiten 1–3: maximal Rang 5, aber höchstens Rang ⌈Level/2⌉. Fähigkeit 4 (Ultimate): maximal Rang 3, freischaltbar ab Level 6, 11 und 16
- XP durch Zombie-Kills (je Typ in `zombies.json`, +5 % pro Welle), für alle lebenden Helden im Umkreis von 15 m. Teilen sich mehrere Helden einen Kill, bekommt jeder einen Anteil (allein 100 %, zu zweit 60 %, zu dritt 45 %, zu viert 35 %). Elite und Boss geben mehr XP.
- XP-Kurve: etwa Level 6 um Welle 5 und Level 18 um Welle 25 (allein gespielt)
- Grundwerte wachsen pro Level: Leben, Regeneration und Schaden (+6 % je Level, gilt auch für Fähigkeiten)
- Vorschlag (später): dünne Übungsschicht zusätzlich. Zielgenauigkeit steigt durch viele Schüsse, Nahkampfschaden durch viele Treffer, jeweils als kleine Passivboni.

## 6. Helden

Geplant sind 8 Helden, 2 Slots bleiben frei. In M3 spielbar: **Grimm, Gärtnerin, Pirat, Libero, Rotschopf und Schläferin**. Taucher und Imker folgen in M7. Spalten Q/W/E/R entsprechen den Tasten 1/2/3/4. Werte stehen in `data/heroes.json`, der Code in `src/sim/heroes/`.

| Held | Linksklick |
|---|---|
| Grimm | Biss (Nahkampf, 2 m, 90°) |
| Gärtnerin | Steinschleuder (8 m) |
| Pirat | Enterhaken-Wurf (6 m) |
| Libero | Pritschen, kleiner Ballschuss (7 m) |
| Rotschopf | Hammer (Nahkampf, 2,5 m, 120°) |
| Schläferin | Sternenstaub aus dem Stab (8 m) |

| Held | Rolle | Q | W | E | R |
|---|---|---|---|---|---|
| Taucher | Nahkampf, Tank | Harpune | Druckluft | Strömung | Tiefenrausch |
| Pirat (Qualm) | Kontrolle | Qualmstoß | Rauchwolke | Nebelschritt | Dicke Luft |
| Imker | Fernkampf, Schaden über Zeit | Schwarm | Bienenstock | Honigfalle | Königin |
| Libero | Fernkampf, Support | Aufschlag | Block | Zuspiel | Schmetterball |
| Gärtnerin | Fernkampf, ausdauernd | Pfeilschuss | Saat | Kräutertee | Mein Garten! |
| Rotschopf | Nahkampf, Berserker | Wuchtschlag | Wutanfall | Ungezielter Sprung | Amok |
| Schläferin | Kontrolle | Berührung | Gähnen | Powernap | Gute Nacht |
| Grimm | Nahkampf, Jäger | Sprungbiss | Fährte | Heulen | Hetzjagd |

### Grimm (Hund)

- Rolle: Nahkampf-Jäger. Stark gegen Elite und Boss, heilt sich durch Beißen.
- Optik: ein kleiner, flauschiger weißer Hund. Kampfmodus: wild, gesträubtes Fell, gefletschte Zähne, leuchtende Augen. Cremeweißes Fell, hellbraune Flecken an den Ohren, rosa Nase, dunkle Augen, buschige Rute über dem Rücken, kleines dunkles Geschirr. Stilisiert. Die Wirkung soll süß und klein sein, im Kampf aber wild (Vorschlag: Fell sträubt sich und die Augen leuchten bei Fähigkeiten).
- Fähigkeiten (eigene Namen und Werte, Grundidee: ein Jäger, der verwundete Beute aufspürt und festhält):
  - Passiv Wittern: Zombies unter 50 % Leben sind durch Wände hindurch sichtbar. Der Hund heilt sich beim Beißen stärker, je weniger Leben er selbst hat.
  - Q Sprungbiss: Sprung in Zielrichtung, beißt den ersten getroffenen Zombie und heilt sich um einen Teil des Schadens.
  - W Fährte: Verwundete Zombies in der Nähe werden markiert. Zu ihnen hin ist der Hund schneller und greift schneller an.
  - E Heulen: Kurz weniger Schaden erleiden, danach laufen Zombies in der Nähe für einen Moment verängstigt weg.
  - R Hetzjagd: Langer Sprung zu einem Zielzombie (Elite oder Boss). Der Hund hält ihn fest, er kann sich nicht bewegen, und er erleidet Biss-Schaden pro Sekunde. Der Hund heilt sich dabei.
- Alle Zahlen (Schaden, Heilung, Abklingzeiten) sind Platzhalter und werden beim Balancing festgelegt.

## 6b. Weitere Helden (Entwürfe)

Namen sind Platzhalter, Fähigkeiten haben eigene Namen und Werte. Die früheren Platzhalter-Archetypen (Brecher, Schütze, Fallensteller, Sanitäter) entfallen, die persönlichen Helden ersetzen sie. Zufall (z. B. beim Rotschopf) wird immer vom Server gewürfelt.

### Spike (Libero, Volleyball)
- Rolle: Fernkampf, Kontrolle und Support. Optik (`assets/reference/helden/libero.jpg`): Mann mit braunen Locken und Bart, Ledermütze, ärmelloses Lederhemd mit goldener Palme, Knieschoner, bandagierte Hände, leuchtender Volleyball mit Runen und Funken. Spielgefühl: ein Held mit einem Ball, der liegen bleibt (Orianna in LoL).
- Der Ball ist ein Objekt auf der Karte. Fähigkeiten gehen vom Ball aus oder bewegen ihn.
- Passiv Ballgefühl: Der Ball kehrt zurück, wenn er mehr als 15 m entfernt ist. Mit Ball in der Hand läuft Libero 10 % schneller. Einen liegenden Ball hebt er im Vorbeilaufen auf.
- Q Aufschlag: Ball fliegt als Linienschuss durch Zombies und bleibt am Ende liegen
- W Block: kurze Sperre vor dem Helden, Zombies werden zurückgedrängt
- E Zuspiel: Ball zu einem Mitspieler oder Bot, gibt ihm einen Schild (ohne Mitspieler an sich selbst)
- R Schmetterball: Ball springt hoch und schlägt nieder, Flächenschaden mit Betäubung

### Rauchbarth (Pirat, Rauch-Held)
- Rolle: Kontrolle. Optik (`assets/reference/helden/pirat.jpg`): bärtiger Pirat mit Dreispitz, Kopftuch, Lederweste, Gurten, Enterhaken und Seil. Spielgefühl: Rauchgranate, die Gegnern die Sicht nimmt (Graves in LoL).
- Linksklick: Enterhaken-Wurf. Passiv Pulverdampf: Jeder 4. Treffer hüllt den Zombie in Rauch (kurz geblendet).
- Rauch-Regel: Zombies im Rauch sehen nur wenige Meter weit, verlieren ihr Ziel, torkeln und treffen oft daneben.
- Q Qualmstoß: Rauchkegel nach vorne, wenig Schaden, Zombies sind kurz benommen
- W Rauchwolke: Granate, die Wolke bleibt ca. 5 s und verlangsamt Zombies darin
- E Nebelschritt: Sprung in eine eigene Rauchwolke, dort kurz unsichtbar. Ohne Wolke ein kurzer Sprung ohne Unsichtbarkeit.
- R Dicke Luft: große Wolke, Zombies sind 3 s betäubt und danach 5 s blind
### Hagedorn (Gärtnerin)
- Rolle: Fernkampf, ausdauernd. Optik (`assets/reference/helden/gaertnerin.jpg`): ältere, grummelige Frau mit Stoffhut, Karohemd, Latzhose, Gummistiefeln, Arbeitshandschuhen, Werkzeuggürtel und großer Heckenschere. Spielgefühl: Pflanzen als kleine Geschütztürme (Zyra in LoL).
- Linksklick: Steinschleuder (die Heckenschere ist Optik)
- Passiv Sturschädel: regeneriert langsam Leben und wird zäher, je länger sie im Kampf bleibt
- Q Pfeilschuss: Fernschuss mit dem Bogen (bis v1.6 Steinschleuder)
- W Saat: pflanzt Samen, nach 2 s wachsen Dornenranken, die Zombies verlangsamen und stechen (max. 3 gleichzeitig)
- E Kräutertee: heilt sie und Verbündete im Umkreis über Zeit
- R Mein Garten!: Dornenhecke wächst als Ring (ca. 8 s), hält Zombies zurück und verursacht Schaden. Kann einen Zugang kurz sperren.

### Ragnar (Rotschopf)
- Rolle: Nahkämpfer, stark und unberechenbar. Optik (`assets/reference/helden/rotschopf.jpg`): rote Locken und Bart, kräftig, wild, Schutzbrille auf der Stirn, Beinschienen, riesiger Kriegshammer. Spielgefühl: Berserker (Olaf in LoL).
- Passiv Jähzorn: je mehr Schaden er einsteckt, desto schneller greift er an
- Q Wuchtschlag: Schlag mit zufälligem Zusatzeffekt (Betäubung, doppelter Schaden oder Rückstoß)
- W Wutanfall: zufälliger Buff (Tempo, Schild oder Heilung)
- E Ungezielter Sprung: Sprung mit kleiner Zufallsabweichung, hoher Schaden
- R Amok: kurz unaufhaltsam (immun gegen Betäubung und Rückstoß), doppelter Schaden

### Somnia (Schläferin)
- Rolle: Kontrolle. Optik (`assets/reference/helden/schlaeferin.jpg`): Magierin mit braunem Haar, Kristallstab, blau-grünem Sternenmantel mit Mondmotiven, Mondanhänger, Schmetterling, Sternenstaub-Wirbel. Superkraft: sofortiger Schlaf. Spielgefühl: Schlaf-Fähigkeiten (Lillia und Zoe in LoL).
- Schlaf-Regel: Ein schlafender Zombie ist ausgeschaltet und wacht bei Schaden auf. Der erste Treffer auf einen Schlafenden macht Bonusschaden. Elite schlafen kürzer, Boss sind immun.
- Passiv Mondlicht (ersetzt „Sprinterin“): Ihre Treffer machen Zombies schläfrig (langsamer). Nach 3 Treffern innerhalb von 4 s schläft der Zombie kurz ein.
- Q Berührung: Antritt zu einem Zombie, er schläft sofort 2 s
- W Gähnen: Kegel, Zombies werden langsamer und schlafen nach 1,5 s ein
- E Powernap: kurz stillstehen, starke Heilung, danach Tempobonus
- R Gute Nacht: großes Gebiet, alle Zombies schlafen ein

### Taucher Kapitän Tiefe (umgesetzt v2.4, Tank)
- Optik: schwerer Anzug, alter Messing-Taucherhelm mit Bullauge, Sauerstoffflasche auf dem Rücken (aus dem Entwurf), Harpune.
- Angriff: Nahkampf (Harpunenstoß/Bleistiefel), 3 m, Bogen 100°.
- Passiv Druckanzug: 15 % weniger Schaden, kein Rückstoß, langsamer (4,6 m/s).
- 1 Harpune (Linie 9 m): Schaden, zieht den ersten Zombie heran (nicht Bosse/Neutrale) und betäubt 0,6 s (aus dem Entwurf).
- 2 Luftblase (5 m): Schild 100–260 für 4 s auf ihn und Mitspieler.
- 3 Tauchgang (7 m): 0,8 s unverwundbar, unsichtbar und ohne Laufen; taucht am Ziel auf, Schaden und Betäubung 1–1,6 s im Umkreis 2,5 m.
- 4 Flutwelle (Linie 12 m, 4 m breit): Schaden, spült 5/7/9 m zurück, verlangsamt 3 s.

### Glöcknerin Hedwig (umgesetzt v2.6, Support)
- Optik: violettes Gewand, weiße Haube, Schultertuch, Messing-Handglocke (umgebaute Somnia-Figur).
- Angriff: Schallwelle (Geschoss), 9 m, 0,85 s.
- Passiv Abendläuten: jeder dritte Treffer heilt den schwächsten Mitspieler in 8 m um 25 (+5 je Level).
- 1 Weckruf (Kegel 5 m, 60°): Schaden 35–115, Betäubung 0,6–1 s.
- 2 Glockenschlag (Kreis 4 m, Reichweite 9 m): Heilung 70–190 für alle Mitspieler.
- 3 Schutzglocke (Kreis 2,5 m): Schild 70–170 für 4 s.
- 4 Sturmgeläut (um sie, 7 m): Schaden 120–240, Furcht 1,5–2,5 s; Mitspieler +25 % Tempo für 4 s.

### Förster Bruno (umgesetzt v2.6, Tank)
- Optik: grüne Jacke, Filzhut mit Feder, Holzfälleraxt (umgebaute Rauchbarth-Figur).
- Angriff: Nahkampf (Axt), 3 m, Bogen 110°, 1,15 s.
- Passiv Dickes Fell: 10 % weniger Schaden, unter 40 % Leben +15 %.
- 1 Baumstamm (Linie 8 m, 1,2 m breit): Schaden 45–145, Rückstoß 2,5 m, Verlangsamung 40 % für 2 s.
- 2 Lockruf (um ihn, 5 m): Zombies zielen 3 s auf ihn; Schild 60–160 plus 10–26 je Zombie (höchstens 8).
- 3 Wurzelwerk (Kreis 3 m, Reichweite 8 m): Festhalten 1,2–2 s, Schaden 30–90.
- 4 Holz fällen (Linie 10 m, 3 m breit): nach 0,9 s Schaden 180–380, Betäubung 1,4–2 s (Ereignis `timber-warn`, dann `timber`).

### Schornsteinfeger Kasimir (umgesetzt v2.6, Schaden)
- Optik: schwarzer Anzug, Zylinder, Kaminbesen (umgebaute Spike-Figur).
- Angriff: Rußball (Geschoss), 9 m, 0,8 s.
- Passiv Glücksbringer: 15 % Chance auf doppelten Schaden beim Grundangriff (Spiel-Zufall).
- 1 Rußwolke (Kegel 5 m, 55°): Schaden 40–120, blendet 2 s.
- 2 Kaminsprung (Sprung bis 7 m): bei der Landung Schaden 45–145 im Umkreis 2,2 m.
- 3 Besenwirbel (um ihn, 3 m): Schaden 35–115, Rückstoß 3 m.
- 4 Funkenflug (Kreis 4,5 m, Reichweite 9 m): Brandzone 45–95 Schaden/s für 5 s.

### Bäckerin Frieda (umgesetzt v2.6, Schaden)
- Optik: helles Kleid, Kochmütze, Schürze, Nudelholz (umgebaute Somnia-Figur).
- Angriff: Nahkampf (Nudelholz), 2,8 m, Bogen 100°, 0,95 s.
- Passiv Frisch aus dem Ofen: alle 6 s +60 % Schaden beim nächsten Hieb und Heilung 30 (+6 je Level).
- 1 Brezelwurf (Linie 8 m, 0,8 m breit): Schaden 45–145 an allen auf der Linie.
- 2 Mehlstaub (Kreis 3 m, Reichweite 7 m): blendet 1,5–2,7 s, verlangsamt 35 %.
- 3 Ofenhitze (selbst): +30–50 % Angriffstempo, +15 % Tempo für 5 s.
- 4 Großes Backblech (Kreis 4 m, Reichweite 8 m): nach 0,8 s Schaden 170–350, Betäubung 1,2–1,8 s.

### Imker (umgesetzt v2.4, Support)
- Optik: heller Anzug, Imkerhut mit Schleier, Smoker in der Hand, ein paar Bienen schwirren um ihn (aus dem früheren Entwurf).
- Angriff: kleiner Bienenschwarm als Geschoss, 9 m. Jeder Treffer setzt einen Stich (bis 5, je 3 Schaden/s plus 0,4 je Level, 4 s, frischt auf) – der Schaden über Zeit der Bienen aus dem Entwurf.
- Passiv Mein Volk: in 12 m um den Bienenstock heilt er 30 % stärker; solange er lebt, heilt sich der Stock um 1 Leben/s.
- 1 Honigtopf (Fläche 3,5 m): heilt Mitspieler, Zombies darin 3 s verlangsamt (Honigfalle aus dem Entwurf).
- 2 Smoker (Kegel 6 m, 70°): blendet und verlangsamt 2–3 s.
- 3 Wachbienen (9 m): Bienen umkreisen einen Mitspieler (oder ihn) 6 s; jeder Zombie, der ihn angreift, wird gestochen.
- 4 Schwarm (Fläche 4,5 m, 5 s): Schaden über Zeit, Zombies darin bekommen sofort volle Stiche, Mitspieler darin werden von Seuche gereinigt.

### Goldschmied Aurelius (umgesetzt v2.4, Schaden)
- Optik: älterer Handwerker mit runder Brille, Lederschürze, Lupe am Gürtel.
- Angriff: Goldnuggets, 9 m, Durchschlag 1 Ziel dahinter (60 %).
- Passiv Feingold: +15 % Gold für eigene Kills; je 100 getragenes Gold +1 % Schaden (bis 25 %).
- 1 Lötflamme (Kegel 5 m, 50°): Schaden und Brand über 3 s.
- 2 Blattgold (9 m): Schild 80–200 für 4 s auf den Mitspieler am Zeiger.
- 3 Schmelztiegel (Fläche 2,8 m, 4 s): verlangsamt 50 % und macht Schaden.
- 4 Goldrausch (Fläche 5 m): 150/250/350 Schaden; wer in 6 s stirbt, lässt doppeltes Gold fallen (golden markiert).

### Lotte (umgesetzt v2.4, Schaden/Beschwörerin)
- Optik: kleines Mädchen, Zöpfe, gelber Regenmantel, Teddy im Arm. Trolle: grüne Hulks in drei Größen.
- Angriff: Steinschleuder, 8 m.
- Passiv Beste Freunde: Trolle +6 % Leben und Schaden je Level; mit einem Troll in 5 m nimmt sie 20 % weniger Schaden.
- 1 Trollruf (7 m): Troll 300–700 Leben, 20–40 Schaden, 12 s, greift Zombies in 9 m an.
- 2 Brückentroll (8 m): großer Troll 600–1400 Leben, 8 s, läuft nicht; Zombies in 5 m greifen nur ihn an (Wand).
- 3 Wutanfall: alle eigenen Trolle 4 s lang 50 % schneller (Bewegung und Angriff) und stärker; nur mit Trollen.
- 4 Trollfamilie (8 m): zwei Trolle (500–900 Leben) und ein Riese (1600–2800 Leben, 70–120 Schaden) für 15 s.
- Technik: verbündete Beschwörungen (`state.minions`, `src/sim/minions.ts`); Zombies greifen Trolle an, die näher sind als ein Held oder sie per Brückentroll anziehen.

## 7. Gegner

Referenzbilder in `assets/reference/gegner/`. Werte in `data/zombies.json` und `data/waves.json`.

- **Walker** (langsam, Masse; Optik v1.7: meist Polizisten-Zombie, sonst Zombie-Mädchen), **Runner** (schnell, wenig Leben; Optik: Parasit oder Skelett-Zombie), **Brute** (Tank; Kürbis-Hulk, 1,5-fach groß)
- **Kriecher** (ab Welle 3): kriecht am Boden, langsam (1,15 m/s), viel Leben. Sein Treffer hält den Helden 1 s fest.
- **Wer greift was an:** Zombies (Walker, Runner, Brute, Kriecher, Elites) jagen Helden in der Nähe und laufen sonst zum Lebensmittelvorrat. Den Bienenstock und die Beete lassen sie in Ruhe.
- **Ratten (Minions):** klein, sehr schnell, wenig Leben und Schaden. Ab Welle 2 kommen Rudel von 5–8 Ratten gemeinsam an einem Spawnpunkt, mit jeder Welle mehr Rudel. Sie fressen die **Hochbeete** an (60 %, jeweils das nächste intakte Beet), gehen an den **Bienenstock** (20 %) oder an den **Vorrat** (20 %, v1.7). Zum Vorrat kommen sie (wie alle) durch den Durchgang im Südwesten oder den Nordeingang. Helden beißen sie nur, wenn sie gestört werden: Ein Held steht näher als 2 m oder hat sie in den letzten 4 s getroffen.
- **Hornissen** (ab Welle 1: anfangs ein Schwarm von 2–3, Schwärme wachsen um 0,4 Tiere pro Welle, alle 4 Wellen ein Schwarm mehr): gelb-schwarz, schnell, wenig Leben. Sie fliegen über Hecken, Zäune und das Haus und greifen die Honigkästen des Bienenstocks an. Sie kommen zu 85 % aus dem Spawnpunkt Nordwest. Helden greifen sie wie Ratten nur an, wenn sie gestört werden. Ihr Angriff macht die Bienen wütend.
- **Elites** alle 5 Wellen (⌊Welle/5⌋ Stück, abwechselnd), mit immer sichtbarem Lebensbalken und Ankündigung:
  - **Rattenkönig:** große Ratte mit Krone, ruft alle 8 s vier Ratten herbei
  - **Dämon** (v1.7, ab Welle 15 im Wechsel): schnell, springt alle 8 s auf einen Helden in bis zu 10 m. Vorher markiert ein violetter Kreis 0,7 s lang den Landeplatz; bei der Landung trifft er alle Helden im Umkreis von 2,5 m (55 Schaden, kurz betäubt).
  - **Vogelscheuche** (v2.6, im Wechsel ab Welle 3): Sensenhieb (slam, Radius 2,2 m), Krähenschwarm ab Welle 5 (bolt, 2 Ziele, Seuche), Saat der Toten ab Welle 9 (nova; Boss-Fähigkeit `summon`: 2 Walker am Einschlagpunkt). Team-Buff Erntedank (0,8 % Leben/s, −8 % Schaden).
  - **Frostriese** (v2.6, im Wechsel ab Welle 3): Eisfaust (slam, 0,6 s Betäubung), Frosthauch (nova 4 m; Boss-Fähigkeit `slow`: −35 % Tempo für 2,5 s), Eiszapfen ab Welle 8 (bolt, 3 Ziele, −30 % für 2 s). Team-Buff Frostschutz (−12 % Schaden, +10 % Angriffstempo).
  - **Totengräber** (v2.6, im Wechsel): Schaufelschlag (slam, 0,4 s Betäubung), Erdwurf (bolt, 2 Ziele, −30 % für 2 s), Grab öffnen ab Welle 9 (nova, `summon` 2 Kriecher). Team-Buff Grabesruhe (+15 % Schaden).
  - **Moorhexe** (v2.6, im Wechsel): Fluchblitz (bolt, 2 Ziele, Seuche), Sumpfnebel (nova 3,6 m, −30 % für 2,5 s), Krötenregen ab Welle 10 (bolt, 2 Ziele, `summon` je 2 Ratten). Team-Buff Hexentrank (1 % Leben/s, +10 % Angriffstempo).
  - **Schlächter:** riesiger Zombie (1,9-fach) mit Hackbeil. Holt alle 8 s aus (rote Warnlinie) und stürmt auf einen Helden in bis zu 8 m. Wer getroffen wird, nimmt Schaden, wird zurückgestoßen und 0,75 s betäubt.
  - Elites schlafen nur halb so lang. Grimms Hetzjagd bevorzugt sie.
  - Optik (v1.7): leuchtender Boden-Ring in eigener Farbe (Schlächter rot, Dämon violett, Rattenkönig gold), glühende Augen, Namensschild über dem großen Lebensbalken. Der Rattenkönig ist dreimal so groß wie eine Ratte.
- Kontrolle auf Helden (festgehalten, betäubt) wirkt nicht, solange der Held unaufhaltsam ist (Rotschopf: Amok)
- Später: Spitter (Fernkampf), Boss
- Verhalten: Zombies greifen Helden an, die in Reichweite sind. Sonst laufen sie zum Haus. Pfadfindung um Hindernisse.
- Durchbruch: Erreicht ein Zombie das Haus, bleibt er stehen und greift es an (Schaden pro Sekunde, Elite und Boss mehr). Wird er getötet, endet der Schaden.

## 8a. Sieg (v1.9)

- Wer **Welle 20 übersteht, gewinnt** (`victoryWave` in `data/waves.json`). Nach Sieg oder Niederlage folgt die Endstatistik (v2.2, siehe unten).
- Die Wellen sind auf **vier aktive Spieler** ausgelegt: Fällt einer aus (AFK), ist es zu dritt kaum zu schaffen. Sein Held bekommt dann auch kein Gold und keine Erfahrung mehr.

## 8c. Endstatistik (v2.2)

- **Zählung:** Die Sim zählt je Held in `h.stats` (`src/sim/stats.ts`):
  - Schaden an Zombies und erlittenen Schaden (nach Rüstung und Schild)
  - Heilung, die dem Heiler gutgeschrieben wird: Zauber, Fähigkeiten, Lebensraub, Heilung über Zeit über `Buff.by`; ohne die normale Regeneration
  - Tode, Serien (Kills ohne Tod), Kills pro Welle
  - Einsätze von Fähigkeiten und Zaubern, ausgegebenes Gold
- **Übertragung:** `stats` geht nicht in die Schnappschüsse, weil sich die Werte bei jedem Treffer ändern. Das `gameOver`-Ereignis bringt `stats` (alle Helden, nach Wertung sortiert) und `team` (Welle, Zeit, Zombies, Bosse, Postboten, Vorrat, Beete, Stock) einmal fertig mit (`endGame`).
- **Wertung (`mvpScore`):** Kill 1, Boss 5, Assist 0,6, Schaden/400, Heilung/300, erlittener Schaden/800, Tod −1, nie unter 0. Gewichte in `data/economy.json` unter `rewards.mvp`.
- **Bildschirm:** Teamleiste, Podest (Platz 1 als MVP), Auszeichnungen (nur Kategorien mit Wert > 0), sortierbare Rangliste mit Schadensbalken, SVG-Diagramm „Kills pro Welle“. Die Zahlen zählen hoch. „Nochmal“ führt online zurück in die Lobby.

## 8. Niederlage

- Der **Lebensmittelvorrat** (früher „Herz“) im Innenhof hat einen gut sichtbaren Lebensbalken (5500). Fällt er auf 0, ist das Spiel verloren: „Der Lebensmittelvorrat ist geplündert“.
- Ein Durchbruch (Zombie erreicht den Vorrat) ist keine sofortige Niederlage. Die Zombies brauchen Zeit zum Plündern, und die Helden können sie wegkämpfen. Ohne Gegenwehr führt der Durchbruch aber zur Niederlage.
- Der Vorrat regeneriert **nicht** von selbst. Keine Reparatur im Shop.
- **Bienen und Beete (v2.0):** Die Bienen bestäuben die Beete und heilen den Stock dabei: je intaktem Beet 0,8 Leben/s (`bees.pollenHeal`). Sind alle Beete zerstört, hungern die Bienen und der Stock verliert 1,5 Leben/s (`bees.starve`, rund 11 Minuten bis zum Tod, also mehrere Wellen); die Kopfleiste zeigt „Bienen hungern“. Nach der Ernte wachsen angefressene Beete nur mit Bienen wieder voll auf, zerstörte nach 2 Wellen.
- **Ernte:** Nach jeder überstandenen Welle ernten die sechs Hochbeete und füllen den Vorrat auf, jedes Beet 80 bei vollem Leben, angefressene anteilig weniger. Ein zerstörtes Beet bringt nichts und wächst nach 2 Wellen mit vollem Leben nach, aber nur, solange der Bienenstock steht (ohne Bienen keine Bestäubung). Zerstörte Beete sind keine Niederlage.
- Der **Bienenstock** (1000 Leben) wird von Hornissen und einem Teil der Ratten angegriffen. Normalerweise stechen die Bienen nur Gegner in der Nähe. Sobald der Stock Schaden bekommt, werden sie für einige Sekunden wütend und stechen alle in der Nähe, auch Helden. Ein zerstörter Stock ist keine Niederlage, die Bienen sind dann aber weg und zerstörte Beete wachsen nicht mehr nach.
- Gefallene Helden respawnen nach einem Timer, der mit der Welle wächst (5 s + 1 s pro Welle), im Innenhof und müssen von dort durch den Durchgang nach draußen.

## 8b. Sidequests: Postbote und Lager (wie Drache und Dschungel in LoL)

Freiwillige Ziele im Gelände außerhalb des Gartens. Sie bringen Gold und XP, kosten aber Zeit, in der der Garten schwächer verteidigt ist. Alle Neutralen greifen erst an, wenn man sie angreift, und dann gemeinsam mit ihrem Lager. Entfernen sie sich weiter als ihre **Leine** von ihrem Platz (oder ist kein Held mehr in der Nähe), kehren sie um und heilen sich voll (der Postbote heilt sich seit v1.7 nicht mehr). **Ausweichen (v1.9):** Trifft das Lager seinen Angreifer 5 s lang nicht (z. B. Fernkämpfer hinter einem Zaun), setzt es sich zurück wie in LoL: alle Bewohner kehren heim, sind auf dem Rückweg unverwundbar und am Platz wieder voll geheilt (Meldung „… weicht aus und setzt sich zurück“). Beim Verfolgen laufen Neutrale um Hindernisse herum. Bots greifen Neutrale nicht von sich aus an, helfen aber Menschen, die gegen Postbote oder Lager kämpfen (bis 25 m), und folgen einem Angriffs-Ping.

**Zombie-Postbote** (Drache): ein Team-Ziel (v2.0)
- Erscheint **ab Welle 6**, 20 s nach Wellenbeginn, und läuft seinen **Rundweg** im Gelände (`courierRoute` in `data/map.json`). Er **bleibt, bis er getötet wird**. Nach seinem Tod kommt **3 Wellen später** ein neuer, stärker, weil sein Leben mit der Welle wächst.
- Auf Level-6-Helden abgestimmt: in Welle 6 rund 5500 Leben und 60 Schaden pro Schlag. Im Kampf wirft er alle 6 s ein **Paket** auf einen Helden in bis zu 9 m (0,9 s Warnung, 3 m Flächenschaden).
- Leine 14 m ab dem Punkt, an dem der Kampf beginnt; beim Umkehren heilt er sich nicht.
- **Belohnung:** Jeder Beteiligte bekommt 150 + 30 × Welle Gold, dazu Boss-Gold für Kill und Assists.
- Zombie in Uniform mit Postmütze und Paket, goldener Ring (auch durch Wände sichtbar), Meldungen beim Auftauchen und Besiegen.

**Lager** (Dschungel), Werte in `data/zombies.json`, Lage in `data/map.json` (`camps`):
- **Fledermausschwarm** (Nord und Ost): 5 fliegende Zombie-Fledermäuse, schnell und schwach
- **Spinnennest** (West): Riesen-Zombiespinne mit zwei kleinen Spinnen
- **Krötentümpel** (Süd): eine Riesen-Zombiekröte, langsam, viel Leben, harte Treffer
- Zu Spielbeginn besetzt. Geleerte Lager kommen nach 75 s (Kröte 90 s) wieder, mit der Stärke der aktuellen Welle.
- Belohnung: Kill-Gold und XP wie bei Zombies für alle Helden in der Nähe.
- Lager und Postbote zählen nicht zur Welle.

## 8e. Wiederbeleben (v2.5)

- **Am Boden:** Gefallene liegen 10 s am Boden (`revive.window`). Mitspieler in 1,8 m füllen den Fortschritt in 3 s (Supports in 2 s); ohne Helfer sinkt er mit halber Geschwindigkeit.
- **Aufstehen:** Bei vollem Fortschritt steht der Held an Ort und Stelle mit 40 % Leben auf. Sonst greift der normale Respawn.
- **Bots:** Sie gehen zu gefallenen Mitspielern in 16 m Umkreis.
- **Code:** `src/sim/revive.ts`; Werte in `data/economy.json` unter `revive`.

## 8d. Verteidigungen (v2.5)

- **Bauen:** jederzeit, in der Pause und während der Welle (seit v2.7, vorher nur in der Pause), nicht im PvP und nicht als Gefallener. Befehle `build {kind, pos, rot}` und `repair`; Werte in `data/economy.json` unter `defenses`, Code in `src/sim/defenses.ts`.
- **Stacheldraht:** Kreis 1,3 m; verlangsamt (45 %), 10 Schaden/s; Abnutzung 4 Leben/s je Zombie darin (300 Leben).
- **Bretterbarrikade:** 2,4 × 0,5 m, quer oder längs; Hindernis im Raster und in den Wegefeldern (neu berechnet beim Bauen und Zerstören). Zombies, die zum Ziel laufen und sie berühren, schlagen sie (700 Leben).
- **Feuerfass:** Kreis 1,8 m; Brand 12 Schaden/s für 3 s; Abnutzung 3 Leben/s je Zombie (400 Leben).
- **Grenzen:** je Art 6/6/3 fürs Team, mindestens 1,2 m Abstand (Barrikaden 2,2 m), nicht auf Hindernissen, Zielen oder Helden; Barrikaden auch nicht auf Zombies.
- **Reparieren:** jederzeit; fehlender Anteil × Neupreis × 0,5 Gold, zahlt der auslösende Held.

## 8f. Wellen-Ereignisse (v2.6)

- **Auslosung:** zu Wellenbeginn mit dem Spiel-Zufall (`rollWaveEvent`, `src/sim/waveevents.ts`). Ab `fromWave` 4 mit `chance` 0,25, höchstens alle `gap` 3 Wellen, nie im PvP. Der Zustand `wave.event` wird übertragen; das Ereignis `waveEvent` löst die Ansage aus.
- **Nebelnacht:** Aggro-Reichweite der Zombies ×0,7. Der Client verkürzt den Nebel, die Minimap zeigt Zombies nur in 15 m um das eigene Team.
- **Blutmond:** Zwischenbosse ×2 (zusätzliche `elite:`-Einträge in der Warteschlange), Kill-Gold ×1,5; rotes Licht.
- **Regen:** Tempo von Helden und Zombies ×0,85, Brand ×0,5; Regenpartikel.
- **Ende:** Die Wirkung gilt nur in der Phase `wave` (`eventFactor`); beim Wechsel in die Pause wird `wave.event` gelöscht.

## 9. Gold, Shop und Items

Umgesetzt in M4. Zahlen in `data/items.json` und `data/economy.json`.

- **Gold nach Leistung (v1.9, wie in LoL):** Startgold 350. Der **letzte Treffer** bringt das volle Kill-Gold des Zombies, wer in den letzten 8 s Schaden gemacht hat (**Assist**), ein Drittel, wer nur danebensteht nichts. Der **Wellenbonus** (50 + 10 × Welle) geht nur an Helden, die in dieser Welle gekämpft haben. Der Postbote bringt allen Beteiligten das Paket-Gold.
- **Erfahrung nach Leistung (v1.9):** Killer 100 %, Mitkämpfer 50 %, Helden in 15 m, die nicht mitgekämpft haben, 25 % (`economy.rewards`). Wer viele Zombies erlegt, levelt also deutlich schneller.
- **Bosse wie in LoL (v1.7):** Elites, Postbote und die großen Neutralen (Riesenspinne, Kröte) merken sich, wer ihnen in den letzten 10 s Schaden gemacht hat. Der letzte Treffer bringt 100 + 15 × Welle Gold, jeder andere Beteiligte die Hälfte (Assist). Der erste Boss der Partie bringt +150 Gold („Erstes Blut“). Normales Kill-Gold und Postboten-Gold kommen dazu. Jeder Held zählt Kills, Bosse, Assists und verdientes Gold; **Tab halten** zeigt die Anzeigetafel, die Teamleiste einen Totenkopf mit der Zahl der Bosse.
- **Shop:** nur in der Pause **und** nur im Innenhof (6 m um das Herz). Taste B oder Klick auf den Hinweis „B: Shop öffnen“. Das Spiel läuft beim Einkaufen weiter, die Pause tickt also. Beginnt die Welle oder verlässt man den Hof, schließt der Shop.
- **Waffen sind Werte-Items** (wie in LoL): Der Standardangriff des Helden bleibt, die Waffe macht ihn stärker. Nahkampfwaffen wirken bei Nahkämpfern voll, Fernkampfwaffen bei Fernkämpfern, sonst halb.
- **Rezepte wie in LoL:** Items haben drei Stufen. Ein Rezept besteht aus Bauteilen plus Aufpreis (`from` in `data/items.json`, der Preis ist der Gesamtpreis). Beim Kauf werden Bauteile im Inventar verbraucht und auf den Preis angerechnet; fehlt ein Bauteil, zählen dessen eigene Bauteile (rekursiv). Kombinieren geht auch bei vollem Inventar. Der Shop zeigt den Restpreis („noch 450 Gold“), vorhandene Bauteile grün und beim Überfahren mit der Maus Bauteile und Weiterentwicklungen.
  - **Grundteile:** Baseballschläger (+15 % Schaden, Nahkampf), Pistole (+15 % Schaden, Fernkampf), Arbeitshandschuhe (+12 % Angriffstempo), Lederjacke (10 % weniger Schaden), Lebensamulett (+200 Leben), Laufschuhe (+12 % Tempo), Kräuterbeutel (+5 Leben/s), Küchenwecker (−8 % Abklingzeit)
  - **Aufbau:** Axt (Schläger, +30 % Schaden), Schrotflinte (Pistole, +35 % Schaden), Gewehr (Pistole, +20 % Schaden, +25 % Reichweite), Armbrust (Handschuhe, +35 % Angriffstempo, Fernkampf), Kettenhemd (Lederjacke, 20 % weniger Schaden), Taschenuhr (Küchenwecker, −15 % Abklingzeit)
  - **Fertig:** Kettensäge (Axt + Handschuhe: +40 % Schaden, +40 % Angriffstempo), Vorschlaghammer (Axt + Amulett: +40 % Schaden, +300 Leben), Jagdgewehr (Schrotflinte + Gewehr: +55 % Schaden, +35 % Reichweite), Repetierarmbrust (Armbrust + Schrotflinte: +45 % Angriffstempo, +40 % Schaden), Ritterrüstung (Kettenhemd + Amulett: 30 % weniger Schaden, +300 Leben), Siebenmeilenstiefel (Laufschuhe + Kräuterbeutel: +20 % Tempo, +10 Leben/s), Großvateruhr (Taschenuhr + Amulett: −25 % Abklingzeit, +250 Leben)
  - Obergrenzen: Schadensreduktion höchstens 80 %, Abklingzeit-Verkürzung höchstens 50 %.
  - Bots kaufen nach ihrer Liste in `data/bots.json`: Reicht das Gold nicht für das ganze Rezept, kaufen sie zuerst Bauteile; Verbautes zählt als vorhanden.
- **Inventar:** 6 Plätze für Waffen und Items. Verkaufen (Rechtsklick im offenen Shop) bringt 70 % des Preises.
- **Verbrauchsgüter** auf den Item-Tasten R und T, stapelbar: Heiltrank (150 Leben über 5 s, bis 5 Stück), Energiedrink (6 s lang +30 % Tempo und Angriffstempo, bis 3 Stück). Benutzbar jederzeit, außer wenn betäubt.
- Keine Munition.

## 9b. Beschwörerzauber (v1.9)

Werte in `data/spells.json`, Logik in `src/sim/spells.ts`.
- **Zwei pro Held**, unabhängig vom Helden. **Gewählt** wird vor dem Spiel (Team- bzw. Beitritts-Bildschirm, im Browser gemerkt). In der **Pause** kann man tauschen (Rechtsklick auf das Feld); die Abklingzeit des Platzes bleibt.
- **Tasten:** F und G, frei belegbar; D ist schon „nach rechts laufen“.
- **Zauber:**
  - **Blitz** (110 s): bis 4,5 m springen, auch über Hecken.
  - **Teleport** (150 s): 3 s kanalisieren, dann zu einem Mitspieler oder Ziel in 10 m um den Mauszeiger; Laufen bricht ab.
  - **Entzünden** (80 s): Brand 5 s, 60 + 25 pro Level.
  - **Heilen** (110 s): 90 + 18 pro Level für dich und den schwächsten Mitspieler in 8 m, dazu 1 s +30 % Tempo.
  - **Barriere** (90 s): Schild 110 + 22 pro Level für 2,5 s.
  - **Geist** (100 s): 8 s +35 % Tempo.
  - **Erschöpfen** (95 s): 3 s 40 % langsamer und 40 % weniger Schaden.
  - **Zerschmettern** (50 s): 380 + 40 pro Level Schaden, zählt als Treffer des Helden (Boss-Gold).
  - **Reinigen** (90 s): löst Festhalten und Betäubung, 2 s immun.
- **Vorgaben und Bots:** Nahkampf Blitz + Entzünden, Fernkampf Blitz + Heilen, Kontrolle Blitz + Erschöpfen, Grimm Blitz + Zerschmettern. Bots setzen sie nach einfachen Regeln ein: Heilen/Barriere bei wenig Leben, Blitz zur Flucht, Entzünden/Erschöpfen auf große Gegner, Zerschmettern zum Erlegen, Geist für weite Wege, Teleport zu weit entfernten Aufträgen.

## 9c. Ton (v2.1)

- **Erzeugung:** alles synthetisiert mit Web-Audio (`src/client/audio.ts`), keine Dateien.
- **Kanäle:** Effekte, Umgebung, Musik, Oberfläche, darüber Gesamt. Jeder hat einen Regler (Esc-Menü „Ton“), dazu Stumm (Taste M). Gespeichert in `localStorage` (`winterburg.audio`).
- **Raumklang:** Lautstärke `1 / (1 + (d/9)²)` nach Abstand zum Zuhörer (eigener Held bzw. Kamerafokus), Stereo nach seitlichem Abstand. Oberfläche und Musik sind ortlos.
- **Begrenzung:** höchstens 24 Stimmen, je Geräusch 4, gleiche Geräusche frühestens nach 35 ms erneut (`VoiceLimiter`).
- **Anbindung:** Die Spielereignisse (`hit`, `swing`, `shot`, `attack`, `death`, `waveStart`, `waveCleared`, `breach`, `gold`, `levelUp`, `ping`, `spell`, `bossKill`, `courier`, `elite`, `charge`, `leap`, `parcel`, `sting`, `shop`, `gameOver`) lösen Klänge aus. Gold und Level-up gibt es nur für den eigenen Helden.
- **Umgebung und Musik:** Sie werden jedes Bild aktualisiert: Feuer- und Bienennähe, Stöhnen naher Zombies, Krähen. Die Musik wird intensiver mit laufender Welle bzw. lebendem Boss oder Elite.

## 10. Mehrspieler und Bots

- **Lobby (v2.1):** Ein Online-Raum beginnt in der Lobby (`phase: lobby`, keine Simulation). Jeder Mensch wählt einen Helden (keine doppelten) und seine Zauber und meldet sich bereit (nur mit Held). Sind alle Menschen bereit, startet nach 15 s die Partie; leere Plätze füllen Bots mit freien Helden (Wunsch-Team des Gastgebers zuerst). „Nicht bereit“, ein neuer oder gehender Spieler stoppen den Countdown. Die Bot-Stärke legt der Gastgeber fest. „Nochmal“ nach Spielende führt zurück in die Lobby. Nachrichten: `pick`, `spells`, `ready`, `difficulty`; `join` mit Platz −1 = nächster freier Platz.
- **Zuschauer (v2.7):** `watch {room}` macht eine Verbindung zum Zuschauer.
  - Ein Zuschauer belegt keinen Platz, bekommt `watching {room}`, danach Raum-Infos und Zustände (ack 0; der erste Zustand und der nach einem Rückstau sind vollständig).
  - Alle steuernden Nachrichten eines Zuschauers ignoriert der Server; erlaubt sind nur `info`, `ping`, `create`, `join` und `watch`.
  - Höchstens 8 Zuschauer je Raum; `RoomInfo.spectators` zählt sie. Zuschauer halten einen leeren Raum nicht offen.
  - Im Client folgt die Kamera einem Helden (1–4, Klick auf die Teamleiste); die Leertaste schaltet die Übersicht. Lokal startet „Zuschauen (nur Bots)“ eine Partie nur mit Bots.
- **Pings als Aufträge an Bots (v1.7):** Ein Ping eines Menschen wird zum Auftrag. Bots antworten mit „Bin unterwegs“.
  - **Angriff!:** Alle Bots greifen das nächste Ziel um den Ping an (Zombie, Lager oder Postbote), solange sie dort kämpfen bis es fällt (sonst höchstens 25 s). Ohne Ziel kämpfen sie am Ort.
  - **Hilfe!:** Alle Bots laufen zum Helden und beschützen ihn 12 s.
  - **Hier! / Bin unterwegs:** Die zwei nächsten Bots halten den Ort 12 s.
  - **Gefahr!:** Bots meiden den Bereich (10 m) für 10 s.
  - Mit Auftrag ziehen sich Bots erst bei sehr wenig Leben zurück. Ohne Auftrag bevorzugen sie Ziele, die Mitspieler gerade angreifen (Fokus).

- Raum mit 4 Slots. Der Host erstellt den Raum, Freunde joinen per Link. Leere Slots füllen Bots.
- **Umgesetzt (M6):** Node-Server (`server/`, `npm run server`, Docker), liefert das gebaute Spiel aus und betreibt Räume über WebSocket (`/ws`).
  - Raum erstellen: Held und Team wählen, „Online mit Freunden“. Raum-Code aus 4 Zeichen, Einladungslink `?room=CODE`.
  - Beitreten: Der Link zeigt die vier Plätze; ein Bot-Platz lässt sich übernehmen (Level, Gold, Items bleiben). Verlässt ein Mensch den Raum, übernimmt wieder ein Bot. Leere Räume stehen still und werden nach 5 Minuten geschlossen.
  - Netz: Der Server simuliert mit 20 Ticks/s und schickt jedem Spieler 20× pro Sekunde den Zustand (Zombies als kompakte Zahlenreihen, Ereignisse gesammelt, WebSocket-Kompression). Gemessen rund 3 KB/s pro Spieler zu Beginn. Der Client blendet zwischen zwei Zuständen weich über und schickt Eingaben höchstens 20× pro Sekunde. Befehle steuern nur den eigenen Helden.
  - Im Mehrspieler gibt es keine Pause (Esc öffnet nur die Tastenbelegung). „Nochmal“ nach Game Over startet die Partie für alle neu.
  - **Netzcode (v1.5):**
    - Eingaben mit laufender Nummer (`seq`), genau eine pro Server-Tick angewendet (fehlt eine, gilt die letzte weiter), Bestätigung (`ack`) im Zustand.
    - Der Client sagt die eigene Bewegung mit derselben Formel voraus und blendet zwischen den 50-ms-Schritten über (v1.6, sonst ruckelt der eigene Held) (`moveHero` in `src/sim/hero.ts`, `src/client/prediction.ts`), wendet unbestätigte Eingaben auf die Server-Position erneut an und gleicht Abweichungen weich aus (über 2 m sofort). Keine Vorhersage im Sprung, beim Kanalisieren, betäubt oder festgehalten.
    - Jitter-Puffer (`src/client/snapshots.ts`): Darstellung 2 Ticks hinter dem neuesten Zustand nach Server-Tick; jedes Ereignis genau einmal.
    - Gegendruck: Bei vollem Sendepuffer lässt der Server Zustände aus und liefert die Ereignisse mit dem nächsten nach.
    - Wiederverbinden: Token je Spieler (im Tab gespeichert), Platz 2 Minuten reserviert, automatische Wiederholung (0,5–8 s), auch nach Neuladen. Erster Verbindungsaufbau wird bis 90 s wiederholt („Server wacht auf …“).
    - Herzschlag (WebSocket-Ping alle 5 s), Laufzeitanzeige im HUD, Nachrichten geprüft (`parseClientMessage`), höchstens 4 KB und 60 pro Sekunde, Build-Kennung (`version.json`) gegen veraltete Seiten.
  - **Serverumgebung:** vorkomprimierte Auslieferung (Brotli/gzip), Cache-Header, Sicherheits-Header, `/health`, sauberes Herunterfahren (SIGTERM), Docker zweistufig ohne root mit Gesundheitsprüfung. Kostenlos betreiben: `npm run share` (eigener Rechner plus Cloudflare-Tunnel mit HTTPS) oder Render-Gratis-Tarif (`render.yaml`).
  - Noch offen: Heldenwechsel in der Pause.
- Join in laufender Partie: Der Mensch übernimmt den Bot-Slot samt Level, Gold und Items. Heldenwechsel nur in der Pausenphase (Vorschlag).
- Schwierigkeit ist fest und hängt nicht von der Zahl der Menschen ab.
- Bot-KI ist klassische Spiel-KI, kein Sprachmodell. Umgesetzt in M5 (`src/sim/bots/`, Werte in `data/bots.json`):
  - **Team:** Der Spieler wählt seinen Helden, die drei Bots bekommen automatisch je einen Nahkämpfer, Fernkämpfer und eine Kontrolle. Auf dem Startbildschirm lassen sie sich per Klick tauschen.
  - **Stärke** wählbar: leicht, mittel (Standard), schwer. Sie bestimmt Reaktionszeit (0,9 / 0,3 / 0,1 s), Zielfehler (2,2 / 0,6 / 0,1 m), wie oft Fähigkeitsgelegenheiten genutzt werden (20 / 75 / 100 %) und wann sie sich zurückziehen.
  - **Posten:** Jeder Bot verteidigt einen Posten (Ausgang des Durchgangs, Bienenstock, Ost-Hang) und greift Zombies im Umkreis von 14 m an.
  - **Ziele nach Bedrohung:** Zombies am Herz und am Bienenstock zuerst, dann Zombies an Mitspielern, Elites bevorzugt
  - Fernkämpfer halten Abstand. Fähigkeiten nach Einsatzhinweisen je Held (z. B. Flächen bei genug Zombies, Heilung bei wenig Leben, Hetzjagd auf Elites, Zuspiel an verletzte Mitspieler).
  - **Rückzug** bei wenig Leben in den Innenhof, Heiltrank trinken
  - **Einkauf** in der Pause nach Einkaufsliste je Held. Skillpunkte nach Reihenfolge, die Ultimate sobald möglich.
  - Bots schicken dieselben Befehle wie Menschen. Übernimmt in M6 ein Mensch einen Bot-Slot, wird nur die Bot-Steuerung entfernt.
- Bots laufen auf dem Server (Mehrspieler) bzw. lokal (Singleplayer)
- **Balancing für 4 Helden** (Wellen in `data/waves.json`, `npm run balance` lässt vier Bots über mehrere Seeds spielen). Stand v0.9 (Vorrat, Beete, Hornissen; Elites: eine in Welle 5 und 10, zwei ab Welle 15): Vier Bots allein schaffen im Schnitt Welle 11,3 (leicht), 14,5 (mittel) und 14,3 (schwer). „Schwer“ ist damit nicht stärker als „mittel“: Seit dem Umbau entscheidet vor allem der Druck auf den Vorrat, nicht die Feinsteuerung. Das ist ein Punkt für M7. Seit den Item-Rezepten (v1.0) liegen die Bots bei 11,2 / 12,7 / 12,8 (je 6 Seeds), weil sie ihre Kraft später in wenigen fertigen Items bündeln; Feinabstimmung der Preise in M7. Mit erweiterter Karte, früheren Hornissen und Postbote (v1.1): 11,0 / 14,2 / 12,8. Mit neuer Karte und Verstecken (v1.6): 11,2 / 13,0 / 13,5. Mit neuen Figuren, Dämon, Rattenloch und Bots, die sich gegenseitig helfen (v1.7): 9,7 / 12,0 / 10,8; die Streuung zwischen den Seeds ist groß (schwer: 10 bis 15), in allen Partien fällt der Bienenstock. Feinabstimmung in M7. Mit Belohnung nach Leistung, Sieg nach Welle 20 und leichteren Wellen (v1.9, je 4 Seeds bis Welle 20): 4 Bots „schwer“ 15,0, „mittel“ 13,8, 3 Bots „schwer“ + 1 abwesender Spieler 13,5; kein Bot-Team gewinnt. Zähere, dafür weniger Zombies machten es für beide schwerer (13,5 bzw. 12,0) und wurden verworfen. Bots sind deutlich schwächer als gute Menschen; ob Welle 20 für vier aktive Spieler passt, muss ein Test mit Menschen zeigen. Mit Bienen-/Beete-Kreislauf und Postbote ab Welle 6 (v2.0): 4 Bots „schwer“ 13,8, 3 Bots + 1 abwesender Spieler 11,5. Mit einem guten menschlichen Spieler kommt das Team weiter. Ziel bleibt Welle 30 für sehr gute Teams. Mit Wellen-Ereignissen und fünf Zwischenbossen (v2.6, 3 Bots „schwer“, je 3 Seeds): 13,3; die neuen Bosse wurden so abgestimmt, dass sie nicht schwerer sind als die alte Rotation. Mit sieben Zwischenbossen (Totengräber und Moorhexe dazu): 13,0.

## 10b. PvP-Varianten (v2.6)

- **Optionen:** `SimulationOptions.pvp.goal` (`kills` | `kiste`) und `zombies`; Bots auf freien Plätzen über `options.bots`. Die Lobby schickt `pvpOptions {goal, zombies, bots}` (nur Gastgeber), `RoomInfo.pvp` zeigt sie an. Mit Bots füllen freie Plätze das kleinere Team (`Room.pvpTeams`).
- **Kiste erobern:** `state.pvp.crate {pos, points, toWin, holder, contested}`. Ort aus `economy.pvp.crate.pos`, sonst die Mitte zwischen den Basen. Nur ein Team im Umkreis `radius` → `perSecond` Punkte pro Sekunde; beide → umkämpft. Sieg bei `pointsToWin`; Kills beenden das Spiel in diesem Modus nicht. Ereignis `pvpCrate` bei jedem Wechsel.
- **Zombies nebenbei:** `economy.pvp.roamers` (`first`, `every`, `min`..`max`, `types`, `maxAlive`, Startpunkte `from`). Die Zombies haben `roam` (Wegpunkt: Mitte, dann eine Seite). Ohne Opfer in Sicht ziehen sie dorthin, sonst jagen sie Helden beider Teams. `enemyAvatars` liefert jedem Team die echten Zombies mit, sodass alle Angriffe sie treffen. Tod durch Zombies gibt keinen Punkt.
- **Bots:** eigenes Verhalten `pvpThink` (`src/sim/bots/brain.ts`): Rückzug zur Basis und Einkauf, nächstes Ziel in 13 m (Helden vor Zombies), sonst zur Kiste bzw. zum nächsten Gegner.

## 10c. Spielzähler (v2.7)

- Der Server zählt nur Zahlen, keine personenbezogenen Daten. Felder:
  - `start:<art>`, `win:<art>`, `loss:<art>`, `end:pvp`
  - `day:<JJJJ-MM-TT>` für die Starts pro Tag
  - Arten: `solo`, `daily`, `zuschauen`, `koop`, `pvp`
- Online-Partien meldet der Raum selbst über `Room.onPlay`, beim Start nach dem Countdown und bei `gameOver`. Einzelspieler-Partien meldet der Browser mit `POST /api/played {kind, event}`. Der Server nimmt dort nur `solo`, `daily` und `zuschauen` an, höchstens 20 Meldungen je Adresse und Minute; die Begrenzung liegt nur im Speicher.
- `GET /stats` zeigt eine HTML-Übersicht, `GET /stats.json` die Rohdaten. Mit `STATS_KEY` ist beides nur mit `?key=…` erreichbar.
- Speicher:
  - Upstash Redis über die REST-API (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`): Hash `winterburg:stats`, `HINCRBY` und `HGETALL`
  - sonst die Datei `STATS_FILE` (Standard `.data/stats.json`), höchstens alle 2 s und beim Herunterfahren geschrieben

## 11. Karte

Garten mit Haus, Hecken und Zugängen. Umgesetzt in `data/map.json`, 1 Spieleinheit = 1 Meter, Norden oben.

- Garten ca. 66 x 75 m. Rundherum 10 m **Gelände** (Karte von −10 bis 76 bzw. 85, `minX`/`minY` in `data/map.json`), dahinter Wald als Kulisse. Ein Zaun umschließt den Garten; offen sind nur die **Tore** im Westen (beim Bienenstock), Süden (Heckenlücke) und Osten (Zuwegung).
- Haus in U-Form (ca. 21 x 24 m) mit Westflügel, Ostflügel und Südblock. Das Haus selbst ist nicht begehbar. Aussehen: verputzte Wände mit Fachwerk und Sockel, Fenster mit warmem Licht und Läden, Satteldächer mit Ziegeln, Schornsteine mit Rauch; der Innenhof ist gepflastert.
- **Innenhof = Lebensmittelvorrat der Winterburg.** Dort stehen Kisten, Fässer und Säcke. Der Hof ist nur über einen schmalen Durchgang (ca. 2,7 m) von Süden zwischen Westflügel und Südblock erreichbar: die wichtigste Engstelle.
- Helden starten im Innenhof und erscheinen dort nach dem Tod wieder.
- **Bienenstock** nordwestlich vom Haus: Ziel der Hornissen und eines Teils der Ratten (siehe Abschnitt 8)
- Sechs **Hochbeete** westlich vom Haus: Ziel der Ratten, versorgen den Vorrat mit ihrer Ernte. Sie blockieren das Laufen, nicht aber Schüsse.
- Zombie-Zugänge:
  1. **Bunker** unten links im Garten, der einzige Spawn im Garten. Der Bunker liegt unter der Erde: Zu sehen ist nur eine flache Luke im Rasen mit rostiger Doppeltür, aus der die Zombies steigen; daneben steht eine Hollywoodschaukel.
  2. **Süd:** im Gelände vor der Heckenlücke, durch das Südtor
  3. **Ost:** am Ende der Zuwegung; die Zombies laufen den Hang hinauf und sind dort langsamer (halbes Tempo)
  4. **Nordwest** im Gelände vor dem Westtor: 85 % der Hornissen (sie fliegen über den Zaun) und ebenso oft Zombies wie Ost. Liegt nah an Bienenstock und Hochbeeten.
- Hecken im Norden, Osten und Süden, Zäune an der Zuwegung und zum Nachbargrundstück (nordöstlich, nicht begehbar, verwildertes Dickicht), Bäume als Hindernisse
- **Garten (v1.6):** Kieswege zwischen Toren, Haus und Beeten; Gartenhaus, Kompost, Holzstapel, Regentonne, Schubkarre, Bank, Blumenbeete, Laternen mit Lichtschein.
- **Gelände (v1.6):** Heckenreihen mit Büschen davor, Felsen, umgestürzte Stämme, tote Bäume, eine verwilderte Grabstätte im Norden und ein Teich mit Schilf im Süden (beim Krötentümpel). Wald mit Laub- und Nadelbäumen als Kulisse.
- **Nacht (v1.7):** kühles Mondlicht, dunkelblauer Himmel, Nebel in der Ferne und ziehende Bodennebel. Warme Lichtinseln: Fenster (einige vernagelt), Laternen, brennende Fässer an den Toren und eine Laterne beim eigenen Helden; jeder Held hat einen schwachen Lichtkreis, Helden ein Randlicht in ihrer Farbe, Zombies glühende Augen.
- **Details (v1.7, `props` in `data/map.json`, ohne Kollision):** Barrikaden aus Sandsäcken, Kisten und Brettern an den Toren, Vogelscheuche, umgekippter Handwagen, Knochen und Schädel, Blutflecken, leuchtende Pilze und Wurzeln, Spinnweben am Friedhofszaun und am Gartenhaus, eine offene Grube mit Schaufel, Krähen (flattern auf, wenn ein Held nahe kommt). Als Hindernisse: verrostetes Autowrack vor dem Osttor, Brunnen im Garten.
- **Mehr Details (v1.9):**
  - **Westflügel als Ruine:** Die Südhälfte steht noch (hohle Mauern, halbes Dach, kahle Sparren), die Nordhälfte ist eingestürzt (Mauerstümpfe, Schutt, Balken, umgekippter Schornstein, Efeu). Die Kollision ist unverändert.
  - **Deko:** Stacheldraht an Toren, Nordhecke, Friedhof und Nordeingang; Bretterbarrikaden an Haus, Toren und Gartenhütte; zwei Feuerstellen (Garten Nordwest, beim Krötentümpel) mit Funken; Baumstümpfe, Farn, Reifen, Vogeltränke, Holzkreuze mit Helmen, Kaminholz.
  - **Hochbeete:** Bretterkästen mit Eckpfosten und je Beet anderen Pflanzen (Kohl, Salat, Tomaten, Kürbisse, Lauch), dazu Schild, Gießkanne oder Harke.
  - **Wege:** Bruchsteinplatten statt Kies, mit unregelmäßigem Rand.
  - **Gras:** 10 neue Grasflächen zum Verstecken (8 im Gelände, 2 im Garten) und Grasbüschel mit Wildblumen an Zäunen, Hecken, Mauern und Wegen (bei Grafik „Niedrig“ aus).
- **Landschaft (v2.0):** Wege sind schmale Spuren (1,3 m) aus einzelnen Bruchstein-Trittplatten auf schlammiger Erde, teils verschoben, gebrochen oder fehlend. Wildblumen-Flecken (Mohn, Margeriten, Lupinen, Kornblumen, ein Teil verwelkt) an Ruine, Zäunen, Gräbern, Beeten und im Gelände. Heruntergekommen: umgestürzte Zaunfelder, Wäscheleine mit Lumpen, umgekippte Mülltonnen, Kanister, Glasscherben, Brandflecken, Pfützen, Kisten, Papier, ein eingefallenes Zelt, Absperrband, Warnschilder „Sperrzone“, Leichensäcke, ein umgekippter Briefkasten, kahle Erdstellen.
- **Nordeingang (v1.9):** 2 m breiter Durchgang in der Nordmauer des Innenhofs (x 38,5–40,5), ersetzt das Rattenloch aus v1.7. Der Innenhof ist damit über den Durchgang im Südwesten und von Norden erreichbar. Kleine Einheiten (`small` in `data/zombies.json`, Ratten) haben weiterhin ein eigenes Wegeraster mit weniger Abstand zu Hindernissen.
- **Verstecke (wie das Gebüsch in LoL, `brush` in `data/map.json`):** hohes Gras und Büsche im Garten, Büsche an den Hecken und in den Ecken des Geländes, Schilf am Teich. Begehbar, halten keine Schüsse auf.
  - Wer im Versteck steht, wird von Zombies und Lagerbewohnern erst aus nächster Nähe gesehen (2,5 m) oder wenn sie im selben Versteck stehen. Angriff oder Fähigkeit verrät den Helden für 1,5 s.
  - Zombies im Versteck sind für die Spieler unsichtbar (auch auf der Minimap), bis ein Held im selben Versteck oder höchstens 3 m daneben steht.
  - Eigene Helden im Versteck werden halbdurchsichtig gezeigt. Bots nutzen Verstecke nicht gezielt.
- Spawnpunkte haben Gewichte (wie oft dort Zombies erscheinen), alles in `data/map.json`
- Grafikstil: stilisiert, Low-Poly (siehe Abschnitt 3)

## 12. Meilensteine

1. M1: Offline-Prototyp. Eine Arena, ein Held (zwei Testhelden: Nah- und Fernkampf), Steuerung wie in Supervive, Zombies in Wellen, Nahkampf und Schuss.
2. M2: Karte Winterburg mit Haus (Lebensbalken), Garten, Hindernissen und den drei Zugängen
3. M3: Level, XP, Skillpunkte, 6 Helden (Grimm, Gärtnerin, Pirat, Libero, Rotschopf, Schläferin) mit Fähigkeiten auf 1–4
4. M4: Gold, Shop, Waffen und Items, Elite-Zombies, Ratten und Kriecher
5. M5: Bots (Singleplayer mit 3 Bots), Balancing für 4 Helden
6. M6: Server und Mehrspieler (Raum, Join per Link, Bot-Ersatz) – umgesetzt
7. M7: Weitere Helden (Taucher, Imker, zwei freie Slots), Boss, Balancing, Feinschliff

## 13. Offene Fragen

- Namen und Optik der Helden (Entwürfe in Abschnitt 6b) und die letzten 2 Heldenslots

Nach LoL-Vorbild bereits entschieden: Haus-Regeneration wie beim Nexus, Spielziel Welle 30, Grafikstil, Hosting erst bei Meilenstein 6. Lebenspunkte des Hauses, Zombieschaden und alle anderen Zahlen sind Platzhalter in den JSON-Dateien und werden beim Spielen balanciert.

## 14. Hinweise für Claude Code

- Zuerst Plan-Modus, dann M1 bauen. Jeder Meilenstein muss spielbar sein.
- Simulation und Rendering getrennt halten (siehe Abschnitt 3)
- Helden, Items, Zombies und Wellen als JSON-Daten
- Tests für die Simulation (Schaden, XP, Wellenaufbau)
- Kleine Schritte, nach jedem Schritt lauffähig
