# 3D-Modelle

Quellen:
- [Mixamo](https://www.mixamo.com) (Adobe): die fünf Menschen-Helden, alle menschlichen Zombies und ihre Animationen. Figuren und Animationen von Mixamo dürfen laut Adobe lizenzfrei in eigenen Projekten und Spielen verwendet werden (nicht als Rohdateien weiterverkauft).
- [Quaternius](https://quaternius.com), Lizenz CC0 (gemeinfrei): Schäferhund (`grimm`, aus dem Zombie Apocalypse Kit), Ratte (`rat`), Wespe (`wasp`), Spinne (`spider`) und Frosch (`frog`, als Riesen-Zombiekröte), aus den Animated Animals. Die Schlange (`snake`) aus derselben Reihe liegt für später bereit, ist aber nicht im Spiel. Die vier Quaternius-Zombies (`zombie-basic`, `zombie-arm`, `zombie-ribcage`, `zombie-chubby`) sind seit v1.7 nicht mehr im Spiel; ihre Quellen bleiben, `model.json` heißt dort `model.json.unused`.

## Aufbau

```
assets/models/<name>/
  *.fbx        Originale aus Mixamo (FBX Binary, "With Skin", 30 fps)
  model.json   Welche Datei Figur/Textur liefert, welcher Clip aus welcher Datei kommt
```

`npm run models` wandelt jedes Modell in eine kompakte GLB für das Spiel um (`public/models/<name>.glb`):

1. Chromium (Playwright) lädt die FBX mit dem FBXLoader aus Three.js, hängt alle Animationen als Clips an, entfernt die Vorwärtsbewegung der Hüfte (`inPlace`) und verkleinert die Textur.
2. glTF-Transform entfernt doppelte Daten, vereinfacht das Netz (`simplifyRatio`) und dünnt Keyframes aus.

Voraussetzung lokal: `npx playwright install chromium`.

Neben FBX gehen auch glTF-Dateien. Enthält eine Datei mehrere Animationen (Quaternius), wählt `"clip": "Run"` eine davon aus; ohne `file` gilt die Figur-Datei (`base`). `simplifyRatio: 1` lässt Low-Poly-Netze unverändert. Ein Clip kann mehrfach dieselbe Datei nutzen. `idleFrom` erzeugt den Clip `idle` aus dem ersten Bild einer Datei. Pfade wie `../shared/pill.fbx` verweisen auf gemeinsame Animationen.

## Figuren (v1.7)

Jede Figur hat einen Ordner mit `figur.fbx` (Mixamo-Figur samt Texturen) und `model.json`. Die Animationen stammen aus den bestehenden Ordnern: Mixamo-Animationen passen auf jede Mixamo-Figur. Beim Umwandeln gleicht `scripts/convert-models.mjs` die Knochennamen an, übernimmt nur Drehungen (plus die Hüfthöhe, auf die Beinlänge umgerechnet) und behält nur Farb- und (bei Helden) Normalen-Textur.

| Ordner | Figur | Spiel |
|---|---|---|
| rotschopf | Brute | Ragnar (mit Kriegshammer) |
| pirat | Pirate (P. Konstantinov) | Rauchbart (mit Enterhaken) |
| gaertnerin | Erika Archer (mit Bogen) | Hagedorn |
| schlaeferin | Arissa | Somnia (mit Kristallstab) |
| libero | Kachujin | Spike |
| zombie-cop | Copzombie | Walker (2 von 3) |
| zombie-girl | Zombiegirl | Walker (1 von 3), Kriecher |
| zombie-parasite, zombie-skeleton | Parasite, Skeletonzombie | Runner |
| zombie-war | Warzombie | Postbote (mit Mütze und Paket) |
| zombie-pumpkin | Pumpkinhulk | Brute, 1,5-fach |
| zombie-warrok | Warrok | Schlächter, 1,9-fach, Hackbeil |
| zombie-demon | Demon | Dämon, 1,35-fach |

Schwere Gegner (Elites) tragen einen leuchtenden Ring in ihrer Farbe, glühende Augen und ein Namensschild (`ELITE_COLORS` in `src/client/units.ts`). Helden bekommen ein Randlicht in ihrer Heldenfarbe, damit sie bei Nacht gut zu sehen sind.

## zombie (nur Animationen)

Der Ordner liefert die Zombie-Animationen für alle Zombie-Figuren (eine eigene GLB entsteht nicht mehr).

| Clip | Datei | Verwendung |
|---|---|---|
| walk | walk.fbx | Walker, Brute, Schlächter, Postbote, Dämon |
| run, run2 | running.fbx, run.fbx | Runner, Postbote und Dämon (schnell) |
| crawl, crawlFast | crawl.fbx, crawl-fast.fbx | Kriecher |
| idle | idle.fbx | Stehen (am Ziel, betäubt) |
| attack | attack.fbx | Zuschlagen |
| bite, bite2, bite3 | bite.fbx, neck-bite.fbx, biting2.fbx | Beißen, zufällige Variante |
| death, death2 | death.fbx, dying.fbx | Sterben; die Leiche bleibt 2,5 s liegen und versinkt |
| scream | scream.fbx | Elite-Auftritt, Ausholen des Schlächters, Sprung des Dämons |

## Helden

Alle fünf Menschen-Helden haben einen eigenen Ordner, damit jeder später eine eigene Figur bekommen kann. Gemeinsam: `use` (shared/pill.fbx, Trank benutzen) und `down` (shared/laying.fbx, gefallen bis zum Respawn). Linksklick spielt `attack` im Angriffstakt, die Fähigkeiten 1–4 spielen `ability1`–`ability4` (bei `ability3b` zufällig eine von beiden).

| Held | run | idle | attack | ability1 | ability2 | ability3 | ability4 |
|---|---|---|---|---|---|---|---|
| rotschopf | run | 1. Bild slash | slash | turn180 | casting | jump-attack / mutant-jump | flex |
| schlaeferin | sprint | 1. Bild cast-spell | magic-1h-03, magic-1h-02, cast-spell | magic-1h-02 | yawn | laying (hält, solange Powernap läuft) | magic-2h-01 |
| libero | running | 1. Bild goalie-throw | goalie-throw | pass | scoop | pass | throw-in |
| pirat | running | shared/pistol-idle | throw-grenade | shared/toss-grenade | grenade-throw | jumping | grenade-throw |
| gaertnerin | run | shared/pistol-idle | draw-arrow | firing-rifle | shared/toss-grenade | drinking | melee-down |

Die Animationsdateien stammen noch vom Mixamo-Mocap-Anzug; die Figur selbst kommt aus `figur.fbx` (siehe oben). Für eine andere Figur genügt es, `figur.fbx` zu ersetzen und `npm run models <ordner>` aufzurufen.

## grimm, rat, wasp (Quaternius)

| Modell | Clips | Verwendung |
|---|---|---|
| grimm (german-shepherd.gltf) | run, walk, idle, attack, ability1 Run_Jump, ability2 Idle_2_HeadLow, ability3 Idle_2, ability4 Attack, use Eating, death | Grimm; stirbt mit `death` und bleibt bis zum Respawn liegen |
| rat (rat.fbx) | run, walk, idle, attack, attack2 (Sprung), death | Ratte, Rattenkönig (3-fach, mit Krone am Knochen `Head`) |
| wasp (wasp.fbx) | fly, attack, death | Hornisse (schwebt 0,9 m über dem Boden) |
| snake (snake.fbx) | walk, idle, attack, attack2 (Sprung); **keine Todesanimation** | **Abgelegt für später, nicht im Spiel.** Quaternius (CC0). `model.json.unused` in `model.json` umbenennen und `npm run models snake` aufrufen, um sie zu verwenden |

Ergebnis: je Modell ca. 1–3,5 MB (Ragnar mit mehreren Texturen am größten), 4.000–16.000 Dreiecke. Die Originale in `assets/models/` sind zusammen gut 400 MB groß.
