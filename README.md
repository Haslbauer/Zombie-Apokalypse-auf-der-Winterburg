# Zombie-Apokalypse auf der Winterburg

Koop-Verteidigungsspiel im Browser. Vier Helden verteidigen die Winterburg (Haus und Vorgärten) gegen Zombiewellen – Schrägkamera von oben, WASD + Maus, Level, Gold, Shop und KI-Bots für freie Slots.

- Spezifikation: [docs/SPEC.md](docs/SPEC.md)
- Referenzbilder (z. B. `hund.jpg` für Chupa, Satellitenbild der Karte): `assets/reference/`

## Starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev
```

Dann http://localhost:5173 öffnen. Weitere Befehle: `npm test` (Simulationstests), `npm run typecheck`, `npm run build`.

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
| Esc | Pause und Tastenbelegung (alle Tasten frei belegbar) |

Die Markierung am Boden zeigt Reichweite und Trefferbereich der Waffe: einen Bogen beim Nahkampf, einen Pfeil beim Fernkampf.

## Karte

Die Winterburg nach der Skizze in `assets/reference/karte-skizze.jpg`: U-förmiges Haus mit dem **Herz** im Innenhof (nur über einen schmalen Durchgang erreichbar), **Bienenstock** als zweites Ziel, Zombies aus dem **Bunker**, durch die **Heckenlücke Süd** und den **Hang Ost** hinauf. Fällt das Herz, ist das Spiel verloren.

Entwicklermodus: http://localhost:5173/?overview zeigt die ganze Karte von oben, `?level=6` startet auf Level 6, `?wave=5` mit Welle 5 (kombinierbar: `?wave=5&level=8`), `?bots=4` lässt vier Bots allein spielen (Zuschauen, optional `&difficulty=schwer`).

## Team und Bots

Du wählst deinen Helden, drei Bots spielen mit (je ein Nahkämpfer, Fernkämpfer und eine Kontrolle; per Klick tauschbar). Die Bot-Stärke (leicht, mittel, schwer) stellst du auf dem Startbildschirm ein. Links zeigt die Teamleiste Level und Leben aller vier Helden; Bots haben einen blauen Ring.

`npm run balance` lässt vier Bots ohne Spieler über mehrere Seeds spielen und gibt die erreichte Welle aus (Optionen: `BALANCE_SEEDS=5`, `BALANCE_DIFF=mittel`).

## Gegner

Walker, Runner, Brute, Kriecher (hält fest), Ratten in Rudeln und alle 5 Wellen Elites: Rattenkönig (ruft Ratten) und Schlächter (Anlauf, betäubt). Details in `docs/SPEC.md` (Abschnitt 7).

## Shop

Gold gibt es für Kills und jede überstandene Welle. In der Pause im Innenhof öffnet **B** den Shop: Waffen (wirken als Werte-Items), Rüstung, Werte-Items und Verbrauchsgüter für R/T. Rechtsklick auf ein Item im Inventar verkauft es (70 %).

## Helden

| Held | Rolle | Fähigkeiten (1–4) |
|---|---|---|
| Chupa | Nahkampf-Jäger | Sprungbiss, Fährte, Heulen, Hetzjagd |
| Gärtnerin | Fernkampf, ausdauernd | Schleuderschuss, Saat, Kräutertee, Mein Garten! |
| Pirat | Kontrolle | Qualmstoß, Rauchwolke, Nebelschritt, Dicke Luft |
| Libero | Fernkampf, Support | Aufschlag, Block, Zuspiel, Schmetterball |
| Rotschopf | Nahkampf, Berserker | Wuchtschlag, Wutanfall, Ungezielter Sprung, Amok |
| Schläferin | Kontrolle | Berührung, Gähnen, Powernap, Gute Nacht |

Details in `docs/SPEC.md` (Abschnitt 6), Werte in `data/heroes.json`.

## Aufbau

- `src/sim/` – Spiellogik, tickbasiert (20 Ticks/s), ohne Browser-Abhängigkeit. Läuft im Singleplayer im Browser, ab M6 auch auf dem Server.
- `src/client/` – Rendering (Three.js), Eingabe, HUD
- `data/` – Helden, Zombies, Wellen und Arena als JSON (Balancing ohne Codeänderung)
- `tests/sim/` – Tests für die Simulation (Vitest)

## Meilensteine

1. M1: Offline-Prototyp (Arena, ein Held, Zombiewellen, Nah- und Fernkampf) ✅
2. M2: Karte Winterburg mit Herz, Bienenstock und drei Zugängen ✅
3. M3: Level, XP, Skillpunkte, 6 Helden mit Fähigkeiten ✅
4. M4: Gold, Shop, Waffen und Items, Elite-Zombies ✅
5. M5: Bots (Singleplayer mit 3 Bots) ✅
6. M6: Server und Mehrspieler
7. M7: Weitere Helden, Boss, Balancing, Feinschliff
