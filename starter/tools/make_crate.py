"""Procedural asset test: build a reinforced wooden crate in Blender (headless, via the bpy module)
and export it as glTF for Godot. Usage: python3 make_crate.py <out.glb>"""
import sys, math, random
import bpy

out = sys.argv[1]
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, rough, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    return m

wood = mat("Wood", (0.32, 0.20, 0.11), 0.85)
frame = mat("FrameWood", (0.18, 0.11, 0.06), 0.9)
steel = mat("Steel", (0.35, 0.35, 0.36), 0.45, 1.0)

def box(name, size, loc, material, rot=(0, 0, 0), bevel=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new("bevel", "BEVEL"); b.width = bevel; b.segments = 2
    bpy.ops.object.modifier_apply(modifier="bevel")  # apply before join, or join drops it
    o.data.materials.append(material)
    return o

S = 0.8  # crate edge length (m)
h = S / 2
parts = [box("Core", (S * 0.96, S * 0.96, S * 0.96), (0, 0, 0), wood, bevel=0.004)]
# planks: slight random offsets so it doesn't look machine-perfect
for face_axis in range(3):
    for sign in (-1, 1):
        for i in range(4):
            off = -h + S * (i + 0.5) / 4
            jitter = random.uniform(-0.004, 0.004)
            size = [S * 0.94] * 3
            loc = [0.0, 0.0, 0.0]
            size[face_axis] = 0.03
            loc[face_axis] = sign * (h * 0.96 + 0.012) + jitter
            plank_axis = (face_axis + 1) % 3
            size[plank_axis] = S / 4 - 0.012
            loc[plank_axis] = off
            parts.append(box(f"Plank{face_axis}{sign}{i}", size, tuple(loc), wood, bevel=0.006))
# 12 edge beams
t = 0.07
for axis in range(3):
    for a in (-1, 1):
        for b in (-1, 1):
            size = [t] * 3; size[axis] = S + 0.02
            loc = [0.0, 0.0, 0.0]
            o1, o2 = (axis + 1) % 3, (axis + 2) % 3
            loc[o1] = a * (h + 0.005); loc[o2] = b * (h + 0.005)
            parts.append(box(f"Edge{axis}{a}{b}", size, tuple(loc), frame, bevel=0.012))
# diagonal brace on two faces + steel corner caps
for sign in (-1, 1):
    parts.append(box(f"Brace{sign}", (0.06, S * 1.25, 0.035), (sign * (h + 0.03), 0, 0), frame,
                     rot=(math.radians(45), 0, 0), bevel=0.01))
for x in (-1, 1):
    for y in (-1, 1):
        for z in (-1, 1):
            parts.append(box("Cap", (0.11, 0.11, 0.11), (x * h, y * h, z * h), steel, bevel=0.015))

for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
crate = bpy.context.active_object
crate.name = "Crate"
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True)
print("EXPORTED", out, "verts:", len(crate.data.vertices), "tris(approx):",
      sum(len(p.vertices) - 2 for p in crate.data.polygons))
