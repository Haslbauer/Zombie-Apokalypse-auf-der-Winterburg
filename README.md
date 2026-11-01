# Zombie-Apokalypse auf der Winterburg

**▶ Jetzt spielen: [zombie-apokalypse.onrender.com](https://zombie-apokalypse.onrender.com)** – kostenloser Server; nach einer Weile ohne Besucher schläft er ein, der erste Aufruf dauert dann etwa eine Minute.

Koop-Verteidigungsspiel im Browser. Drei Helden (Tank, Schaden, Support) verteidigen die Winterburg (Haus und Vorgärten) gegen Zombiewellen – Schrägkamera von oben, WASD + Maus, Level, Gold, Shop, Verteidigungen und KI-Bots für freie Plätze. Dazu ein PvP-Modus für bis zu vier Spieler.

- Spezifikation: [docs/SPEC.md](docs/SPEC.md)
- Referenzbilder (z. B. `hund.jpg` für Grimm, Satellitenbild der Karte): `assets/reference/`

## Starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev
```

**Nach jedem Aktualisieren (`git pull`) einmal `npm install` ausführen**, falls neue Pakete dazugekommen sind (sonst z. B. „Cannot find module 'ws'“). `npm run share` macht das selbst.

Dann http://localhost:5173 öffnen. Weitere Befehle: `npm test` (Simulationstests), `npm run typecheck`, `npm run build`, `npm run models` (3D-Modelle aus `assets/models/` umwandeln, siehe dortige README).

## Mehrspieler

Koop für bis zu drei Spieler (Tank, Schaden, Support), freie Plätze spielen Bots; im PvP bis zu vier. Der Server rechnet das Spiel (samt Bots) und liefert es auch aus. Alles kostenlos.

### Mit Freunden spielen (vom eigenen Rechner)

```bash
npm run share
```

Baut das Spiel, startet den Server und öffnet einen kostenlosen Cloudflare-Tunnel. Angezeigt wird ein Link `https://….trycloudflare.com` – den an die Freunde schicken. HTTPS kommt von Cloudflare, am Router muss nichts eingestellt werden. Der Link gilt, solange das Fenster offen ist. Einmalig `cloudflared` installieren (Windows: `winget install --id Cloudflare.cloudflared`, macOS: `brew install cloudflared`); ohne zeigt `npm run share` die Adressen fürs eigene WLAN.

Im Spiel: Helden wählen, **„Online mit Freunden“**. Oben rechts stehen Raum-Code, Ping (ms) und **„Link kopieren“**. Wer den Link öffnet, übernimmt einen Bot-Platz samt Level, Gold und Items.

### Dauerhafter Link (Render, Gratis-Tarif)

Das Spiel läuft unter **https://zombie-apokalypse.onrender.com** und wird bei jedem Push auf `main` automatisch neu gebaut. Eigene Instanz: bei [render.com](https://render.com) mit GitHub anmelden, **New → Blueprint**, dieses Repo wählen – `render.yaml` erledigt den Rest (Region Frankfurt). Der Gratis-Dienst schläft nach rund 15 Minuten ohne Besucher; der erste Aufruf danach dauert etwa eine Minute, das Spiel zeigt dann „Server wacht auf …“ und versucht es weiter. Laufende Räume gehen beim Einschlafen verloren. (Stand der Anbieterbedingungen kann sich ändern.)

### Eigener Server (Docker)

```bash
docker build -t winterburg .
```

```bash
docker run -p 3000:3000 winterburg
```

Im Internet hinter HTTPS betreiben (z. B. Caddy oder ein Tunnel), denn Browser verlangen dort `wss://`. Einstellungen: `PORT` (3000), `HOST` (0.0.0.0), `MAX_ROOMS` (200). `/health` meldet Build, Räume und Spieler.

### PvP-Modus

In der Lobby stellt der Gastgeber den Modus auf **PvP: Helden gegeneinander**. Jeder wählt Held und Team (**Nord** oder **Süd**), möglich sind 1:1, 1:2, 2:2 und 1:3.
- **Start:** Das Spiel startet, wenn beide Seiten mindestens einen Spieler haben und alle bereit sind. Leere Plätze bleiben leer, es gibt keine Bots und keine Zombies.
- **Sieg:** Das Team, das zuerst **10 Kills** hat, gewinnt.
- **Belohnung:** Ein Kill bringt 250 Gold und Erfahrung. Dazu gibt es laufend Gold und Erfahrung, und der Shop ist an der eigenen Basis jederzeit offen.
- **Wiederbeleben:** Wer fällt, kommt nach 6 s an der eigenen Basis zurück.
- **Ausgleich:** Das kleinere Team macht mehr Schaden und nimmt weniger, nach der Wurzel des Größenverhältnisses. Bei 1:3 ist das Faktor 1,73.
- **Fähigkeiten:** Alle Fähigkeiten, Zauber und Angriffe treffen nur Gegner, nie Mitspieler.

### Lobby

„Online mit Freunden“ öffnet eine **Lobby**: Oben stehen Raum-Code und „Link kopieren“. Wer den Link öffnet, gibt seinen Namen ein und landet ebenfalls in der Lobby. Jeder wählt einen Helden (vergebene sind ausgegraut) und seine Beschwörerzauber und klickt **„Bereit“**. Sind alle bereit, startet das Spiel nach **15 Sekunden**; „Nicht bereit“ oder ein neuer Spieler halten den Countdown an. Freie Plätze spielen Bots, die Bot-Stärke wählt der Gastgeber. Nach Spielende führt „Nochmal“ zurück in die Lobby. Wer später kommt, übernimmt einen Bot im laufenden Spiel.

### Was der Netzcode tut

- **Eigene Bewegung ohne Verzögerung:** Der Client sagt die eigene Bewegung voraus und gleicht sie mit dem Server ab (getestet mit 300 ms Laufzeit: Der Held läuft sofort los, am Ende stimmen Bild und Server auf den Zentimeter).
- **Gleichmäßige Bewegung der anderen:** Zustände 20× pro Sekunde, Darstellung 100 ms im Puffer gegen Netzschwankungen.
- **Nichts geht verloren:** Ereignisse (Treffer, Gold, Pings …) werden gesammelt und auch bei voller Leitung nachgeliefert.
- **Verbindungsabbruch:** Ein Bot springt ein, der Platz bleibt 2 Minuten reserviert, der Client verbindet sich sofort selbst neu und bekommt denselben Helden zurück – auch nach dem Neuladen der Seite. Der Grund der Trennung wird angezeigt (z. B. „Verbindung abgerissen (Netz oder Tunnel)“) und im Server-Log notiert.
- **Absicherung:** Nachrichten werden geprüft, begrenzt (Größe, Anzahl pro Sekunde), tote Verbindungen per Herzschlag erkannt (getrennt wird erst nach 30 s ohne Antwort). Nach einem Ruckler nachgeschickte Eingaben führen nicht zur Trennung. Nach einem Update meldet die alte Seite „Neue Version – bitte neu laden“.
- **Klein:** Inventar, Ränge, Punkte und Ziele gehen nur bei Änderung (und jede Sekunde zur Sicherheit) mit, sonst nur Positionen, Leben und Zustände (gepackt meist 1–2 KB pro Zustand). Das Spiel selbst wird vorkomprimiert ausgeliefert.
- **Überlastung erkennen:** Der Server meldet im Log langsame Ticks und wenn er hinterherhinkt (z. B. weil Spiel und Server bei `npm run share` auf demselben Rechner laufen).

**Wenn es ruckelt:** Im Esc-Menü „Leistung anzeigen“ einschalten (fps und Ping) und die Grafik auf „Automatisch“ lassen oder auf „Mittel“/„Niedrig“ stellen. Bei `npm run share` teilen sich Spiel und Server den Rechner; ein zweiter Rechner als reiner Server (oder Render) entlastet.

Beim Entwickeln (`npm run dev`) leitet Vite den Mehrspieler an einen laufenden `npm run server` weiter. Zum Testen schlechter Leitungen: `LAG_MS=150 npm run server` (künstliche Verzögerung je Richtung).

## Steuerung (wie in Supervive)

| Eingabe | Wirkung |
|---|---|
| W A S D | laufen |
| Maus | Blickrichtung und Zielen |
| Linksklick | Angriff Richtung Mauszeiger (halten = Dauerangriff) |
| 1 2 3 4 | Fähigkeiten (4 = Ultimate). Halten zeigt die Vorschau, Loslassen löst aus |
| Shift + 1–4 | Skillpunkt setzen (oder „+“ in der Fähigkeitenleiste) |
| R T | Verbrauchsgüter benutzen (Heiltrank, Energiedrink) |
| F G | Beschwörerzauber (wie D/F in LoL) Richtung Mauszeiger; Rechtsklick auf das Feld in der Pause: tauschen |
| B | Shop (nur in der Pause im Innenhof) |
| N | Welle sofort starten (in der Pause) |
| Rechtsklick | Ping an alle: kurz = „Hier!“, halten und ziehen = Ping-Rad mit fünf Feldern (oben Angriff, rechts Bin unterwegs, rechts unten Brauche Heilung, links unten Hilfe, links Gefahr). „Brauche Heilung“ ruft vor allem Support-Bots. Auch auf der Minimap. Bots folgen den Pings (siehe unten). |
| Tab (halten) | Anzeigetafel: Kills, Bosse, Assists, Gold und Level aller Helden |
| M | Ton an/aus |
| Mausrad | Kamera heran- bzw. herauszoomen. Ganz hinein und weiter: **Ego-Sicht** (Klick fängt die Maus, Maus dreht den Blick, W läuft nach vorn, A/D seitlich, Angriff und Fähigkeiten zielen aufs Fadenkreuz, Rechtsklick pingt „Hier!“). Herausscrollen: zurück |
| Griff ⠿ an der Skillleiste | Leiste verschieben (Doppelklick: zurück), „−“/„+“ ändern die Größe; Größe und Deckkraft auch im Esc-Menü |
| Esc | Pause und Tastenbelegung (alle Tasten frei belegbar); online läuft das Spiel weiter |

Die Markierung am Boden zeigt Reichweite und Trefferbereich der Waffe: einen Bogen beim Nahkampf, einen Pfeil beim Fernkampf.

## Ton

Alle Geräusche und die Musik entstehen im Browser (Web-Audio, `src/client/audio.ts`): Oszillatoren, Rauschen, Filter und Hüllkurven, jedes Mal leicht anders. Es gibt keine Tondateien und damit keine Lizenzfragen. Der Ton startet beim ersten Klick bzw. Tastendruck, weil Browser das so verlangen.

- **Kampf:** Hiebe, Bogen, Wurf, Enterhaken, Magie, Treffer, Zombie-Bisse, Stöhnen und Todesröcheln, Schreie der Elites, Sprung und Paketwurf.
- **Spielablauf:** Horn zum Wellenstart, Akkord für „Welle geschafft“, Alarm bei Durchbruch, Fanfare für den Postboten, Boss erlegt, Sieg und Niederlage.
- **Oberfläche:** Gold, Level-up, Shop, Pings (je Art ein Ton), Countdown in der Lobby.
- **Zauber:** je Beschwörerzauber ein eigener Klang.
- **Umgebung:** Nachtwind, Knistern an Feuerfässern und Feuerstelle, Bienensummen am Stock (wütend lauter), Krähen.
- **Musik:** düsterer Bordun mit Moll-Akkorden; in der Welle mit Trommeln und schneller, bei Bossen dichter.

Geräusche werden mit dem Abstand zum eigenen Helden leiser und links/rechts verteilt. Es laufen höchstens 24 Geräusche gleichzeitig, damit viele Zombies nicht übersteuern.

Der Hintergrund ist bewusst fast still: keine Dauergeräusche, nur ab und zu eine Windböe, Knacken nah am Feuer, Summen nah am Bienenstock, eine Krähe oder ein Zombie in der Nähe. Musik (weiche Akkorde) gibt es nur während der Wellen.

**Einstellungen:** Im Esc-Menü unter „Ton“ gibt es Regler für Gesamt, Effekte, Umgebung, Musik und Oberfläche sowie „Stumm“ (Taste M, frei belegbar). Die Werte bleiben im Browser gespeichert.

## Karte

Die Winterburg: U-förmiges Haus mit dem **Lebensmittelvorrat** im Innenhof (erreichbar über einen schmalen Durchgang im Südwesten und den Nordeingang). Zombies kommen aus dem **Bunker**, durch die **Heckenlücke Süd**, den **Hang Ost** hinauf und aus dem **Nordwesten**. Zombies plündern den Vorrat, **Ratten** fressen die **Hochbeete** oder laufen zum Vorrat (deren Ernte füllt den Vorrat nach jeder Welle auf), **Hornissen** greifen den **Bienenstock** an. Ist der Vorrat leer, ist das Spiel verloren.

Neutrale Lager lassen sich nicht über den Zaun hinweg „abfarmen“: Erreichen sie ihren Angreifer 5 s lang nicht, kehren sie unverwundbar heim und heilen sich. Es ist Nacht: Mondlicht, Nebel, brennende Fässer, Stacheldraht und Bretterbarrikaden an den Toren, Feuerstellen, Krähen, Knochen und ein Autowrack vor dem Osttor. Der Westflügel des Hauses ist eine halb eingestürzte Ruine, die Wege sind aus Bruchstein. Ohne Bienenstock wachsen zerstörte Beete nicht mehr nach (verdorrte Stängel, Hinweis in der Kopfleiste). Rund um den Garten liegt Gelände mit Büschen, Hecken, einer alten Grabstätte und einem Teich. **Verstecke** wie das Gebüsch in LoL: Im hohen Gras, in Büschen und im Schilf sehen Zombies einen Helden erst aus nächster Nähe – bis er angreift. Umgekehrt sieht man Zombies im Gebüsch erst, wenn man selbst nah dran ist.

Entwicklermodus: http://localhost:5173/?overview zeigt die ganze Karte von oben, `?level=6` startet auf Level 6, `?wave=5` mit Welle 5 (kombinierbar: `?wave=5&level=8`), `?bots=3` (oder `?bots=4`) lässt drei Bots allein spielen (Zuschauen, optional `&difficulty=schwer`). `?camera=x,y,abstand` richtet die Kamera fest auf einen Punkt (z. B. `?bots=4&camera=37,22,30` fürs Haus), `?debug` gibt Testhilfen frei (`winterburg.teleport(x, y)`, `spawnZombie(typ, x, y)`, `buff(art, wert, sekunden)`, `down()`, `finish(sieg)`). `portrait.html?hero=<id>` rendert ein Porträt aus dem Modell.

## Team und Bots

Du wählst deinen Helden, zwei Bots spielen mit und ergänzen die fehlenden Rollen (Tank, Schaden, Support; per Klick tauschbar). Die Bot-Stärke (leicht, mittel, schwer) stellst du auf dem Startbildschirm ein. Getrennt davon gibt es die **Schwierigkeit** für alle: **Entspannt** (Zombies, Boss-Leben und Schaden ×0,75), **Normal** und **Albtraum** (Zombies ×1,3, Boss-Leben ×1,35, Schaden ×1,3). Solo wählst du sie auf dem Team-Bildschirm, online legt sie der Gastgeber in der Lobby fest. Links zeigt die Teamleiste Level, Leben und erlegte Bosse aller drei Helden; Bots haben einen blauen Ring.

**Bots verteidigen:** Greifen Zombies den Vorrat oder den Bienenstock an, laufen Bots auch von weit her zurück. Zombies weit weg von den Zielen jagen sie nur, wenn diese nah sind oder einen Helden angreifen.

**Bots folgen Pings:** „Angriff!“ schickt alle Bots auf das Ziel (auch Postbote und Lager), „Hilfe!“ holt sie zu dir, „Hier!“ schickt die zwei nächsten an den Ort, „Gefahr!“ lässt sie den Bereich meiden. Sie antworten mit „Bin unterwegs“. Kämpfst du gegen Postbote oder Lager, helfen Bots in der Nähe auch ohne Ping.

`npm run balance` lässt drei Bots ohne Spieler über mehrere Seeds spielen und gibt die erreichte Welle aus (Optionen: `BALANCE_SEEDS=5`, `BALANCE_DIFF=mittel`, `BALANCE_TEAM=rotschopf,grimm,gaertnerin`).

## Reichweite und Durchschlag

Angriffe reichen weiter als früher (die Karte ist größer). Manche Schüsse treffen auch Gegner dahinter, mit weniger Schaden:

| Held | Angriff | Reichweite | Durchschlag |
|---|---|---|---|
| Ragnar | Hammer (Bogen 120°) | 3,1 m | Wucht: bis 1 m dahinter im 60°-Kegel 50 % |
| Grimm | Biss (Bogen 90°) | 2,5 m | trifft alle im Bogen |
| Hagedorn | Stein | 10 m | 1 dahinter mit 60 %; Pfeilschuss: 2 dahinter mit 75 % |
| Somnia | Stern | 10 m | 1 dahinter mit 70 % |
| Spike | Ball | 9 m | 2 dahinter mit 50 % |
| Rauchbart | Haken | 7,5 m | bleibt im ersten Ziel hängen |

Fähigkeiten reichen 15 % weiter.

## Rollen

Jeder Held hat eine Rolle im Team. Ohne Tank, Schaden und Support ist das Spiel kaum zu gewinnen:

| Rolle | Helden | Wirkung |
|---|---|---|
| 🛡 Tank | Ragnar, Spike, Kapitän Tiefe | nimmt 20 % weniger Schaden; Bosse und Elites in 10 m Nähe greifen ihn an statt der anderen |
| ⚔ Schaden | Grimm, Rauchbart, Aurelius, Lotte | 40 % mehr Schaden an Bossen und Elites |
| ✚ Support | Hagedorn, Somnia, Imker | heilt Verbündete in 7 m Nähe ständig ein wenig und reinigt sie alle 3 s von **Seuche** |

**Rollen-Kombos:**
- Die Schaden-Rolle macht 25 % mehr Schaden an Zielen, die gerade betäubt, festgehalten oder eingeschlafen sind, meist durch den Tank.
- Heilung und Schilde eines Supports wirken auf einem Tank 30 % stärker.

Über den Köpfen der Mitspieler zeigt ein Symbol ihre Rolle (🛡 ⚔ ✚).

**Seuche:** Bossfähigkeiten hinterlassen einen stapelbaren Schaden über Zeit, der nur abklingt, wenn sie eine Weile nicht mehr trifft. Ein Support in der Nähe (oder der Zauber Reinigen) entfernt sie.

Bot-Partien mit drei Bots auf „schwer“ (je 3 Läufe, `BALANCE_TEAM=… npm run balance`), seit die Bots Vorrat und Bienenstock verteidigen: komplettes Team Ø Welle **15,0**; ohne Tank 12,0; ohne Support 11,3; ohne Schaden 11,3. Siege schaffen Bots noch keine; die genaue Abstimmung braucht echte Partien.

Die Heldenwahl und die Lobby zeigen die Rolle jedes Helden und warnen, wenn eine Rolle fehlt. Bots füllen zuerst die fehlenden Rollen auf.

## Schadenszahlen und Lebensbalken

Über getroffenen Gegnern steigen **Schadenszahlen** auf. Treffer in kurzer Folge werden je Ziel zusammengefasst, damit Brand, Stiche und Durchschlag lesbar bleiben.

| Farbe | Bedeutung |
|---|---|
| Weiß | normaler Schaden |
| Gelb, größer | Schaden an Bossen |
| Orange mit „!“ | Rollenbonus, etwa Schaden-Rolle an Bossen |
| Rot | Schaden an dir |

Im Esc-Menü unter Grafik lassen sich die Zahlen abschalten.

**Lebensbalken** haben wie in LoL einen Strich je 100 Leben und einen dickeren je 1000 Leben.

## Buff-Ringe und Münzen

**Buff-Ringe:** Aktive Wirkungen erscheinen wie in LoL als farbige, sich drehende Ringe um die Füße eines Helden. Das gilt für alle Helden, auch für Mitspieler und Gegner im PvP.

| Ring | Farbe |
|---|---|
| mehr Schaden | Rot-Orange |
| Angriffstempo | Gelb |
| Lauftempo | Hellblau |
| Schutz (Schild, weniger Schaden) | Weiß-Blau |
| Heilung über Zeit | Grün |
| Seuche (Schwächung) | Giftgrün, gestrichelt und langsam |

Team-Buffs von Bossen haben breitere Ringe mit leuchtenden Punkten. In den letzten 5 s blinkt ein Ring.

**Münzen:** Gold springt als glänzende Münzen aus dem erlegten Gegner und fliegt zum Helden. Beim Wellenbonus regnet es Münzen. Kleine Beträge bringen 1 Münze, ein Boss bis zu 8.

**Zähler:** In der Kopfleiste, auf der Anzeigetafel (Tab) und in der Endstatistik zählen als **Kills** nur Bosse und Zwischenbosse (☠). Die erlegten Zombies haben ihren eigenen Zähler (🧟).

## Zwischenbosse und Team-Buffs

Zwischenbosse (Rattenkönig, Schlächter, Dämon) kommen ab Welle 3 jede zweite Welle und ab Welle 10 in jeder Welle. Alle 5 Wellen kommt einer mehr dazu, und mit jeder Welle haben sie zusätzlich mehr Leben.

Sie haben Fähigkeiten wie die Helden. Jede kündigt sich mit einer **Warnung am Boden** an; wer rechtzeitig herausläuft, weicht aus:

| Boss | Fähigkeiten |
|---|---|
| Rattenkönig | **Pestbiss** (Einschläge bei 2 Helden, bevorzugt hinten, Seuche), **Pestwolke** ab Welle 8 (Fläche um ihn, Seuche), ruft weiter Ratten |
| Schlächter | **Hackbeil** (schwerer Schlag aufs Ziel), **Fleischwolf** ab Welle 6 (Fläche, Seuche), Anlauf |
| Dämon | **Klauenhieb** (schwerer Schlag), **Höllenfeuer** ab Welle 7 (3 Einschläge, Seuche), Höllensprung |

**Wut:** Ein Boss, der länger als 30 s lebt, macht jede Sekunde 3,5 % mehr Schaden, höchstens das 2,5-Fache. Er färbt sich dann rot.

Der schwere Schlag braucht einen **Tank**, die Seuche einen **Support**, die Wut genug **Schaden**.

**Endgegner: Das Bauamt.** Es erscheint ab Welle 15 in jeder Welle, jedes Mal stärker. In Welle 20 ist es der Endkampf: Erst wenn es fällt, ist die Winterburg gehalten. Seine Fähigkeiten:
- **Abrissbescheid:** schwerer Schlag aufs Ziel.
- **Formularflut:** 4 Einschläge mit Seuche.
- **Baustopp:** große Fläche mit Betäubung und Seuche.

Dazu ruft es Sachbearbeiter. Wer es besiegt, bekommt 📜 Baugenehmigung: +25 % Schaden und −15 % erlittenen Schaden, 120 s.

**Team-Buffs:** Fällt ein Zwischenboss, bekommen alle lebenden Helden seinen Buff. Er wird oben unter der Kopfleiste mit Restzeit angezeigt:

| Boss | Buff |
|---|---|
| Rattenkönig | 🐀 Rattenfieber: +25 % Angriffstempo, 90 s |
| Schlächter | 🩸 Blutrausch: +20 % Schaden, 90 s |
| Dämon | 🔥 Höllenglut: +10 % Schaden, +12 % Tempo, 90 s |
| Riesenspinne | 🕷 Spinnenbeine: +15 % Tempo, 75 s |
| Kröte | 🐸 Krötenschleim: 1 % Leben pro Sekunde, 75 s |
| Postbote | 📦 Eilzustellung: +10 % Tempo und Angriffstempo, 60 s |

## Gegner

Walker, Runner, Brute, Kriecher (hält fest), Ratten in Rudeln (fressen Beete, schlüpfen zum Vorrat), Hornissen-Schwärme (greifen den Bienenstock an) und alle 5 Wellen Elites mit leuchtendem Ring: Rattenkönig (ruft Ratten), Schlächter (Anlauf, betäubt) und ab Welle 15 der Dämon (Höllensprung mit Warnkreis). **Bosse wie in LoL:** Der letzte Treffer an einem Elite, dem Postboten oder einem großen Neutralen bringt Extra-Gold, Mithelfer bekommen die Hälfte (Assist), der erste Boss der Partie +150 („Erstes Blut“). Details in `docs/SPEC.md` (Abschnitt 7).

## Beschwörerzauber

Wie in LoL wählst du vor dem Spiel zwei Zauber, unabhängig vom Helden (auf dem Team- bzw. Beitritts-Bildschirm; die Wahl wird gemerkt). In der Pause lassen sie sich tauschen, die Abklingzeit bleibt dabei erhalten.

| Zauber | Wirkung | Abklingzeit |
|---|---|---|
| ⚡ Blitz | Sofort bis 4,5 m Richtung Mauszeiger springen, auch über Hecken | 110 s |
| 🌀 Teleport | Nach 3 s Kanalisieren zu einem Mitspieler oder Ziel nahe dem Mauszeiger; Laufen bricht ab | 150 s |
| 🔥 Entzünden | Gegner am Mauszeiger brennt 5 s (60 + 25 pro Level Schaden) | 80 s |
| ✚ Heilen | Heilt dich und den schwächsten Mitspieler in 8 m, kurz schneller | 110 s |
| 🛡 Barriere | Schild für 2,5 s | 90 s |
| 👻 Geist | 8 s lang 35 % schneller | 100 s |
| 💤 Erschöpfen | Gegner 3 s langsamer und schwächer | 95 s |
| ☄ Zerschmettern | Großer Treffer (380 + 40 pro Level), ideal gegen Lager, Postbote und Elites | 50 s |
| ✦ Reinigen | Löst Festhalten und Betäubung, 2 s immun | 90 s |

Bots nehmen je nach Rolle Blitz plus Entzünden (Nahkampf), Heilen (Fernkampf), Erschöpfen (Kontrolle) bzw. Zerschmettern (Grimm) und setzen sie selbst ein. Werte in `data/spells.json`.

## Sieg und Belohnung

Wer **Welle 20** übersteht und dort das Bauamt besiegt, gewinnt. Das Spiel ist auf drei aktive Spieler (Tank, Schaden, Support) ausgelegt; fällt einer aus, wird es sehr schwer.

**Wiederbeleben:** Gefallene liegen 10 s am Boden. Stellt sich ein Mitspieler daneben, füllt sich ein grüner Ring um den Gefallenen. Nach 3 s (bei Supports nach 2 s) steht er an Ort und Stelle mit 40 % Leben wieder auf. Ohne Helfer leert sich der Ring langsam, und es gilt der normale Respawn-Timer im Innenhof. Bots laufen zu gefallenen Mitspielern in der Nähe und helfen ihnen auf.

Gutes Spielen wird belohnt (wie in LoL): Der letzte Treffer bringt das volle Gold, Mithelfen ein Drittel, Danebenstehen nichts. Erfahrung: Killer voll, Mithelfer die Hälfte, Zuschauer in der Nähe ein Viertel. Den Wellenbonus bekommt nur, wer in der Welle mitgekämpft hat.

**Speedrun:** Oben läuft die Spielzeit (⏱). Sobald alle Zombies einer Welle erledigt sind, startet N bzw. „Jetzt starten“ sofort die nächste Welle, statt die Pause abzuwarten. Nach einem Sieg zeigt die Endstatistik die Zeit und die Bestzeit; die Bestzeit wird im Browser gespeichert.

**Endstatistik:** Nach Sieg oder Niederlage erscheint eine Statistik, online für alle gleich:
- **Teamwerte:** Welle, Spielzeit, Zombies, Bosse, Postboten, Beete, Vorrat, Bienenstock.
- **Podest:** die besten drei nach Wertung, der Erste ist **MVP**.
- **Auszeichnungen:** Meiste Kills, Meiste Assists, Meistes Gold, Meister Schaden, Bollwerk (meister erlittener Schaden), Heiler, Längste Serie, Bossjäger.
- **Rangliste:** Kills, Tode, Assists, Bosse, Schaden, Erlitten, Heilung, Gold (verdient/ausgegeben), Level und Wertung. Ein Klick auf eine Spalte sortiert.
- **Diagramm:** Kills pro Welle je Held.

Die Wertung funktioniert wie in LoL: Kill 1 Punkt, Boss 5, Assist 0,6, je 400 Schaden 1, je 300 Heilung 1, je 800 eingesteckter Schaden 1, je Tod −1. Die Gewichte lassen sich in `data/economy.json` unter `rewards.mvp` anpassen.

## Verteidigungen bauen (Pause)

In der Pause öffnet **V** die Bauleiste. Dort wählst du eine Verteidigung und stellst sie per **Linksklick** an der Maus auf. **X** dreht die Barrikade, **Esc** bricht ab. Die Höchstzahl gilt fürs ganze Team.

| Verteidigung | Kosten | Höchstens | Wirkung |
|---|---|---|---|
| 🪢 Stacheldraht | 60 Gold | 6 | Zombies im Umkreis von 1,3 m sind verlangsamt und nehmen 10 Schaden/s; der Draht nutzt sich ab, je mehr Zombies durchlaufen |
| 🪵 Bretterbarrikade | 80 Gold | 6 | blockiert den Weg (2,4 m breit, 700 Leben); Zombies laufen außen herum oder schlagen sie kaputt |
| 🛢 Feuerfass | 100 Gold | 3 | setzt Zombies im Umkreis von 1,8 m 3 s in Brand; brennt langsam herunter |

**🔧 Reparieren** stellt alle beschädigten Verteidigungen wieder her und kostet die Hälfte des Neupreises für den fehlenden Anteil. Den Schaden der Verteidigungen bekommt der Held angerechnet, der sie gebaut hat. Im PvP gibt es keine Verteidigungen.

## Shop

Gold gibt es für Kills und jede überstandene Welle, in der man mitgekämpft hat. In der Pause im Innenhof öffnet **B** den Shop: Waffen (wirken als Werte-Items), Rüstung, Werte-Items und Verbrauchsgüter für R/T. Rechtsklick auf ein Item im Inventar verkauft es (70 %).

## Helden

| Held | Rolle | Fähigkeiten (1–4) |
|---|---|---|
| Grimm (Hund) | Nahkampf-Jäger | Sprungbiss, Fährte, Heulen, Hetzjagd |
| Hagedorn (Waldläuferin) | Fernkampf, ausdauernd | Pfeilschuss, Saat, Kräutertee, Mein Garten! |
| Rauchbart (Pirat) | Kontrolle | Qualmstoß, Rauchwolke, Nebelschritt, Dicke Luft |
| Spike (Libero) | Fernkampf, Support | Aufschlag, Block, Zuspiel, Schmetterball |
| Ragnar (Rotschopf) | Nahkampf, Berserker | Wuchtschlag, Wutanfall, Ungezielter Sprung, Amok |
| Somnia (Schläferin) | Kontrolle | Berührung, Gähnen, Powernap, Gute Nacht |
| Imker | Support (Bienen) | Honigtopf, Smoker, Wachbienen, Schwarm |
| Aurelius (Goldschmied) | Schaden, Fernkampf | Lötflamme, Blattgold, Schmelztiegel, Goldrausch |
| Lotte | Schaden, Beschwörerin | Trollruf, Brückentroll, Wutanfall, Trollfamilie |
| Kapitän Tiefe (Taucher) | Tank | Harpune, Luftblase, Tauchgang, Flutwelle |

**Imker** (Support):
- **Angriff:** ein kleiner Bienenschwarm (9 m). Jeder Treffer hinterlässt einen **Stich**, bis zu 5. Die Stiche machen 4 s lang Schaden über Zeit.
- **Passiv „Mein Volk“:** Nahe am Bienenstock heilt er 30 % stärker. Solange er lebt, heilt sich der Stock schneller.
- **Honigtopf:** heilt Mitspieler in einer Fläche; Zombies darin kleben fest.
- **Smoker:** Rauchkegel, blendet und verlangsamt.
- **Wachbienen:** Bienen schützen einen Mitspieler und stechen jeden Angreifer.
- **Ultimate „Schwarm“:** großer Schwarm, viel Schaden über Zeit. Zombies darin bekommen volle Stiche, Mitspieler werden von Seuche gereinigt.

**Aurelius** (Goldschmied, Schaden):
- **Angriff:** wirft Goldnuggets (9 m) mit Durchschlag auf 1 Ziel dahinter.
- **Passiv „Feingold“:** 15 % mehr Gold für eigene Kills, dazu je 100 Gold im Beutel 1 % mehr Schaden (höchstens 25 %).
- **Lötflamme:** Feuerkegel, der Zombies in Brand setzt.
- **Blattgold:** goldener Schild auf einen Mitspieler.
- **Schmelztiegel:** Fläche mit flüssigem Gold, verlangsamt und macht Schaden.
- **Ultimate „Goldrausch“:** großer Flächenschaden; Zombies, die in den nächsten 6 s sterben, lassen doppelt Gold fallen und leuchten golden.

**Lotte** (Schaden, Beschwörerin):
- **Angriff:** Steinschleuder (8 m).
- **Passiv „Beste Freunde“:** Ihre Trolle werden mit jedem Level 6 % stärker. Steht ein Troll in ihrer Nähe, nimmt sie 20 % weniger Schaden.
- **Trollruf:** kleiner Troll für 12 s.
- **Brückentroll:** großer Troll für 8 s; alle Zombies in 5 m greifen nur ihn an, so blockiert er einen Weg.
- **Wutanfall:** alle ihre Trolle 4 s lang 50 % schneller und stärker.
- **Ultimate „Trollfamilie“:** drei Trolle für 15 s, einer davon riesig.

Trolle kämpfen selbst; ihr Schaden zählt für Lotte. Zombies greifen Trolle an, die ihnen im Weg stehen.

**Kapitän Tiefe** (Taucher, Tank):
- **Angriff:** Nahkampf mit Harpunenstoß bzw. Bleistiefel (3 m).
- **Passiv „Druckanzug“:** 15 % weniger Schaden, kann nicht zurückgestoßen werden, ist dafür langsamer.
- **Harpune:** zieht den ersten getroffenen Zombie heran und betäubt ihn kurz. Bosse werden nur betäubt.
- **Luftblase:** Schild für ihn und Mitspieler in 5 m.
- **Tauchgang:** 0,8 s unverwundbar abtauchen, dann an der Zielstelle auftauchen, die Zombies dort betäuben und treffen.
- **Ultimate „Flutwelle“:** breite Welle in eine Richtung; Schaden, spült Zombies 5–9 m zurück und verlangsamt sie.

Die neuen Helden sind vorerst umgebaute vorhandene Figuren. Der Imker hat einen hellen Anzug mit Imkerhut, Schleier und Smoker. Aurelius trägt runde Brille, Lederschürze und eine Lupe am Gürtel. Lotte ist eine verkleinerte Figur im gelben Mantel mit Zöpfen und Teddy. Die Trolle sind grün eingefärbte Kürbis-Hulks. Kapitän Tiefe trägt einen schweren Anzug, einen Messinghelm mit Bullauge, eine Sauerstoffflasche und eine Harpune.
Die Figur ist vorerst eine umgefärbte vorhandene Figur mit Imkerhut, Schleier und Smoker. Das Porträt ist aus dem Modell gerendert (`portrait.html?hero=imker` im Entwicklungsserver, Screenshot per Playwright).

Details in `docs/SPEC.md` (Abschnitt 6), Werte in `data/heroes.json`.

## Aufbau

- `src/sim/` – Spiellogik, tickbasiert (20 Ticks/s), ohne Browser-Abhängigkeit. Läuft im Einzelspieler im Browser, im Mehrspieler auf dem Server.
- `src/net/` – Netzprotokoll (Nachrichten, kompakte Zustände)
- `src/client/` – Rendering (Three.js), Eingabe, HUD; `session.ts` verbindet lokal oder mit dem Server
- `server/` – Spielserver (Node, WebSocket): Räume, Beitritt per Link, Bots auf freien Plätzen
- `data/` – Helden, Zombies, Wellen und Arena als JSON (Balancing ohne Codeänderung)
- `tests/sim/`, `tests/server/` – Tests für Simulation und Server (Vitest)

## Meilensteine

1. M1: Offline-Prototyp (Arena, ein Held, Zombiewellen, Nah- und Fernkampf) ✅
2. M2: Karte Winterburg mit Herz, Bienenstock und drei Zugängen ✅
3. M3: Level, XP, Skillpunkte, 6 Helden mit Fähigkeiten ✅ (inzwischen 10 Helden)
4. M4: Gold, Shop, Waffen und Items, Elite-Zombies ✅
5. M5: Bots (Singleplayer mit Bots, heute 2 Mitspieler-Bots) ✅
6. M6: Server und Mehrspieler ✅
7. M7: Weitere Helden ✅, Bosse ✅ (Zwischenbosse, Bauamt), Rollen ✅, PvP ✅, Verteidigungen ✅, Wiederbeleben ✅; Balancing und Feinschliff laufen weiter
