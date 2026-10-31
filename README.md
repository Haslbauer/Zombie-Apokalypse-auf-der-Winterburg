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

Dann http://localhost:5173 öffnen. Weitere Befehle: `npm test` (Simulationstests), `npm run typecheck`, `npm run build`, `npm run models` (3D-Modelle aus `assets/models/` umwandeln, siehe dortige README).

## Mehrspieler

Bis zu vier Spieler, freie Plätze spielen Bots. Der Server rechnet das Spiel (samt Bots) und liefert es auch aus.

```bash
npm run build
npm run server
```

Dann http://localhost:3000 öffnen, Helden wählen, **„Online mit Freunden“**. Oben rechts steht der Raum-Code mit **„Link kopieren“**. Wer den Link öffnet, übernimmt einen Bot-Platz samt Level, Gold und Items; wer geht, wird wieder durch einen Bot ersetzt. Leere Räume halten 5 Minuten (Rückkehr über denselben Link).

- **Im selben WLAN:** Die anderen öffnen `http://<IP-des-Rechners>:3000/?room=CODE` (IP z. B. mit `ipconfig` bzw. `ip addr`). Eventuell muss die Firewall Port 3000 erlauben.
- **Über das Internet, von zu Hause:** einen Tunnel starten, z. B. `cloudflared tunnel --url http://localhost:3000` oder `ngrok http 3000`, und dessen Adresse weitergeben.
- **Dauerhaft im Internet:** Docker-Image bauen und bei einem Anbieter (Fly.io, Render, Railway, eigener Server) starten:

```bash
docker build -t winterburg .
```

```bash
docker run -p 3000:3000 winterburg
```

Port über `PORT` (Standard 3000). Beim Entwickeln (`npm run dev`) leitet Vite den Mehrspieler an einen laufenden `npm run server` weiter.

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
| Esc | Pause und Tastenbelegung (alle Tasten frei belegbar) |

Die Markierung am Boden zeigt Reichweite und Trefferbereich der Waffe: einen Bogen beim Nahkampf, einen Pfeil beim Fernkampf.

## Karte

Die Winterburg: U-förmiges Haus mit dem **Lebensmittelvorrat** im Innenhof (nur über einen schmalen Durchgang erreichbar). Zombies kommen aus dem **Bunker**, durch die **Heckenlücke Süd**, den **Hang Ost** hinauf und aus dem **Nordwesten**. Zombies plündern den Vorrat, **Ratten** fressen die **Hochbeete** (deren Ernte füllt den Vorrat nach jeder Welle auf), **Hornissen** greifen den **Bienenstock** an. Ist der Vorrat leer, ist das Spiel verloren.

Entwicklermodus: http://localhost:5173/?overview zeigt die ganze Karte von oben, `?level=6` startet auf Level 6, `?wave=5` mit Welle 5 (kombinierbar: `?wave=5&level=8`), `?bots=4` lässt vier Bots allein spielen (Zuschauen, optional `&difficulty=schwer`).

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
6. M6: Server und Mehrspieler ✅ (Vorhersage der eigenen Bewegung folgt)
7. M7: Weitere Helden, Boss, Balancing, Feinschliff
