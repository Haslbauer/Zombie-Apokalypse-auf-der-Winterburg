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
| 1 2 3 4 R T | Fähigkeiten (ab M3) |
| Esc | Pause und Tastenbelegung (alle Tasten frei belegbar) |

Die Markierung am Boden zeigt Reichweite und Trefferbereich der Waffe: einen Bogen beim Nahkampf, einen Pfeil beim Fernkampf.

## Aufbau

- `src/sim/` – Spiellogik, tickbasiert (20 Ticks/s), ohne Browser-Abhängigkeit. Läuft im Singleplayer im Browser, ab M6 auch auf dem Server.
- `src/client/` – Rendering (Three.js), Eingabe, HUD
- `data/` – Helden, Zombies, Wellen und Arena als JSON (Balancing ohne Codeänderung)
- `tests/sim/` – Tests für die Simulation (Vitest)

## Meilensteine

1. M1: Offline-Prototyp (Arena, ein Held, Zombiewellen, Nah- und Fernkampf) ✅
2. M2: Karte Winterburg mit Haus-Lebensbalken und drei Zugängen
3. M3: Level, XP, Skillpunkte, 5 Helden mit Q/W/E/R
4. M4: Gold, Shop, Waffen und Items, Elite-Zombies
5. M5: Bots (Singleplayer mit 3 Bots)
6. M6: Server und Mehrspieler
7. M7: Weitere Helden, Boss, Balancing, Feinschliff
