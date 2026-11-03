# Deko-Modelle (Props)

Unbewegte 3D-Modelle, die als Deko auf der Karte stehen (`props` in `data/map.json`, ohne Kollision).

## Quelle und Lizenz

Alle Modelle stammen von [Quaternius](https://quaternius.com) und stehen unter **CC0 1.0** (gemeinfrei, https://creativecommons.org/publicdomain/zero/1.0/). Namensnennung ist nicht nötig, aber gern gesehen.

| Datei | Paket | Look im Spiel |
|---|---|---|
| Barrel.fbx | Medieval Village Pack (Dez. 2020) | `oakbarrel` (Holzfass) |
| Crate.fbx | Medieval Village Pack | `woodcrate` (Holzkiste) |
| Cart.fbx | Medieval Village Pack | `handcart` (Marktkarren) |
| Fence.fbx | Medieval Village Pack | `picketfence` (Zaunfeld) |
| Bags.fbx | Medieval Village Pack | `grainsacks` (Kornsäcke) |
| Axe.fbx | Survival Pack (Sept. 2020) | `axe` (Axt; mit `h` im Baumstumpf, sonst liegend) |
| Shovel.fbx | Survival Pack | `shovel` (Schaufel, in die Erde gesteckt) |

## Umwandeln

`assets/props/props.json` legt je Modell Datei und Zielgröße fest. `npm run props` (Playwright/Chromium wie bei `npm run models`) erzeugt daraus `public/models/props.glb`: ein Knoten je Look, Unterseite auf y = 0, Größe in Metern, ein Mesh je Material. Der Client (`src/client/propmodels.ts`) lädt die Datei nach dem Kartenaufbau und fasst alle Exemplare je Material zu einem Mesh zusammen.

Neues Modell: FBX hierher legen, Eintrag in `props.json`, Look in `PROP_LOOKS` (`src/sim/types.ts`) und `MODEL_PROPS` (`src/client/propmodels.ts`) ergänzen, `npm run props`, dann in `data/map.json` platzieren.
