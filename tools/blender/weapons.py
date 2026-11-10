"""
Waffen der Helden und Bosse aus Blender (Python-Paket bpy).

Aufruf:
  python tools/blender/weapons.py public/models/weapons.glb [Vorschau-Ordner]

Lage wie im Spiel (src/client/weapons.ts): Die Hand hält im Ursprung, die
Waffe zeigt nach oben (Blender +Z = Spiel +y), Schneiden und Köpfe zeigen nach
vorne (Blender −Y = Spiel +z). Maße in Metern.

Jede Waffe ist ein Objekt "w_<art>" mit mehreren Materialien (Holz, Stahl,
Schneide, Eisen, Messing, Leder …; Metallwerte für Spiegelungen im Spiel) und
Ecken-Farben (Maserung, Kratzer und vorberechnete Verdeckung). Ein leeres
Objekt "tip_<art>" markiert die Schlagkante für die Bewegungsspur.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402  (zuerst: stellt bmesh und mathutils bereit)
import bmesh  # noqa: E402
from mathutils import Color, Vector, noise  # noqa: E402

import common as C  # noqa: E402

# ---------------------------------------------------------------- Materialien

PATTERN = {}


def pbr(name, color, metal=0.0, rough=0.7, emit=None, strength=1.0, pattern=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes['Principled BSDF']
    c = C.hexcol(color)
    bsdf.inputs['Base Color'].default_value = (c.r, c.g, c.b, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit is not None:
        e = C.hexcol(emit)
        bsdf.inputs['Emission Color'].default_value = (e.r, e.g, e.b, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    m.diffuse_color = (c.r, c.g, c.b, 1)
    if pattern:
        PATTERN[name] = pattern
    return m


def grain(axis=2, scale=1.0, amount=0.28):
    """Holzmaserung entlang einer Achse (Ecken-Helligkeit)."""
    def f(p, n):
        q = [p.x * 70, p.y * 70, p.z * 70]
        q[axis] = (p.x, p.y, p.z)[axis] * 2.5
        v = Vector(q) * scale
        g = noise.noise(v) * amount + math.sin(noise.noise(v * 0.5) * 9) * amount * 0.35
        return 1 + g
    return f


def scratches(amount=0.12):
    def f(p, n):
        s = noise.noise(Vector((p.x * 160, p.y * 40, p.z * 160))) * amount
        return 1 + s - max(0.0, noise.noise(p * 25)) * amount * 0.8
    return f


def mats():
    return {
        'wood': pbr('wood', 0x7a5230, rough=0.72, pattern=grain()),
        'lightwood': pbr('lightwood', 0xc89a64, rough=0.65, pattern=grain(amount=0.18)),
        'darkwood': pbr('darkwood', 0x4e3420, rough=0.75, pattern=grain(amount=0.3)),
        'steel': pbr('steel', 0xc4c8ce, metal=0.9, rough=0.3, pattern=scratches()),
        'edge': pbr('edge', 0xf2f4f8, metal=1.0, rough=0.14, pattern=scratches(0.05)),
        'iron': pbr('iron', 0x5a5d62, metal=0.8, rough=0.55, pattern=scratches(0.08)),
        'brass': pbr('brass', 0xc89a3c, metal=1.0, rough=0.3, pattern=scratches(0.08)),
        'leather': pbr('leather', 0x5e3a22, rough=0.85, pattern=scratches(0.15)),
        'rope': pbr('rope', 0xa48a5c, rough=1.0, pattern=scratches(0.2)),
        'soot': pbr('soot', 0x1e1e20, rough=1.0),
        'rubber': pbr('rubber', 0x8a3a22, rough=0.75),
        'gem': pbr('gem', 0x9fe3ff, rough=0.1, emit=0x3aa0ff, strength=2.5),
        'moon': pbr('moon', 0xfff4c8, metal=0.2, rough=0.35, emit=0xffd86a, strength=1.2),
    }


# ---------------------------------------------------------------- Formen

def obj(name, bm, mat, smooth=0.6):
    ob = C.link(name, bm, mat, smooth_angle=smooth)
    return ob


def lathe(name, profile, mat, segs=20, z0=0.0, lobes=0, lobe=0.0, twist=0.0):
    """Drehkörper aus [Radius, Höhe] um Z. lobes/lobe: gerippter Querschnitt, twist: Verdrehung je Meter."""
    bm = bmesh.new()
    rings = []
    for r, h in profile:
        ring = []
        for k in range(segs):
            a = k / segs * math.tau
            rr = r * (1 + lobe * math.cos(lobes * (a + twist * h))) if lobes else r
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, h + z0)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return obj(name, bm, mat)


def handle(name, length, r, mat, segs=16, flare=1.45):
    """Gedrechselter Stiel mit Knauf unten, leicht tailliert, oben etwas dicker; viele Ringe für die Maserung."""
    prof = [(0.0, -0.045), (r * flare * 0.9, -0.044), (r * flare, -0.032), (r * flare, -0.016), (r * 1.02, 0.0)]
    n = max(6, int(length / 0.04))
    for i in range(1, n + 1):
        t = i / n
        prof.append((r * (0.94 + 0.06 * math.cos(t * math.pi * 2) + 0.1 * t * t), t * length))
    prof.append((0.0, length))
    return lathe(name, prof, mat, segs)


def wrap(parts, m, z0, z1, r, turns_per_m=60):
    """Lederwicklung: schräg gewickelte, flache Bänder."""
    n = int((z1 - z0) * turns_per_m)
    for i in range(n):
        z = z0 + (i + 0.5) * (z1 - z0) / n
        t = C.cylinder('wrap', r, r, (z1 - z0) / n * 0.92, Vector((0, 0, z)), m['leather'], seg=16, rot=(0.12, 0, 0), rings=0)
        parts.append(t)


def plate(name, poly, thick, mat, edge_mat=None, edge_pred=None, taper=None, bevel=0.003, sub=0):
    """Flache Form (Klinge, Blatt): poly in (vorne f, oben u); Dicke entlang X.
    taper(f, u) -> Faktor 0..1 für die Dicke (Schneide dünn), edge_pred(f, u) markiert Schneide-Flächen."""
    bm = bmesh.new()
    vs = [bm.verts.new((0, -f, u)) for f, u in poly]
    face = bm.faces.new(vs)
    if sub:
        bmesh.ops.triangulate(bm, faces=[face])
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=sub, use_grid_fill=True)
    res = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    top = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in top:
        v.co.x += thick
    for v in bm.verts:
        v.co.x -= thick / 2
    if taper:
        for v in bm.verts:
            k = max(0.08, min(1.0, taper(-v.co.y, v.co.z)))
            v.co.x *= k
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel:
        sharp = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > 0.9]
        try:
            bmesh.ops.bevel(bm, geom=sharp, offset=bevel, segments=1, affect='EDGES', profile=0.5)
        except Exception:
            pass
    ob = obj(name, bm, mat)
    if edge_mat and edge_pred:
        ob.data.materials.append(edge_mat)
        for p in ob.data.polygons:
            c = p.center
            if edge_pred(-c.y, c.z):
                p.material_index = 1
    return ob


def curve_tube(name, pts, radii, mat, subdiv=1):
    edges = [(i, i + 1) for i in range(len(pts) - 1)]
    return C.skin_tree(name, pts, edges, radii, mat, subdiv=subdiv)


# ---------------------------------------------------------------- Waffen

def hammer(m):
    p = [handle('h', 1.0, 0.026, m['wood'])]
    wrap(p, m, 0.03, 0.3, 0.03)
    # Kopf: achteckiges Prisma entlang der Schlagrichtung, Bänder, Keil im Auge
    head = C.cylinder('head', 0.085, 0.085, 0.36, Vector((0, 0, 0.98)), m['iron'], seg=8, rot=(math.pi / 2, 0, math.pi / 8), rings=4)
    p.append(head)
    for s in (-1, 1):
        p.append(C.cylinder('face', 0.09, 0.08, 0.035, Vector((0, s * 0.195, 0.98)), m['steel'], seg=8, rot=(math.pi / 2, 0, math.pi / 8), rings=0))
        p.append(C.cylinder('band', 0.092, 0.092, 0.025, Vector((0, s * 0.11, 0.98)), m['steel'], seg=8, rot=(math.pi / 2, 0, math.pi / 8), rings=0))
    p.append(C.box('wedge', (0.012, 0.05, 0.02), Vector((0, 0, 1.07)), m['darkwood'], bevel=0.003, step=1))
    return p, (0, -0.2, 0.98)


def axe(m):
    # Leicht geschwungener Stiel (Skin), Wicklung unten
    p = [curve_tube('h', [Vector((0, 0, -0.04)), Vector((0, 0.015, 0.25)), Vector((0, -0.01, 0.55)), Vector((0, 0.0, 0.76))], [0.026, 0.022, 0.021, 0.024], m['wood'])]
    p.append(C.blob('knob', 0.03, Vector((0, 0, -0.04)), m['wood'], seed=1, rough=0.05, subdiv=2, squash=0.8))
    wrap(p, m, 0.02, 0.22, 0.027)
    # Bärtiges Blatt: Nacken hinten, Blatt nach vorne (−Y), Schneide geschwungen
    poly = [(-0.06, 0.04), (0.03, 0.045), (0.12, 0.08), (0.24, 0.17), (0.28, 0.09), (0.3, 0.0), (0.29, -0.1), (0.26, -0.2),
            (0.17, -0.12), (0.08, -0.07), (0.03, -0.045), (-0.06, -0.04)]
    p.append(plate('blade', [(f, u + 0.66) for f, u in poly], 0.05, m['steel'], m['edge'],
                   edge_pred=lambda f, u: f > 0.255, taper=lambda f, u: 1.0 - max(0.0, f - 0.04) / 0.27, bevel=0.002, sub=0))
    p.append(C.box('eye', (0.06, 0.1, 0.11), Vector((0, 0.03, 0.66)), m['iron'], bevel=0.01, step=1))
    return p, (0, -0.3, 0.66)


def rollingpin(m):
    prof = [(0, -0.12), (0.018, -0.12), (0.022, -0.1), (0.016, -0.04), (0.014, 0.02), (0.037, 0.03), (0.04, 0.05)]
    for i in range(1, 16):
        prof.append((0.04 + 0.002 * math.sin(i * 0.4), 0.05 + i * 0.02))
    prof += [(0.038, 0.39), (0.014, 0.4), (0.016, 0.46), (0.022, 0.52), (0.018, 0.54), (0, 0.54)]
    p = [lathe('pin', [(r, h - 0.02) for r, h in prof], m['lightwood'], 20)]
    # Mehlstaub-Flecken als leichte Ringe
    return p, (0, 0, 0.36)


def staff(m):
    prof = [(0, -0.42), (0.03, -0.41)]
    for i in range(1, 40):
        h = -0.4 + i * 0.038
        knot = 0.009 if i in (8, 27) else 0.0
        prof.append((0.022 + 0.003 * math.sin(i * 0.9) + knot, h))
    prof += [(0.034, 1.11), (0.036, 1.14), (0, 1.15)]
    p = [lathe('shaft', prof, m['darkwood'], 10, lobes=4, lobe=0.12, twist=6.0)]
    # Mondsichel (zwei Kreisbögen), Kristall, Messingfassung
    crescent = []
    # schmale Sichel: äußerer Kreis, innerer Kreis nach rechts versetzt
    # Spitzen genau am Schnittpunkt der Kreise (sonst überschneidet sich die Form)
    R1, R2, D = 0.15, 0.125, 0.07
    xi = (R1 * R1 - R2 * R2 + D * D) / (2 * D)
    yi = math.sqrt(R1 * R1 - xi * xi)
    a1 = math.atan2(yi, xi)
    a2 = math.atan2(yi, xi - D)
    for i in range(25):
        a = a1 + i * (2 * math.pi - 2 * a1) / 24
        crescent.append((math.cos(a) * R1, math.sin(a) * R1 + 1.27))
    for i in range(1, 24):
        a = (2 * math.pi - a2) - i * (2 * math.pi - 2 * a2) / 24
        crescent.append((math.cos(a) * R2 + D, math.sin(a) * R2 + 1.27))
    p.append(plate('moon', crescent, 0.03, m['moon'], bevel=0.0))
    for ob in p[-1:]:
        ob.rotation_euler = (0, 0, math.pi / 2)
    gem = C.blob('gem', 0.045, Vector((0.06, 0, 1.27)), m['gem'], seed=0, rough=0.0, subdiv=1)
    gem.scale = (0.8, 0.8, 1.3)
    p.append(gem)
    for z in (1.12, 1.16):
        p.append(C.cylinder('ring', 0.04, 0.04, 0.02, Vector((0, 0, z)), m['brass'], seg=14, rings=0))
    # Fassung: drei Krallen um den Kristall
    for k in range(3):
        a = k / 3 * math.tau
        p.append(curve_tube('claw', [Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 1.16)), Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, 1.22)),
                                     Vector((math.cos(a) * 0.035, math.sin(a) * 0.035, 1.3))], [0.008, 0.007, 0.004], m['brass'], subdiv=0))
    return p, (0, 0, 1.27)


def harpoongun(m):
    # Holzschaft mit Pistolengriff (Profil in vorne/oben, Dicke X)
    stock = [(-0.05, -0.16), (0.03, -0.16), (0.05, -0.02), (0.05, 0.14), (0.03, 0.22), (-0.03, 0.22), (-0.04, 0.1), (-0.06, -0.02)]
    p = [plate('stock', stock, 0.055, m['wood'], bevel=0.012)]
    p.append(C.cylinder('barrel', 0.03, 0.03, 0.78, Vector((0, 0, 0.6)), m['iron'], seg=16, rings=6))
    p.append(C.cylinder('muzzle', 0.038, 0.034, 0.05, Vector((0, 0, 0.99)), m['brass'], seg=16, rings=0))
    for z in (0.24, 0.5, 0.78):
        p.append(C.cylinder('band', 0.036, 0.036, 0.03, Vector((0, 0, z)), m['brass'], seg=16, rings=0))
    # Abzugsbügel
    p.append(curve_tube('guard', [Vector((0, -0.02, 0.0)), Vector((0, -0.07, -0.02)), Vector((0, -0.075, 0.06)), Vector((0, -0.04, 0.1))], [0.006] * 4, m['brass'], subdiv=0))
    p.append(C.box('trigger', (0.008, 0.012, 0.04), Vector((0, -0.045, 0.04)), m['iron'], bevel=0.002, step=1))
    # Harpune: Schaft, Spitze mit zwei Widerhaken, Leine
    p.append(C.cylinder('shaft', 0.009, 0.009, 0.32, Vector((0, 0, 1.1)), m['steel'], seg=8, rings=1))
    p.append(lathe('point', [(0, 1.32), (0.03, 1.24), (0.012, 1.23), (0, 1.23)], m['edge'], 12))
    for s in (-1, 1):
        p.append(plate('barb', [(0, 1.235), (0.045 * s, 1.2), (0.01 * s, 1.22)], 0.01, m['edge'], bevel=0.0))
        p[-1].rotation_euler = (0, 0, math.pi / 2)
    p.append(C.cylinder('coil', 0.04, 0.04, 0.06, Vector((0, 0.06, 0.3)), m['rope'], seg=14, rot=(0, math.pi / 2, 0), rings=3))
    return p, (0, 0, 1.3)


def broom(m):
    # Seil mit Kugelgewicht, Stange, kugelige Rußbürste aus vielen Borsten
    p = []
    for i in range(9):
        p.append(C.cylinder('rope', 0.016, 0.016, 0.045, Vector((0, 0, 0.02 + i * 0.042)), m['rope'], seg=10, rot=(0.25 * (1 if i % 2 else -1), 0, 0), rings=0))
    p.append(C.blob('ball', 0.05, Vector((0, 0, -0.1)), m['iron'], seed=1, rough=0.02, subdiv=3))
    p.append(C.cylinder('rod', 0.011, 0.011, 0.2, Vector((0, 0, 0.42)), m['iron'], seg=8, rings=1))
    p.append(C.blob('core', 0.055, Vector((0, 0, 0.53)), m['soot'], seed=2, rough=0.05, subdiv=2))
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
    dirs = [v.co.copy() for v in bm.verts]
    bm.free()
    for d in dirs:
        L = 0.075 + noise.noise(d * 3) * 0.015
        c = Vector((0, 0, 0.53)) + d * (0.045 + L / 2)
        b = C.cylinder('br', 0.007, 0.003, L, c, m['soot'], seg=3, rings=0)
        b.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        p.append(b)
    return p, (0, 0, 0.53)


def handbell(m):
    p = [lathe('grip', [(0, 0), (0.016, 0), (0.022, 0.03), (0.017, 0.07), (0.025, 0.1), (0.022, 0.12), (0, 0.125)], m['darkwood'], 14)]
    bell = [(0.014, 0.12), (0.03, 0.128), (0.042, 0.15), (0.05, 0.19), (0.062, 0.225), (0.082, 0.255), (0.094, 0.27), (0.093, 0.278),
            (0.086, 0.276), (0.074, 0.262), (0.056, 0.232), (0.044, 0.196), (0.036, 0.155), (0.022, 0.135), (0, 0.13)]
    p.append(lathe('bell', bell, m['brass'], 28))
    p.append(C.cylinder('clap', 0.004, 0.004, 0.08, Vector((0, 0, 0.21)), m['iron'], seg=6, rings=0))
    p.append(C.blob('ball', 0.018, Vector((0, 0, 0.255)), m['iron'], seed=0, rough=0, subdiv=2))
    return p, (0, 0, 0.26)


def cleaver(m):
    p = [handle('h', 0.2, 0.019, m['darkwood'], flare=1.2)]
    for z in (0.06, 0.13):
        for s in (-1, 1):
            p.append(C.blob('rivet', 0.009, Vector((s * 0.019, 0, z)), m['brass'], seed=0, rough=0, subdiv=1))
    blade = [(-0.03, 0.18), (0.2, 0.19), (0.225, 0.26), (0.23, 0.34), (0.215, 0.44), (-0.03, 0.45)]
    b = plate('blade', blade, 0.02, m['steel'], m['edge'], edge_pred=lambda f, u: f > 0.2, taper=lambda f, u: 1.0 - max(0.0, f - 0.12) / 0.12 * 0.85, bevel=0.002, sub=0)
    # Loch zum Aufhängen
    cut = C.cylinder('hole', 0.018, 0.018, 0.1, Vector((0, -0.17, 0.41)), m['steel'], seg=16, rot=(0, math.pi / 2, 0), rings=0)
    mod = b.modifiers.new('hole', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cut
    C.apply_modifiers(b)
    bpy.data.objects.remove(cut)
    p.append(b)
    p.append(C.box('spine', (0.024, 0.012, 0.27), Vector((0, 0.03, 0.315)), m['iron'], bevel=0.003, step=1))
    return p, (0, -0.2, 0.32)


def scythe(m):
    p = [curve_tube('snath', [Vector((0, 0, -0.4)), Vector((0, -0.04, 0.3)), Vector((0, 0.0, 1.0)), Vector((0, 0.05, 1.5))], [0.024, 0.022, 0.021, 0.022], m['wood'])]
    for z in (0.2, 0.75):
        p.append(C.cylinder('grip', 0.014, 0.012, 0.17, Vector((0.085, 0, z)), m['wood'], seg=10, rot=(0, math.pi / 2, 0), rings=1))
        p.append(C.cylinder('ring', 0.027, 0.027, 0.03, Vector((0, 0, z)), m['iron'], seg=12, rings=0))
    # Lange, gebogene Klinge nach vorne, dünn auslaufend
    pts = []
    for i in range(17):
        t = i / 16
        pts.append((t * 0.72, 1.48 + math.sin(t * math.pi) * 0.11 - t * 0.04))
    for i in range(16, -1, -1):
        t = i / 16
        w = 0.07 * (1 - t) ** 0.8 + 0.004
        pts.append((t * 0.72, 1.48 + math.sin(t * math.pi) * 0.11 - t * 0.04 - w))
    p.append(plate('blade', pts, 0.014, m['steel'], m['edge'], edge_pred=lambda f, u: True and u < 1.48 + math.sin(min(1, f / 0.72) * math.pi) * 0.11 - f / 0.72 * 0.04 - 0.035 * (1 - f / 0.72),
                   taper=lambda f, u: 0.6, bevel=0.0015))
    p.append(C.box('tang', (0.03, 0.06, 0.05), Vector((0, 0.02, 1.47)), m['iron'], bevel=0.005, step=1))
    return p, (0, -0.55, 1.45)


def shovel(m):
    p = [handle('h', 1.0, 0.022, m['wood'])]
    # D-Griff unten
    p.append(curve_tube('d', [Vector((0, -0.05, -0.04)), Vector((0, -0.06, -0.12)), Vector((0, 0, -0.15)), Vector((0, 0.06, -0.12)), Vector((0, 0.05, -0.04))], [0.013] * 5, m['wood'], subdiv=1))
    p.append(C.cylinder('dbar', 0.016, 0.016, 0.11, Vector((0, 0, -0.13)), m['wood'], seg=10, rot=(math.pi / 2, 0, 0), rings=1))
    # Tülle und gewölbtes Blatt mit Trittkanten
    p.append(C.cylinder('socket', 0.03, 0.026, 0.14, Vector((0, 0, 1.0)), m['iron'], seg=14, rings=2))
    # Blatt: Umriss mit runder Spitze als flache Platte (Dicke entlang X), dann zur Vorderseite gedreht
    outline = [(-0.12, 1.06), (0.12, 1.06), (0.125, 1.2)]
    for i in range(1, 12):
        a = i / 12 * math.pi
        outline.append((math.cos(a) * 0.125, 1.2 + math.sin(a) * 0.14))
    outline.append((-0.125, 1.2))
    blade = plate('blade', outline, 0.008, pbr('blade_iron', 0x6a6d72, metal=0.75, rough=0.45), bevel=0.002)
    blade.rotation_euler = (0, 0, math.pi / 2)
    p.append(blade)
    for s in (-1, 1):
        p.append(C.box('tread', (0.08, 0.025, 0.012), Vector((s * 0.07, 0.0, 1.065)), m['iron'], bevel=0.003, step=1))
    p.append(C.box('rib', (0.012, 0.012, 0.2), Vector((0, -0.022, 1.15)), m['iron'], bevel=0.003, step=1))
    return p, (0, 0, 1.3)


def hook(m):
    p = [lathe('cuff', [(0, -0.06), (0.06, -0.06), (0.062, -0.02), (0.057, 0.03), (0.045, 0.055), (0.03, 0.065), (0, 0.065)], m['leather'], 18)]
    for z in (-0.03, 0.02):
        p.append(C.cylinder('stitch', 0.061, 0.061, 0.006, Vector((0, 0, z)), m['rope'], seg=18, rings=0))
    p.append(C.cylinder('ring', 0.042, 0.042, 0.018, Vector((0, 0, 0.065)), m['brass'], seg=16, rings=0))
    p.append(C.cylinder('stem', 0.013, 0.012, 0.11, Vector((0, 0, 0.12)), m['steel'], seg=12, rings=1))
    pts, rad = [], []
    for i in range(14):
        a = math.radians(180 - i * 17)
        pts.append(Vector((0, -0.06 - math.cos(a) * 0.06, 0.18 + math.sin(a) * 0.06 - (0.0 if i < 10 else (i - 9) * 0.004))))
        rad.append(0.013 * (1 - i / 16) + 0.002)
    pts[0] = Vector((0, 0.0, 0.175))
    p.append(curve_tube('hook', pts, rad, m['edge'], subdiv=1))
    return p, (0, -0.1, 0.2)


def sling(m):
    p = [handle('h', 0.12, 0.016, m['wood'], flare=1.3)]
    for s in (-1, 1):
        p.append(curve_tube('arm', [Vector((0, 0, 0.1)), Vector((s * 0.025, 0, 0.15)), Vector((s * 0.045, 0, 0.2)), Vector((s * 0.048, 0, 0.23))], [0.015, 0.013, 0.012, 0.011], m['wood']))
    # Gummiband von Gabel zu Gabel über die Lederschlaufe (nach hinten gezogen)
    p.append(curve_tube('band', [Vector((-0.048, 0, 0.225)), Vector((-0.02, 0.05, 0.22)), Vector((0, 0.07, 0.22)), Vector((0.02, 0.05, 0.22)), Vector((0.048, 0, 0.225))], [0.004] * 5, m['rubber'], subdiv=1))
    pouch = C.box('pouch', (0.04, 0.014, 0.024), Vector((0, 0.072, 0.22)), m['leather'], bevel=0.005, step=1)
    p.append(pouch)
    p.append(C.blob('stone', 0.012, Vector((0, 0.08, 0.22)), m['iron'], seed=3, rough=0.2, subdiv=1))
    return p, (0, 0, 0.22)


WEAPONS = {
    'hammer': hammer, 'axe': axe, 'rollingpin': rollingpin, 'staff': staff, 'harpoongun': harpoongun, 'broom': broom,
    'handbell': handbell, 'cleaver': cleaver, 'scythe': scythe, 'shovel': shovel, 'hook': hook, 'sling': sling,
}


# ---------------------------------------------------------------- Farben und Zusammenbau

def finish(name, parts):
    """Verdeckung (klein, für Fugen und Wicklungen) und Muster in Ecken-Farben, Materialien bleiben getrennt."""
    sc = bpy.context.scene
    sc.world.light_settings.distance = 0.04
    sc.cycles.samples = 512  # kleine Teile: viele Strahlen, sonst rauscht die Verdeckung
    C.bake(parts, ground=False)
    sc.cycles.samples = 64
    for o in parts:
        me = o.data
        ao = me.color_attributes['ao']
        col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        mw = o.matrix_world
        nm = mw.to_3x3()
        for poly in me.polygons:
            mat = me.materials[poly.material_index]
            pat = PATTERN.get(mat.name)
            for li in poly.loop_indices:
                v = me.vertices[me.loops[li].vertex_index]
                p = mw @ v.co
                k = pat(p, (nm @ v.normal).normalized()) if pat else 1.0
                a = 0.5 + 0.5 * ao.data[li].color[0]
                c = max(0.0, min(1.0, k * a))
                col.data[li].color = (c, c, c, 1)
        me.color_attributes.active_color = col
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        me.color_attributes.remove(ao)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/models/weapons.glb'
    prev = sys.argv[2] if len(sys.argv) > 2 else None
    C.reset()
    m = mats()
    built = []
    for kind, fn in WEAPONS.items():
        parts, tip = fn(m)
        ob = finish(f'w_{kind}', parts)
        t = bpy.data.objects.new(f'tip_{kind}', None)
        bpy.context.scene.collection.objects.link(t)
        t.location = tip
        t.parent = ob
        built.append(ob)
        print(f'{kind}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} Dreiecke')
    if prev:
        os.makedirs(prev, exist_ok=True)
        for ob in built:
            ob.rotation_euler = (0, 0, -0.9)
            C.preview([ob], os.path.join(prev, ob.name + '.png'), size=360, elev=12)
            ob.rotation_euler = (0, 0, 0)
    for ob in built:
        ob.rotation_euler = (0, 0, 0)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_vertex_color='ACTIVE',
        export_materials='EXPORT',
        export_animations=False,
    )


if __name__ == '__main__':
    main()
