"""Browser-pipeline test: model a corridor in headless Blender, bake global illumination into a
lightmap with Cycles (CPU), export the mesh as glTF and the lightmap as EXR.
Usage: python3 bake_corridor.py <out_dir> [samples] [lightmap_px] [raw_dir]
raw_dir keeps the un-denoised bake out of the shipped assets (defaults to out_dir)."""
import sys, time, math
import bpy

out_dir = sys.argv[1]
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 128
LM = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
RAW_DIR = sys.argv[4] if len(sys.argv) > 4 else out_dir
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

def mat(name, rgb, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Roughness"].default_value = rough
    return m

concrete = mat("Concrete", (0.20, 0.195, 0.185), 0.9)
floor_m = mat("WetFloor", (0.05, 0.05, 0.05), 0.2)
cab_m = mat("Cabinet", (0.22, 0.25, 0.22), 0.6)

parts = []
def slab(size, loc, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    parts.append(o)

L = 24.0
zc = -L / 2 + 2
slab((4.0, L, 0.2), (0, -zc, -0.1), floor_m)            # Blender is Z-up: (x, y=depth, z=up)
slab((4.0, L, 0.2), (0, -zc, 3.1), concrete)            # ceiling
slab((0.2, L, 3.2), (-2.1, -zc, 1.5), concrete)         # left wall
slab((0.2, L, 3.2), (2.1, -zc, 1.5), concrete)          # right wall
slab((4.4, 0.2, 3.2), (0, L - 2, 1.5), concrete)        # far wall (y = +22 -> three z = -22)
slab((4.4, 0.2, 3.2), (0, -2.1, 1.5), concrete)         # back wall
for z in (4.0, 10.0, 16.0):
    for x in (-1.75, 1.75):
        slab((0.5, 0.5, 3.0), (x, z, 1.5), concrete)
slab((0.6, 1.2, 1.9), (1.65, 12.8, 0.95), cab_m)        # a filing cabinet bank
slab((0.6, 0.6, 1.1), (-1.65, 18.5, 0.55), cab_m)

bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
env = bpy.context.active_object
env.name = "Corridor"

# lightmap UVs (single UV set; surface detail in the browser comes from world-space noise)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
bpy.ops.object.mode_set(mode="OBJECT")

# lights: warm ceiling lamp mid-corridor, red emergency lamp at the far end, nothing near the camera
def light(kind, loc, energy, rgb, size=0.1):
    d = bpy.data.lights.new(kind, kind)
    d.energy = energy
    d.color = rgb
    if kind == "AREA":
        d.size = size
    else:
        d.shadow_soft_size = size
    o = bpy.data.objects.new(kind, d)
    o.location = loc
    scn.collection.objects.link(o)
    return o

light("POINT", (0, 7.0, 2.75), 70, (1.0, 0.72, 0.45), 0.15)
red = light("AREA", (0.3, 17.0, 2.9), 90, (1.0, 0.12, 0.06), 0.5)
red.rotation_euler = (0, 0, 0)  # area light faces -Z (down)

img = bpy.data.images.new("LM", LM, LM, float_buffer=True)
for m in (concrete, floor_m, cab_m):
    n = m.node_tree.nodes.new("ShaderNodeTexImage")
    n.image = img
    m.node_tree.nodes.active = n

scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = SAMPLES
scn.render.bake.margin = 4
bpy.ops.object.select_all(action="DESELECT")
env.select_set(True)
bpy.context.view_layer.objects.active = env
t0 = time.time()
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"})
bake_s = time.time() - t0

# always keep the raw bake, then denoise it with OpenImageDenoise through the compositor
img.filepath_raw = f"{RAW_DIR}/corridor_lm_raw.exr"; img.file_format = "OPEN_EXR"; img.save()
t1 = time.time()
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); scn.collection.objects.link(cam); scn.camera = cam
scn.render.resolution_x = scn.render.resolution_y = LM
scn.render.resolution_percentage = 100
scn.cycles.samples = 1
denoised = False
try:
    ng = bpy.data.node_groups.new("BakeDenoise", "CompositorNodeTree")
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    scn.compositing_node_group = ng
    src = ng.nodes.new("CompositorNodeImage"); src.image = img
    dn = ng.nodes.new("CompositorNodeDenoise")
    out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(src.outputs["Image"], dn.inputs["Image"]); ng.links.new(dn.outputs["Image"], out.inputs[0])
    scn.render.use_compositing = True
    scn.render.image_settings.file_format = "OPEN_EXR"
    scn.render.image_settings.color_depth = "16"
    scn.render.filepath = f"{out_dir}/corridor_lm.exr"
    bpy.ops.render.render(write_still=True)
    denoised = True
except Exception as e:
    print("DENOISE_FAILED", repr(e))
    img.filepath_raw = f"{out_dir}/corridor_lm.exr"; img.save()
print(f"DENOISE denoised={denoised} seconds={time.time() - t1:.0f}")

# remove bake nodes before export so the glTF carries plain materials
for m in (concrete, floor_m, cab_m):
    for n in list(m.node_tree.nodes):
        if n.type == "TEX_IMAGE":
            m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action="DESELECT")
env.select_set(True)
bpy.ops.export_scene.gltf(filepath=f"{out_dir}/corridor.glb", export_format="GLB", use_selection=True)
print(f"BAKE_DONE samples={SAMPLES} lightmap={LM}px seconds={bake_s:.0f} tris~{sum(len(p.vertices)-2 for p in env.data.polygons)}")
