"""
Häuser der Winterburg aus Blender (Python-Paket bpy), nach den Rechtecken
in data/map.json (look "house", breiter als 1,2 m; species "gables" = Reihe
von Giebeln). Ergebnis: public/models/houses.glb mit je Haus

  house_<x*100>_<y*100>        Mauern, Dach, Fenster, Türen (eine Textur)
  house_<x*100>_<y*100>_glow   erleuchtete Fensterscheiben und Türlampen

Die Texturen (Ziegel mit Mörtelfugen, Dachziegel mit Moos, Sandstein,
Holz, Blech) entstehen aus Blenders Textur-Knoten und werden zusammen mit
der Umgebungsverdeckung in ein Bild je Haus gerechnet (Bake).

Aufruf:
  python tools/blender/houses.py public/models/houses.glb [Vorschau-Ordner]
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402  (zuerst: stellt bmesh und mathutils bereit)
import bmesh  # noqa: E402
from mathutils import Color, Matrix, Vector  # noqa: E402

import common as C  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WALL_H = 3.2  # wie im Spiel (mapdecor.ts)


# ---------------------------------------------------------------- Materialien (Knoten)

class Nodes:
    """Kleine Hilfe zum Bauen von Knotenbäumen."""

    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.out = self.nt.nodes.new('ShaderNodeOutputMaterial')

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.nt.links.new(a, b)

    def uv(self):
        return self.n('ShaderNodeUVMap', uv_map='tex').outputs['UV']

    def rgb(self, hexv):
        c = C.hexcol(hexv)
        return (c.r, c.g, c.b, 1)

    def mul(self, a, b, fac=1.0):
        m = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        m.inputs[0].default_value = fac
        self.link(a, m.inputs[6])
        if isinstance(b, tuple):
            m.inputs[7].default_value = b
        else:
            self.link(b, m.inputs[7])
        return m.outputs[2]

    def mix(self, fac, a, b):
        m = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MIX')
        if isinstance(fac, float):
            m.inputs[0].default_value = fac
        else:
            self.link(fac, m.inputs[0])
        for i, s in ((6, a), (7, b)):
            if isinstance(s, tuple):
                m.inputs[i].default_value = s
            else:
                self.link(s, m.inputs[i])
        return m.outputs[2]

    def noise(self, scale, detail=4.0, vec=None):
        t = self.n('ShaderNodeTexNoise')
        t.inputs['Scale'].default_value = scale
        t.inputs['Detail'].default_value = detail
        if vec is not None:
            self.link(vec, t.inputs['Vector'])
        return t

    def ramp(self, fac, stops):
        r = self.n('ShaderNodeValToRGB')
        els = r.color_ramp.elements
        while len(els) > 2:
            els.remove(els[-1])
        for i, (pos, col) in enumerate(stops):
            e = els[i] if i < 2 else els.new(pos)
            e.position = pos
            e.color = self.rgb(col) if isinstance(col, int) else col
        self.link(fac, r.inputs['Fac'])
        return r.outputs['Color']

    def height_grime(self, color, top=1.2, dark=0.72):
        """Unten schmutziger (Spritzwasser), nach oben sauber."""
        geo = self.n('ShaderNodeNewGeometry')
        sep = self.n('ShaderNodeSeparateXYZ')
        self.link(geo.outputs['Position'], sep.inputs[0])
        mr = self.n('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.0
        mr.inputs['From Max'].default_value = top
        mr.inputs['To Min'].default_value = dark
        mr.inputs['To Max'].default_value = 1.0
        self.link(sep.outputs['Z'], mr.inputs['Value'])
        cr = self.n('ShaderNodeCombineColor')
        for k in ('Red', 'Green', 'Blue'):
            self.link(mr.outputs['Result'], cr.inputs[k])
        return self.mul(color, cr.outputs['Color'])

    def finish(self, albedo, image):
        """Farbe × Umgebungsverdeckung als Leuchten (für den Bake), Bildknoten als Ziel."""
        ao = self.n('ShaderNodeAmbientOcclusion', samples=24)
        ao.inputs['Distance'].default_value = 0.7
        self.link(albedo, ao.inputs['Color'])
        em = self.n('ShaderNodeEmission')
        self.link(ao.outputs['Color'], em.inputs['Color'])
        self.link(em.outputs['Emission'], self.out.inputs['Surface'])
        img = self.n('ShaderNodeTexImage', image=image)
        self.nt.nodes.active = img


def mat_brick(name, image, c1=0x9a4a36, c2=0x7d3a2a, mortar=0xb9ae9c):
    m = bpy.data.materials.new(name)
    N = Nodes(m)
    b = N.n('ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0, squash_frequency=1)
    N.link(N.uv(), b.inputs['Vector'])
    b.inputs['Color1'].default_value = N.rgb(c1)
    b.inputs['Color2'].default_value = N.rgb(c2)
    b.inputs['Mortar'].default_value = N.rgb(mortar)
    b.inputs['Scale'].default_value = 1.0
    b.inputs['Mortar Size'].default_value = 0.011
    b.inputs['Mortar Smooth'].default_value = 0.15
    b.inputs['Bias'].default_value = 0.0
    b.inputs['Brick Width'].default_value = 0.25
    b.inputs['Row Height'].default_value = 0.078
    # einzelne Steine heller/dunkler, großflächige Flecken, Schmutz unten
    var = N.ramp(N.noise(2.2, 2.0, N.uv()).outputs['Fac'], [(0.3, 0x9a9a9a), (0.7, 0xffffff)])
    col = N.mul(b.outputs['Color'], var, 0.6)
    fine = N.ramp(N.noise(40.0, 2.0, N.uv()).outputs['Fac'], [(0.35, 0xb0b0b0), (0.65, 0xffffff)])
    col = N.mul(col, fine, 0.5)
    col = N.height_grime(col, 1.0, 0.7)
    N.finish(col, image)
    return m


def mat_noise(name, image, c_dark, c_light, scale=6.0, grime=True):
    """Sandstein, Putz, Holz, Blech: zwei Farben, Rauschen dazwischen."""
    m = bpy.data.materials.new(name)
    N = Nodes(m)
    t = N.noise(scale, 6.0, N.uv())
    col = N.ramp(t.outputs['Fac'], [(0.35, c_dark), (0.65, c_light)])
    fine = N.ramp(N.noise(scale * 6, 2.0, N.uv()).outputs['Fac'], [(0.3, 0xc0c0c0), (0.7, 0xffffff)])
    col = N.mul(col, fine, 0.5)
    if grime:
        col = N.height_grime(col, 0.8, 0.75)
    N.finish(col, image)
    return m


def mat_wood(name, image, c_dark, c_light):
    """Holz mit Maserung entlang u (Bretter laufen in u-Richtung)."""
    m = bpy.data.materials.new(name)
    N = Nodes(m)
    mp = N.n('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.4, 12.0, 12.0)
    N.link(N.uv(), mp.inputs['Vector'])
    t = N.noise(3.0, 8.0, mp.outputs['Vector'])
    col = N.ramp(t.outputs['Fac'], [(0.3, c_dark), (0.7, c_light)])
    N.finish(col, image)
    return m


def mat_roof(name, image):
    m = bpy.data.materials.new(name)
    N = Nodes(m)
    b = N.n('ShaderNodeTexBrick', offset=0.5, offset_frequency=2, squash=1.0, squash_frequency=1)
    N.link(N.uv(), b.inputs['Vector'])
    b.inputs['Color1'].default_value = N.rgb(0xa2442a)
    b.inputs['Color2'].default_value = N.rgb(0x86341f)
    b.inputs['Mortar'].default_value = N.rgb(0x2a120c)
    b.inputs['Scale'].default_value = 1.0
    b.inputs['Mortar Size'].default_value = 0.012
    b.inputs['Mortar Smooth'].default_value = 0.6
    b.inputs['Bias'].default_value = 0.0
    b.inputs['Brick Width'].default_value = 0.24
    b.inputs['Row Height'].default_value = 0.3
    var = N.ramp(N.noise(1.6, 2.0, N.uv()).outputs['Fac'], [(0.3, 0x8a8a8a), (0.7, 0xffffff)])
    col = N.mul(b.outputs['Color'], var, 0.7)
    # Moos und Flechten in Flecken
    moss = N.ramp(N.noise(0.9, 6.0, N.uv()).outputs['Fac'], [(0.58, (0, 0, 0, 1)), (0.7, (1, 1, 1, 1))])
    lichen = N.ramp(N.noise(7.0, 4.0, N.uv()).outputs['Fac'], [(0.4, 0x46602c), (0.7, 0x7a8a40)])
    sep = N.n('ShaderNodeSeparateColor')
    N.link(moss, sep.inputs['Color'])
    col = N.mix(sep.outputs['Red'], col, lichen)
    N.finish(col, image)
    return m


# ---------------------------------------------------------------- Bauteile

class House:
    """Ein Haus im eigenen Rahmen: X = lange Achse, -Y = Vorderseite (im Spiel side > 0)."""

    def __init__(self, o, tex_size, key=None):
        self.o = o
        self.long = max(o['w'], o['h'])
        self.short = min(o['w'], o['h'])
        self.along_x = o['w'] >= o['h']
        self.gables = o.get('species') == 'gables' and self.long >= 7
        self.key = key or f"house_{round(o['x'] * 100)}_{round(o['y'] * 100)}"
        self.image = bpy.data.images.new(self.key, tex_size, tex_size)
        self.parts = []
        self.glow = []
        self.cutters = []
        self.R = C.rand(round(o['x'] * 13 + o['y'] * 7))
        im = self.image
        self.m = {
            'brick': mat_brick(f'{self.key}_brick', im),
            'stone': mat_noise(f'{self.key}_stone', im, 0x9a8f7c, 0xc8bea8, 5.0),
            'roof': mat_roof(f'{self.key}_roof', im),
            'ridge': mat_noise(f'{self.key}_ridge', im, 0x5a2016, 0x7a2e1e, 8.0, False),
            'frame': mat_noise(f'{self.key}_frame', im, 0xcfc8b8, 0xe8e2d4, 9.0, False),
            'shutter': mat_wood(f'{self.key}_shutter', im, 0x2f5a34, 0x46784a),
            'door': mat_wood(f'{self.key}_door', im, 0x5a3a22, 0x7a5634),
            'plank': mat_wood(f'{self.key}_plank', im, 0x5a4632, 0x7a6448),
            'board': mat_wood(f'{self.key}_board', im, 0x3a2418, 0x5a3a26),
            'metal': mat_noise(f'{self.key}_metal', im, 0x5e6266, 0x8a9094, 4.0, False),
            'dark': mat_noise(f'{self.key}_dark', im, 0x0c0b0a, 0x1a1714, 9.0, False),
            'iron': mat_noise(f'{self.key}_iron', im, 0x1e1e1e, 0x3a3a3a, 9.0, False),
            'clay': mat_noise(f'{self.key}_clay', im, 0x8a4a2c, 0xa8603a, 8.0, False),
            'flowerbox': mat_wood(f'{self.key}_fbox', im, 0x5a3a22, 0x6a4a2c),
            'leaf': mat_noise(f'{self.key}_leaf', im, 0x2f5a24, 0x5a8a3a, 20.0, False),
            'ivy': mat_noise(f'{self.key}_ivy', im, 0x1f4a1c, 0x4a7a32, 14.0, False),
            'felt': mat_noise(f'{self.key}_felt', im, 0x26262a, 0x3a3a40, 12.0, False),
            'felt2': mat_noise(f'{self.key}_felt2', im, 0x34343a, 0x48484e, 10.0, False),
            'water': mat_noise(f'{self.key}_water', im, 0x2a3a44, 0x4a5f6a, 3.0, False),
            'rubble': mat_noise(f'{self.key}_rubble', im, 0x6a6258, 0x968c7e, 7.0, False),
            'soot': mat_noise(f'{self.key}_soot', im, 0x141210, 0x2a2420, 6.0, False),
        }
        self.glow_mat = bpy.data.materials.get('glow_warm') or self._glow_mat()

    def _glow_mat(self):
        g = bpy.data.materials.new('glow_warm')
        g.diffuse_color = (*C.hexcol(0xffcf7a), 1)
        bsdf = g.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*C.hexcol(0xffcf7a), 1)
        bsdf.inputs['Emission Color'].default_value = (*C.hexcol(0xffa53a), 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
        return g

    # Ort im Hausrahmen: a entlang, c quer (+ = Vorderseite), z Höhe → Blender
    @staticmethod
    def P(a, c, z):
        return Vector((a, -c, z))

    def box(self, mat, size_a, size_c, size_z, a, c, z, bevel=0.01, rot=(0, 0, 0), glow=False):
        ob = C.box('p', (size_a, size_c, size_z), self.P(a, c, z), self.glow_mat if glow else self.m[mat], bevel=bevel, step=99, rot=rot)
        (self.glow if glow else self.parts).append(ob)
        return ob

    def cut(self, size_a, size_c, size_z, a, c, z):
        ob = C.box('cut', (size_a, size_c, size_z), self.P(a, c, z), self.m['dark'], bevel=0, step=99)
        self.cutters.append(ob)

    def prism(self, mat, base, height, thick, a, c, z, along_c=False):
        """Giebeldreieck (Breite base, Höhe height, Dicke thick); Fläche quer zur Achse a (along_c=False)."""
        bm = bmesh.new()
        if not along_c:
            pts = [(-base / 2, 0), (base / 2, 0), (0, height)]  # in (c, z)
            vs = [bm.verts.new((a + s * thick / 2, -(c + pc), z + pz)) for s in (-1, 1) for pc, pz in pts]
        else:
            pts = [(-base / 2, 0), (base / 2, 0), (0, height)]  # in (a, z)
            vs = [bm.verts.new((a + pa, -(c + s * thick / 2), z + pz)) for s in (-1, 1) for pa, pz in pts]
        bm.faces.new(vs[0:3])
        bm.faces.new(vs[3:6][::-1])
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((vs[i], vs[j], vs[3 + j], vs[3 + i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        ob = C.link('gable', bm, self.m[mat])
        self.parts.append(ob)
        return ob

    def ivy(self, a, c, z, w, h, normal_c=True):
        """Efeu: Büschel kleiner Blattballen, flach an der Wand (Wand-Normale entlang c oder a)."""
        R = self.R
        n = max(4, int(w * h * 9))
        for i in range(n):
            da = (R.random() - 0.5) * w
            dz = R.random() ** 0.7 * h
            rr = 0.12 + R.random() * 0.12
            pos = self.P(a + da, c, z + dz) if normal_c else self.P(a, c + da, z + dz)
            b = C.blob('ivy', rr, pos, self.m['ivy'], seed=int(R.random() * 1000), rough=0.5, subdiv=1)
            b.scale = (1, 0.4, 1) if normal_c else (0.4, 1, 1)
            self.parts.append(b)

    def cyl(self, mat, r, length, a, c, z, axis='a', seg=10, half=False):
        rot = {'a': (0, math.pi / 2, 0), 'c': (math.pi / 2, 0, 0), 'z': (0, 0, 0)}[axis]
        ob = C.cylinder('c', r, r, length, self.P(a, c, z), self.m[mat], seg=seg, rot=rot, rings=0)
        self.parts.append(ob)
        return ob

    # ---------- Wand, Fenster, Tür ----------

    def walls(self):
        L, S = self.long, self.short
        self.box('stone', L + 0.14, S + 0.14, 0.5, 0, 0, 0.25, bevel=0.02)
        self.wall = self.box('brick', L, S, WALL_H, 0, 0, WALL_H / 2, bevel=0.0)
        self.parts.remove(self.wall)
        # Steinband unter der Traufe und als Sohlbank-Gesims
        self.box('stone', L + 0.08, S + 0.08, 0.16, 0, 0, WALL_H - 0.12, bevel=0.015)
        self.box('stone', L + 0.04, S + 0.04, 0.07, 0, 0, 1.52, bevel=0.01)

    def window(self, a, side, boarded, face='c'):
        """Fenster in einer Längswand (face 'c': Wand bei c = side*S/2) oder Giebelwand (face 'a')."""
        S, L = self.short, self.long
        z = 2.1
        w, h = 0.82, 1.05
        depth = 0.16
        if face == 'c':
            wall = side * S / 2
            def at(da, dc, dz):
                return a + da, wall - side * dc, z + dz
            sz = lambda sa, sc, sh: (sa, sc, sh)  # noqa: E731
        else:
            wall = side * L / 2
            def at(da, dc, dz):  # da quer zur Wand (entlang c), dc in die Wand hinein (entlang a)
                return wall - side * dc, a + da, z + dz
            sz = lambda sa, sc, sh: (sc, sa, sh)  # noqa: E731

        def put(mat, sa, sc, sh, da, dc, dz, bevel=0.008, glow=False):
            A, Cc, Z = at(da, dc, dz)
            x, y, zz = sz(sa, sc, sh)
            return self.box(mat, x, y, zz, A, Cc, Z, bevel=bevel, glow=glow)
        # Öffnung
        A, Cc, Z = at(0, 0, 0)
        x, y, zz = sz(w, depth * 2, h)
        self.cut(x, y, zz, A, Cc, Z)
        # Scheibe (leuchtend oder dunkel), Rahmen und Kreuz
        put('dark', w, 0.02, h, 0, depth - 0.01, 0, bevel=0, glow=not boarded)
        fr = 0.06
        put('frame', w, 0.06, fr, 0, depth - 0.04, h / 2 - fr / 2)
        put('frame', w, 0.06, fr, 0, depth - 0.04, -h / 2 + fr / 2)
        put('frame', fr, 0.06, h, w / 2 - fr / 2, depth - 0.04, 0)
        put('frame', fr, 0.06, h, -w / 2 + fr / 2, depth - 0.04, 0)
        if not boarded:
            put('frame', 0.04, 0.05, h, 0, depth - 0.05, 0)
            put('frame', w, 0.05, 0.04, 0, depth - 0.05, 0.15)
        # Sohlbank (Stein, steht vor), Sturz aus Stein
        put('stone', w + 0.2, 0.24, 0.07, 0, -0.04, -h / 2 - 0.035, bevel=0.012)
        put('stone', w + 0.24, 0.05, 0.18, 0, -0.02, h / 2 + 0.09, bevel=0.01)
        if boarded:
            # Bretter quer vor dem Fenster
            for dz, ang in ((0.3, 0.12), (-0.05, -0.18), (-0.33, 0.08)):
                ob = put('plank', w + 0.25, 0.04, 0.13, 0, -0.04, dz)
                ob.rotation_euler.rotate(Matrix.Rotation(ang, 3, (Vector((0, 1, 0)) if face == 'c' else Vector((1, 0, 0)))))
        else:
            # Fensterläden offen an der Wand
            for s in (-1, 1):
                put('shutter', 0.42, 0.05, h + 0.02, s * (w / 2 + 0.25), -0.03, 0)
            if self.R.random() < 0.55:
                put('flowerbox', w - 0.05, 0.2, 0.17, 0, -0.18, -h / 2 + 0.05)
                for k in range(6):
                    pos = self.P(*at(-w / 2 + 0.1 + k * (w - 0.2) / 5, -0.18, -h / 2 + 0.17))
                    self.parts.append(C.blob('leaf', 0.08, pos, self.m['leaf'], seed=k, rough=0.4, subdiv=1))

    def door(self, a, side):
        S = self.short
        wall = side * S / 2
        w, h = 1.1, 2.15
        zc = 0.12 + h / 2
        self.cut(w, 0.36, h, a, wall, zc)
        # Bretter-Tür in der Laibung
        for k in range(5):
            self.box('door', 0.21, 0.06, h - 0.02, a - w / 2 + 0.11 + k * 0.22, wall - side * 0.13, zc, bevel=0.006)
        for dz in (-0.6, 0.55):
            self.box('iron', w - 0.2, 0.03, 0.06, a, wall - side * 0.1, zc + dz, bevel=0.004)
        # Steinrahmen und Stufe
        self.box('stone', w + 0.3, 0.06, 0.22, a, wall + side * 0.01, zc + h / 2 + 0.11, bevel=0.012)
        for s in (-1, 1):
            self.box('stone', 0.14, 0.06, h, a + s * (w / 2 + 0.07), wall + side * 0.01, zc, bevel=0.01)
        self.box('stone', w + 0.6, 0.55, 0.18, a, wall + side * 0.27, 0.09, bevel=0.02)
        # Laterne neben der Tür
        la = a + w / 2 + 0.45
        self.box('iron', 0.05, 0.25, 0.05, la, wall + side * 0.12, 2.5, bevel=0)
        self.box('lamp', 0.2, 0.2, 0.26, la, wall + side * 0.25, 2.35, bevel=0.01, glow=True)
        self.box('iron', 0.26, 0.26, 0.05, la, wall + side * 0.25, 2.5, bevel=0.01)

    def facades(self):
        L, S = self.long, self.short
        posts = max(1, round(L / 2.4))
        span = L / posts
        door_panel = posts // 2
        for side in (-1, 1):
            for i in range(posts):
                a = -L / 2 + (i + 0.5) * span
                is_door = (L >= 7 and i == door_panel) and (side == 1 or self.gables)
                if is_door:
                    self.door(a, side)
                    continue
                if S < 2.5:
                    continue
                boarded = (i * 7 + round(self.o['x'] * 3 + self.o['y']) + (1 if side > 0 else 0)) % 3 == 0
                self.window(a, side, boarded, 'c')
        # Giebelwände: ein Fenster, wenn breit genug (nicht bei der Giebelreihe)
        if not self.gables and S >= 4:
            for side in (-1, 1):
                self.window(0, side, side < 0, 'a')

    # ---------- Dächer ----------

    def gable_roof(self, ridge_len, span, rh, a0, c0, along_a=True, over=0.45):
        """Satteldach: First entlang a (along_a) oder c, Breite span, Firsthöhe rh über WALL_H."""
        H = WALL_H
        half = span / 2 + over
        drop = rh * over / (span / 2)
        slope = math.atan2(rh, span / 2)
        slen = math.hypot(half, rh + drop)
        for sgn in (-1, 1):
            # Dachfläche (Platte), Mitte zwischen First und Traufe
            mid_c = sgn * half / 2
            mid_z = H + rh - (rh + drop) / 2
            if along_a:
                ob = self.box('roof', ridge_len, slen, 0.1, a0, c0 + mid_c, mid_z + 0.05, bevel=0.01)
                ob.rotation_euler = (sgn * slope, 0, 0)  # um X (Blender), Vorderseite -Y
            else:
                ob = self.box('roof', slen, ridge_len, 0.1, a0 + mid_c, c0, mid_z + 0.05, bevel=0.01)
                ob.rotation_euler = (0, sgn * slope, 0)
            # Ziegelreihen als feine Stufen (Schattenkanten)
            k = 0.3
            while k < slen - 0.1:
                t = k / slen
                cc = sgn * half * t
                zz = H + rh - (rh + drop) * t + 0.115
                if along_a:
                    st = self.box('roof', ridge_len, 0.06, 0.025, a0, c0 + cc, zz, bevel=0.004)
                    st.rotation_euler = (sgn * slope, 0, 0)
                else:
                    st = self.box('roof', 0.06, ridge_len, 0.025, a0 + cc, c0, zz, bevel=0.004)
                    st.rotation_euler = (0, sgn * slope, 0)
                k += 0.3
            # Dachrinne an der Traufe, Ortgangbretter an den Giebeln
            gz = H - drop + 0.02
            if along_a:
                self.cyl('metal', 0.07, ridge_len, a0, c0 + sgn * (half + 0.02), gz, 'a', 8)
                for e in (-1, 1):
                    vb = self.box('board', 0.06, slen, 0.2, a0 + e * (ridge_len / 2 + 0.03), c0 + mid_c, mid_z + 0.05, bevel=0.008)
                    vb.rotation_euler = (sgn * slope, 0, 0)
            else:
                self.cyl('metal', 0.07, ridge_len, a0 + sgn * (half + 0.02), c0, gz, 'c', 8)
                for e in (-1, 1):
                    vb = self.box('board', slen, 0.06, 0.2, a0 + mid_c, c0 + e * (ridge_len / 2 + 0.03), mid_z + 0.05, bevel=0.008)
                    vb.rotation_euler = (0, sgn * slope, 0)
        # Firstziegel
        self.cyl('ridge', 0.13, ridge_len + 0.05, a0, c0, H + rh + 0.08, 'a' if along_a else 'c', 10)

    def roofs(self):
        L, S = self.long, self.short
        if not self.gables:
            rh = min(2.6, max(0.9, S * 0.42))
            self.gable_roof(L + 0.6, S, rh, 0, 0, True, 0.45)
            for side in (-1, 1):
                self.prism('brick', S, rh - 0.05, 0.2, side * (L / 2 - 0.1), 0, WALL_H)
                if S >= 4:
                    self.oculus(side * L / 2, 0, WALL_H + rh * 0.42, 'a', side)
            self.rh = rh
            if L >= 10:
                ca = 0.28 * L if self.along_x else -0.28 * L
                self.chimney(ca, 0.18 * S, WALL_H + rh + 1.2)
        else:
            n = max(2, round(L / 4.3))
            seg = L / n
            rh = min(2.6, max(1.2, seg * 0.5))
            for i in range(n):
                a = -L / 2 + (i + 0.5) * seg
                self.gable_roof(S + 0.7, seg + 0.12 - 0.12, rh, a, 0, False, 0.06)
                for side in (-1, 1):
                    self.prism('brick', seg, rh - 0.05, 0.2, a, side * (S / 2 - 0.1), WALL_H, along_c=True)
                    self.oculus(a, side * S / 2, WALL_H + rh * 0.42, 'c', side)
                if i > 0:
                    self.cyl('metal', 0.09, S + 0.7, a - seg / 2, 0, WALL_H + 0.05, 'c', 8)
            for i in range(1, n):
                self.cyl('metal', 0.05, WALL_H, -L / 2 + i * seg, S / 2 + 0.07, WALL_H / 2, 'z', 8)
            self.rh = rh
            self.chimney(0, -0.2 * S, WALL_H + rh + 1.0)

    def oculus(self, a, c, z, face, side):
        """Rundes Giebelfenster mit Steinring."""
        if face == 'a':
            ring = C.cylinder('ring', 0.3, 0.3, 0.08, self.P(a + side * 0.02, c, z), self.m['stone'], seg=16, rot=(0, math.pi / 2, 0), rings=0)
            pane = C.cylinder('pane', 0.2, 0.2, 0.02, self.P(a + side * 0.065, c, z), self.glow_mat, seg=16, rot=(0, math.pi / 2, 0), rings=0)
        else:
            ring = C.cylinder('ring', 0.3, 0.3, 0.08, self.P(a, c + side * 0.02, z), self.m['stone'], seg=16, rot=(math.pi / 2, 0, 0), rings=0)
            pane = C.cylinder('pane', 0.2, 0.2, 0.02, self.P(a, c + side * 0.065, z), self.glow_mat, seg=16, rot=(math.pi / 2, 0, 0), rings=0)
        self.parts.append(ring)
        self.glow.append(pane)

    def chimney(self, a, c, top):
        h = top - WALL_H + 0.2
        self.box('brick', 0.72, 0.72, h, a, c, WALL_H - 0.2 + h / 2, bevel=0.01)
        self.box('stone', 0.88, 0.88, 0.12, a, c, top + 0.06, bevel=0.015)
        for s in (-1, 1):
            self.cyl('clay', 0.09, 0.28, a + s * 0.17, c, top + 0.26, 'z', 10)
        self.chimney_top = (a, c, top + 0.4)

    # ---------- Zusammenbau ----------

    def build(self):
        self.walls()
        self.facades()
        self.roofs()
        # Öffnungen in die Mauer schneiden
        if self.cutters:
            bpy.ops.object.select_all(action='DESELECT')
            for c in self.cutters:
                c.select_set(True)
            bpy.context.view_layer.objects.active = self.cutters[0]
            bpy.ops.object.join()
            cutter = bpy.context.active_object
            mod = self.wall.modifiers.new('cut', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.solver = 'EXACT'
            mod.object = cutter
            C.apply_modifiers(self.wall)
            bpy.data.objects.remove(cutter)
        # Deckel und Boden der Mauer braucht niemand (spart Texturfläche)
        bm = bmesh.new()
        bm.from_mesh(self.wall.data)
        dead = [f for f in bm.faces if abs(f.normal.z) > 0.9 and (f.calc_center_median().z > WALL_H / 2 - 0.01 or f.calc_center_median().z < -WALL_H / 2 + 0.01)]
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        bm.to_mesh(self.wall.data)
        bm.free()
        self.parts.append(self.wall)
        # ins Spiel drehen: lange Achse entlang z (im Spiel) → 90° um Blender-Z
        if not self.along_x:
            bpy.context.view_layer.update()  # sonst sind matrix_world-Werte veraltet
            rot = Matrix.Rotation(math.pi / 2, 4, 'Z')
            for ob in self.parts + self.glow:
                ob.matrix_world = rot @ ob.matrix_world

    def bake(self):
        objs = self.parts
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        ob = bpy.context.active_object
        ob.name = self.key
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        tex_uv(ob)
        # Bake-UV: Inseln automatisch, gleichmäßige Dichte
        bake_uv = ob.data.uv_layers.new(name='bake')
        ob.data.uv_layers.active = bake_uv
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        # Boden für die Verdeckung, andere Häuser ausblenden
        sc = bpy.context.scene
        others = [o for o in sc.objects if o is not ob]
        for o in others:
            o.hide_render = True
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        mid = sum(bb, Vector()) / 8
        bpy.ops.mesh.primitive_plane_add(size=60, location=(mid.x, mid.y, 0))
        plane = bpy.context.active_object
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        sc.cycles.samples = 48
        sc.render.bake.margin = 6
        sc.render.bake.target = 'IMAGE_TEXTURES'
        bpy.ops.object.bake(type='EMIT')
        bpy.data.objects.remove(plane)
        for o in others:
            o.hide_render = False
        # Ein Material mit dem fertigen Bild
        final = bpy.data.materials.new(self.key)
        nt = final.node_tree
        bsdf = nt.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = 0.9
        img = nt.nodes.new('ShaderNodeTexImage')
        img.image = self.image
        uvn = nt.nodes.new('ShaderNodeUVMap')
        uvn.uv_map = 'bake'
        nt.links.new(uvn.outputs['UV'], img.inputs['Vector'])
        nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
        ob.data.materials.clear()
        ob.data.materials.append(final)
        for p in ob.data.polygons:
            p.material_index = 0
        ob.data.uv_layers.remove(ob.data.uv_layers['tex'])
        ob.data.uv_layers['bake'].active_render = True
        self.image.file_format = 'JPEG'
        self.object = ob
        # Leuchtende Teile zu einem Objekt
        if self.glow:
            bpy.ops.object.select_all(action='DESELECT')
            for o in self.glow:
                o.select_set(True)
            bpy.context.view_layer.objects.active = self.glow[0]
            bpy.ops.object.join()
            g = bpy.context.active_object
            g.name = self.key + '_glow'
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        return ob


class Ruin(House):
    """Verfallener Flügel: eine Hälfte steht (hohle Mauern, Flachdach mit Dachpappe),
    die andere ist eingestürzt (Mauerstümpfe, Schutt, Balken, Efeu).
    Im eigenen Rahmen liegt die stehende Hälfte bei a < 0."""

    def build(self):
        L, S = self.long, self.short
        hl, hs = L / 2, S / 2
        T = 0.32
        B = 0.45  # Sockelhöhe
        R = self.R
        self.box('stone', L + 0.15, S + 0.15, B, 0, 0, B / 2, bevel=0.02)
        self.box('soot', L - 0.4, S - 0.4, 0.02, 0, 0, B + 0.01, bevel=0)
        # ---- stehende Hälfte: hohle Mauern mit Fensteröffnungen
        walls = []
        for side in (-1, 1):
            walls.append(self.box('brick', hl, T, WALL_H, -hl / 2, side * (hs - T / 2), B + WALL_H / 2, bevel=0))
        walls.append(self.box('brick', T, S, WALL_H, -hl + T / 2, 0, B + WALL_H / 2, bevel=0))
        for w in walls:
            self.parts.remove(w)
        cutters = []
        for side in (-1, 1):
            a = -hl + 1.15
            k = 0
            while a < -0.6:
                cutters.append(C.box('cut', (0.82, 0.8, 1.0), self.P(a, side * (hs - T / 2), 2.4), self.m['dark'], bevel=0, step=99))
                # Sohlbank und Sturz aus Stein
                self.box('stone', 1.0, T + 0.12, 0.07, a, side * (hs - T / 2), 1.86, bevel=0.01)
                self.box('stone', 1.04, T + 0.04, 0.16, a, side * (hs - T / 2), 2.98, bevel=0.01)
                if (k + (side > 0)) % 2 == 0:
                    for dz, ang in ((0.25, 0.15), (-0.1, -0.2)):
                        pl = self.box('plank', 1.05, 0.04, 0.13, a, side * (hs + 0.03), 2.4 + dz)
                        pl.rotation_euler.rotate(Matrix.Rotation(ang, 3, Vector((0, 1, 0))))
                a += 2.3
                k += 1
        cut = cutters[0]
        bpy.ops.object.select_all(action='DESELECT')
        for c in cutters:
            c.select_set(True)
        bpy.context.view_layer.objects.active = cut
        bpy.ops.object.join()
        cut = bpy.context.active_object
        for w in walls:
            mod = w.modifiers.new('cut', 'BOOLEAN')
            mod.operation = 'DIFFERENCE'
            mod.solver = 'EXACT'
            mod.object = cut
            C.apply_modifiers(w)
            self.parts.append(w)
        bpy.data.objects.remove(cut)
        # Steinband unter der Dachkante
        for side in (-1, 1):
            self.box('stone', hl + 0.04, T + 0.1, 0.16, -hl / 2, side * (hs - T / 2), B + WALL_H - 0.1, bevel=0.012)
        # ---- Flachdach mit Dachpappe: Bahnen, Nähte, Blechkante, Flicken, Pfütze
        rz = B + WALL_H
        self.box('felt', hl + 0.25, S + 0.3, 0.12, -hl / 2 - 0.1, 0, rz + 0.06, bevel=0.01)
        c = -hs
        while c <= hs + 0.01:
            self.box('felt2', hl + 0.2, 0.09, 0.025, -hl / 2 - 0.1, c, rz + 0.13, bevel=0.006)
            c += 0.95
        for side in (-1, 1):
            self.box('metal', hl + 0.32, 0.06, 0.12, -hl / 2 - 0.1, side * (hs + 0.15), rz + 0.09, bevel=0.01)
        self.box('metal', 0.06, S + 0.36, 0.12, -hl - 0.24, 0, rz + 0.09, bevel=0.01)
        for i in range(5):
            pa = -hl + 0.7 + R.random() * (hl - 1.4)
            pc = (R.random() - 0.5) * (S - 0.8)
            p = self.box('felt2', 0.5 + R.random() * 0.6, 0.4 + R.random() * 0.5, 0.02, pa, pc, rz + 0.13, bevel=0.004)
            p.rotation_euler.z = R.random()
        pud = C.blob('pud', 0.6, self.P(-hl * 0.55, (R.random() - 0.5) * (S - 1.8), rz + 0.125), self.m['water'], seed=4, rough=0.2, subdiv=2, squash=0.02)
        self.parts.append(pud)
        # Abbruchkante: Pappe hängt in Fetzen über die Mauer, Sparrenstümpfe ragen heraus
        c = -hs + 0.1
        while c < hs - 0.1:
            fl = self.box('felt', 0.4, 0.42, 0.025, 0.12, c + 0.2, rz - 0.05, bevel=0.004)
            fl.rotation_euler = (0, 0.6 + R.random() * 0.7, R.uniform(-0.15, 0.15))
            c += 0.46
        for i in range(4):
            c = -hs + 0.5 + i * (S - 1) / 3
            bm = self.box('board', 0.9 + R.random() * 0.5, 0.14, 0.16, 0.25, c, rz - 0.1, bevel=0.01)
            bm.rotation_euler = (0, R.uniform(-0.1, 0.25), R.uniform(-0.1, 0.1))
        # ---- eingestürzte Hälfte: gezackte Mauerstümpfe mit Efeu
        for side in (-1, 1):
            a = 0.0
            while a < hl - 0.2:
                h = max(0.3, (WALL_H - 0.4) * (1 - a / hl) * (0.45 + R.random() * 0.6))
                st = self.box('brick', 0.56, T, h, a + 0.28, side * (hs - T / 2), B + h / 2, bevel=0.03)
                st.rotation_euler = (R.uniform(-0.03, 0.03), R.uniform(-0.05, 0.05), 0)
                # lose Ziegel auf der Mauerkrone
                if R.random() < 0.6:
                    lb = self.box('brick', 0.26, 0.13, 0.08, a + 0.28 + R.uniform(-0.1, 0.1), side * (hs - T / 2), B + h + 0.04, bevel=0.01)
                    lb.rotation_euler.z = R.uniform(-0.5, 0.5)
                if R.random() < 0.35:
                    self.ivy(a + 0.28, side * (hs + 0.04), B, 0.7, h * 0.85)
                a += 0.56
        eh = 0.5 + R.random() * 0.5
        self.box('brick', T, S, eh, hl - T / 2, 0, B + eh / 2, bevel=0.03)
        # Efeu an der stehenden Hälfte
        for i in range(4):
            side = 1 if i % 2 else -1
            self.ivy(-hl + 0.8 + R.random() * (hl - 1.6), side * (hs + 0.05), B, 0.9 + R.random() * 0.6, 1.2 + R.random() * 1.6)
        # Schutthaufen, Ziegel und Balken
        for i in range(12):
            r = 0.3 + R.random() * 0.45
            self.parts.append(C.blob('rub', r, self.P(R.random() * (hl - 0.6) + 0.3, (R.random() - 0.5) * (S - 1), B), self.m['rubble' if R.random() < 0.6 else 'brick'], seed=60 + i, rough=0.5, subdiv=1, squash=0.55))
        for i in range(45):
            b = self.box('brick', 0.25, 0.12, 0.075, R.random() * (hl + 1) - 0.4, (R.random() - 0.5) * (S + 2.2), 0.05 + R.random() * 0.45, bevel=0.01)
            b.rotation_euler = (R.uniform(-0.4, 0.4), R.uniform(-0.4, 0.4), R.random() * 3)
        for i in range(5):
            bm = self.box('board', 2.4 + R.random() * 1.6, 0.16, 0.16, R.random() * hl * 0.8 + 0.3, (R.random() - 0.5) * (S - 1), 0.75 + R.random() * 0.6, bevel=0.015)
            bm.rotation_euler = (R.uniform(-0.3, 0.3), R.uniform(-0.4, 0.4), R.random() * math.pi)
        if not self.along_x:
            bpy.context.view_layer.update()  # sonst sind matrix_world-Werte veraltet
            rot = Matrix.Rotation(math.pi / 2, 4, 'Z')
            for ob in self.parts + self.glow:
                ob.matrix_world = rot @ ob.matrix_world


class Courtyard(House):
    """Hofmauern (schmale Haus-Rechtecke) und Hoftor, direkt in Spielkoordinaten
    (a = x, c = y der Karte); das Modell steht im Spiel im Ursprung."""

    def __init__(self, walls, gates, tex_size):
        super().__init__({'x': 0, 'y': 0, 'w': 1, 'h': 0.5}, tex_size, key='courtyard')
        self.walls = walls
        self.gates = gates

    def build(self):
        H = 2.6
        R = self.R
        piers_done = []  # Eckpfeiler nur einmal (zwei Mauern treffen sich)
        for o in self.walls:
            along = o['w'] >= o['h']
            ln = max(o['w'], o['h'])
            t = min(o['w'], o['h'])
            self.box('stone', o['w'] + 0.1, o['h'] + 0.1, 0.35, o['x'], o['y'], 0.175, bevel=0.015)
            self.box('brick', o['w'], o['h'], H, o['x'], o['y'], H / 2, bevel=0.0)
            self.box('stone', o['w'] + 0.14, o['h'] + 0.14, 0.12, o['x'], o['y'], H + 0.06, bevel=0.02)
            piers = max(1, round(ln / 2.5))
            for i in range(piers + 1):
                tt = -ln / 2 + i * ln / piers
                pa, pc = (o['x'] + tt, o['y']) if along else (o['x'], o['y'] + tt)
                sa, sc = (0.45, t + 0.18) if along else (t + 0.18, 0.45)
                if any(abs(pa - x) < 0.8 and abs(pc - y) < 0.8 for x, y in piers_done):
                    continue
                piers_done.append((pa, pc))
                self.box('brick', sa, sc, H + 0.2, pa, pc, (H + 0.2) / 2, bevel=0.01)
                self.box('stone', sa + 0.12, sc + 0.12, 0.12, pa, pc, H + 0.26, bevel=0.02)
            # Efeu an beiden Seiten
            for i in range(3):
                if R.random() < 0.3:
                    continue
                tt = (R.random() - 0.5) * (ln - 1)
                side = 1 if R.random() < 0.5 else -1
                h = 0.8 + R.random() * 1.4
                if along:
                    self.ivy(o['x'] + tt, o['y'] + side * (t / 2 + 0.06), 0.3, 0.8 + R.random() * 0.6, h, True)
                else:
                    self.ivy(o['x'] + side * (t / 2 + 0.06), o['y'] + tt, 0.3, 0.8 + R.random() * 0.6, h, False)
        for d in self.gates:
            self.gate(d)

    def gate(self, d):
        along = d['w'] >= d['h']
        W = max(d['w'], d['h'])

        def at(u, v):
            """u entlang der Mauer, v quer dazu → (a, c)."""
            return (d['x'] + u, d['y'] + v) if along else (d['x'] + v, d['y'] + u)

        def sz(su, sv):
            return (su, sv) if along else (sv, su)
        for s in (-1, 1):
            a, c = at(s * (W / 2 + 0.3), 0)
            self.box('brick', *sz(0.55, 0.75), 3.0, a, c, 1.5, bevel=0.01)
            self.box('stone', *sz(0.68, 0.88), 0.14, a, c, 3.07, bevel=0.02)
            self.parts.append(C.blob('ball', 0.2, self.P(a, c, 3.36), self.m['stone'], seed=7, rough=0.02, subdiv=2))
        # Flacher Bogen aus Ziegeln zwischen den Pfeilern, Schlussstein aus Stein
        r_in, r_out, rise = W / 2 + 0.05, W / 2 + 0.4, 0.55
        bm = bmesh.new()
        segs = 18
        ring = []
        for i in range(segs + 1):
            t = math.pi * i / segs
            for rr in (r_in, r_out):
                u, z = -math.cos(t) * rr, 2.45 + math.sin(t) * rr * rise
                for v in (-0.3, 0.3):
                    a, c = at(u, v)
                    ring.append(bm.verts.new(self.P(a, c, z)))
        for i in range(segs):
            q = [ring[(i * 4) + k] for k in range(4)]
            n_ = [ring[((i + 1) * 4) + k] for k in range(4)]
            # Reihenfolge je Ecke: (innen,-v) (innen,+v) (außen,-v) (außen,+v)
            for f in ((q[0], q[1], n_[1], n_[0]), (q[2], n_[2], n_[3], q[3]), (q[0], n_[0], n_[2], q[2]), (q[1], q[3], n_[3], n_[1])):
                bm.faces.new(f)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.parts.append(C.link('arch', bm, self.m['brick']))
        a, c = at(0, 0)
        self.box('stone', *sz(0.3, 0.64), 0.42, a, c, 2.45 + (r_in + r_out) / 2 * rise, bevel=0.015)
        # offene Torflügel aus Brettern mit Eisenbändern, nach innen (Süden) aufgeschwungen
        lw = W / 2 - 0.05
        for s in (-1, 1):
            hinge_u = s * (W / 2 - 0.02)
            ang = s * 1.25
            for k in range(5):
                u0 = -(k + 0.5) * (lw / 5) * s
                du = math.cos(ang) * u0
                dv = -math.sin(abs(ang)) * abs(u0)
                a, c = at(hinge_u + du, 0.1 - dv)
                pl = self.box('door', *sz(lw / 5 - 0.02, 0.06), 2.1, a, c, 1.1, bevel=0.006)
                pl.rotation_euler.z = (ang if along else ang + math.pi / 2)
            for zz in (0.5, 1.7):
                u0 = -lw / 2 * s
                a, c = at(hinge_u + math.cos(ang) * u0, 0.1 + math.sin(abs(ang)) * abs(u0) + 0.04)
                bnd = self.box('iron', *sz(lw, 0.03), 0.07, a, c, zz, bevel=0.004)
                bnd.rotation_euler.z = (ang if along else ang + math.pi / 2)
        a, c = at(0, 0)
        self.box('stone', *sz(W, 0.7), 0.05, a, c, 0.025, bevel=0.01)


def tex_uv(ob):
    """UV 'tex' in Metern für die Textur-Knoten: Wände senkrecht (Ziegel waagrecht),
    Dachflächen entlang First und Gefälle, Böden von oben."""
    me = ob.data
    uv = me.uv_layers.new(name='tex')
    up = Vector((0, 0, 1))
    for poly in me.polygons:
        n = poly.normal
        if abs(n.z) > 0.95:
            ax, ay = Vector((1, 0, 0)), Vector((0, 1, 0))
        elif abs(n.z) < 0.25:
            h = Vector((n.x, n.y, 0)).normalized()
            ax = up.cross(h).normalized()
            ay = up
        else:
            h = Vector((n.x, n.y, 0)).normalized()
            ax = up.cross(h).normalized()  # entlang First
            ay = n.cross(ax).normalized()  # das Gefälle hinauf
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (p.dot(ax), p.dot(ay))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/models/houses.glb'
    prev = sys.argv[2] if len(sys.argv) > 2 else None
    with open(os.path.join(ROOT, 'data', 'map.json'), encoding='utf8') as f:
        arena = json.load(f)
    C.reset()
    houses = [o for o in arena['obstacles'] if o.get('look') == 'house' and o['kind'] == 'rect' and min(o['w'], o['h']) > 1.2]
    done = []
    for o in houses:
        area = 2 * (o['w'] + o['h']) * WALL_H + o['w'] * o['h'] * 2.6
        size = 2048 if area > 120 else 1024
        h = House(o, size)
        h.build()
        ob = h.bake()
        done.append((h, ob))
        print(f"{h.key}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} Dreiecke, Textur {size}px, Schornstein {getattr(h, 'chimney_top', None)}")
    for o in arena['obstacles']:
        if o.get('look') == 'ruin' and o['kind'] == 'rect':
            r = Ruin(o, 2048, key=f"ruin_{round(o['x'] * 100)}_{round(o['y'] * 100)}")
            r.build()
            ob = r.bake()
            done.append((r, ob))
            print(f"{r.key}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} Dreiecke")
    walls = [o for o in arena['obstacles'] if o.get('look') == 'house' and o['kind'] == 'rect' and min(o['w'], o['h']) <= 1.2]
    gates = [d for d in arena.get('decor', []) if d.get('look') == 'gate']
    if walls or gates:
        cy = Courtyard(walls, gates, 2048)
        cy.build()
        ob = cy.bake()
        done.append((cy, ob))
        print(f"courtyard: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} Dreiecke")
    # Hilfsobjekte und ungenutzte Materialien weg
    keep = {h.key for h, _ in done} | {h.key + '_glow' for h, _ in done}
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o)
    if prev:
        os.makedirs(prev, exist_ok=True)
        for h, ob in done:
            show = [ob] + [o for o in bpy.data.objects if o.name == h.key + '_glow']
            C.preview(show, os.path.join(prev, h.key + '.png'), size=640, elev=42)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_vertex_color='NONE',
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_jpeg_quality=82,
        export_animations=False,
    )


if __name__ == '__main__':
    main()
