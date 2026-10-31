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

### Was der Netzcode tut

- **Eigene Bewegung ohne Verzögerung:** Der Client sagt die eigene Bewegung voraus und gleicht sie mit dem Server ab (getestet mit 300 ms Laufzeit: Der Held läuft sofort los, am Ende stimmen Bild und Server auf den Zentimeter).
- **Gleichmäßige Bewegung der anderen:** Zustände 20× pro Sekunde, Darstellung 100 ms im Puffer gegen Netzschwankungen.
- **Nichts geht verloren:** Ereignisse (Treffer, Gold, Pings …) werden gesammelt und auch bei voller Leitung nachgeliefert.
- **Verbindungsabbruch:** Ein Bot springt ein, der Platz bleibt 2 Minuten reserviert, der Client verbindet sich selbst neu und bekommt denselben Helden zurück – auch nach dem Neuladen der Seite.
- **Absicherung:** Nachrichten werden geprüft, begrenzt (Größe, Anzahl pro Sekunde), tote Verbindungen per Herzschlag erkannt. Nach einem Update meldet die alte Seite „Neue Version – bitte neu laden“.
- **Klein:** Komprimierte Zustände (rund 3 KB/s pro Spieler zu Beginn), das Spiel selbst wird vorkomprimiert ausgeliefert (JavaScript 845 KB → 187 KB).

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
| B | Shop (nur in der Pause im Innenhof) |
| N | Welle sofort starten (in der Pause) |
| Rechtsklick | Ping an alle: kurz = „Hier!“, halten und ziehen = Ping-Rad (oben Angriff, rechts Bin unterwegs, unten Hilfe, links Gefahr). Auch auf der Minimap. |
| Mausrad | Kamera heran- bzw. herauszoomen |
| Esc | Pause und Tastenbelegung (alle Tasten frei belegbar); online läuft das Spiel weiter |

Die Markierung am Boden zeigt Reichweite und Trefferbereich der Waffe: einen Bogen beim Nahkampf, einen Pfeil beim Fernkampf.

## Karte

Die Winterburg: U-förmiges Haus mit dem **Lebensmittelvorrat** im Innenhof (nur über einen schmalen Durchgang erreichbar). Zombies kommen aus dem **Bunker**, durch die **Heckenlücke Süd**, den **Hang Ost** hinauf und aus dem **Nordwesten**. Zombies plündern den Vorrat, **Ratten** fressen die **Hochbeete** (deren Ernte füllt den Vorrat nach jeder Welle auf), **Hornissen** greifen den **Bienenstock** an. Ist der Vorrat leer, ist das Spiel verloren.

Rund um den Garten liegt Gelände mit Büschen, Hecken, einer alten Grabstätte und einem Teich. **Verstecke** wie das Gebüsch in LoL: Im hohen Gras, in Büschen und im Schilf sehen Zombies einen Helden erst aus nächster Nähe – bis er angreift. Umgekehrt sieht man Zombies im Gebüsch erst, wenn man selbst nah dran ist.

Entwicklermodus: http://localhost:5173/?overview zeigt die ganze Karte von oben, `?level=6` startet auf Level 6, `?wave=5` mit Welle 5 (kombinierbar: `?wave=5&level=8`), `?bots=4` lässt vier Bots allein spielen (Zuschauen, optional `&difficulty=schwer`). `?camera=x,y,abstand` richtet die Kamera fest auf einen Punkt (z. B. `?bots=4&camera=37,22,30` fürs Haus), `?debug` gibt Testhilfen frei.

## Team und Bots

Du wählst deinen Helden, drei Bots spielen mit (je ein Nahkämpfer, Fernkämpfer und eine Kontrolle; per Klick tauschbar). Die Bot-Stärke (leicht, mittel, schwer) stellst du auf dem Startbildschirm ein. Links zeigt die Teamleiste Level und Leben aller vier Helden; Bots haben einen blauen Ring.

`npm run balance` lässt vier Bots ohne Spieler über mehrere Seeds spielen und gibt die erreichte Welle aus (Optionen: `BALANCE_SEEDS=5`, `BALANCE_DIFF=mittel`).

## Gegner

Walker, Runner, Brute, Kriecher (hält fest), Ratten in Rudeln (fressen Beete), Hornissen-Schwärme (greifen den Bienenstock an) und alle 5 Wellen Elites: Rattenkönig (ruft Ratten) und Schlächter (Anlauf, betäubt). Details in `docs/SPEC.md` (Abschnitt 7).

## Shop

Gold gibt es für Kills und jede überstandene Welle. In der Pause im Innenhof öffnet **B** den Shop: Waffen (wirken als Werte-Items), Rüstung, Werte-Items und Verbrauchsgüter für R/T. Rechtsklick auf ein Item im Inventar verkauft es (70 %).

## Helden

| Held | Rolle | Fähigkeiten (1–4) |
|---|---|---|
| Grimm (Hund) | Nahkampf-Jäger | Sprungbiss, Fährte, Heulen, Hetzjagd |
| Hagedorn (Gärtnerin) | Fernkampf, ausdauernd | Schleuderschuss, Saat, Kräutertee, Mein Garten! |
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
