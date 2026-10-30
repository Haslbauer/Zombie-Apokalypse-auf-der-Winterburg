# Zombie-Apokalypse – Spielspezifikation (Entwurf v0.7)

Stand: 30.10.2026. Arbeitsgrundlage für Claude Code.

Änderungen v0.7: M4 umgesetzt. Gold, Shop (Pause + Innenhof), Waffen als Werte-Items, Inventar und Verbrauchsgüter auf R/T. Neue Gegner Kriecher und Ratten, Elites Rattenkönig und Schlächter.
Änderungen v0.6: M3 umgesetzt. Level- und Skillregeln konkret, sechs Helden im Spiel (Chupa, Gärtnerin, Pirat, Libero, Rotschopf, Schläferin), Linksklick-Angriff je Held, Passive für Pirat, Libero und Schläferin (Mondlicht). Fähigkeiten steigern mit Shift + Taste. Gegnerbilder in assets/reference/gegner/, Ratte als Minion-Vorlage.
Änderungen v0.5: Optik der Helden nach den Referenzbildern in assets/reference/helden/ (Libero ist ein Mann mit Runen-Volleyball, die Schläferin eine Magierin mit Kristallstab).
Änderungen v0.4: Karte nach der Skizze (echte Maße, U-Haus mit Innenhof als Herz der Base, Bunker als Zombie-Spawn, Heckenlücke Süd, Hang Ost, Bienenstock als zweites Ziel). Helden-Spawn im Innenhof, tote Helden respawnen.
Änderungen v0.3: Steuerung wie in Supervive (WASD laufen, Maus zielt, Angriff Richtung Mauszeiger, kein Auto-Attack, keine Zielauswahl). Fähigkeiten auf 1–4, Items auf R und T, alle Tasten frei belegbar. Nahkampf-Reichweite 2,5 m im 120°-Bogen.
Änderungen v0.2: Veraltete Verweise auf Sanitäter und Brecher ersetzt.
Mit "Vorschlag" markierte Punkte sind noch nicht entschieden, alles andere ist festgelegt.

## 1. Vision

Koop-Verteidigungsspiel im Browser. Vier Helden verteidigen die "Winterburg" (Haus und Vorgärten, als Karte nachgebaut) gegen Zombiewellen. Perspektive von oben mit LoL-artiger Kamera und Steuerung wie in Supervive (WASD und Maus). Das Haus hat Lebenspunkte: Zombies, die es erreichen, greifen es an. Fällt der Lebensbalken auf 0, ist das Spiel verloren.

## 2. Festgelegte Entscheidungen

- Browser-Spiel mit 3D-Grafik und fester Schrägkamera von oben, wie in League of Legends und Dota
- Steuerung wie in Supervive:
  - WASD = laufen, der Mauszeiger bestimmt die Blickrichtung
  - Linksklick = Angriff Richtung Mauszeiger (gedrückt halten = Dauerangriff im Takt der Abklingzeit)
  - Kein Auto-Attack und keine Zielauswahl: Man greift in eine Richtung an. Reichweite und Trefferbereich hängen von der Waffe ab.
  - Nahkampf trifft alle Zombies im Bogen vor dem Helden (Testheld: 2,5 m, 120°). Fernkampf schießt ein Projektil geradeaus, das den ersten Zombie trifft, danebengehen kann und an Hindernissen endet.
  - Eine Markierung am Boden (Bogen bzw. Pfeil) zeigt Reichweite und Richtung des Angriffs
  - Fähigkeiten auf 1, 2, 3, 4 (4 = Ultimate), Items auf R und T. Taste halten zeigt eine Vorschau von Reichweite und Wirkfläche, Loslassen löst aus.
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
- Pausenphase (Vorschlag: 30 s): Shop öffnen, Skillpunkte verteilen, Wiederbeleben
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

Geplant sind 8 Helden, 2 Slots bleiben frei. In M3 spielbar: **Chupa, Gärtnerin, Pirat, Libero, Rotschopf und Schläferin**. Taucher und Imker folgen in M7. Spalten Q/W/E/R entsprechen den Tasten 1/2/3/4. Werte stehen in `data/heroes.json`, der Code in `src/sim/heroes/`.

| Held | Linksklick |
|---|---|
| Chupa | Biss (Nahkampf, 2 m, 90°) |
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
| Gärtnerin | Fernkampf, ausdauernd | Schleuderschuss | Saat | Kräutertee | Mein Garten! |
| Rotschopf | Nahkampf, Berserker | Wuchtschlag | Wutanfall | Ungezielter Sprung | Amok |
| Schläferin | Kontrolle | Berührung | Gähnen | Powernap | Gute Nacht |
| Chupa | Nahkampf, Jäger | Sprungbiss | Fährte | Heulen | Hetzjagd |

### Chupa

- Rolle: Nahkampf-Jäger. Stark gegen Elite und Boss, heilt sich durch Beißen.
- Optik: Chupa ist der Hund des Auftraggebers, ein kleiner, flauschiger weißer Hund nach Referenzfoto (hund.jpg, in assets/reference/ ablegen). Kampfmodus siehe `assets/reference/helden/chupa.jpg`: wild, gesträubtes Fell, gefletschte Zähne, leuchtende Augen. Cremeweißes Fell, hellbraune Flecken an den Ohren, rosa Nase, dunkle Augen, buschige Rute über dem Rücken, kleines dunkles Geschirr. Stilisiert. Die Wirkung soll süß und klein sein, im Kampf aber wild (Vorschlag: Fell sträubt sich und die Augen leuchten bei Fähigkeiten).
- Fähigkeiten (eigene Namen und Werte, Grundidee: ein Jäger, der verwundete Beute aufspürt und festhält):
  - Passiv Wittern: Zombies unter 50 % Leben sind durch Wände hindurch sichtbar. Der Hund heilt sich beim Beißen stärker, je weniger Leben er selbst hat.
  - Q Sprungbiss: Sprung in Zielrichtung, beißt den ersten getroffenen Zombie und heilt sich um einen Teil des Schadens.
  - W Fährte: Verwundete Zombies in der Nähe werden markiert. Zu ihnen hin ist der Hund schneller und greift schneller an.
  - E Heulen: Kurz weniger Schaden erleiden, danach laufen Zombies in der Nähe für einen Moment verängstigt weg.
  - R Hetzjagd: Langer Sprung zu einem Zielzombie (Elite oder Boss). Der Hund hält ihn fest, er kann sich nicht bewegen, und er erleidet Biss-Schaden pro Sekunde. Der Hund heilt sich dabei.
- Alle Zahlen (Schaden, Heilung, Abklingzeiten) sind Platzhalter und werden beim Balancing festgelegt.

## 6b. Weitere Helden (Entwürfe)

Namen sind Platzhalter, Fähigkeiten haben eigene Namen und Werte. Die früheren Platzhalter-Archetypen (Brecher, Schütze, Fallensteller, Sanitäter) entfallen, die persönlichen Helden ersetzen sie. Zufall (z. B. beim Rotschopf) wird immer vom Server gewürfelt.

### Libero (Volleyball)
- Rolle: Fernkampf, Kontrolle und Support. Optik (`assets/reference/helden/libero.jpg`): Mann mit braunen Locken und Bart, Ledermütze, ärmelloses Lederhemd mit goldener Palme, Knieschoner, bandagierte Hände, leuchtender Volleyball mit Runen und Funken. Spielgefühl: ein Held mit einem Ball, der liegen bleibt (Orianna in LoL).
- Der Ball ist ein Objekt auf der Karte. Fähigkeiten gehen vom Ball aus oder bewegen ihn.
- Passiv Ballgefühl: Der Ball kehrt zurück, wenn er mehr als 15 m entfernt ist. Mit Ball in der Hand läuft Libero 10 % schneller. Einen liegenden Ball hebt er im Vorbeilaufen auf.
- Q Aufschlag: Ball fliegt als Linienschuss durch Zombies und bleibt am Ende liegen
- W Block: kurze Sperre vor dem Helden, Zombies werden zurückgedrängt
- E Zuspiel: Ball zu einem Mitspieler oder Bot, gibt ihm einen Schild (ohne Mitspieler an sich selbst)
- R Schmetterball: Ball springt hoch und schlägt nieder, Flächenschaden mit Betäubung

### Pirat (Rauch-Held, Platzhaltername Qualm)
- Rolle: Kontrolle. Optik (`assets/reference/helden/pirat.jpg`): bärtiger Pirat mit Dreispitz, Kopftuch, Lederweste, Gurten, Enterhaken und Seil. Spielgefühl: Rauchgranate, die Gegnern die Sicht nimmt (Graves in LoL).
- Linksklick: Enterhaken-Wurf. Passiv Pulverdampf: Jeder 4. Treffer hüllt den Zombie in Rauch (kurz geblendet).
- Rauch-Regel: Zombies im Rauch sehen nur wenige Meter weit, verlieren ihr Ziel, torkeln und treffen oft daneben.
- Q Qualmstoß: Rauchkegel nach vorne, wenig Schaden, Zombies sind kurz benommen
- W Rauchwolke: Granate, die Wolke bleibt ca. 5 s und verlangsamt Zombies darin
- E Nebelschritt: Sprung in eine eigene Rauchwolke, dort kurz unsichtbar. Ohne Wolke ein kurzer Sprung ohne Unsichtbarkeit.
- R Dicke Luft: große Wolke, Zombies sind 3 s betäubt und danach 5 s blind
### Gärtnerin
- Rolle: Fernkampf, ausdauernd. Optik (`assets/reference/helden/gaertnerin.jpg`): ältere, grummelige Frau mit Stoffhut, Karohemd, Latzhose, Gummistiefeln, Arbeitshandschuhen, Werkzeuggürtel und großer Heckenschere. Spielgefühl: Pflanzen als kleine Geschütztürme (Zyra in LoL).
- Linksklick: Steinschleuder (die Heckenschere ist Optik)
- Passiv Sturschädel: regeneriert langsam Leben und wird zäher, je länger sie im Kampf bleibt
- Q Schleuderschuss: Fernschuss mit Steinschleuder
- W Saat: pflanzt Samen, nach 2 s wachsen Dornenranken, die Zombies verlangsamen und stechen (max. 3 gleichzeitig)
- E Kräutertee: heilt sie und Verbündete im Umkreis über Zeit
- R Mein Garten!: Dornenhecke wächst als Ring (ca. 8 s), hält Zombies zurück und verursacht Schaden. Kann einen Zugang kurz sperren.

### Rotschopf
- Rolle: Nahkämpfer, stark und unberechenbar. Optik (`assets/reference/helden/rotschopf.jpg`): rote Locken und Bart, kräftig, wild, Schutzbrille auf der Stirn, Beinschienen, riesiger Kriegshammer. Spielgefühl: Berserker (Olaf in LoL).
- Passiv Jähzorn: je mehr Schaden er einsteckt, desto schneller greift er an
- Q Wuchtschlag: Schlag mit zufälligem Zusatzeffekt (Betäubung, doppelter Schaden oder Rückstoß)
- W Wutanfall: zufälliger Buff (Tempo, Schild oder Heilung)
- E Ungezielter Sprung: Sprung mit kleiner Zufallsabweichung, hoher Schaden
- R Amok: kurz unaufhaltsam (immun gegen Betäubung und Rückstoß), doppelter Schaden

### Schläferin
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

- **Walker** (langsam, Masse; Optik: Zombie mit Bart und langen Haaren), **Runner** (schnell, wenig Leben; Optik: hagerer, einarmiger Zombie), **Brute** (Tank)
- **Kriecher** (ab Welle 3): kriecht am Boden, sehr langsam, viel Leben. Sein Treffer hält den Helden 1 s fest.
- **Ratten (Minions):** klein, sehr schnell, wenig Leben und Schaden. Ab Welle 2 kommen Rudel von 5–8 Ratten gemeinsam an einem Spawnpunkt, mit jeder Welle mehr Rudel.
- **Elites** alle 5 Wellen (⌊Welle/5⌋ Stück, abwechselnd), mit immer sichtbarem Lebensbalken und Ankündigung:
  - **Rattenkönig:** große Ratte mit Krone, ruft alle 8 s vier Ratten herbei
  - **Schlächter:** großer Zombie mit Schürze und Beil. Holt alle 8 s aus (rote Warnlinie) und stürmt auf einen Helden in bis zu 8 m. Wer getroffen wird, nimmt Schaden, wird zurückgestoßen und 0,75 s betäubt.
  - Elites schlafen nur halb so lang. Chupas Hetzjagd bevorzugt sie.
- Kontrolle auf Helden (festgehalten, betäubt) wirkt nicht, solange der Held unaufhaltsam ist (Rotschopf: Amok)
- Später: Spitter (Fernkampf), Boss
- Verhalten: Zombies greifen Helden an, die in Reichweite sind. Sonst laufen sie zum Haus. Pfadfindung um Hindernisse.
- Durchbruch: Erreicht ein Zombie das Haus, bleibt er stehen und greift es an (Schaden pro Sekunde, Elite und Boss mehr). Wird er getötet, endet der Schaden.

## 8. Niederlage

- Das **Herz** im Innenhof hat einen gut sichtbaren Lebensbalken. Fällt er auf 0, ist das Spiel verloren.
- Ein Durchbruch (Zombie erreicht das Herz) ist keine sofortige Niederlage. Die Zombies brauchen Zeit, das Herz zu beschädigen, und die Helden können sie wegkämpfen. Ohne Gegenwehr führt der Durchbruch aber zur Niederlage.
- Nach LoL-Vorbild (Nexus): Das Herz regeneriert langsam von selbst, in den Pausenphasen schneller. Keine Reparatur im Shop.
- Der **Bienenstock** ist ein zweites Ziel: Ein Teil der Zombies läuft ihn an. Normalerweise stechen die Bienen nur Zombies in der Nähe. Sobald der Stock Schaden bekommt, werden sie für einige Sekunden wütend und stechen alle in der Nähe, auch Helden. Ein zerstörter Stock ist keine Niederlage, die Bienen sind dann aber weg.
- Gefallene Helden respawnen nach einem Timer, der mit der Welle wächst (5 s + 1 s pro Welle), im Innenhof und müssen von dort durch den Durchgang nach draußen.

## 9. Gold, Shop und Items

Umgesetzt in M4. Zahlen in `data/items.json` und `data/economy.json`.

- **Gold:** Startgold 350. Kill-Gold je Zombie-Typ bekommt jeder Held im Umkreis von 15 m in voller Höhe (Koop, kein Last-Hit). Bonus pro überstandener Welle: 50 + 10 × Welle für alle.
- **Shop:** nur in der Pause **und** nur im Innenhof (6 m um das Herz). Taste B oder Klick auf den Hinweis „B: Shop öffnen“. Das Spiel läuft beim Einkaufen weiter, die Pause tickt also. Beginnt die Welle oder verlässt man den Hof, schließt der Shop.
- **Waffen sind Werte-Items** (wie in LoL): Der Standardangriff des Helden bleibt, die Waffe macht ihn stärker. Nahkampfwaffen wirken bei Nahkämpfern voll, Fernkampfwaffen bei Fernkämpfern, sonst halb.
  - Nahkampf: Baseballschläger (+15 % Schaden), Axt (+30 %), Kettensäge (+45 % Angriffstempo, +15 % Schaden)
  - Fernkampf: Pistole (+15 % Schaden), Schrotflinte (+35 %), Gewehr (+20 % Schaden, +25 % Reichweite), Armbrust (+40 % Angriffstempo)
- **Items:** Lederjacke und Kettenhemd (10 % bzw. 20 % weniger Schaden), Laufschuhe (+12 % Tempo), Kräuterbeutel (+5 Leben/s), Lebensamulett (+200 Leben), Taschenuhr (−15 % Abklingzeit)
- **Inventar:** 6 Plätze für Waffen und Items. Verkaufen (Rechtsklick im offenen Shop) bringt 70 % des Preises.
- **Verbrauchsgüter** auf den Item-Tasten R und T, stapelbar: Heiltrank (150 Leben über 5 s, bis 5 Stück), Energiedrink (6 s lang +30 % Tempo und Angriffstempo, bis 3 Stück). Benutzbar jederzeit, außer wenn betäubt.
- Keine Munition.

## 10. Mehrspieler und Bots

- Raum mit 4 Slots. Der Host erstellt den Raum, Freunde joinen per Link. Leere Slots füllen Bots.
- Join in laufender Partie: Der Mensch übernimmt den Bot-Slot samt Level, Gold und Items. Heldenwechsel nur in der Pausenphase (Vorschlag).
- Schwierigkeit ist fest und hängt nicht von der Zahl der Menschen ab.
- Bot-KI ist klassische Spiel-KI (State Machine oder Behavior Tree), kein Sprachmodell:
  - bleibt in der Nähe von Haus und Team
  - zielt auf nächste oder gefährlichste Zombies
  - setzt Fähigkeiten nach Abklingzeit und Situation ein (Libero schützt Mitspieler, Taucher geht nach vorn)
  - zieht sich bei wenig Leben zurück
  - kauft im Shop nach Prioritätenliste ein
- Bots laufen auf dem Server (Mehrspieler) bzw. lokal (Singleplayer)

## 11. Karte

Grundlage ist die Skizze auf dem Lageplan (`assets/reference/karte-skizze.jpg`). Umgesetzt in `data/map.json`, 1 Spieleinheit = 1 Meter, Norden oben.

- Karte ca. 66 x 75 m (echte Maße aus dem Lageplan)
- Haus in U-Form (ca. 21 x 24 m) mit Westflügel, Ostflügel und Südblock. Das Haus selbst ist nicht begehbar.
- **Innenhof = Herz der Base.** Dort steht das Herz. Der Hof ist nur über einen schmalen Durchgang (ca. 2,7 m) von Süden zwischen Westflügel und Südblock erreichbar: die wichtigste Engstelle.
- Helden starten im Innenhof und erscheinen dort nach dem Tod wieder.
- **Bienenstock** nordwestlich vom Haus: zweites Ziel der Zombies (siehe Abschnitt 8)
- Hochbeete westlich vom Haus (blockieren das Laufen, nicht aber Schüsse)
- Zombie-Zugänge:
  1. **Bunker** unten links im Garten: Zombies kommen aus der Bunkertür (Ostseite)
  2. **Heckenlücke Süd** in der Mitte der Südhecke
  3. **Zuwegung Ost:** Die Zombies laufen den Hang hinauf und sind dort langsamer (halbes Tempo), oben auf der Ebene wieder normal schnell
- Hecken im Norden, Osten und Süden, Zäune an der Zuwegung und zum Nachbargrundstück (nordöstlich, nicht begehbar), Bäume als Hindernisse
- Spawnpunkte haben Gewichte (wie oft dort Zombies erscheinen), alles in `data/map.json`
- Grafikstil: stilisiert, Low-Poly (siehe Abschnitt 3)

## 12. Meilensteine

1. M1: Offline-Prototyp. Eine Arena, ein Held (zwei Testhelden: Nah- und Fernkampf), Steuerung wie in Supervive, Zombies in Wellen, Nahkampf und Schuss.
2. M2: Karte Winterburg mit Haus (Lebensbalken), Garten, Hindernissen und den drei Zugängen
3. M3: Level, XP, Skillpunkte, 6 Helden (Chupa, Gärtnerin, Pirat, Libero, Rotschopf, Schläferin) mit Fähigkeiten auf 1–4
4. M4: Gold, Shop, Waffen und Items, Elite-Zombies, Ratten und Kriecher
5. M5: Bots (Singleplayer mit 3 Bots)
6. M6: Server und Mehrspieler (Raum, Join per Link, Bot-Ersatz)
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
