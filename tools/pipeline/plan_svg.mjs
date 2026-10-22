// Floor plans of content/layout.json as one SVG (docs/layout.svg), for the owner's layout review (M2 gate).
// Rooms are coloured by acoustic tag; doors, blast doors and archways sit on walls; stairs, lift and vents are
// marked; locked doors show their key. Regenerate after editing the layout: node tools/pipeline/plan_svg.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const layout = JSON.parse(readFileSync('content/layout.json', 'utf8'));
const acoustics = JSON.parse(readFileSync('content/rooms.json', 'utf8')).rooms;
const S = 11; // px per metre
const FILL = { small_hard: '#d9d2c3', medium_hard: '#cfc6b3', large_hard: '#bfb39b', soft: '#c9d3bd', wet: '#b7c8cf', machine: '#d8b9a6', shaft: '#b9b4c9' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

let x0 = 20, svg = '', width = 0, height = 0;
for (const level of layout.levels) {
  const rooms = layout.rooms.filter((r) => r.level === level.id);
  const minX = Math.min(...rooms.map((r) => r.x[0])), maxX = Math.max(...rooms.map((r) => r.x[1]));
  const minZ = Math.min(...rooms.map((r) => r.z[0])), maxZ = Math.max(...rooms.map((r) => r.z[1]));
  // north (+z) is up on the page
  const px = (x) => x0 + (x - minX) * S, pz = (z) => 60 + (maxZ - z) * S;
  svg += `<text x="${x0}" y="34" class="h">${esc(level.id)} · ${esc(level.name)} (floor ${level.floorY} m)</text>`;
  for (const r of rooms) {
    const ac = acoustics[r.id] ?? {};
    svg += `<rect x="${px(r.x[0])}" y="${pz(r.z[1])}" width="${(r.x[1] - r.x[0]) * S}" height="${(r.z[1] - r.z[0]) * S}" fill="${FILL[ac.acoustic] ?? '#ddd'}" stroke="#333" stroke-width="1.5"/>`;
    const cx = px((r.x[0] + r.x[1]) / 2), cz = pz((r.z[0] + r.z[1]) / 2);
    const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0];
    if (w >= 7.5) {
      svg += `<text x="${cx}" y="${cz - 2}" class="n">${esc(r.name)}</text><text x="${cx}" y="${cz + 10}" class="m">${w}×${d} m · h ${r.height} · ${esc(ac.surface ?? '')} · ${ac.noiseDb ?? '?'} dB</text>`;
    } else if (d > w) { // narrow and long: the name runs along the room, details in the tooltip
      svg += `<text x="${cx}" y="${cz}" class="n" transform="rotate(-90 ${cx} ${cz})">${esc(r.name)}<title>${w}×${d} m · h ${r.height} · ${esc(ac.surface ?? '')} · ${ac.noiseDb ?? '?'} dB</title></text>`;
    } else {
      svg += `<text x="${cx}" y="${cz + 3}" class="n s">${esc(r.name)}<title>${w}×${d} m · h ${r.height} · ${esc(ac.surface ?? '')} · ${ac.noiseDb ?? '?'} dB</title></text>`;
    }
  }
  for (const o of layout.openings) {
    const a = layout.rooms.find((r) => r.id === o.a), b = layout.rooms.find((r) => r.id === o.b);
    const here = a.level === level.id ? a : b.level === level.id ? b : null;
    if (!here) continue;
    const x = px(o.at.x), z = pz(o.at.z);
    if (o.type === 'vent') {
      const other = here === a ? b : a;
      if (other.level === level.id && here === a) svg += `<line x1="${x}" y1="${z}" x2="${px((other.x[0] + other.x[1]) / 2)}" y2="${pz((other.z[0] + other.z[1]) / 2)}" class="vent"/>`;
      if (here === a) svg += `<circle cx="${x}" cy="${z}" r="4" class="ventdot"/>`;
    } else if (o.type === 'stairs' || o.type === 'lift') {
      const other = here === a ? b : a;
      svg += `<rect x="${x - 9}" y="${z - 9}" width="18" height="18" class="${o.type}"/><text x="${x}" y="${z + 22}" class="m">${o.type === 'lift' ? 'lift' : 'stairs'} → ${esc(other.level)}${o.powered ? ' ⚡' : ''}</text>`;
    } else if (a.level === level.id) {
      const vertical = Math.abs(o.at.x - a.x[0]) < 1e-6 || Math.abs(o.at.x - a.x[1]) < 1e-6; // door on an east/west wall
      const half = (o.width * S) / 2;
      const cls = o.state === 'locked' ? 'locked' : o.type;
      svg += vertical ? `<line x1="${x}" y1="${z - half}" x2="${x}" y2="${z + half}" class="op ${cls}"/>` : `<line x1="${x - half}" y1="${z}" x2="${x + half}" y2="${z}" class="op ${cls}"/>`;
      if (o.lockedBy) svg += `<text x="${x + 6}" y="${z - 6}" class="k">🔒 ${esc(o.lockedBy)}</text>`;
    }
  }
  if (level.id === layout.levels.find((l) => layout.rooms.find((r) => r.id === layout.start).level === l.id).id) {
    const s = layout.rooms.find((r) => r.id === layout.start);
    svg += `<text x="${px((s.x[0] + s.x[1]) / 2)}" y="${pz(s.z[1]) - 6}" class="k">▼ start (from the surface)</text>`;
  }
  const ex = layout.rooms.find((r) => r.id === layout.exit.room);
  if (ex.level === level.id) svg += `<text x="${px((ex.x[0] + ex.x[1]) / 2)}" y="${pz(ex.z[0]) + 16}" class="k">▲ exit: lift to the surface (needs ${esc(layout.exit.needs)})</text>`;
  const w = (maxX - minX) * S;
  x0 += w + 60; width = x0; height = Math.max(height, 60 + (maxZ - minZ) * S + 60);
}
const legend = `<g transform="translate(20 ${height - 10})" class="m"><text x="0" y="0">Doors: grey · blast doors: black · archways: dashed · locked: red · purple dashed: creature-only vent ducts · squares: stairs (brown), lift (blue, ⚡ needs power) · hover a narrow room for its size · fill: acoustic tag (machine = orange, wet = blue, soft = green)</text></g>`;
const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 10}" viewBox="0 0 ${width} ${height + 10}" font-family="system-ui, sans-serif">
<style>.h{font-size:16px;font-weight:600;fill:#222}.n{font-size:10px;font-weight:600;text-anchor:middle;fill:#222}.n.s{font-size:8px}.m{font-size:8px;text-anchor:middle;fill:#444}g.m text{text-anchor:start}.k{font-size:9px;fill:#a22}
.op{stroke-width:5;stroke-linecap:butt}.door{stroke:#888}.blast_door{stroke:#111}.archway{stroke:#888;stroke-dasharray:3 2}.window{stroke:#6ad}.locked{stroke:#c33}
.vent{stroke:#86c;stroke-width:1.5;stroke-dasharray:4 3;fill:none}.ventdot{fill:#86c}.stairs{fill:#b08050;stroke:#333}.lift{fill:#5a8fd0;stroke:#333}</style>
<rect width="100%" height="100%" fill="#f7f4ee"/>${svg}${legend}</svg>
`;
writeFileSync('docs/layout.svg', out);
console.log(`docs/layout.svg: ${layout.rooms.length} rooms, ${layout.openings.length} openings, ${width}×${height} px`);
