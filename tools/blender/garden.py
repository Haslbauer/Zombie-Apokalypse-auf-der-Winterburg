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
    return broadleaf(name, seed, leaf=leaf, leaf_top=leaf_top)


def broadleaf(name, seed, leaf=0x3f6b2a, leaf_top=0x8fb04a, trunk_h=1.6, trunk_r=0.33, stems=1, stem_lean=0.0,
              branch_len=1.25, branch_r=0.2, depth=2, main=3, elev=(38, 55), clump=0.42, clumps=30, per_tip=2,
              core=3, core_r=0.7, squash=0.8, rough=0.45, bark=0x5d4a3a, extras=None, roots=True,
              leaf_subdiv=2, trunk_subdiv=1):
    """Laubbaum oder Strauch: Gerüst mit Skin-Modifier, Laubballen an den Spitzen.
    stems > 1: mehrere schräge Stämme (Olive, Feige, Holunder). extras(R, tips, parts): Früchte usw."""
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

    root = add(Vector((0, 0, -0.2)), trunk_r * 1.4, None)
    base = add(Vector((0, 0, 0.12)), trunk_r * 1.1, root)
    if roots:
        for k in range(5):
            a = k * 2 * math.pi / 5 + R.uniform(-0.3, 0.3)
            add(Vector((math.cos(a) * trunk_r * 1.8, math.sin(a) * trunk_r * 1.8, -0.32)), trunk_r * 0.3, base)

    def branch(start, p, d, length, r, depth):
        idx = start
        r2 = r
        for k in range(3):
            d = (d + Vector((R.uniform(-0.15, 0.15), R.uniform(-0.15, 0.15), 0.06))).normalized()
            p = p + d * (length / 3)
            r2 = r * (1 - 0.3 * (k + 1) / 3)
            idx = add(p, max(0.02, r2), idx)
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

    az0 = R.random() * math.tau
    for si in range(stems):
        p = Vector((0, 0, 0.12))
        if stems > 1:
            az = az0 + si * math.tau / stems + R.uniform(-0.3, 0.3)
            d = Vector((math.cos(az) * stem_lean, math.sin(az) * stem_lean, 1)).normalized()
        else:
            d = Vector((R.uniform(-0.08, 0.08), R.uniform(-0.08, 0.08), 1)).normalized()
        parent = base
        height = trunk_h * (1 + R.uniform(-0.1, 0.15))
        sr = trunk_r if stems == 1 else trunk_r * 0.6
        for k in range(4):
            d = (d + Vector((R.uniform(-0.1, 0.1), R.uniform(-0.1, 0.1), 0))).normalized()
            p = p + d * (height / 4)
            parent = add(p, sr * (1 - 0.27 * (k + 1) / 4), parent)
        for j in range(main if stems == 1 else 2):
            az = az0 + si * 1.3 + j * math.tau / main + R.uniform(-0.4, 0.4)
            el = math.radians(R.uniform(*elev))
            d2 = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
            branch(parent, p, d2, branch_len * (1 + R.uniform(0, 0.25)), branch_r if stems == 1 else branch_r * 0.7, depth)

    barkm = C.material(f'bark_{name}', bark, bark_shader())
    parts = [C.skin_tree(f'{name}_trunk', verts, edges, radii, barkm, subdiv=trunk_subdiv)]
    leaves = C.material(f'leaf_{name}', leaf, leaf_shader(leaf_top))
    R.shuffle(tips)
    for i, (tp, td, k) in enumerate(tips[:clumps]):
        for j in range(per_tip):
            r = (clump + R.random() * clump * 0.5) * k
            off = Vector((R.uniform(-0.35, 0.35), R.uniform(-0.35, 0.35), R.uniform(-0.1, 0.25))) * (clump / 0.42)
            parts.append(C.blob('leaf', r, tp + td * 0.2 + off, leaves, seed=seed * 10 + i * 2 + j, rough=rough, subdiv=leaf_subdiv, squash=squash))
    if tips and core:
        cz = sum((t[0].z for t in tips), 0) / len(tips)
        for i in range(core):
            a = R.random() * math.tau
            parts.append(C.blob('leaf', core_r + R.random() * core_r * 0.3, Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, cz - 0.2 + i * 0.25)), leaves, seed=seed * 7 + i, rough=rough, subdiv=leaf_subdiv, squash=squash))
    if extras:
        extras(R, tips, parts)
    C.bake(parts)
    return C.finish(name, parts, ao_floor=0.3)


def dots_on_crown(R, parts, leaf_objs_tips, n, radius, color, name, shape=None, spread=0.55):
    """Früchte/Beeren: kleine Kugeln am Rand der Laubballen (außen, leicht unten)."""
    mat = C.material(name, color, C.speckle(0.08, 40))
    for i in range(n):
        tp, td, k = leaf_objs_tips[i % len(leaf_objs_tips)]
        off = Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-0.8, 0.2))).normalized() * spread
        ob = C.blob('fruit', radius, tp + td * 0.2 + off, mat, seed=i, rough=0.05, subdiv=1)
        if shape:
            ob.scale = shape
        parts.append(ob)


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

def pine(name, seed, needle=0x2b5232, tip=0x4f7a45, scale=1.0, lod=False):
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
    tiers = 6 if lod else 7
    for i in range(tiers):
        z = 0.85 + i * 0.66
        r = 1.85 * (1 - i / (tiers + 0.6)) + 0.2
        h = 1.15 - i * 0.04
        bm = bmesh.new()
        segs = 11 if lod else 18
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=0.0, depth=h)
        side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-4]
        bmesh.ops.subdivide_edges(bm, edges=side, cuts=1 if lod else 3)
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
    ob = C.finish(name, parts, ao_floor=0.3)
    if scale != 1.0:
        ob.scale = (scale, scale, scale)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob


# ---------------------------------------------------------------- Baumarten

def species_trees():
    """Besondere Baumarten der Karte (species), je bei Bezugsradius RREF gebaut."""
    out = []

    def apples(R, tips, parts):
        dots_on_crown(R, parts, tips, 34, 0.075, 0xc8281e, 'apple_fruit')
        mat = C.material('apple_fruit', 0xc8281e)
        for i in range(5):
            parts.append(C.blob('fallen', 0.07, Vector((R.uniform(-1.6, 1.6), R.uniform(-1.6, 1.6), 0.06)), mat, seed=i, rough=0.05, subdiv=1))
    out.append(broadleaf('tree_apple', 101, leaf=0x355f26, leaf_top=0x7aae4a, trunk_h=1.3, trunk_r=0.24, branch_len=1.05,
                         branch_r=0.15, elev=(25, 45), clump=0.38, clumps=34, extras=apples, bark=0x5a4838))

    def pears(R, tips, parts):
        dots_on_crown(R, parts, tips, 28, 0.07, 0xd8c040, 'pear_fruit', shape=(0.85, 0.85, 1.3))
    out.append(broadleaf('tree_fruit', 113, leaf=0x3a6428, leaf_top=0x86b450, trunk_h=1.4, trunk_r=0.26, branch_len=1.15,
                         branch_r=0.16, elev=(35, 55), clump=0.4, clumps=34, extras=pears))

    def olives(R, tips, parts):
        dots_on_crown(R, parts, tips, 24, 0.035, 0x2a2a20, 'olive_fruit', shape=(0.8, 0.8, 1.2), spread=0.35)
    out.append(broadleaf('tree_olive', 127, leaf=0x4a6440, leaf_top=0x9aae78, trunk_h=1.1, trunk_r=0.16, stems=3, stem_lean=0.35,
                         branch_len=0.7, branch_r=0.07, depth=1, clump=0.3, clumps=24, per_tip=2, core=1, core_r=0.45,
                         rough=0.55, bark=0x6a6458, roots=False, extras=olives))

    def figs(R, tips, parts):
        dots_on_crown(R, parts, tips, 16, 0.06, 0x5a3050, 'fig_fruit', shape=(0.9, 0.9, 1.15))
    out.append(broadleaf('tree_fig', 131, leaf=0x2a5426, leaf_top=0x5f9a44, trunk_h=0.9, trunk_r=0.2, stems=3, stem_lean=0.6,
                         branch_len=0.95, branch_r=0.1, depth=1, elev=(15, 35), clump=0.5, clumps=20, squash=0.65,
                         rough=0.35, bark=0x8a857a, roots=False, extras=figs))

    def berries(R, tips, parts):
        mat = C.material('rowan_berry', 0xe0461a)
        for i in range(12):
            tp, td, k = tips[i % len(tips)]
            c = tp + td * 0.2 + Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-0.9, -0.2))).normalized() * 0.5
            for j in range(7):
                parts.append(C.blob('berry', 0.04, c + Vector((R.uniform(-0.1, 0.1), R.uniform(-0.1, 0.1), R.uniform(-0.06, 0.04))), mat, seed=j, rough=0.05, subdiv=1))
    out.append(broadleaf('tree_rowan', 137, leaf=0x2f5a2a, leaf_top=0x86c058, trunk_h=2.2, trunk_r=0.18, branch_len=0.95,
                         branch_r=0.1, elev=(50, 70), clump=0.32, clumps=30, rough=0.55, bark=0x7a7268, extras=berries))

    def yew_berries(R, tips, parts):
        dots_on_crown(R, parts, tips, 14, 0.035, 0xc81e1e, 'yew_berry', spread=0.4)
    out.append(broadleaf('tree_yew', 139, leaf=0x14301c, leaf_top=0x34583a, trunk_h=0.5, trunk_r=0.22, branch_len=0.9,
                         branch_r=0.12, depth=2, elev=(55, 80), clump=0.45, clumps=36, per_tip=2, core=5, core_r=0.85,
                         squash=1.1, rough=0.3, bark=0x6a4030, extras=yew_berries))

    def umbels(R, tips, parts):
        mat = C.material('elder_umbel', 0xf2eedc, C.speckle(0.1, 60))
        for i in range(16):
            tp, td, k = tips[i % len(tips)]
            c = tp + td * 0.2 + Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(0.1, 0.8))).normalized() * 0.42
            ob = C.blob('umbel', 0.13, c, mat, seed=i, rough=0.25, subdiv=2, squash=0.3)
            parts.append(ob)
    out.append(broadleaf('tree_elder', 149, leaf=0x24502a, leaf_top=0x6aa84c, trunk_h=0.9, trunk_r=0.12, stems=4, stem_lean=0.45,
                         branch_len=0.6, branch_r=0.05, depth=1, elev=(30, 60), clump=0.3, clumps=26, core=2, core_r=0.5,
                         squash=0.8, bark=0x8a7a62, roots=False, extras=umbels))
    out.append(pine('tree_fir', 151, 0x1f4630, 0x3e6a44, scale=1.5))
    return out


# ---------------------------------------------------------------- Gemüse

def cup_leaf(name, r, mat, loc, yaw, rise=0.6, cup=0.8, lobes=0, crinkle=0.0, seed=0, length=1.0):
    """Blatt vom Stiel (Ursprung) nach außen: gewölbt, optional gelappt oder kraus."""
    import bmesh
    from mathutils import noise
    bm = bmesh.new()
    rings, segs = 4, 14
    cx = r * 0.95 * length
    center = bm.verts.new((cx, 0, 0))
    grid = []
    for i in range(1, rings + 1):
        f = i / rings
        row = []
        for j in range(segs):
            a = j / segs * math.tau
            rr = r * (1 - 0.25 * abs(math.sin(a * lobes / 2)) if lobes else 1)
            x = cx + math.cos(a) * rr * f * length
            y = math.sin(a) * rr * f
            d2 = ((x - cx) ** 2 + y * y) / (r * r)
            z = cup * r * d2 * 0.5 + rise * (x / (2 * cx)) * r
            if crinkle:
                z += noise.noise(Vector((x * 30, y * 30, seed))) * crinkle * r * f
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(segs):
        bm.faces.new((center, grid[0][j], grid[0][(j + 1) % segs]))
    for i in range(rings - 1):
        for j in range(segs):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][(j + 1) % segs], grid[i][(j + 1) % segs]))
    ob = C.link(name, bm, mat, smooth_angle=0)
    ob.location = loc
    ob.rotation_euler = (0, 0, yaw)
    return ob


def vein_shader(dark=0.75):
    from mathutils import noise

    def f(p, n, c):
        v = abs(math.sin(math.atan2(p.y, p.x) * 9))
        out = C.jitter(c, (1 - v) * 0.12 + noise.noise(p * 40) * 0.05)
        return out
    return f


def plants():
    out = []
    # Kohl: fester Kopf, darum bläuliche, gewölbte Außenblätter mit Adern
    head = C.material('cabbage_head', 0xa8cc7a, C.speckle(0.08, 25))
    outer = C.material('cabbage_leaf', 0x5f8f62, vein_shader())
    R = C.rand(1)
    parts = [C.blob('head', 0.16, Vector((0, 0, 0.14)), head, seed=1, rough=0.12, subdiv=2, squash=0.9)]
    for i in range(8):
        a = i / 8 * math.tau + R.uniform(-0.2, 0.2)
        parts.append(cup_leaf('cl', 0.17, outer, Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.02 + (i % 2) * 0.03)), a, rise=0.9 - (i % 2) * 0.3, cup=1.4, lobes=5, seed=i))
    C.bake(parts)
    out.append(C.finish('plant_cabbage', parts, ao_floor=0.35))
    # Salat: krause Rosette in zwei Grüntönen
    l1 = C.material('lettuce_a', 0x9ad86a, C.speckle(0.08, 30))
    l2 = C.material('lettuce_b', 0x6aaa44, C.speckle(0.08, 30))
    parts = []
    for i in range(14):
        a = i * 2.4
        r = 0.08 + (i / 14) * 0.06
        parts.append(cup_leaf('ll', r, l1 if i % 2 else l2, Vector((0, 0, 0.02 + (14 - i) * 0.006)), a, rise=1.6 - i * 0.06, cup=1.2, crinkle=0.5, seed=i))
    C.bake(parts)
    out.append(C.finish('plant_lettuce', parts, ao_floor=0.35))
    # Kürbis: gerippt, Stiel, große gelappte Blätter, Ranke
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=14, radius=0.3)
    for v in bm.verts:
        phi = math.atan2(v.co.y, v.co.x)
        rib = 1 + 0.08 * math.cos(phi * 8)
        pole = 1 - 0.28 * (abs(v.co.z) / 0.3) ** 3
        v.co.x *= rib * 1.12
        v.co.y *= rib * 1.12
        v.co.z *= pole * 0.78
    def pumpkin_shade(p, n, c):
        phi = math.atan2(p.y, p.x)
        groove = max(0.0, -math.cos(phi * 8))
        return C.jitter(c, -groove * 0.28 + 0.05)
    orange = C.material('pumpkin', 0xe0761a, pumpkin_shade)
    pk = C.link('pumpkin', bm, orange, smooth_angle=0)
    pk.location = (0, 0, 0.22)
    stem = C.material('pumpkin_stem', 0x5a6a2a, C.speckle(0.1, 30))
    leaf = C.material('pumpkin_leaf', 0x3f7a30, vein_shader())
    parts = [pk, C.cylinder('stem', 0.035, 0.022, 0.16, Vector((0.02, 0, 0.47)), stem, seg=8, rot=(0, 0.35, 0))]
    for i in range(5):
        a = i / 5 * math.tau + 0.4
        parts.append(cup_leaf('pl', 0.26, leaf, Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, 0.02)), a, rise=0.5, cup=0.9, lobes=5, seed=i))
    vine = C.skin_tree('vine', [Vector((0.2, 0, 0.02)), Vector((0.45, 0.15, 0.04)), Vector((0.7, -0.05, 0.03)), Vector((0.85, 0.12, 0.05))],
                       [(0, 1), (1, 2), (2, 3)], [0.018, 0.016, 0.014, 0.01], C.material('vine', 0x4a7a2a), subdiv=0)
    parts.append(vine)
    C.bake(parts)
    out.append(C.finish('plant_pumpkin', parts, ao_floor=0.35))
    # Tomate: Stab mit Bindfaden, Pflanze, Rispen mit roten und grünen Früchten, gelbe Blüten
    R = C.rand(7)
    wood = C.material('stake', 0x8a6a45, C.wood_grain('z'))
    leafm = C.material('tomato_leaf', 0x3f7a30, C.speckle(0.12, 20))
    red = C.material('tomato_red', 0xd42a22)
    green = C.material('tomato_green', 0x8ab83a)
    yellow = C.material('tomato_flower', 0xf2d040)
    parts = [C.cylinder('stake', 0.018, 0.015, 1.25, Vector((0.05, 0, 0.6)), wood, seg=6)]
    parts.append(C.skin_tree('tstem', [Vector((0, 0, 0)), Vector((0.02, 0.01, 0.4)), Vector((0.03, -0.02, 0.8)), Vector((0.02, 0, 1.05))],
                             [(0, 1), (1, 2), (2, 3)], [0.02, 0.016, 0.012, 0.008], C.material('tstemm', 0x4a7a2a), subdiv=0))
    for k in range(5):
        z = 0.2 + k * 0.2
        for j in range(2):
            a = R.random() * math.tau
            parts.append(C.blob('tl', 0.09 + R.random() * 0.04, Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, z)), leafm, seed=k * 3 + j, rough=0.6, subdiv=2, squash=0.7))
    for i in range(9):
        a = R.random() * math.tau
        rr = 0.12 + R.random() * 0.06
        parts.append(C.blob('tf', 0.045 + R.random() * 0.015, Vector((math.cos(a) * rr, math.sin(a) * rr, 0.25 + R.random() * 0.55)), red if R.random() < 0.65 else green, seed=i, rough=0.04, subdiv=2, squash=0.9))
    for i in range(4):
        a = R.random() * math.tau
        parts.append(C.blob('fl', 0.02, Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0.85 + R.random() * 0.2)), yellow, seed=i, rough=0.2, subdiv=1))
    C.bake(parts)
    out.append(C.finish('plant_tomato', parts, ao_floor=0.35))
    # Lauch: weißer Schaft, fächerförmige blaugrüne Blätter
    white = C.material('leek_shaft', 0xe2e6c8, C.speckle(0.06, 30))
    blade = C.material('leek_blade', 0x4f7f5a, C.speckle(0.08, 25))
    parts = [C.cylinder('shaft', 0.03, 0.026, 0.35, Vector((0, 0, 0.17)), white, seg=10)]
    for i in range(5):
        side = 1 if i % 2 else -1
        b = C.box('blade', (0.035, 0.012, 0.42), Vector((side * 0.04 * (i // 2 + 1) * 0.6, 0, 0.5)), blade, bevel=0.004, step=0.1, rot=(0, side * (0.25 + 0.15 * (i // 2)), i * 0.4))
        parts.append(b)
    C.bake(parts)
    out.append(C.finish('plant_leek', parts, ao_floor=0.35))
    # Möhre: orange Schulter aus der Erde, fedriges Kraut
    org = C.material('carrot', 0xe8782a, C.speckle(0.1, 40))
    frond = C.material('carrot_frond', 0x5aa63a, C.speckle(0.12, 30))
    R = C.rand(9)
    parts = [C.cylinder('shoulder', 0.035, 0.03, 0.06, Vector((0, 0, 0.01)), org, seg=10)]
    for i in range(9):
        a = i / 9 * math.tau
        parts.append(C.cylinder('fr', 0.006, 0.002, 0.3, Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.17)), frond, seg=4, rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, 0)))
        for k in range(5):
            rr = 0.04 + k * 0.022
            parts.append(C.blob('fb', 0.016, Vector((math.cos(a) * rr + R.uniform(-0.01, 0.01), math.sin(a) * rr, 0.1 + k * 0.045)), frond, seed=i * 5 + k, rough=0.8, subdiv=1, squash=0.5))
    C.bake(parts)
    out.append(C.finish('plant_carrot', parts, ao_floor=0.35))
    return out


# ---------------------------------------------------------------- Hochbeet

def bed_frame(length, depth, variant):
    """Hochbeet aus drei Lagen Brettern, Eckpfosten, Abschlussbrett, Erde mit Furchen."""
    import bmesh
    from mathutils import noise
    R = C.rand(17 + variant)
    tones = [0x7a5634, 0x6e4c2e, 0x85603a]
    planks = [C.material(f'bed_plank{i}', t, C.wood_grain('x')) for i, t in enumerate(tones)]
    planks_y = [C.material(f'bed_planky{i}', t, C.wood_grain('y')) for i, t in enumerate(tones)]
    post = C.material('bed_post', 0x5a3c22, C.wood_grain('z'))
    parts = []
    for layer in range(3):
        z = 0.1 + layer * 0.2
        for side in (-1, 1):
            parts.append(C.box('pl', (length, 0.06, 0.18), Vector((0, side * (depth / 2 - 0.03), z)), planks[(layer + R.randint(0, 2)) % 3], bevel=0.01, step=0.3))
            parts.append(C.box('pe', (0.06, depth - 0.12, 0.18), Vector((side * (length / 2 - 0.03), 0, z)), planks_y[layer % 3], bevel=0.01, step=0.3))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(C.box('post', (0.1, 0.1, 0.72), Vector((sx * (length / 2 - 0.05), sy * (depth / 2 - 0.05), 0.36)), post, bevel=0.012, step=0.2))
    for side in (-1, 1):
        parts.append(C.box('cap', (length + 0.08, 0.14, 0.04), Vector((0, side * (depth / 2 - 0.03), 0.66)), post, bevel=0.008, step=0.3))
    # Erde: Gitter mit Furchen längs und Krümeln
    bm = bmesh.new()
    nx, ny = int(length / 0.12), int(depth / 0.07)
    vs = []
    for i in range(nx + 1):
        row = []
        for j in range(ny + 1):
            x = -length / 2 + 0.06 + i * (length - 0.12) / nx
            y = -depth / 2 + 0.06 + j * (depth - 0.12) / ny
            z = 0.6 + 0.025 * math.cos(y / (depth - 0.12) * math.pi * (4 if depth > 1.2 else 2) * 2) + noise.noise(Vector((x * 4, y * 4, variant))) * 0.02
            row.append(bm.verts.new((x, y, z)))
        vs.append(row)
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    soil = C.material('bed_soil', 0x3a2818, C.speckle(0.25, 18))
    parts.append(C.link('soil', bm, soil, smooth_angle=0))
    crumb = C.material('bed_crumb', 0x4f3826)
    for i in range(int(length * 5)):
        parts.append(C.blob('cr', 0.03 + R.random() * 0.03, Vector((R.uniform(-1, 1) * (length / 2 - 0.15), R.uniform(-1, 1) * (depth / 2 - 0.15), 0.62)), crumb, seed=i, rough=0.4, subdiv=1, squash=0.6))
    # Schildchen am Kopfende
    signm = C.material('bed_sign', 0xd8c8a0, C.speckle(0.08, 20))
    parts.append(C.box('sign', (0.28, 0.02, 0.16), Vector((-length / 2 + 0.25, -(depth / 2 - 0.15), 0.95)), signm, bevel=0.004, step=0.3, rot=(0.3, 0, 0)))
    parts.append(C.box('signpost', (0.02, 0.02, 0.35), Vector((-length / 2 + 0.25, -(depth / 2 - 0.15), 0.78)), post, bevel=0.003, step=0.3))
    if variant == 0:
        # Gießkanne aus verzinktem Blech
        tin = C.material('can', 0x7a8a8e, C.speckle(0.1, 20))
        parts.append(C.cylinder('can', 0.14, 0.13, 0.28, Vector((length / 2 + 0.3, -(depth / 2 - 0.1), 0.14)), tin, seg=14))
        parts.append(C.cylinder('spout', 0.02, 0.03, 0.38, Vector((length / 2 + 0.5, -(depth / 2 - 0.1), 0.22)), tin, seg=6, rot=(0, 0.9, 0)))
        handle = C.box('handle', (0.03, 0.02, 0.2), Vector((length / 2 + 0.3, -(depth / 2 - 0.1), 0.34)), tin, bevel=0.005, step=0.3)
        parts.append(handle)
    else:
        handle = C.material('rake_handle', 0x8a6340, C.wood_grain('z'))
        metal = C.material('rake_metal', 0x6a6e72)
        parts.append(C.cylinder('rake', 0.02, 0.02, 1.4, Vector((length / 2 + 0.15, 0, 0.66)), handle, seg=6, rot=(0, -0.35, 0)))
        parts.append(C.box('rakehead', (0.04, 0.45, 0.04), Vector((length / 2 + 0.38, 0, 1.3)), metal, bevel=0.005, step=0.3))
    C.bake(parts)
    return C.finish(f'bed_{round(length * 100)}x{round(depth * 100)}_{"ab"[variant]}', parts, ao_floor=0.3)


# ---------------------------------------------------------------- Schuppen

def shed(w, h):
    """Geräteschuppen: Bretterwand, Wellblechdach mit Rost, Tür mit Z-Strebe, Fenster, Werkzeug, Regentonne."""
    import bmesh
    from mathutils import noise
    R = C.rand(21)
    tones = [0x7a5a3a, 0x6a4c30, 0x86643f, 0x5e4429]
    parts = []
    H = 2.2
    parts.append(C.box('core', (w - 0.06, h - 0.06, H), Vector((0, 0, H / 2)), C.material('shed_core', 0x3a2a1c), bevel=0, step=0.5))
    for side in (-1, 1):
        x = -w / 2 + 0.12
        while x < w / 2:
            m = C.material(f'shed_plank{R.randint(0, 3)}', tones[R.randint(0, 3)], C.wood_grain('z'))
            hh = H + R.uniform(-0.02, 0.06)
            parts.append(C.box('p', (0.22, 0.04, hh), Vector((x, -side * (h / 2 + 0.0), hh / 2)), m, bevel=0.006, step=0.4))
            x += 0.24
        y = -h / 2 + 0.12
        while y < h / 2:
            m = C.material(f'shed_plank{R.randint(0, 3)}', tones[R.randint(0, 3)], C.wood_grain('z'))
            parts.append(C.box('p', (0.04, 0.22, H), Vector((side * (w / 2), y, H / 2)), m, bevel=0.006, step=0.4))
            y += 0.24
    # Giebeldreiecke aus Brettern (einfach: Prisma), Wellblechdach
    roofH = 0.9
    span = h + 0.6
    def rust(p, n, c):
        k = noise.noise(p * 1.7) + noise.noise(p * 6) * 0.4
        rustc = C.hexcol(0x8a4a22)
        out = C.mix(c, rustc, (k - 0.1) * 2.2)
        return C.jitter(out, noise.noise(p * 30) * 0.06)
    tin = C.material('shed_tin', 0x7a7672, rust)
    slope = math.atan2(roofH, span / 2)
    slen = math.hypot(roofH, span / 2)
    for sgn in (-1, 1):
        bm = bmesh.new()
        nx, ny = 64, 6
        L = w + 0.5
        vs = []
        for i in range(nx + 1):
            row = []
            for j in range(ny + 1):
                x = -L / 2 + i * L / nx
                v = j * slen / ny
                z = 0.025 * math.sin(i / nx * L / 0.12 * math.tau)
                row.append(bm.verts.new((x, v, z)))
            vs.append(row)
        for i in range(nx):
            for j in range(ny):
                bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
        sheet = C.link('sheet', bm, tin, smooth_angle=0)
        # Blech vom First (v = 0) zur Traufe kippen, Seite sgn (-1 = vorne/−Y)
        for vtx in sheet.data.vertices:
            yy, zz = vtx.co.y, vtx.co.z
            vtx.co.y = sgn * yy * math.cos(slope) + 0
            vtx.co.z = H + roofH - yy * math.sin(slope) + zz
        parts.append(sheet)
    gable = C.material('shed_gable', 0x6a4c30, C.wood_grain('z'))
    for side in (-1, 1):
        bm = bmesh.new()
        pts = [(-h / 2, H), (h / 2, H), (0, H + roofH - 0.05)]
        v = [bm.verts.new((side * w / 2, -py, pz)) for py, pz in pts]
        bm.faces.new(v if side > 0 else v[::-1])
        parts.append(C.link('gable', bm, gable, smooth_angle=0))
    # Tür (vorne = −Y) mit Z-Strebe, Bändern und Riegel
    door = C.material('shed_door', 0x4a321e, C.wood_grain('z'))
    brace = C.material('shed_brace', 0x5e4429, C.wood_grain('x'))
    iron = C.material('shed_iron', 0x2a2a2a)
    dx = -w * 0.15
    fy = -(h / 2 + 0.04)
    parts.append(C.box('door', (1.0, 0.05, 1.85), Vector((dx, fy, 0.95)), door, bevel=0.008, step=0.3))
    for z in (0.3, 1.55):
        parts.append(C.box('br', (0.95, 0.04, 0.1), Vector((dx, fy - 0.04, z)), brace, bevel=0.006, step=0.3))
        parts.append(C.box('hinge', (0.35, 0.02, 0.05), Vector((dx - 0.32, fy - 0.07, z)), iron, bevel=0.004, step=0.3))
    parts.append(C.box('diag', (0.1, 0.04, 1.45), Vector((dx, fy - 0.04, 0.93)), brace, bevel=0.006, step=0.3, rot=(0, 0.62, 0)))
    parts.append(C.box('latch', (0.18, 0.03, 0.06), Vector((dx + 0.4, fy - 0.07, 1.0)), iron, bevel=0.004, step=0.3))
    # Fenster mit trübem, warmem Licht
    frame = C.material('shed_wframe', 0x3a2a1c)
    glass = C.material('shed_glass', 0xe8c070, C.speckle(0.15, 12))
    wx = w * 0.28
    parts.append(C.box('wf', (0.62, 0.05, 0.52), Vector((wx, fy, 1.5)), frame, bevel=0.006, step=0.3))
    parts.append(C.box('wg', (0.5, 0.05, 0.4), Vector((wx, fy - 0.01, 1.5)), glass, bevel=0.0, step=0.3))
    parts.append(C.box('wc', (0.04, 0.06, 0.4), Vector((wx, fy - 0.02, 1.5)), frame, bevel=0.0, step=0.3))
    # Rechen und Spaten angelehnt
    handle = C.material('tool_handle', 0x8a6340, C.wood_grain('z'))
    metal = C.material('tool_metal', 0x6a6e72, C.speckle(0.1, 30))
    parts.append(C.cylinder('rake', 0.025, 0.025, 1.7, Vector((w / 2 - 0.25, fy - 0.22, 0.85)), handle, seg=6, rot=(0.18, 0, 0)))
    parts.append(C.box('rh', (0.45, 0.04, 0.04), Vector((w / 2 - 0.25, fy - 0.07, 1.68)), metal, bevel=0.004, step=0.3))
    parts.append(C.cylinder('spade', 0.025, 0.025, 1.1, Vector((w / 2 + 0.25, -h * 0.1, 0.75)), handle, seg=6, rot=(0, 0.15, 0)))
    parts.append(C.box('sb', (0.2, 0.02, 0.28), Vector((w / 2 + 0.2, -h * 0.1, 0.14)), metal, bevel=0.004, step=0.3))
    # Regentonne an der Ecke
    bw = C.material('shed_barrel', 0x5a4630, C.wood_grain('z'))
    hoop = C.material('shed_hoop', 0x3a3a3a)
    water = C.material('shed_water', 0x2f4f5a)
    bx, by = -w / 2 - 0.35, -(h / 2 - 0.25)
    parts.append(C.cylinder('barrel', 0.32, 0.29, 0.86, Vector((bx, by, 0.43)), bw, seg=16))
    for z in (0.15, 0.7):
        parts.append(C.cylinder('hoop', 0.335, 0.335, 0.05, Vector((bx, by, z)), hoop, seg=16, rings=0))
    parts.append(C.cylinder('water', 0.28, 0.28, 0.02, Vector((bx, by, 0.84)), water, seg=16, rings=0))
    C.bake(parts)
    return C.finish(f'shed_{round(w * 100)}x{round(h * 100)}', parts, ao_floor=0.3)


# ---------------------------------------------------------------- Wald, Büsche, Hecken (sparsam)

def forest():
    """Sparsame Bäume für Waldrand und Dickicht (wenige Dreiecke, viele Instanzen)."""
    out = []
    for name, seed, leaf, top in (('forest_oak_a', 201, 0x2f5a26, 0x6a9a44), ('forest_oak_b', 211, 0x355f2a, 0x7aa64a), ('forest_oak_c', 223, 0x284f24, 0x5f8f40)):
        out.append(broadleaf(name, seed, leaf=leaf, leaf_top=top, trunk_h=1.8, trunk_r=0.3, branch_len=1.3, depth=1,
                             clump=0.75, clumps=9, per_tip=1, core=2, core_r=1.0, rough=0.5, leaf_subdiv=2, trunk_subdiv=0, roots=False))
    out.append(pine('forest_pine_a', 231, 0x22472e, 0x41694a, lod=True))
    out.append(pine('forest_pine_b', 241, 0x1d4030, 0x3a6046, lod=True))
    return out


def bushes():
    out = []
    for name, seed, leaf, top, flower in (('bush_a', 301, 0x2c5626, 0x6a9a44, None), ('bush_b', 311, 0x305a2a, 0x76a64c, 0xf0e6f0), ('bush_c', 321, 0x27502a, 0x5a8a40, 0xc8282a)):
        R = C.rand(seed)
        leaves = C.material(f'leaf_{name}', leaf, leaf_shader(top))
        parts = []
        for i in range(8):
            a = R.random() * math.tau
            d = R.random() * 0.45
            r = 0.38 + R.random() * 0.22
            parts.append(C.blob('b', r, Vector((math.cos(a) * d, math.sin(a) * d, 0.35 + R.random() * 0.4)), leaves, seed=seed + i, rough=0.55, subdiv=2, squash=0.85))
        if flower:
            fm = C.material(f'flower_{name}', flower)
            for i in range(14):
                a = R.random() * math.tau
                parts.append(C.blob('f', 0.04, Vector((math.cos(a) * 0.62, math.sin(a) * 0.62, 0.35 + R.random() * 0.5)), fm, seed=i, rough=0.1, subdiv=1))
        C.bake(parts)
        out.append(C.finish(name, parts, ao_floor=0.3))
    # Heckenstück: 1 m lang, 1 m tief, 1,3 m hoch (wird gestreckt und aneinandergereiht)
    R = C.rand(331)
    leaves = C.material('leaf_hedge', 0x2a5a26, leaf_shader(0x5f9440))
    parts = [C.box('core', (1.0, 0.8, 1.1), Vector((0, 0, 0.55)), C.material('hedge_core', 0x1e3a1c), bevel=0.05, step=0.5)]
    for i in range(10):
        parts.append(C.blob('h', 0.32 + R.random() * 0.12, Vector((R.uniform(-0.5, 0.5), R.uniform(-0.38, 0.38), R.uniform(0.25, 1.15))), leaves, seed=340 + i, rough=0.5, subdiv=2, squash=0.9))
    C.bake(parts)
    out.append(C.finish('hedge_seg', parts, ao_floor=0.3))
    return out


# ---------------------------------------------------------------- Gartenkram und Gelände

def rock_shader():
    from mathutils import noise
    moss = C.hexcol(0x4f6a2e)

    def f(p, n, c):
        out = C.jitter(c, noise.noise(p * 3) * 0.18 + noise.noise(p * 14) * 0.08)
        return C.mix(out, moss, max(0.0, n.z - 0.55) * 1.6 * (0.5 + noise.noise(p * 2) * 0.6))
    return f


def end_grain(axis=0):
    """Hirnholz: helle Stirnflächen mit Jahresringen, sonst Rinde."""
    from mathutils import noise
    wood = C.hexcol(0xb08a5a)

    def f(p, n, c):
        if abs(n[axis]) > 0.8:
            rr = math.hypot(*(p[i] for i in range(3) if i != axis))
            return C.jitter(wood, math.sin(rr * 90) * 0.08 + noise.noise(p * 20) * 0.05)
        g = noise.noise(Vector((p.x * 9, p.y * 9, p.z * 9))) * 0.22
        return C.jitter(c, g)
    return f


def props():
    out = []
    # ---- Felsen (3 Formen), Durchmesser 2 m
    for i in range(3):
        m = C.material(f'rock{i}', [0x5f5e5a, 0x6a6862, 0x585650][i], rock_shader())
        parts = [C.blob('rock', 1.0, Vector((0, 0, 0.35)), m, seed=400 + i, rough=0.35, subdiv=3, squash=0.62)]
        parts.append(C.blob('rock2', 0.45, Vector((0.75, 0.3, 0.12)), m, seed=410 + i, rough=0.4, subdiv=2, squash=0.6))
        C.bake(parts)
        out.append(C.finish(f'rock_{"abc"[i]}', parts, ao_floor=0.3))
    # ---- Baumstamm 3,6 m, mit Moos, Pilzen und Aststummel
    bark = C.material('log_bark', 0x6b4a2b, end_grain(0))
    parts = [C.cylinder('log', 0.43, 0.4, 3.6, Vector((0, 0, 0.4)), bark, seg=14, rot=(0, math.pi / 2, 0), rings=8)]
    parts.append(C.cylinder('stub', 0.1, 0.06, 0.5, Vector((0.6, -0.35, 0.65)), bark, seg=8, rot=(0.9, 0, 0.3), rings=1))
    moss = C.material('log_moss', 0x4a6a2a, C.speckle(0.2, 20))
    R = C.rand(5)
    for i in range(8):
        parts.append(C.blob('moss', 0.18, Vector((R.uniform(-1.6, 1.6), R.uniform(-0.15, 0.15), 0.78)), moss, seed=i, rough=0.5, subdiv=1, squash=0.35))
    cap = C.material('mush_cap', 0xb06a3a, C.speckle(0.15, 30))
    for i in range(5):
        x = R.uniform(-1.4, 1.4)
        parts.append(C.blob('cap', 0.07, Vector((x, -0.42, 0.32 + R.random() * 0.2)), cap, seed=i, rough=0.1, subdiv=1, squash=0.45))
    C.bake(parts)
    out.append(C.finish('log', parts, ao_floor=0.3))
    # ---- Toter Baum: knorrig, kahle, gebrochene Äste
    verts, edges, radii = [Vector((0, 0, -0.2)), Vector((0, 0, 0.3))], [(0, 1)], [0.36, 0.3]
    R = C.rand(7)
    p, d, par = Vector((0, 0, 0.3)), Vector((0.05, 0, 1)).normalized(), 1
    for k in range(5):
        d = (d + Vector((R.uniform(-0.2, 0.2), R.uniform(-0.2, 0.2), 0))).normalized()
        p = p + d * 0.6
        verts.append(p.copy())
        radii.append(0.26 - k * 0.045)
        edges.append((par, len(verts) - 1))
        par = len(verts) - 1
        if k >= 1:
            a = R.random() * math.tau
            bd = Vector((math.cos(a), math.sin(a), 0.6)).normalized()
            q = p + bd * (0.6 + R.random() * 0.6)
            verts.append(q)
            radii.append(0.06)
            edges.append((par, len(verts) - 1))
            q2 = q + (bd + Vector((R.uniform(-0.5, 0.5), R.uniform(-0.5, 0.5), 0.3))).normalized() * 0.4
            verts.append(q2)
            radii.append(0.025)
            edges.append((len(verts) - 2, len(verts) - 1))
    dead = C.material('dead_bark', 0x5a4a3c, bark_shader())
    parts = [C.skin_tree('dead', verts, edges, radii, dead)]
    C.bake(parts)
    out.append(C.finish('deadtree', parts, ao_floor=0.3))
    # ---- Grabsteine (3 Formen): Stein, davor ein Grabhügel nach Süden (−Y)
    stone = C.material('grave_stone', 0x8f8f8a, rock_shader())
    mound = C.material('grave_mound', 0x4a3a28, C.speckle(0.2, 12))
    grass = C.material('grave_grass', 0x3f5f2a, C.speckle(0.2, 20))
    for i in range(3):
        parts = []
        if i == 0:
            parts.append(C.box('slab', (0.62, 0.16, 0.8), Vector((0, 0, 0.4)), stone, bevel=0.03, step=0.15))
            parts.append(C.cylinder('top', 0.31, 0.31, 0.16, Vector((0, 0, 0.8)), stone, seg=16, rot=(math.pi / 2, 0, 0), rings=0))
        elif i == 1:
            parts.append(C.box('post', (0.12, 0.12, 1.0), Vector((0, 0, 0.5)), stone, bevel=0.015, step=0.2))
            parts.append(C.box('arm', (0.6, 0.12, 0.12), Vector((0, 0, 0.72)), stone, bevel=0.015, step=0.2))
            parts.append(C.box('base', (0.4, 0.3, 0.12), Vector((0, 0, 0.06)), stone, bevel=0.02, step=0.2))
        else:
            parts.append(C.box('slab', (0.7, 0.18, 0.6), Vector((0, 0, 0.3)), stone, bevel=0.04, step=0.15, rot=(0.12, 0.06, 0)))
        parts.append(C.blob('mound', 0.75, Vector((0, -0.78, 0.0)), mound, seed=i, rough=0.15, subdiv=2, squash=0.18))
        parts[-1].scale = (0.5, 1.0, 1.0)
        for k in range(6):
            parts.append(C.blob('g', 0.08, Vector(((k % 3 - 1) * 0.22, -0.2 - (k // 3) * 1.1, 0.05)), grass, seed=k, rough=0.7, subdiv=1, squash=0.6))
        C.bake(parts)
        out.append(C.finish(f'grave_{"abc"[i]}', parts, ao_floor=0.3))
    # ---- Regentonne (Radius 0,4)
    staves = C.material('barrel_wood', 0x6a4a2c, C.wood_grain('z'))
    iron = C.material('barrel_iron', 0x3a3a3a, C.speckle(0.15, 20))
    water = C.material('barrel_water', 0x2f4f5a, C.speckle(0.08, 6))
    parts = []
    n = 16
    for k in range(n):
        a = k / n * math.tau
        st = C.box('st', (0.15, 0.05, 0.9), Vector((math.cos(a) * 0.37, math.sin(a) * 0.37, 0.45)), staves, bevel=0.008, step=0.3, rot=(0, 0, a + math.pi / 2))
        parts.append(st)
    for z in (0.12, 0.45, 0.78):
        parts.append(C.cylinder('hoop', 0.405, 0.405, 0.05, Vector((0, 0, z)), iron, seg=20, rings=0))
    parts.append(C.cylinder('water', 0.35, 0.35, 0.02, Vector((0, 0, 0.82)), water, seg=20, rings=0))
    parts.append(C.cylinder('bottom', 0.36, 0.36, 0.05, Vector((0, 0, 0.03)), staves, seg=20, rings=0))
    C.bake(parts)
    out.append(C.finish('rain_barrel', parts, ao_floor=0.3))
    # ---- Bank 2,2 × 0,7 m: Holzlatten, gusseiserne Seiten
    slat = C.material('bench_slat', 0x7a5634, C.wood_grain('x'))
    cast = C.material('bench_iron', 0x2a2c2e, C.speckle(0.1, 20))
    parts = []
    for k in range(4):
        parts.append(C.box('seat', (2.1, 0.13, 0.04), Vector((0, -0.22 + k * 0.14, 0.45)), slat, bevel=0.01, step=0.4))
    for k in range(3):
        parts.append(C.box('back', (2.1, 0.04, 0.11), Vector((0, 0.3, 0.6 + k * 0.14)), slat, bevel=0.01, step=0.4, rot=(-0.2, 0, 0)))
    for s in (-1, 1):
        parts.append(C.box('leg', (0.06, 0.6, 0.05), Vector((s * 0.95, 0, 0.43)), cast, bevel=0.01, step=0.3))
        parts.append(C.box('legf', (0.06, 0.05, 0.45), Vector((s * 0.95, -0.25, 0.22)), cast, bevel=0.01, step=0.3, rot=(0.15, 0, 0)))
        parts.append(C.box('legb', (0.06, 0.05, 0.95), Vector((s * 0.95, 0.28, 0.47)), cast, bevel=0.01, step=0.3, rot=(-0.2, 0, 0)))
        parts.append(C.box('arm', (0.07, 0.6, 0.05), Vector((s * 1.02, -0.02, 0.68)), cast, bevel=0.015, step=0.3))
    C.bake(parts)
    out.append(C.finish('bench', parts, ao_floor=0.3))
    # ---- Kompost 2,2 × 2,2 m: Lattenkiste, Erde, Grünschnitt, Stöcke
    plank = C.material('compost_wood', 0x6a4c30, C.wood_grain('x'))
    planky = C.material('compost_woody', 0x6a4c30, C.wood_grain('y'))
    post = C.material('compost_post', 0x4a3420, C.wood_grain('z'))
    parts = []
    for z in (0.15, 0.4, 0.65, 0.9):
        for s in (-1, 1):
            parts.append(C.box('px', (2.2, 0.04, 0.16), Vector((0, s * 1.08, z)), plank, bevel=0.008, step=0.5))
            parts.append(C.box('py', (0.04, 2.2, 0.16), Vector((s * 1.08, 0, z)), planky, bevel=0.008, step=0.5))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(C.box('post', (0.1, 0.1, 1.05), Vector((sx * 1.08, sy * 1.08, 0.52)), post, bevel=0.01, step=0.3))
    soil = C.material('compost_soil', 0x3a2818, C.speckle(0.25, 10))
    green = C.material('compost_green', 0x5a7a2a, C.speckle(0.25, 18))
    brown = C.material('compost_brown', 0x7a6a3a, C.speckle(0.2, 18))
    parts.append(C.blob('heap', 1.0, Vector((0, 0, 0.55)), soil, seed=3, rough=0.25, subdiv=2, squash=0.45))
    R = C.rand(11)
    for i in range(12):
        parts.append(C.blob('g', 0.18, Vector((R.uniform(-0.7, 0.7), R.uniform(-0.7, 0.7), 0.85)), green if i % 3 else brown, seed=i, rough=0.6, subdiv=1, squash=0.4))
    C.bake(parts)
    out.append(C.finish('compost', parts, ao_floor=0.3))
    # ---- Holzstapel 3,2 × 1,2 m: Scheite mit Hirnholz, Hackklotz
    logm = C.material('woodpile_log', 0x6a4a2c, end_grain(1))
    parts = []
    R = C.rand(13)
    for row in range(5):
        n = 13 - row
        for k in range(n):
            x = -1.5 + (k + row * 0.5) * 0.23 + R.uniform(-0.02, 0.02)
            parts.append(C.cylinder('l', 0.11, 0.11, 1.1, Vector((x, R.uniform(-0.05, 0.05), 0.11 + row * 0.2)), logm, seg=8, rot=(math.pi / 2, 0, R.uniform(-0.05, 0.05)), rings=0))
    stump = C.material('woodpile_stump', 0x6a4a2c, end_grain(2))
    parts.append(C.cylinder('block', 0.3, 0.32, 0.55, Vector((1.85, -0.3, 0.27)), stump, seg=12, rings=1))
    C.bake(parts)
    out.append(C.finish('woodpile', parts, ao_floor=0.3))
    # ---- Schubkarre 1,7 × 0,8 m
    tub = C.material('barrow_tub', 0x4f7a5a, C.painted(0x7a3a1a, 0.25))
    metal = C.material('barrow_metal', 0x3a3a3a)
    tyre = C.material('barrow_tyre', 0x1a1a1a)
    handle = C.material('barrow_handle', 0x8a6340, C.wood_grain('x'))
    parts = [C.box('tub', (0.9, 0.62, 0.35), Vector((0.1, 0, 0.55)), tub, bevel=0.06, step=0.2)]
    parts.append(C.box('in', (0.78, 0.5, 0.05), Vector((0.1, 0, 0.71)), C.material('barrow_soil', 0x3a2818, C.speckle(0.25, 12)), bevel=0.02, step=0.2))
    parts.append(C.cylinder('wheel', 0.2, 0.2, 0.09, Vector((-0.6, 0, 0.2)), tyre, seg=16, rot=(math.pi / 2, 0, 0), rings=0))
    for s in (-1, 1):
        parts.append(C.cylinder('h', 0.025, 0.025, 1.4, Vector((0.25, s * 0.25, 0.55)), handle, seg=6, rot=(0, math.pi / 2 - 0.25, 0), rings=0))
        parts.append(C.box('leg', (0.04, 0.04, 0.4), Vector((0.45, s * 0.25, 0.2)), metal, bevel=0.005, step=0.3))
    C.bake(parts)
    out.append(C.finish('wheelbarrow', parts, ao_floor=0.3))
    # ---- Hollywoodschaukel 2,8 × 1,4 m: Gestell, Bank mit Kissen, gestreiftes Dach
    frame = C.material('swing_frame', 0xdedede, C.speckle(0.08, 10))
    seatm = C.material('swing_seat', 0xf0f0f0, C.speckle(0.06, 10))
    cushion = C.material('swing_cushion', 0x4f86c6, C.speckle(0.1, 25))
    W = 2.8

    def stripes(p, n, c):
        k = int((p.x + 10) / (W / 6)) % 2
        return C.hexcol(0xf2f2f2) if k else C.hexcol(0x4f86c6)
    canopy = C.material('swing_canopy', 0x4f86c6, stripes)
    parts = []
    for s in (-1, 1):
        for lean in (-1, 1):
            parts.append(C.cylinder('leg', 0.04, 0.04, 2.15, Vector((s * (W / 2 - 0.1), lean * 0.42, 1.0)), frame, seg=8, rot=(lean * -0.38, 0, 0), rings=2))
    parts.append(C.cylinder('top', 0.045, 0.045, W, Vector((0, 0, 1.97)), frame, seg=8, rot=(0, math.pi / 2, 0), rings=4))
    parts.append(C.box('seat', (W - 0.5, 0.6, 0.1), Vector((0, 0, 0.55)), seatm, bevel=0.02, step=0.3))
    parts.append(C.box('back', (W - 0.5, 0.1, 0.6), Vector((0, 0.28, 0.85)), seatm, bevel=0.02, step=0.3, rot=(-0.12, 0, 0)))
    parts.append(C.box('cush', (W - 0.6, 0.5, 0.12), Vector((0, -0.02, 0.66)), cushion, bevel=0.05, step=0.2))
    parts.append(C.box('cushb', (W - 0.6, 0.12, 0.45), Vector((0, 0.2, 0.92)), cushion, bevel=0.05, step=0.2, rot=(-0.12, 0, 0)))
    for s in (-1, 1):
        parts.append(C.cylinder('chain', 0.012, 0.012, 1.3, Vector((s * (W / 2 - 0.3), 0, 1.3)), frame, seg=4, rings=0))
    blue = C.material('swing_blue', 0x4f86c6, C.speckle(0.06, 20))
    white = C.material('swing_white', 0xf2f2f2, C.speckle(0.06, 20))
    sw = (W + 0.1) / 6
    for k in range(6):
        parts.append(C.box('canopy', (sw, 1.45, 0.04), Vector((-(W + 0.1) / 2 + (k + 0.5) * sw, 0, 2.15)), blue if k % 2 == 0 else white, bevel=0.005, step=0.3, rot=(0.18, 0, 0)))
    C.bake(parts)
    out.append(C.finish('swing', parts, ao_floor=0.3))
    # ---- Autowrack 4,2 × 1,9 m (lange Achse X): Rost, eingeschlagene Scheiben, platter Reifen
    from mathutils import noise

    def rust(p, n, c):
        k = noise.noise(p * 1.5) + noise.noise(p * 5) * 0.5
        out = C.mix(c, C.hexcol(0x7a3a18), (k + 0.1) * 1.8)
        return C.jitter(out, noise.noise(p * 25) * 0.08)
    body = C.material('car_body', 0x4f6a7a, rust)
    dark = C.material('car_dark', 0x101214, C.speckle(0.2, 8))
    chrome = C.material('car_chrome', 0x8a8e90, rust)
    parts = [C.box('body', (4.1, 1.8, 0.7), Vector((0, 0, 0.6)), body, bevel=0.15, step=0.3)]
    parts.append(C.box('cabin', (2.1, 1.6, 0.6), Vector((-0.2, 0, 1.2)), body, bevel=0.15, step=0.3))
    for s in (-1, 1):
        parts.append(C.box('win', (1.8, 0.02, 0.4), Vector((-0.2, s * 0.8, 1.22)), dark, bevel=0.0, step=0.5))
    parts.append(C.box('wf', (0.02, 1.4, 0.42), Vector((0.86, 0, 1.22)), dark, bevel=0.0, step=0.5, rot=(0, -0.35, 0)))
    parts.append(C.box('wr', (0.02, 1.4, 0.42), Vector((-1.26, 0, 1.22)), dark, bevel=0.0, step=0.5, rot=(0, 0.35, 0)))
    for x in (-1.3, 1.3):
        for s in (-1, 1):
            flat = (x > 0 and s > 0)
            parts.append(C.cylinder('tyre', 0.34, 0.34, 0.24, Vector((x, s * 0.85, 0.26 if flat else 0.34)), dark, seg=16, rot=(math.pi / 2, 0, 0), rings=0))
            parts[-1].scale = (1, 1, 0.75 if flat else 1)
    for x in (-2.07, 2.07):
        parts.append(C.box('bumper', (0.08, 1.7, 0.14), Vector((x, 0, 0.42)), chrome, bevel=0.03, step=0.4))
    for s in (-1, 1):
        parts.append(C.cylinder('lamp', 0.1, 0.1, 0.05, Vector((2.05, s * 0.6, 0.72)), chrome, seg=10, rot=(0, math.pi / 2, 0), rings=0))
    C.bake(parts)
    out.append(C.finish('car', parts, ao_floor=0.3))
    # ---- Brunnen (Radius 0,9): Steinring, Holzgestell mit Dach, Kurbel und Eimer
    st = C.material('well_stone', 0x8a8478, rock_shader())
    wood = C.material('well_wood', 0x5a4028, C.wood_grain('z'))
    roof = C.material('well_roof', 0x6a3a28, C.speckle(0.2, 10))
    parts = []
    n = 12
    for row in range(3):
        for k in range(n):
            a = (k + row * 0.5) / n * math.tau
            parts.append(C.box('blk', (0.42, 0.22, 0.24), Vector((math.cos(a) * 0.78, math.sin(a) * 0.78, 0.12 + row * 0.25)), st, bevel=0.03, step=0.3, rot=(0, 0, a + math.pi / 2)))
    parts.append(C.cylinder('water', 0.62, 0.62, 0.02, Vector((0, 0, 0.45)), C.material('well_water', 0x0f1a1e), seg=20, rings=0))
    for s in (-1, 1):
        parts.append(C.box('post', (0.1, 0.1, 1.9), Vector((s * 0.8, 0, 1.15)), wood, bevel=0.01, step=0.4))
    parts.append(C.cylinder('axle', 0.06, 0.06, 1.7, Vector((0, 0, 1.6)), wood, seg=8, rot=(0, math.pi / 2, 0), rings=0))
    for sgn in (-1, 1):
        rf = C.box('roof', (2.0, 0.75, 0.05), Vector((0, sgn * 0.3, 2.2)), roof, bevel=0.01, step=0.3, rot=(sgn * -0.6, 0, 0))
        parts.append(rf)
    parts.append(C.cylinder('bucket', 0.14, 0.11, 0.22, Vector((0.2, 0.2, 0.6)), wood, seg=10, rings=0))
    C.bake(parts)
    out.append(C.finish('well', parts, ao_floor=0.3))
    return out


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
    built += species_trees()
    built += plants()
    built += [bed_frame(10.0, 1.5, 0), bed_frame(10.0, 1.5, 1), shed(4.2, 3.2)]
    built += forest() + bushes() + props()
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
