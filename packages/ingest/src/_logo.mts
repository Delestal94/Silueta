import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff9d3d"/><stop offset="1" stop-color="#f5821f"/>
    </linearGradient>
    <radialGradient id="bg" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#1d2c4d"/><stop offset="1" stop-color="#0b1324"/>
    </radialGradient>
  </defs>
  <circle cx="256" cy="256" r="242" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="242" fill="none" stroke="url(#ring)" stroke-width="18"/>
  <circle cx="256" cy="256" r="212" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="3"/>
  <text x="256" y="238" text-anchor="middle" font-family="Arial Black, Arial, sans-serif"
        font-size="96" font-weight="900" fill="#ffffff" letter-spacing="-2">SILU</text>
  <text x="256" y="330" text-anchor="middle" font-family="Arial Black, Arial, sans-serif"
        font-size="96" font-weight="900" fill="#f5821f" letter-spacing="-2">MATCH</text>
  <text x="256" y="386" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="26" fill="#ffffff" fill-opacity="0.5" letter-spacing="4">FÚTBOL &amp; SILUETAS</text>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile('apps/web/public/logo.png');
console.log('logo provisional generado');
