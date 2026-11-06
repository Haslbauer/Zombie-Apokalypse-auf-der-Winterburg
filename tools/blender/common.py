"""
Hilfen für die Modell-Skripte (Blender als Python-Paket `bpy`).

Arbeitsweise:
  1. Teile aus bmesh bauen (Kisten mit abgerundeten Kanten, Röhren, Kugeln).
     Jedes Teil bekommt ein Material mit Grundfarbe und optional eine
     Färbe-Funktion (Maserung, abgeplatzte Farbe, Rinde ...).
  2. bake(): Umgebungsverdeckung (Ambient Occlusion) mit Cycles in die
     Vertex-Farben rechnen. Ecken, Fugen und das Innere von Baumkronen
     werden dunkler; im Spiel kostet das nichts.
  3. finish(): Grundfarbe × Muster × Verdeckung in eine Farbe pro Ecke
     schreiben, alle Teile zu einem Mesh mit einem Material zusammenfügen.
  4. export(): alle fertigen Modelle in eine GLB-Datei (Y nach oben).

Koordinaten in Blender: Z nach oben, -Y ist vorne (im Spiel Süden, +z).
"""

import math
import random

import bmesh
import bpy
from mathutils import Color, Vector, noise

# Färbe-Funktionen je Material: (Position, Normale, Grundfarbe) -> Farbe
SHADERS = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 64
    world = bpy.data.worlds.new('world')
    sc.world = world
    world.light_settings.distance = 0.6


def hexcol(h):
    """0xRRGGBB (sRGB) -> lineare Farbe (Blender rechnet linear)."""
    c = Color(((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255))
    return Color(c.from_srgb_to_scene_linear())


def material(name, color, shader=None):
    """Material mit Grundfarbe (0xRRGGBB); shader färbt pro Ecke nach (optional)."""
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*hexcol(color), 1)
        if shader:
            SHADERS[name] = shader
    return m


def link(name, bm, mat, smooth_angle=0.6):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    # Kanten mit großem Knick bleiben scharf
    if smooth_angle:
        for e in me.edges:
            e.use_edge_sharp = False
        me.validate()
        bm2 = bmesh.new()
        bm2.from_mesh(me)
        for e in bm2.edges:
            if e.is_manifold and e.calc_face_angle(0) > smooth_angle:
                e.smooth = False
        bm2.to_mesh(me)
        bm2.free()
    return ob


def box(name, size, loc, mat, bevel=0.015, step=0.12, rot=(0, 0, 0)):
    """Kiste mit abgerundeten Kanten; step: Rasterweite (für weiche Verdeckung)."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    # feineres Raster, damit die Verdeckung pro Ecke weich verläuft
    cuts = max(0, int(max(size) / step) - 1)
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=min(cuts, 10), use_grid_fill=True)
    if bevel > 0:
        sharp = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > 1.0]
        bmesh.ops.bevel(bm, geom=sharp, offset=min(bevel, min(size) * 0.3), segments=2, affect='EDGES', profile=0.5)
    ob = link(name, bm, mat)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def cylinder(name, r1, r2, h, loc, mat, seg=16, rot=(0, 0, 0), rings=3):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    if rings:
        side = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-4]
        bmesh.ops.subdivide_edges(bm, edges=side, cuts=rings)
    ob = link(name, bm, mat)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def blob(name, r, loc, mat, seed=0, rough=0.25, subdiv=2, squash=1.0):
    """Unregelmäßige Kugel (Laubballen, Steine)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in bm.verts:
        n = v.co.normalized()
        d = (noise.noise(v.co * (2.2 / r) + off) * rough * r
             + noise.noise(v.co * (5.0 / r) + off) * rough * 0.4 * r
             + abs(noise.noise(v.co * (11.0 / r) + off)) * rough * 0.5 * r)
        v.co = v.co + n * d
        v.co.z *= squash
    ob = link(name, bm, mat, smooth_angle=0)
    ob.location = loc
    return ob


def apply_modifiers(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def skin_tree(name, verts, edges, radii, mat, subdiv=1):
    """Stamm und Äste aus einem Linien-Gerüst (Skin-Modifier, dann geglättet)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], edges, [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('skin', 'SKIN')
    sk.branch_smoothing = 0.6
    sk.use_smooth_shade = True
    for i, r in enumerate(radii):
        me.skin_vertices[0].data[i].radius = (r, r)
    me.skin_vertices[0].data[0].use_root = True
    if subdiv:
        ss = ob.modifiers.new('sub', 'SUBSURF')
        ss.levels = subdiv
        ss.render_levels = subdiv
    apply_modifiers(ob)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def preview(objects, path, size=420, elev=50, dist=None):
    """Kontrollbild (Cycles) von schräg oben, wie im Spiel."""
    sc = bpy.context.scene
    others = [o for o in sc.objects if o not in objects]
    for o in others:
        o.hide_render = True
    lo = Vector((min(o.bound_box[i][0] + o.location.x for o in objects for i in range(8)),
                 min(o.bound_box[i][1] + o.location.y for o in objects for i in range(8)), 0))
    hi = Vector((max(o.bound_box[i][0] + o.location.x for o in objects for i in range(8)),
                 max(o.bound_box[i][1] + o.location.y for o in objects for i in range(8)),
                 max(o.bound_box[i][2] + o.location.z for o in objects for i in range(8))))
    center = (lo + hi) / 2
    center.z = hi.z * 0.45
    d = dist or max(hi - lo) * 1.9
    e = math.radians(elev)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    cam.location = center + Vector((d * 0.35, -d * math.cos(e), d * math.sin(e)))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = 3.5
    sun = bpy.data.objects.new('sun', sun_data)
    sun.rotation_euler = (math.radians(45), math.radians(20), math.radians(30))
    sc.collection.objects.link(sun)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    ground = bpy.context.active_object
    gm = bpy.data.materials.new('_prev_ground')
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.08, 0.16, 0.05, 1)
    ground.data.materials.append(gm)
    sc.world.color = (0.25, 0.28, 0.35)
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.cycles.samples = 24
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    sc.cycles.samples = 64
    for o in (cam, sun, ground):
        bpy.data.objects.remove(o)
    for o in others:
        o.hide_render = False


def bake(objects, ground=True):
    """Umgebungsverdeckung der Objekte in die Ecken-Farbe 'ao' rechnen."""
    sc = bpy.context.scene
    others = [o for o in sc.objects if o not in objects]
    for o in others:
        o.hide_render = True
    plane = None
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
        plane = bpy.context.active_object
        plane.data.materials.append(material('_ground', 0x777777))
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        me = o.data
        attr = me.color_attributes.get('ao') or me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    sc.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO')
    if plane:
        bpy.data.objects.remove(plane)
    for o in others:
        o.hide_render = False


def finish(name, objects, ao_strength=1.0, ao_floor=0.25):
    """Farben (Grundfarbe × Muster × Verdeckung) schreiben und zu einem Objekt zusammenfügen."""
    for o in objects:
        me = o.data
        ao = me.color_attributes['ao']
        col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        mw = o.matrix_world
        nm = mw.to_3x3()
        for poly in me.polygons:
            mat = me.materials[poly.material_index]
            base = Color(mat.diffuse_color[:3])
            shader = SHADERS.get(mat.name)
            for li in poly.loop_indices:
                v = me.vertices[me.loops[li].vertex_index]
                p = mw @ v.co
                n = (nm @ v.normal).normalized()
                c = shader(p, n, Color(base)) if shader else Color(base)
                a = ao.data[li].color[0]
                a = 1 - (1 - a) * ao_strength
                a = ao_floor + (1 - ao_floor) * a
                col.data[li].color = (c.r * a, c.g * a, c.b * a, 1)
        me.color_attributes.active_color = col
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        me.color_attributes.remove(ao)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    # ein Material (weiß, die Farbe steckt in den Ecken)
    out = bpy.data.materials.get('vc')
    if out is None:
        out = bpy.data.materials.new('vc')
        out.diffuse_color = (1, 1, 1, 1)
        nt = out.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        vcol = nt.nodes.new('ShaderNodeVertexColor')
        vcol.layer_name = 'Col'
        nt.links.new(vcol.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.85
    ob.data.materials.clear()
    ob.data.materials.append(out)
    for p in ob.data.polygons:
        p.material_index = 0
    # Ursprung auf den Boden, Mitte
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def export(path):
    bpy.ops.object.select_all(action='DESELECT')
    for m in list(bpy.data.materials):
        if m.users == 0:
            bpy.data.materials.remove(m)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_vertex_color='ACTIVE',
        export_materials='EXPORT',
        export_animations=False,
    )


# ---------- Muster ----------

def jitter(c, amount):
    """Farbe heller/dunkler um amount (Faktor)."""
    k = 1 + amount
    return Color((max(0, c.r * k), max(0, c.g * k), max(0, c.b * k)))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return Color((a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t))


def wood_grain(axis='x', scale=1.0):
    """Maserung entlang einer Achse: Streifen und feine Fasern."""
    def f(p, n, c):
        q = Vector((p.x, p.y, p.z))
        if axis == 'x':
            u = Vector((q.x * 0.6, q.y * 14, q.z * 14))
        elif axis == 'y':
            u = Vector((q.x * 14, q.y * 0.6, q.z * 14))
        else:
            u = Vector((q.x * 14, q.y * 14, q.z * 0.6))
        g = noise.noise(u * scale) * 0.18 + noise.noise(u * scale * 3.1) * 0.08
        return jitter(c, g)
    return f


def painted(chip=0x8a6a45, amount=0.22):
    """Farbe mit abgeplatzten Stellen (darunter Holz) und leichtem Schmutz unten."""
    under = hexcol(chip)

    def f(p, n, c):
        k = noise.noise(p * 7.0) + noise.noise(p * 19.0) * 0.4
        out = mix(c, under, (k - (0.55 - amount)) * 6)
        dirt = max(0.0, 0.5 - p.z) * 0.25
        return jitter(out, -dirt + noise.noise(p * 40.0) * 0.04)
    return f


def speckle(amount=0.08, freq=30.0):
    def f(p, n, c):
        return jitter(c, noise.noise(p * freq) * amount)
    return f


def rand(seed):
    r = random.Random(seed)
    return r
