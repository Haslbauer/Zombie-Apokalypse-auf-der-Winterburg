# 3D-Modelle

Quelle: [Mixamo](https://www.mixamo.com) (Adobe). Figuren und Animationen von Mixamo dürfen laut Adobe lizenzfrei in eigenen Projekten und Spielen verwendet werden (nicht als Rohdateien weiterverkauft).

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

## zombie

| Clip | Datei | Verwendung |
|---|---|---|
| walk | walk.fbx | Walker, Brute, Schlächter |
| run | run.fbx | Runner |
| crawl | crawl.fbx | Kriecher |
| attack | attack.fbx | Zuschlagen (Walker, Brute, Schlächter) |
| bite | bite.fbx | Beißen (Runner, Kriecher) |

Ergebnis: ca. 1 MB, ca. 9.000 Dreiecke (Original ca. 18.000).

**Hinweis:** Die aktuellen Dateien nutzen Mixamos Standardfigur im schwarzen Motion-Capture-Anzug. Für einen echten Zombie-Look in Mixamo eine Zombie-Figur wählen (unter „Characters“), dieselben Animationen mit „With Skin“ herunterladen und die FBX-Dateien hier ersetzen, danach `npm run models`. Das Spiel färbt die Figur je Typ ein (`ZOMBIE_LOOKS` in `src/client/units.ts`); bei einer neuen Figur sollten die Farbwerte (`tint`) auf 1 zurückgesetzt werden.
