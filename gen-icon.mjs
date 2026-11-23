// Da-Video's icon: four play tiles in one squircle (all your plugins in one place). Run once: node gen-icon.mjs
// (needs @resvg/resvg-js; it is not a dependency of the plugin build).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const tile = (x, y, c) => `<rect x="${x}" y="${y}" width="150" height="150" rx="36" fill="${c}"/>
<polygon points="${x + 58},${y + 45} ${x + 58},${y + 105} ${x + 108},${y + 75}" fill="#FFFFFF"/>`;
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14162B"/><stop offset="1" stop-color="#2A1A3F"/></linearGradient></defs>
<rect x="24" y="24" width="464" height="464" rx="116" fill="url(#g)"/>
${tile(96, 96, "#E50914")}${tile(266, 96, "#7C3AED")}${tile(96, 266, "#0EA5E9")}${tile(266, 266, "#F59E0B")}
</svg>`;
for (const [name, size] of [["icon.png", 256]]) {
  const png = new Resvg(svg(size), { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(name, png);
  console.log(name, png.length, "bytes");
}
