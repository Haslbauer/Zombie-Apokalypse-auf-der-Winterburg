# 3D-Modelle

Quellen:
- [Mixamo](https://www.mixamo.com) (Adobe): Zombie und die fünf Menschen-Helden. Figuren und Animationen von Mixamo dürfen laut Adobe lizenzfrei in eigenen Projekten und Spielen verwendet werden (nicht als Rohdateien weiterverkauft).
- [Quaternius](https://quaternius.com), Lizenz CC0 (gemeinfrei): vier Zombies (`zombie-basic`, `zombie-arm`, `zombie-ribcage`, `zombie-chubby`), Schäferhund (`grimm`, aus dem Zombie Apocalypse Kit), Ratte (`rat`), Wespe (`wasp`), Spinne (`spider`) und Frosch (`frog`, als Riesen-Zombiekröte), aus den Animated Animals.

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

## zombie (Mixamo, nicht mehr im Spiel)

Die Mixamo-Zombies wurden durch die Quaternius-Zombies ersetzt. Dateien und GLB bleiben als Vorlage erhalten, das Spiel lädt sie nicht mehr.


| Clip | Datei | Verwendung |
|---|---|---|
| walk | walk.fbx | Walker, Brute, Schlächter |
| run, run2 | running.fbx, run.fbx | Runner |
| crawl, crawlFast | crawl.fbx, crawl-fast.fbx | Kriecher (schnell ab 1,2 m/s) |
| idle | idle.fbx | Stehen (am Ziel, betäubt) |
| attack | attack.fbx | Zuschlagen (Walker, Brute, Schlächter) |
| bite, bite2, bite3 | bite.fbx, neck-bite.fbx, biting2.fbx | Beißen, zufällige Variante (Runner, Kriecher) |
| death, death2 | death.fbx, dying.fbx | Sterben; die Leiche bleibt 2,5 s liegen und versinkt |
| scream | scream.fbx | Elite-Auftritt, Ausholen des Schlächters |

## Helden

Alle fünf Menschen-Helden haben einen eigenen Ordner, damit jeder später eine eigene Figur bekommen kann. Gemeinsam: `use` (shared/pill.fbx, Trank benutzen) und `down` (shared/laying.fbx, gefallen bis zum Respawn). Linksklick spielt `attack` im Angriffstakt, die Fähigkeiten 1–4 spielen `ability1`–`ability4` (bei `ability3b` zufällig eine von beiden).

| Held | run | idle | attack | ability1 | ability2 | ability3 | ability4 |
|---|---|---|---|---|---|---|---|
| rotschopf | run | 1. Bild slash | slash | turn180 | casting | jump-attack / mutant-jump | flex |
| schlaeferin | sprint | 1. Bild cast-spell | magic-1h-03, magic-1h-02, cast-spell | magic-1h-02 | yawn | laying (hält, solange Powernap läuft) | magic-2h-01 |
| libero | running | 1. Bild goalie-throw | goalie-throw | pass | scoop | pass | throw-in |
| pirat | running | shared/pistol-idle | throw-grenade | shared/toss-grenade | grenade-throw | jumping | grenade-throw |
| gaertnerin | run | shared/pistol-idle | draw-arrow | firing-rifle | shared/toss-grenade | drinking | melee-down |

Die Helden tragen noch Mixamos Mocap-Anzug. Das Spiel ersetzt die Textur durch die Heldenfarbe (`paint` in `HERO_LOOKS`, `src/client/units.ts`) und hängt Requisiten an Hand und Kopf (Hammer, Stab, Enterhaken, Schleuder, Hüte). Für eine eigene Figur in Mixamo die Figur wählen, dieselben Animationen „With Skin“ laden, die FBX im Ordner ersetzen, `paint` entfernen, `npm run models`.

## Zombies (Quaternius)

Alle vier haben dieselben Clip-Namen: walk, run, idle, crawl (nicht Arm), attack, attack2, death, hit, scream. Requisiten hängen am Unterarm (`LowerArmR`, die Figuren haben keinen Handknochen) bzw. am Kopf (`Head`).

| Modell | Spiel |
|---|---|
| zombie-basic | Walker (2 von 3), Kriecher (Crawl), Postbote (Mütze, Paket) |
| zombie-ribcage | Walker (1 von 3) |
| zombie-arm | Runner (einarmig, rennt mit vorgestrecktem Arm) |
| zombie-chubby | Brute (1,25-fach), Schlächter (1,45-fach, rötlich, Hackbeil) |

## grimm, rat, wasp (Quaternius)

| Modell | Clips | Verwendung |
|---|---|---|
| grimm (german-shepherd.gltf) | run, walk, idle, attack, ability1 Run_Jump, ability2 Idle_2_HeadLow, ability3 Idle_2, ability4 Attack, use Eating, death | Grimm; stirbt mit `death` und bleibt bis zum Respawn liegen |
| rat (rat.fbx) | run, walk, idle, attack, attack2 (Sprung), death | Ratte, Rattenkönig (2,6-fach, mit Krone am Knochen `Head`) |
| wasp (wasp.fbx) | fly, attack, death | Hornisse (schwebt 0,9 m über dem Boden) |

Ergebnis: je Modell ca. 1–1,4 MB, ca. 9.000 Dreiecke. Die Originale in `assets/models/` sind zusammen gut 200 MB groß.

**Hinweis Zombie:** Auch der Zombie nutzt die Standardfigur. Für einen echten Zombie-Look in Mixamo eine Zombie-Figur wählen, dieselben Animationen mit „With Skin“ herunterladen und die FBX-Dateien ersetzen, danach `npm run models`. Bei einer neuen Figur die Farbwerte (`tint` in `ZOMBIE_LOOKS`) auf 1 zurücksetzen.
