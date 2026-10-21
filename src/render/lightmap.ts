// Blender writes bakes bottom-up while glTF UVs are top-down: flip V once on the lightmap UVs.
// MASTER_PLAN §2.1 — the lightmap debug view (?view=lightmap) exists to catch this.
export interface UVAttribute {
  count: number;
  getY(index: number): number;
  setY(index: number, y: number): unknown;
  needsUpdate: boolean;
}

export function flipLightmapV(uv: UVAttribute): void {
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;
}
