"""
Garten-Modelle für die Karte, erzeugt mit Blender (Python-Paket bpy):
  beehive         zwei Bienenbeuten auf einem Bock aus Ziegeln und Balken
  oak_a/b/c       Laubbäume (Stamm und Äste mit Skin-Modifier, Laubballen)
  pine_a/b        Nadelbäume (gestufte, gezackte Etagen)

Aufruf (siehe README im selben Ordner):
  python tools/blender/garden.py public/models/garden.glb [Vorschau-Ordner]

Alle Modelle stehen mit der Unterseite auf dem Boden, Mitte im Ursprung,
Maße in Metern. Farben stecken in den Ecken (Grundfarbe × Muster ×
vorberechnete Umgebungsverdeckung), es gibt keine Texturen.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402,F401  (stellt auch mathutils bereit)
from mathutils import Quaternion, Vector  # noqa: E402

import common as C  # noqa: E402


# ---------------------------------------------------------------- Bienenstock

def beehive():
    parts = []
    brick = C.material('brick', 0x8a4a38, C.speckle(0.12, 25))
    beam = C.material('beam', 0x5e4128, C.wood_grain('x'))
    board = C.material('board', 0x7a5a3a, C.wood_grain('x'))
    tin = C.material('tin', 0x9aa1a8, C.speckle(0.07, 18))
    slot = C.material('slot', 0x0c0a08)
    stone = C.material('stone', 0x8c8a84, C.speckle(0.15, 9))
    cleat = C.material('cleat', 0x6a4a2c, C.wood_grain('x'))

    # Bock: je Ecke drei Ziegel (gekreuzt gestapelt), darauf zwei Balken
    for x in (-0.9, 0.9):
        for y in (-0.33, 0.33):
            for k in range(3):
                rz = 0 if k % 2 == 0 else math.pi / 2
                parts.append(C.box('brick', (0.24, 0.115, 0.07), (x, y, 0.035 + k * 0.072), brick, bevel=0.008, step=0.12, rot=(0, 0, rz + (k - 1) * 0.06)))
    for y in (-0.33, 0.33):
        parts.append(C.box('beam', (2.35, 0.1, 0.09), (0, y, 0.26), beam, bevel=0.01, step=0.1))

    def hive(x, colors, topper):
        z = 0.305
        # Boden mit Flugbrett vorne
        parts.append(C.box('floor', (0.66, 0.7, 0.05), (x, 0.0, z + 0.025), board, bevel=0.008, step=0.1))
        land = C.box('landing', (0.5, 0.22, 0.022), (x, -0.43, z + 0.012), board, bevel=0.006, step=0.08, rot=(math.radians(-14), 0, 0))
        parts.append(land)
        z += 0.05
        for i, col in enumerate(colors):
            paint = C.material(f'paint_{col:06x}', col, C.painted(0x8a6a45, 0.2 + 0.05 * (i % 2)))
            h = 0.27
            # Zarge aus zwei Brettern (Fuge dazwischen wird dunkel)
            for k in range(2):
                parts.append(C.box('super', (0.62, 0.62, h / 2 - 0.004), (x, 0, z + h / 4 + k * h / 2), paint, bevel=0.01, step=0.13))
            # Griffleisten links und rechts
            for s in (-1, 1):
                parts.append(C.box('cleat', (0.03, 0.2, 0.035), (x + s * 0.325, 0, z + h * 0.62), cleat, bevel=0.006, step=0.05))
            if i == 0:
                # Flugloch: dunkler Schlitz vorne unten
                parts.append(C.box('slot', (0.34, 0.03, 0.028), (x, -0.305, z + 0.018), slot, bevel=0.004, step=0.2))
            z += h + 0.004
        # Blechdeckel mit Überstand, leicht gewölbt
        parts.append(C.box('lid', (0.72, 0.72, 0.06), (x, 0, z + 0.03), tin, bevel=0.012, step=0.08))
        parts.append(C.box('lidtop', (0.6, 0.6, 0.025), (x, 0, z + 0.07), tin, bevel=0.01, step=0.08))
        z += 0.085
        if topper == 'stone':
            parts.append(C.blob('stone', 0.13, (x + 0.05, 0.04, z + 0.07), stone, seed=3, rough=0.3, subdiv=2, squash=0.6))
        else:
            parts.append(C.box('brick', (0.24, 0.115, 0.07), (x - 0.04, 0.02, z + 0.035), brick, bevel=0.008, step=0.12, rot=(0, 0, 0.4)))

    hive(-0.55, [0xf2e3b3, 0xe8c66a, 0xf2e3b3], 'stone')
    hive(0.55, [0x9ec4d8, 0xf0f0e8], 'brick')
    C.bake(parts)
    return C.finish('beehive', parts)


# ---------------------------------------------------------------- Laubbaum

def oak(name, seed, leaf=0x3f6b2a, leaf_top=0x8fb04a):
    R = C.rand(seed)
    verts, edges, radii = [], [], []
    tips = []

    def add(p, r, parent):
        verts.append(p.copy())
        radii.append(r)
        i = len(verts) - 1
        if parent is not None:
            edges.append((parent, i))
        return i

    def turn(d, deg):
        axis = d.cross(Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1)))).normalized()
        return (Quaternion(axis, math.radians(deg)) @ d).normalized()

    # Stamm mit Wurzelanlauf
    root = add(Vector((0, 0, -0.2)), 0.46, None)
    base = add(Vector((0, 0, 0.12)), 0.36, root)
    for k in range(5):
        a = k * 2 * math.pi / 5 + R.uniform(-0.3, 0.3)
        add(Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, -0.32)), 0.1, base)
    p = Vector((0, 0, 0.12))
    d = Vector((R.uniform(-0.08, 0.08), R.uniform(-0.08, 0.08), 1)).normalized()
    parent = base
    height = 1.6 + R.random() * 0.4
    for k in range(4):
        d = (d + Vector((R.uniform(-0.1, 0.1), R.uniform(-0.1, 0.1), 0))).normalized()
        p = p + d * (height / 4)
        parent = add(p, 0.33 - 0.09 * (k + 1) / 4, parent)

    def branch(start, p, d, length, r, depth):
        idx = start
        for k in range(3):
            d = (d + Vector((R.uniform(-0.15, 0.15), R.uniform(-0.15, 0.15), 0.06))).normalized()
            p = p + d * (length / 3)
            r2 = r * (1 - 0.3 * (k + 1) / 3)
            idx = add(p, max(0.025, r2), idx)
            if k == 1 and depth <= 1:
                tips.append((p.copy(), d.copy(), 0.8))
        if depth == 0:
            tips.append((p.copy(), d.copy(), 1.0))
            return
        n = 2 if R.random() < 0.6 else 3
        for j in range(n):
            nd = turn(d, R.uniform(22, 42))
            nd.z = max(nd.z, 0.1)
            branch(idx, p, nd.normalized(), length * 0.7, r2 * 0.8, depth - 1)

    top = parent
    az0 = R.random() * math.tau
    for j in range(3):
        az = az0 + j * math.tau / 3 + R.uniform(-0.4, 0.4)
        el = math.radians(R.uniform(38, 55))
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        branch(top, p, d, 1.25 + R.random() * 0.3, 0.2, 2)

    bark = C.material(f'bark_{name}', 0x5d4a3a, bark_shader())
    trunk = C.skin_tree(f'{name}_trunk', verts, edges, radii, bark)
    parts = [trunk]

    # Laubballen an den Astspitzen (dichter Kern, ausfransender Rand)
    leaves = C.material(f'leaf_{name}', leaf, leaf_shader(leaf_top))
    R.shuffle(tips)
    for i, (tp, td, k) in enumerate(tips[:30]):
        # mehrere kleine Büschel je Spitze statt eines großen Ballens
        for j in range(2):
            r = (0.42 + R.random() * 0.22) * k
            off = Vector((R.uniform(-0.35, 0.35), R.uniform(-0.35, 0.35), R.uniform(-0.1, 0.25)))
            c = tp + td * 0.2 + off
            parts.append(C.blob('leaf', r, c, leaves, seed=seed * 10 + i * 2 + j, rough=0.45, subdiv=2, squash=0.8))
    # Kernballen füllen die Mitte der Krone
    cz = sum((t[0].z for t in tips), 0) / len(tips)
    for i in range(3):
        a = R.random() * math.tau
        parts.append(C.blob('leaf', 0.7 + R.random() * 0.2, Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, cz - 0.2 + i * 0.25)), leaves, seed=seed * 7 + i, rough=0.45, subdiv=2, squash=0.8))
    C.bake(parts)
    return C.finish(name, parts, ao_floor=0.3)


def bark_shader():
    from mathutils import noise
    moss = C.hexcol(0x4f6a2e)

    def f(p, n, c):
        # Längsrillen der Rinde, Moos an der Nordseite (+Y) unten am Stamm
        g = noise.noise(Vector((p.x * 9, p.y * 9, p.z * 1.2))) * 0.25 + noise.noise(p * 30) * 0.08
        out = C.jitter(c, g)
        m = max(0.0, n.y) * max(0.0, 1.2 - p.z) * (0.6 + noise.noise(p * 6) * 0.5)
        return C.mix(out, moss, m)
    return f


def leaf_shader(top_hex):
    from mathutils import noise
    top = C.hexcol(top_hex)

    def f(p, n, c):
        # Sonnenseite oben heller und gelblicher, dazu Blattflecken
        light = max(0.0, n.z) * 0.45 + max(0.0, p.z - 3.0) * 0.08
        out = C.mix(c, top, light)
        # großflächig wechselnde Grüntöne, dazu Blattflecken
        out = C.mix(out, C.hexcol(0x6a7a2a), max(0.0, noise.noise(p * 0.9 + Vector((5, 1, 2)))) * 0.5)
        return C.jitter(out, noise.noise(p * 11) * 0.14 + noise.noise(p * 37) * 0.07)
    return f


# ---------------------------------------------------------------- Nadelbaum

def pine(name, seed, needle=0x2b5232, tip=0x4f7a45):
    import bmesh
    from mathutils import noise
    R = C.rand(seed)
    bark = C.material(f'bark_{name}', 0x4a3a2c, bark_shader())
    trunk = C.skin_tree(f'{name}_trunk', [Vector((0, 0, -0.2)), Vector((0, 0, 1.2)), Vector((0, 0, 3.4)), Vector((0, 0, 5.6))],
                        [(0, 1), (1, 2), (2, 3)], [0.2, 0.16, 0.09, 0.03], bark)
    parts = [trunk]
    tipc = C.hexcol(tip)

    def needles(p, n, c):
        rim = max(0.0, min(1.0, (math.hypot(p.x, p.y) - 0.3) / 1.6))
        out = C.mix(c, tipc, rim * 0.6 + max(0.0, n.z) * 0.2)
        return C.jitter(out, noise.noise(p * 14) * 0.12)
    mat = C.material(f'needle_{name}', needle, needles)
    tiers = 7
    for i in range(tiers):
        z = 0.85 + i * 0.66
        r = 1.85 * (1 - i / (tiers + 0.6)) + 0.2
        h = 1.15 - i * 0.04
        bm = bmesh.new()
        segs = 18
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=0.0, depth=h)
        side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-4]
        bmesh.ops.subdivide_edges(bm, edges=side, cuts=3)
        bot = min(v.co.z for v in bm.verts)
        rot = R.random() * math.tau
        for v in bm.verts:
            rr = math.hypot(v.co.x, v.co.y)
            if rr < 1e-4:
                continue
            a = math.atan2(v.co.y, v.co.x) + rot
            # gezackter Rand: abwechselnd lange und kurze Zweige, hängende Spitzen
            t = rr / r
            jag = 1 + 0.18 * math.cos(a * segs / 2) * t + noise.noise(Vector((v.co.x, v.co.y, z)) * 1.7) * 0.12 * t
            v.co.x *= jag
            v.co.y *= jag
            if abs(v.co.z - bot) < 1e-4:
                v.co.z += 0.18 * (1 - t) - 0.12 * t
        ob = C.link(f'tier{i}', bm, mat, smooth_angle=0)
        ob.location = (R.uniform(-0.04, 0.04), R.uniform(-0.04, 0.04), z + h / 2)
        parts.append(ob)
    C.bake(parts)
    return C.finish(name, parts, ao_floor=0.3)


# ---------------------------------------------------------------- Ablauf

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/models/garden.glb'
    prev = sys.argv[2] if len(sys.argv) > 2 else None
    C.reset()
    built = [
        beehive(),
        oak('oak_a', 11, 0x3f6b2a, 0x8fb04a),
        oak('oak_b', 23, 0x4a7a30, 0xa5bf55),
        oak('oak_c', 37, 0x365f2c, 0x7ea048),
        pine('pine_a', 5),
        pine('pine_b', 9, 0x264a30, 0x46704a),
    ]
    if prev:
        os.makedirs(prev, exist_ok=True)
        for ob in built:
            C.preview([ob], os.path.join(prev, ob.name + '.png'))
    # nebeneinander? Nein: alle im Ursprung, das Spiel holt sie per Name
    C.export(os.path.abspath(out))
    for ob in built:
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print(f'{ob.name}: {tris} Dreiecke')


if __name__ == '__main__':
    main()
