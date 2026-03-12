const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [192, 512];
const outDir = path.join(__dirname, "..", "public", "icons");

fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Rounded square clip
  const r = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.clip();

  // Warm coral gradient background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#e8927c");
  grad.addColorStop(1, "#d4735d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Centered "O+" text
  const fontSize = Math.round(size * 0.42);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("O+", size / 2, size / 2);

  const outPath = path.join(outDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Created ${outPath} (${fs.statSync(outPath).size} bytes)`);
}
