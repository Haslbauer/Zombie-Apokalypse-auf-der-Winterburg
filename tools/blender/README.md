# Modelle mit Blender (Python)

Die Skripte hier erzeugen 3D-Modelle für die Karte mit Blender als
Python-Paket (`bpy`), ganz ohne Blender-Oberfläche. Ergebnis ist eine
GLB-Datei in `public/models/`, die das Spiel nachlädt.

## Einrichten (einmalig)

`bpy` 5.2 braucht Python 3.13:

```bash
python3 -m venv .venv-blender
.venv-blender/bin/pip install bpy==5.2.3
```

## Modelle erzeugen

```bash
.venv-blender/bin/python tools/blender/garden.py public/models/garden.glb
```

Optional ein zweiter Ordner für Kontrollbilder (je Modell ein PNG):

```bash
.venv-blender/bin/python tools/blender/garden.py public/models/garden.glb vorschau/
```

Oder kurz: `npm run garden` (nutzt `.venv-blender`).

Häuser (dauert einige Minuten, weil die Texturen gerechnet werden):

```bash
npm run houses
```

## Was drin ist

- `common.py`: Bausteine (Kisten mit abgerundeten Kanten, Röhren, unregelmäßige
  Kugeln, Stamm und Äste über den Skin-Modifier), Muster (Holzmaserung,
  abgeplatzte Farbe, Rinde mit Moos, Laub), vorberechnete Umgebungsverdeckung
  (Ambient Occlusion, mit Cycles in die Vertex-Farben gerechnet) und Export.
- `houses.py`: die Häuser der Karte, die Ruine (`look: "ruin"`), die Hofmauern
  (schmale Haus-Rechtecke) und das Hoftor (`decor` mit `look: "gate"`), nach den Rechtecken in `data/map.json`
  (`look: "house"`, breiter als 1,2 m). Mauern aus Ziegeln mit Mörtelfugen,
  Sockel, Gesims und Fensterbänke aus Sandstein, Fenster und Türen sitzen
  wirklich in der Wand (Boolean), Fensterläden, Blumenkästen, vernagelte
  Fenster, Laterne neben der Tür, Dachziegel mit Moos, Firstziegel, Ortgang,
  Dachrinnen, Fallrohre und Schornstein mit Tonaufsätzen. Die Farben kommen
  aus Blenders Textur-Knoten (Brick, Noise) und werden mit der
  Umgebungsverdeckung in ein Bild je Haus gerechnet (Bake, 1024 bzw. 2048
  Pixel, JPEG). Ändert sich ein Haus in der Karte, das Skript neu laufen
  lassen; ohne passendes Modell zeigt das Spiel die Code-Häuser.
- `garden.py`: Bienenstock (`beehive`), drei Laubbäume (`oak_a`, `oak_b`,
  `oak_c`) und zwei Nadelbäume (`pine_a`, `pine_b`).

Im Spiel (`src/client/gardenmodels.ts`) wird der Bienenstock gegen die
einfache Form getauscht. Die gewöhnlichen Bäume ohne Art (`species`) werden
als InstancedMesh gezeichnet, eine Zeichnung je Baumform. Bis die Datei
geladen ist oder wenn sie fehlt, bleiben die alten Formen stehen.
