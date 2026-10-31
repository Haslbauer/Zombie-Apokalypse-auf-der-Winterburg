# Zombie-Apokalypse auf der Winterburg

Koop-Verteidigungsspiel im Browser. Vier Helden verteidigen die Winterburg (Haus und Vorgärten) gegen Zombiewellen – Schrägkamera von oben, WASD + Maus, Level, Gold, Shop und KI-Bots für freie Slots.

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

Bis zu vier Spieler, freie Plätze spielen Bots. Der Server rechnet das Spiel (samt Bots) und liefert es auch aus. Alles kostenlos.

### Mit Freunden spielen (vom eigenen Rechner)

```bash
npm run share
```

Baut das Spiel, startet den Server und öffnet einen kostenlosen Cloudflare-Tunnel. Angezeigt wird ein Link `https://….trycloudflare.com` – den an die Freunde schicken. HTTPS kommt von Cloudflare, am Router muss nichts eingestellt werden. Der Link gilt, solange das Fenster offen ist. Einmalig `cloudflared` installieren (Windows: `winget install --id Cloudflare.cloudflared`, macOS: `brew install cloudflared`); ohne zeigt `npm run share` die Adressen fürs eigene WLAN.

Im Spiel: Helden wählen, **„Online mit Freunden“**. Oben rechts stehen Raum-Code, Ping (ms) und **„Link kopieren“**. Wer den Link öffnet, übernimmt einen Bot-Platz samt Level, Gold und Items.

### Dauerhafter Link (Render, Gratis-Tarif)

Bei [render.com](https://render.com) mit GitHub anmelden, **New → Blueprint**, dieses Repo wählen – `render.yaml` erledigt den Rest (Region Frankfurt). Der Gratis-Dienst schläft nach rund 15 Minuten ohne Besucher; der erste Aufruf danach dauert etwa eine Minute, das Spiel zeigt dann „Server wacht auf …“ und versucht es weiter. Laufende Räume gehen beim Einschlafen verloren. (Stand der Anbieterbedingungen kann sich ändern.)

### Eigener Server (Docker)

```bash
docker build -t winterburg .
```

```bash
docker run -p 3000:3000 winterburg
```

Im Internet hinter HTTPS betreiben (z. B. Caddy oder ein Tunnel), denn Browser verlangen dort `wss://`. Einstellungen: `PORT` (3000), `HOST` (0.0.0.0), `MAX_ROOMS` (200). `/health` meldet Build, Räume und Spieler.

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
| Rechtsklick | Ping an alle: kurz = „Hier!“, halten und ziehen = Ping-Rad (oben Angriff, rechts Bin unterwegs, unten Hilfe, links Gefahr). Auch auf der Minimap. Bots folgen den Pings (siehe unten). |
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

Entwicklermodus: http://localhost:5173/?overview zeigt die ganze Karte von oben, `?level=6` startet auf Level 6, `?wave=5` mit Welle 5 (kombinierbar: `?wave=5&level=8`), `?bots=4` lässt vier Bots allein spielen (Zuschauen, optional `&difficulty=schwer`). `?camera=x,y,abstand` richtet die Kamera fest auf einen Punkt (z. B. `?bots=4&camera=37,22,30` fürs Haus), `?debug` gibt Testhilfen frei.

## Team und Bots

Du wählst deinen Helden, drei Bots spielen mit (je ein Nahkämpfer, Fernkämpfer und eine Kontrolle; per Klick tauschbar). Die Bot-Stärke (leicht, mittel, schwer) stellst du auf dem Startbildschirm ein. Links zeigt die Teamleiste Level, Leben und erlegte Bosse aller vier Helden; Bots haben einen blauen Ring.

**Bots folgen Pings:** „Angriff!“ schickt alle Bots auf das Ziel (auch Postbote und Lager), „Hilfe!“ holt sie zu dir, „Hier!“ schickt die zwei nächsten an den Ort, „Gefahr!“ lässt sie den Bereich meiden. Sie antworten mit „Bin unterwegs“. Kämpfst du gegen Postbote oder Lager, helfen Bots in der Nähe auch ohne Ping.

`npm run balance` lässt vier Bots ohne Spieler über mehrere Seeds spielen und gibt die erreichte Welle aus (Optionen: `BALANCE_SEEDS=5`, `BALANCE_DIFF=mittel`).

## Rollen

Jeder Held hat eine Rolle im Team. Ohne Tank, Schaden und Support ist das Spiel kaum zu gewinnen:

| Rolle | Helden | Wirkung |
|---|---|---|
| 🛡 Tank | Ragnar, Spike | nimmt 15 % weniger Schaden; Bosse und Elites in 8 m Nähe greifen ihn an statt der anderen |
| ⚔ Schaden | Grimm, Rauchbart | 30 % mehr Schaden an Bossen und Elites |
| ✚ Support | Hagedorn, Somnia | heilt Verbündete in 7 m Nähe ständig ein wenig und reinigt sie alle 3 s von **Seuche** |

**Seuche:** Bossfähigkeiten hinterlassen einen stapelbaren Schaden über Zeit, der nur abklingt, wenn sie eine Weile nicht mehr trifft. Ein Support in der Nähe (oder der Zauber Reinigen) entfernt sie.

Die Heldenwahl und die Lobby zeigen die Rolle jedes Helden und warnen, wenn eine Rolle fehlt. Bots füllen zuerst die fehlenden Rollen auf.

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

Wer **Welle 20** übersteht, gewinnt. Das Spiel ist auf vier aktive Spieler ausgelegt; fällt einer aus, wird es zu dritt sehr schwer.

Gutes Spielen wird belohnt (wie in LoL): Der letzte Treffer bringt das volle Gold, Mithelfen ein Drittel, Danebenstehen nichts. Erfahrung: Killer voll, Mithelfer die Hälfte, Zuschauer in der Nähe ein Viertel. Den Wellenbonus bekommt nur, wer in der Welle mitgekämpft hat.

**Speedrun:** Oben läuft die Spielzeit (⏱). Sobald alle Zombies einer Welle erledigt sind, startet N bzw. „Jetzt starten“ sofort die nächste Welle, statt die Pause abzuwarten. Nach einem Sieg zeigt die Endstatistik die Zeit und die Bestzeit; die Bestzeit wird im Browser gespeichert.

**Endstatistik:** Nach Sieg oder Niederlage erscheint eine Statistik, online für alle gleich:
- **Teamwerte:** Welle, Spielzeit, Zombies, Bosse, Postboten, Beete, Vorrat, Bienenstock.
- **Podest:** die besten drei nach Wertung, der Erste ist **MVP**.
- **Auszeichnungen:** Meiste Kills, Meiste Assists, Meistes Gold, Meister Schaden, Bollwerk (meister erlittener Schaden), Heiler, Längste Serie, Bossjäger.
- **Rangliste:** Kills, Tode, Assists, Bosse, Schaden, Erlitten, Heilung, Gold (verdient/ausgegeben), Level und Wertung. Ein Klick auf eine Spalte sortiert.
- **Diagramm:** Kills pro Welle je Held.

Die Wertung funktioniert wie in LoL: Kill 1 Punkt, Boss 5, Assist 0,6, je 400 Schaden 1, je 300 Heilung 1, je 800 eingesteckter Schaden 1, je Tod −1. Die Gewichte lassen sich in `data/economy.json` unter `rewards.mvp` anpassen.

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
3. M3: Level, XP, Skillpunkte, 6 Helden mit Fähigkeiten ✅
4. M4: Gold, Shop, Waffen und Items, Elite-Zombies ✅
5. M5: Bots (Singleplayer mit 3 Bots) ✅
6. M6: Server und Mehrspieler ✅
7. M7: Weitere Helden, Boss, Balancing, Feinschliff
