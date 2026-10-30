# Zombie-Apokalypse – Spielspezifikation (Entwurf v0.2)

Stand: 30.10.2026. Arbeitsgrundlage für Claude Code.

Änderungen v0.2: Steuerung wie in LoL (Klick zum Laufen statt WASD, Q/W/E/R für Fähigkeiten). Veraltete Verweise auf Sanitäter und Brecher ersetzt.
Mit "Vorschlag" markierte Punkte sind noch nicht entschieden, alles andere ist festgelegt.

## 1. Vision

Koop-Verteidigungsspiel im Browser. Vier Helden verteidigen die "Winterburg" (Haus und Vorgärten, als Karte nachgebaut) gegen Zombiewellen. Perspektive von oben mit LoL-artiger Kamera und Steuerung wie in League of Legends. Das Haus hat Lebenspunkte: Zombies, die es erreichen, greifen es an. Fällt der Lebensbalken auf 0, ist das Spiel verloren.

## 2. Festgelegte Entscheidungen

- Browser-Spiel mit 3D-Grafik und fester Schrägkamera von oben, wie in League of Legends und Dota
- Steuerung wie in LoL:
  - Rechtsklick auf den Boden = dorthin laufen (mit Pfadsuche um Hindernisse)
  - Rechtsklick auf einen Zombie = hinlaufen und Standardangriff (Auto-Attack, wiederholt)
  - A + Linksklick = Attack-Move (zum Punkt laufen, unterwegs den nächsten Zombie angreifen), S = Stopp
  - Q/W/E/R = Fähigkeiten, gezielt mit der Maus
  - Ob der Standardangriff Nah- oder Fernkampf ist, hängt vom Helden ab (wie in LoL)
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
- Eingaben sind Befehle (laufen zu, angreifen, Attack-Move, Stopp, Fähigkeit), keine Tastenzustände. Genau diese Befehle gehen im Mehrspieler übers Netz.
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

- Level 1 bis 18, ein Skillpunkt pro Level
- Q, W, E: maximal Rang 5. R (Ultimate): maximal Rang 3, freischaltbar ab Level 6, 11 und 16
- XP durch Zombie-Kills, geteilt unter allen Helden in Reichweite. Elite und Boss geben Bonus-XP.
- Grundwerte (Leben, Schaden, Tempo) wachsen pro Level
- Vorschlag (später): dünne Übungsschicht zusätzlich. Zielgenauigkeit steigt durch viele Schüsse, Nahkampfschaden durch viele Treffer, jeweils als kleine Passivboni.

## 6. Helden

Geplant sind 8 Helden, 2 Slots bleiben frei. Namen sind Platzhalter. Vorschlag für den MVP (5 Helden, je eine andere Rolle): Taucher (Tank), Chupa (Jäger), Gärtnerin (Fernkampf), Pirat (Kontrolle), Libero (Support). Die übrigen kommen nach und nach dazu.

| Held | Rolle | Q | W | E | R |
|---|---|---|---|---|---|
| Taucher | Nahkampf, Tank | Harpune | Druckluft | Strömung | Tiefenrausch |
| Pirat (Qualm) | Kontrolle | Qualmstoß | Rauchwolke | Nebelschritt | Dicke Luft |
| Imker | Fernkampf, Schaden über Zeit | Schwarm | Bienenstock | Honigfalle | Königin |
| Libero | Fernkampf, Support | Aufschlag | Block | Zuspiel | Schmetterball |
| Gärtnerin | Fernkampf, ausdauernd | Schleuderschuss | Saat | Kräutertee | Mein Garten! |
| Rotschopf | Nahkampf, Berserker | Wuchtschlag | Wutanfall | Ungezielter Sprung | Amok |
| Schläferin | Kontrolle, Sprinterin | Berührung | Gähnen | Powernap | Gute Nacht |
| Chupa | Nahkampf, Jäger | Sprungbiss | Fährte | Heulen | Hetzjagd |

### Chupa

- Rolle: Nahkampf-Jäger. Stark gegen Elite und Boss, heilt sich durch Beißen.
- Optik: Chupa ist der Hund des Auftraggebers, ein kleiner, flauschiger weißer Hund nach Referenzfoto (hund.jpg, in assets/reference/ ablegen). Cremeweißes Fell, hellbraune Flecken an den Ohren, rosa Nase, dunkle Augen, buschige Rute über dem Rücken, kleines dunkles Geschirr. Stilisiert. Die Wirkung soll süß und klein sein, im Kampf aber wild (Vorschlag: Fell sträubt sich und die Augen leuchten bei Fähigkeiten).
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
- Rolle: Fernkampf, Kontrolle und Support. Optik: sportliche Volleyball-Kleidung. Spielgefühl: eine Heldin mit einem Ball, der liegen bleibt (Orianna in LoL).
- Der Ball ist ein Objekt auf der Karte. Fähigkeiten gehen vom Ball aus oder bewegen ihn.
- Q Aufschlag: Ball fliegt als Linienschuss durch Zombies und bleibt am Ende liegen
- W Block: kurze Sperre vor dem Helden, Zombies werden zurückgedrängt
- E Zuspiel: Ball zu einem Mitspieler oder Bot, gibt ihm einen Schild
- R Schmetterball: Ball springt hoch und schlägt nieder, Flächenschaden mit Betäubung

### Pirat (Rauch-Held, Platzhaltername Qualm)
- Rolle: Kontrolle. Optik: Pirat. Spielgefühl: Rauchgranate, die Gegnern die Sicht nimmt (Graves in LoL).
- Rauch-Regel: Zombies im Rauch sehen nur wenige Meter weit, verlieren ihr Ziel, torkeln und treffen oft daneben.
- Q Qualmstoß: Rauchkegel nach vorne, wenig Schaden, Zombies sind kurz benommen
- W Rauchwolke: Granate, die Wolke bleibt ca. 5 s und verlangsamt Zombies darin
- E Nebelschritt: Sprung in eine eigene Rauchwolke, dort kurz unsichtbar
- R Dicke Luft: große Wolke, Zombies sind 3 s betäubt und danach 5 s blind
### Gärtnerin
- Rolle: Fernkampf, ausdauernd. Optik: ältere Frau, Gummistiefel, Gartenhut, Schürze, grummelig. Spielgefühl: Pflanzen als kleine Geschütztürme (Zyra in LoL).
- Passiv Sturschädel: regeneriert langsam Leben und wird zäher, je länger sie im Kampf bleibt
- Q Schleuderschuss: Fernschuss mit Steinschleuder
- W Saat: pflanzt Samen, nach 2 s wachsen Dornenranken, die Zombies verlangsamen und stechen (max. 3 gleichzeitig)
- E Kräutertee: heilt sie und Verbündete im Umkreis über Zeit
- R Mein Garten!: Dornenhecke wächst als Ring oder Linie (ca. 8 s), hält Zombies zurück und verursacht Schaden. Kann einen Zugang kurz sperren.

### Rotschopf
- Rolle: Nahkämpfer, stark und unberechenbar. Optik: rote Haare, kräftig, wild. Spielgefühl: Berserker (Olaf in LoL).
- Passiv Jähzorn: je mehr Schaden er einsteckt, desto schneller greift er an
- Q Wuchtschlag: Schlag mit zufälligem Zusatzeffekt (Betäubung, doppelter Schaden oder Rückstoß)
- W Wutanfall: zufälliger Buff (Tempo, Schild oder Heilung)
- E Ungezielter Sprung: Sprung mit kleiner Zufallsabweichung, hoher Schaden
- R Amok: kurz unaufhaltsam (immun gegen Betäubung und Rückstoß), doppelter Schaden

### Schläferin
- Rolle: Kontrolle und Sprinterin. Optik: sportlich, weiblich, Laufkleidung. Superkraft: sofortiger Schlaf. Spielgefühl: Schlaf-Fähigkeiten (Lillia und Zoe in LoL).
- Schlaf-Regel: Ein schlafender Zombie ist ausgeschaltet und wacht bei Schaden auf. Der erste Treffer auf einen Schlafenden macht Bonusschaden. Elite schlafen kürzer, Boss sind immun.
- Passiv Sprinterin: Lauftempo steigt, je länger sie ohne Pause läuft
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

- Walker (langsam, Masse), Runner (schnell, wenig Leben), Brute (Tank), Spitter (Fernkampf), Elite (Mini-Boss mit Spezialfähigkeit), Boss
- Verhalten: Zombies greifen Helden an, die in Reichweite sind. Sonst laufen sie zum Haus. Pfadfindung um Hindernisse.
- Durchbruch: Erreicht ein Zombie das Haus, bleibt er stehen und greift es an (Schaden pro Sekunde, Elite und Boss mehr). Wird er getötet, endet der Schaden.

## 8. Niederlage

- Das Haus hat einen gut sichtbaren Lebensbalken. Fällt er auf 0, ist das Spiel verloren.
- Ein Durchbruch ist keine sofortige Niederlage. Die Zombies brauchen Zeit, das Haus zu beschädigen, und die Helden können sie wegkämpfen. Ohne Gegenwehr führt der Durchbruch aber zur Niederlage.
- Nach LoL-Vorbild (Nexus): Das Haus regeneriert langsam von selbst, in den Pausenphasen schneller. Keine Reparatur im Shop.
- Gefallene Helden respawnen nach Timer, der mit der Welle wächst, am Spieler-Spawn hinter dem Haus und müssen von dort nach vorne laufen.

## 9. Gold, Shop und Items

- Gold pro Kill, Bonus pro überstandener Welle
- Shop in den Pausenphasen
- Waffen: Baseballschläger, Axt, Kettensäge, Pistole, Schrotflinte, Gewehr, Armbrust
- Items: Rüstung, Lauftempo, Lebensregeneration, Verbrauchsgüter (Heiltrank)
- Vorschlag: keine Munition, stattdessen Nachladezeiten (einfacher, weniger Frust)

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

- Winterburg mit Vorgärten, nachgebaut anhand des Satellitenbilds (Haus markiert). 1 Spieleinheit = 1 Meter.
- Das Haus ist 15 x 15 m groß und ein geschlossener Block, gekämpft wird nur draußen.
- Das Haus steht im westlichen Teil des Grundstücks. Die Rückseite zeigt nach Westen und hat nur einen schmalen Streifen (ca. 5 m). Die Vorderseite zeigt nach Osten, dort liegt der große Vorgarten.
- Spieler-Spawn: hinter dem Haus (Westen). Von dort laufen die Helden außen ums Haus nach vorne zu den Zugängen.
- Grundstücksgröße: noch offen. Die Skizze (Grundstück ca. 42 x 48 m) ist nur eine Schätzung.
- Zombie-Zugänge: drei Richtungen laut Satellitenbild (Norden, Osten, Süden). Vorschlag: Der Westen ist durch Hecke und Bäume geschlossen.
- Jeder Zugang ist eine Engstelle zwischen Hecken und Bäumen, also ein Verteidigungspunkt. Die Zombies laufen von dort zum Haus.
- Garten rund ums Haus: Hochbeete und Bäume (Hindernisse), Blumenrabatten (passierbar, Dekoration), Hecken und Zaun (Wände), Kieswege
- Die Hochbeete liegen seitlich vom Haus (Nord- und Südseite, Richtung Vorderseite), nicht auf der Rückseite
- Weitere Hindernisse wie Auto und Mülltonnen dienen als Deckung und Wegsperren
- Karte als Tilemap/JSON (z. B. mit Tiled) mit Ebenen für Boden, Kollision, Deckung, Spawnpunkte und Haustür
- Grafikstil offen (Low-Poly, Pixel-Art, realistisch). Referenzbilder folgen.

## 12. Meilensteine

1. M1: Offline-Prototyp. Eine Arena, ein Held (zwei Testhelden: Nah- und Fernkampf), Klicksteuerung wie in LoL, Zombies in Wellen, Nahkampf und Schuss.
2. M2: Karte Winterburg mit Haus (Lebensbalken), Garten, Hindernissen und den drei Zugängen
3. M3: Level, XP, Skillpunkte, 5 Helden mit Q/W/E/R
4. M4: Gold, Shop, Waffen und Items, Elite-Zombies
5. M5: Bots (Singleplayer mit 3 Bots)
6. M6: Server und Mehrspieler (Raum, Join per Link, Bot-Ersatz)
7. M7: Weitere Helden, Boss, Balancing, Feinschliff

## 13. Offene Fragen

- Namen und Optik der Helden (Entwürfe in Abschnitt 6b) und die letzten 2 Heldenslots
- Grundstücksmaße (Haus steht fest: 15 x 15 m)

Nach LoL-Vorbild bereits entschieden: Haus-Regeneration wie beim Nexus, Spielziel Welle 30, Grafikstil, Hosting erst bei Meilenstein 6. Lebenspunkte des Hauses, Zombieschaden und alle anderen Zahlen sind Platzhalter in den JSON-Dateien und werden beim Spielen balanciert.

## 14. Hinweise für Claude Code

- Zuerst Plan-Modus, dann M1 bauen. Jeder Meilenstein muss spielbar sein.
- Simulation und Rendering getrennt halten (siehe Abschnitt 3)
- Helden, Items, Zombies und Wellen als JSON-Daten
- Tests für die Simulation (Schaden, XP, Wellenaufbau)
- Kleine Schritte, nach jedem Schritt lauffähig
