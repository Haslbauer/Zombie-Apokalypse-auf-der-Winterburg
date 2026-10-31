# Zombie-Apokalypse – Spielspezifikation (Entwurf v1.9)

Stand: 31.10.2026. Arbeitsgrundlage für Claude Code.

Änderungen v1.9: Beschwörerzauber wie in LoL (zwei pro Held, vor dem Spiel gewählt, Tasten F/G), siehe Abschnitt 9b.
Änderungen v1.8: Figuren laufen sichtbar (ein Skelett pro Figur), Schuss-Animationen mit sichtbaren Geschossen, Grafikstufen und Leistungsanzeige, kleinere Zustandspakete, geduldigerer Herzschlag mit Trennungsgrund.
Änderungen v1.7: Neue Mixamo-Figuren für Helden und Zombies, schwere Gegner größer und mit Leucht-Ring, neuer Elite Dämon, Boss-Zähler mit Kill-, Assist- und Erstes-Blut-Gold (Anzeigetafel auf Tab), Bots folgen Pings, Rattenloch zum Innenhof, verdorrte Beete, Nachtstimmung mit vielen Details.
Änderungen v1.6: Karte neu gestaltet (Fachwerkhaus, Bunker als Luke mit Hollywoodschaukel, Garten- und Geländedeko, Grabstätte, Teich, Abendstimmung), Verstecke (Gebüsch, hohes Gras, Schilf), flüssige eigene Bewegung im Mehrspieler.
Änderungen v1.5: Netzcode mit Bewegungsvorhersage, Jitter-Puffer, Wiederverbinden, Absicherung; kostenlose Bereitstellung (Tunnel, Render, Docker).
Änderungen v1.4: Minimap und Pings mit der rechten Maustaste (Ping-Rad wie in LoL).
Änderungen v1.3: M6 Mehrspieler: Node-Server mit Räumen, Beitritt per Link, Bots auf freien Plätzen, Docker.
Änderungen v1.2: Heldennamen Grimm (Hund), Hagedorn (Gärtnerin), Rauchbart (Pirat), Spike (Libero), Ragnar (Rotschopf), Somnia (Schläferin). Die internen IDs bleiben (`gaertnerin`, `pirat`, `libero`, `rotschopf`, `schlaeferin`, `grimm`).
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
- Pausenphase 25 s (vor Welle 1: 20 s): Shop öffnen, Skillpunkte verteilen, Wiederbeleben. Wer fertig ist, startet die nächste Welle sofort mit N bzw. dem Knopf „Jetzt starten“ (im Mehrspieler später erst, wenn alle Menschen bereit sind).
- Welle n hat mehr und stärkere Zombies als Welle n-1
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

### Rauchbart (Pirat, Rauch-Held)
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

### Taucher
- Rolle: Nahkampf-Tank, steckt Schaden ein und hält Zombies von den Mitspielern fern. Optik: Tauchanzug, Maske, Sauerstoffflasche auf dem Rücken, Harpune. Spielgefühl: Haken-Tank (Nautilus in LoL).
- Passiv Luftvorrat: Die Sauerstoffflasche gibt einen Schild, der sich außerhalb des Kampfes wieder auffüllt
- Q Harpune: Haken, der den ersten getroffenen Zombie heranzieht und kurz betäubt
- W Druckluft: Schild um sich herum, Zombies in der Nähe werden zurückgestoßen
- E Strömung: Wasserwelle im Kegel, Schaden und Verlangsamung
- R Tiefenrausch: 4 s lang greifen alle Zombies in der Nähe nur noch ihn an, er erleidet weniger Schaden und ist immun gegen Rückstoß

### Imker
- Rolle: Fernkampf, Schaden über Zeit. Optik: Imkeranzug mit Hut und Schleier, Bienen schwirren um ihn herum.
- Stiche stapeln sich: Je mehr Stiche ein Zombie hat, desto mehr Schaden nimmt er. Nach 5 Stichen gibt es einen Bonus.
- Passiv Summen: Ein kleiner Bienenschwarm begleitet ihn und sticht Zombies in der Nähe
- Q Schwarm: Schwarm fliegt zu einem Ort und bleibt ca. 4 s, Schaden über Zeit an Zombies darin
- W Bienenstock: stellt einen Stock auf (ca. 10 s), dessen Bienen Zombies in Reichweite stechen
- E Honigfalle: Honigfläche, Zombies darin sind stark verlangsamt und bekommen schneller Stiche
- R Königin: riesiger Schwarm über einem großen Gebiet (ca. 8 s), hoher Schaden über Zeit, alle Zombies darin bekommen sofort volle Stiche

## 7. Gegner

Referenzbilder in `assets/reference/gegner/`. Werte in `data/zombies.json` und `data/waves.json`.

- **Walker** (langsam, Masse; Optik v1.7: meist Polizisten-Zombie, sonst Zombie-Mädchen), **Runner** (schnell, wenig Leben; Optik: Parasit oder Skelett-Zombie), **Brute** (Tank; Kürbis-Hulk, 1,5-fach groß)
- **Kriecher** (ab Welle 3): kriecht am Boden, sehr langsam, viel Leben. Sein Treffer hält den Helden 1 s fest.
- **Wer greift was an:** Zombies (Walker, Runner, Brute, Kriecher, Elites) jagen Helden in der Nähe und laufen sonst zum Lebensmittelvorrat. Den Bienenstock und die Beete lassen sie in Ruhe.
- **Ratten (Minions):** klein, sehr schnell, wenig Leben und Schaden. Ab Welle 2 kommen Rudel von 5–8 Ratten gemeinsam an einem Spawnpunkt, mit jeder Welle mehr Rudel. Sie fressen die **Hochbeete** an (60 %, jeweils das nächste intakte Beet), gehen an den **Bienenstock** (20 %) oder an den **Vorrat** (20 %, v1.7). Zum Vorrat schlüpfen sie durch das **Rattenloch** in der Nordmauer des Innenhofs, durch das sonst niemand passt. Helden beißen sie nur, wenn sie gestört werden: Ein Held steht näher als 2 m oder hat sie in den letzten 4 s getroffen.
- **Hornissen** (ab Welle 1: anfangs ein Schwarm von 2–3, Schwärme wachsen um 0,4 Tiere pro Welle, alle 4 Wellen ein Schwarm mehr): gelb-schwarz, schnell, wenig Leben. Sie fliegen über Hecken, Zäune und das Haus und greifen die Honigkästen des Bienenstocks an. Sie kommen zu 85 % aus dem Spawnpunkt Nordwest. Helden greifen sie wie Ratten nur an, wenn sie gestört werden. Ihr Angriff macht die Bienen wütend.
- **Elites** alle 5 Wellen (⌊Welle/5⌋ Stück, abwechselnd), mit immer sichtbarem Lebensbalken und Ankündigung:
  - **Rattenkönig:** große Ratte mit Krone, ruft alle 8 s vier Ratten herbei
  - **Dämon** (v1.7, ab Welle 15 im Wechsel): schnell, springt alle 8 s auf einen Helden in bis zu 10 m. Vorher markiert ein violetter Kreis 0,7 s lang den Landeplatz; bei der Landung trifft er alle Helden im Umkreis von 2,5 m (55 Schaden, kurz betäubt).
  - **Schlächter:** riesiger Zombie (1,9-fach) mit Hackbeil. Holt alle 8 s aus (rote Warnlinie) und stürmt auf einen Helden in bis zu 8 m. Wer getroffen wird, nimmt Schaden, wird zurückgestoßen und 0,75 s betäubt.
  - Elites schlafen nur halb so lang. Grimms Hetzjagd bevorzugt sie.
  - Optik (v1.7): leuchtender Boden-Ring in eigener Farbe (Schlächter rot, Dämon violett, Rattenkönig gold), glühende Augen, Namensschild über dem großen Lebensbalken. Der Rattenkönig ist dreimal so groß wie eine Ratte.
- Kontrolle auf Helden (festgehalten, betäubt) wirkt nicht, solange der Held unaufhaltsam ist (Rotschopf: Amok)
- Später: Spitter (Fernkampf), Boss
- Verhalten: Zombies greifen Helden an, die in Reichweite sind. Sonst laufen sie zum Haus. Pfadfindung um Hindernisse.
- Durchbruch: Erreicht ein Zombie das Haus, bleibt er stehen und greift es an (Schaden pro Sekunde, Elite und Boss mehr). Wird er getötet, endet der Schaden.

## 8. Niederlage

- Der **Lebensmittelvorrat** (früher „Herz“) im Innenhof hat einen gut sichtbaren Lebensbalken (5500). Fällt er auf 0, ist das Spiel verloren: „Der Lebensmittelvorrat ist geplündert“.
- Ein Durchbruch (Zombie erreicht den Vorrat) ist keine sofortige Niederlage. Die Zombies brauchen Zeit zum Plündern, und die Helden können sie wegkämpfen. Ohne Gegenwehr führt der Durchbruch aber zur Niederlage.
- Der Vorrat regeneriert **nicht** von selbst. Keine Reparatur im Shop.
- **Ernte:** Nach jeder überstandenen Welle ernten die sechs Hochbeete und füllen den Vorrat auf, jedes Beet 80 bei vollem Leben, angefressene anteilig weniger. Ein zerstörtes Beet bringt nichts und wächst nach 2 Wellen mit vollem Leben nach, aber nur, solange der Bienenstock steht (ohne Bienen keine Bestäubung). Zerstörte Beete sind keine Niederlage.
- Der **Bienenstock** (1000 Leben) wird von Hornissen und einem Teil der Ratten angegriffen. Normalerweise stechen die Bienen nur Gegner in der Nähe. Sobald der Stock Schaden bekommt, werden sie für einige Sekunden wütend und stechen alle in der Nähe, auch Helden. Ein zerstörter Stock ist keine Niederlage, die Bienen sind dann aber weg und zerstörte Beete wachsen nicht mehr nach.
- Gefallene Helden respawnen nach einem Timer, der mit der Welle wächst (5 s + 1 s pro Welle), im Innenhof und müssen von dort durch den Durchgang nach draußen.

## 8b. Sidequests: Postbote und Lager (wie Drache und Dschungel in LoL)

Freiwillige Ziele im Gelände außerhalb des Gartens. Sie bringen Gold und XP, kosten aber Zeit, in der der Garten schwächer verteidigt ist. Alle Neutralen greifen erst an, wenn man sie angreift, und dann gemeinsam mit ihrem Lager. Entfernen sie sich weiter als ihre **Leine** von ihrem Platz (oder ist kein Held mehr in der Nähe), kehren sie um und heilen sich voll (der Postbote heilt sich seit v1.7 nicht mehr). **Ausweichen (v1.9):** Trifft das Lager seinen Angreifer 5 s lang nicht (z. B. Fernkämpfer hinter einem Zaun), setzt es sich zurück wie in LoL: alle Bewohner kehren heim, sind auf dem Rückweg unverwundbar und am Platz wieder voll geheilt (Meldung „… weicht aus und setzt sich zurück“). Beim Verfolgen laufen Neutrale um Hindernisse herum. Bots greifen Neutrale nicht von sich aus an, helfen aber Menschen, die gegen Postbote oder Lager kämpfen (bis 25 m), und folgen einem Angriffs-Ping.

**Zombie-Postbote** (Drache): ein Team-Ziel
- Erscheint ab Welle 3 in jeder dritten Welle, 20 s nach Wellenbeginn, und läuft seinen **Rundweg** im Gelände (`courierRoute` in `data/map.json`). Nach 120 s ist er weg.
- 2500 Leben, wachsend mit der Welle (in Welle 3 etwa 4500, in Welle 6 etwa 7500), schlägt hart zurück (45 Schaden, ebenfalls wachsend). Allein kaum zu schaffen, im Team gut.
- Leine 14 m ab dem Punkt, an dem der Kampf beginnt.
- **Belohnung:** Jeder Held bekommt 150 + 30 × Welle Gold, egal wo er steht.
- Zombie in Uniform mit Postmütze und Paket, goldener Ring (auch durch Wände sichtbar), Meldungen beim Auftauchen, Besiegen und Entkommen.

**Lager** (Dschungel), Werte in `data/zombies.json`, Lage in `data/map.json` (`camps`):
- **Fledermausschwarm** (Nord und Ost): 5 fliegende Zombie-Fledermäuse, schnell und schwach
- **Spinnennest** (West): Riesen-Zombiespinne mit zwei kleinen Spinnen
- **Krötentümpel** (Süd): eine Riesen-Zombiekröte, langsam, viel Leben, harte Treffer
- Zu Spielbeginn besetzt. Geleerte Lager kommen nach 75 s (Kröte 90 s) wieder, mit der Stärke der aktuellen Welle.
- Belohnung: Kill-Gold und XP wie bei Zombies für alle Helden in der Nähe.
- Lager und Postbote zählen nicht zur Welle.

## 9. Gold, Shop und Items

Umgesetzt in M4. Zahlen in `data/items.json` und `data/economy.json`.

- **Gold:** Startgold 350. Kill-Gold je Zombie-Typ bekommt jeder Held im Umkreis von 15 m in voller Höhe (Koop, kein Last-Hit). Bonus pro überstandener Welle: 50 + 10 × Welle für alle.
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

## 10. Mehrspieler und Bots

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
- **Balancing für 4 Helden** (Wellen in `data/waves.json`, `npm run balance` lässt vier Bots über mehrere Seeds spielen). Stand v0.9 (Vorrat, Beete, Hornissen; Elites: eine in Welle 5 und 10, zwei ab Welle 15): Vier Bots allein schaffen im Schnitt Welle 11,3 (leicht), 14,5 (mittel) und 14,3 (schwer). „Schwer“ ist damit nicht stärker als „mittel“: Seit dem Umbau entscheidet vor allem der Druck auf den Vorrat, nicht die Feinsteuerung. Das ist ein Punkt für M7. Seit den Item-Rezepten (v1.0) liegen die Bots bei 11,2 / 12,7 / 12,8 (je 6 Seeds), weil sie ihre Kraft später in wenigen fertigen Items bündeln; Feinabstimmung der Preise in M7. Mit erweiterter Karte, früheren Hornissen und Postbote (v1.1): 11,0 / 14,2 / 12,8. Mit neuer Karte und Verstecken (v1.6): 11,2 / 13,0 / 13,5. Mit neuen Figuren, Dämon, Rattenloch und Bots, die sich gegenseitig helfen (v1.7): 9,7 / 12,0 / 10,8; die Streuung zwischen den Seeds ist groß (schwer: 10 bis 15), in allen Partien fällt der Bienenstock. Feinabstimmung in M7. Mit einem guten menschlichen Spieler kommt das Team weiter. Ziel bleibt Welle 30 für sehr gute Teams.

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
- **Rattenloch (v1.7):** Kellerloch in der Nordmauer des Innenhofs (0,8 m). Nur kleine Einheiten (`small` in `data/zombies.json`, Ratten) haben ein eigenes Wegeraster mit weniger Abstand zu Hindernissen und kommen hindurch; für alle anderen ist es Mauer.
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
