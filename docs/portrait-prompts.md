# Bild-Prompts für die fehlenden Heldenporträts

Die sechs ursprünglichen Helden (Grimm, Hagedorn, Rauchbarth, Spike, Ragnar, Somnia) haben gemalte Porträts. Die acht neueren Helden haben bisher nur Bilder, die aus ihren 3D-Modellen gerendert sind. Mit diesen Prompts entstehen gemalte Porträts im gleichen Stil.

## So gehst du vor

1. Den **Stil-Block** und den **Helden-Prompt** zusammen in den Bildgenerator geben, zum Beispiel Midjourney, DALL·E, Stable Diffusion, Leonardo oder Ideogram. Die Prompts sind auf Englisch, weil die meisten Generatoren damit verlässlicher arbeiten.
2. Format **Hochformat 3:4**, zum Beispiel 768 × 1024; bei Midjourney `--ar 3:4`.
3. Das Bild auf **240 × 320 Pixel** verkleinern, als JPG speichern und unter dem angegebenen Dateinamen in `public/portraits/` ablegen, zum Beispiel `public/portraits/imker.jpg`. Oder schick mir die Bilder; dann schneide ich sie zu und baue sie ein.

## Stil-Block (vor jeden Helden-Prompt setzen)

```
Digital fantasy character portrait, painterly semi-realistic style like a card game hero illustration,
three-quarter view, full upper body down to the knees, character centered and filling the frame,
dramatic dynamic pose holding the signature item,
dark misty night forest background with deep green tones, soft volumetric light, floating fireflies and glowing particles,
rich detail, sharp focus on the character, cinematic rim lighting, vibrant but slightly desaturated colors,
portrait orientation 3:4
```

**Negative prompt** (falls der Generator das unterstützt):
```
text, letters, watermark, logo, signature, frame, border, blurry, extra limbs, extra fingers, deformed hands,
cropped head, modern clothing, sci-fi, gore, photo, 3d render, plastic look
```

---

## 1. Imker – `imker.jpg` (Support)

```
An old beekeeper in a light beige protective beekeeping suit and a wide-brimmed beekeeper hat with a dark mesh veil
partly lifted so his kind wrinkled face and white beard are visible, holding a tin bee smoker that puffs soft white smoke,
a glowing swarm of golden honeybees circling around him like a protective aura, a few honeycomb drops shimmering,
calm but determined expression
```

## 2. Aurelius – `goldschmied.jpg` (Schaden, Goldschmied)

```
An elderly goldsmith with round brass spectacles and a neat grey beard, wearing a brown leather apron over a dark work shirt,
a jeweler's loupe hanging from his belt, tossing a shining gold nugget from one hand while the other hand holds a small
soldering torch with a blue-orange flame, gold dust and sparkling coins flying around him, confident sly smile
```

## 3. Lotte – `lotte.jpg` (Schaden, Beschwörerin)

```
A brave little girl of about eight years in a bright yellow raincoat with the hood down, two brown pigtails with red ribbons,
holding a wooden slingshot ready to shoot, a worn teddy bear tucked under her other arm,
behind her in the mist the silhouettes of two friendly but huge mossy green forest trolls protecting her,
determined fearless expression, slightly whimsical fairy-tale mood
```

## 4. Kapitän Tiefe – `taucher.jpg` (Tank, Taucher)

```
A massive deep-sea diver in a heavy dark green canvas diving suit with brass fittings and leaden boots,
a big round antique brass diving helmet with a glowing round porthole window, an oxygen tank on his back with hoses,
holding a long harpoon gun with a barbed steel tip, water dripping from the suit, bubbles rising around him,
imposing protective stance like a guardian
```

## 5. Hedwig – `gloecknerin.jpg` (Support, Glöcknerin)

```
An old bell-ringer woman from a castle chapel, wearing a long violet robe, a white linen bonnet and a dark woolen shawl,
ringing a polished brass hand bell that sends visible golden-violet sound waves through the air,
soft healing light and a shimmering protective dome of light around her, gentle but strong wise face with laugh lines
```

## 6. Bruno – `foerster.jpg` (Tank, Förster)

```
A burly bearded forester in a green wool jacket and leather trousers, a dark green felt hat with a pheasant feather,
holding a heavy lumberjack axe over his shoulder, thick roots breaking out of the ground at his feet,
a fallen tree trunk behind him, broad shoulders, stern protective expression, rugged outdoorsman
```

## 7. Kasimir – `schornsteinfeger.jpg` (Schaden, Schornsteinfeger)

```
A young agile chimney sweep in a black double-breasted suit with shiny brass buttons and a tall black top hat,
face lightly smudged with soot, a round chimney brush on a rope slung over his shoulder,
throwing a ball of black soot that explodes into a dark cloud, glowing orange sparks raining down from above,
a cheeky lucky grin, a small four-leaf clover pinned to his lapel as a lucky charm
```

## 8. Frieda – `baeckerin.jpg` (Schaden, Bäckerin)

```
A sturdy cheerful baker woman with rosy cheeks and a messy bun, wearing a tall white chef's hat, a flour-dusted white apron
over a simple peasant dress, swinging a wooden rolling pin like a club, a cloud of white flour swirling around her,
a large golden pretzel in her other hand ready to throw, warm glow as if from an oven behind her, fierce but friendly look
```

---

## Hinweise für ein einheitliches Bild

- Der Hintergrund sollte bei allen ein dunkler, nebliger Nachtwald sein, so wie bei den vorhandenen Porträts.
- Die Figur füllt das Bild vom Kopf bis etwa zu den Knien. Der Kopf darf oben nicht angeschnitten sein.
- Liefert der Generator unpassende Ergebnisse, hilft es, ein vorhandenes Porträt (zum Beispiel `public/portraits/schlaeferin.jpg`) als Stilvorlage mitzugeben, wenn der Generator Bildvorlagen unterstützt.
