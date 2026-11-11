// Gym theme: injects the animated SVG background and the logo lifter. Styles live in theme.css.
(() => {
  const plate = (r, color, label, cls) => `
    <g class="spin ${cls}" fill="none" stroke="${color}">
      <circle r="${r}" stroke-width="${r * 0.08}" stroke-opacity="0.35"/>
      <circle r="${r * 0.86}" stroke-width="1" stroke-opacity="0.25"/>
      <circle r="${r * 0.62}" stroke-width="${r * 0.02}" stroke-opacity="0.2" stroke-dasharray="${r * 0.12} ${r * 0.08}"/>
      <circle r="${r * 0.2}" stroke-width="${r * 0.05}" stroke-opacity="0.35"/>
      <circle r="${r * 0.07}" fill="${color}" fill-opacity="0.15" stroke="none"/>
      <text y="${-r * 0.7}" text-anchor="middle" fill="${color}" fill-opacity="0.3" stroke="none"
            font-family="Anton, sans-serif" font-size="${r * 0.14}" letter-spacing="${r * 0.02}">${label}</text>
      <text y="${r * 0.79}" text-anchor="middle" fill="${color}" fill-opacity="0.3" stroke="none"
            font-family="Anton, sans-serif" font-size="${r * 0.14}" letter-spacing="${r * 0.02}">${label}</text>
    </g>`;

  // ponytail: Math.random chalk positions per load; deterministic layout not needed for decoration.
  const chalk = Array.from({ length: 36 }, () => {
    const x = (Math.random() * 100).toFixed(1), r = (0.6 + Math.random() * 1.8).toFixed(1);
    const delay = (-Math.random() * 14).toFixed(1), dur = (10 + Math.random() * 10).toFixed(1);
    return `<circle cx="${x}%" cy="102%" r="${r}" fill="#f4f4f5" style="animation-delay:${delay}s;animation-duration:${dur}s"/>`;
  }).join('');

  const bg = document.createElement('div');
  bg.id = 'gym-bg';
  bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = `
    <svg class="bg-full" preserveAspectRatio="none">
      <defs>
        <radialGradient id="glow-red" cx="0%" cy="100%" r="70%"><stop offset="0" stop-color="#ef4444" stop-opacity="0.16"/><stop offset="1" stop-color="#ef4444" stop-opacity="0"/></radialGradient>
        <radialGradient id="glow-blue" cx="100%" cy="0%" r="65%"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.13"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
        <radialGradient id="vignette" cx="50%" cy="45%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></radialGradient>
        <pattern id="tread" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect x="4" y="12" width="14" height="4" rx="2" fill="#ffffff" fill-opacity="0.025"/>
          <rect x="18" y="0" width="4" height="14" rx="2" fill="#ffffff" fill-opacity="0.018"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#0b0b0d"/>
      <rect width="100%" height="100%" fill="url(#tread)"/>
      <rect width="100%" height="100%" fill="url(#glow-red)"/>
      <rect width="100%" height="100%" fill="url(#glow-blue)"/>
    </svg>

    <svg style="left:-160px;top:-160px;width:520px;height:520px" viewBox="-260 -260 520 520">${plate(240, '#3b82f6', '20 KG', '')}</svg>
    <svg style="right:-220px;bottom:-220px;width:640px;height:640px" viewBox="-320 -320 640 640">${plate(300, '#ef4444', '25 KG', 'rev')}</svg>
    <svg style="right:-60px;top:30%;width:200px;height:200px" viewBox="-75 -75 150 150">${plate(68, '#facc15', '15 KG', '')}</svg>

    <svg class="drift" style="left:-4%;top:72%;width:70vw;max-width:900px;height:120px;opacity:.05" viewBox="0 0 900 120" fill="none" stroke="#f4f4f5">
      <line x1="40" y1="60" x2="860" y2="60" stroke-width="6"/>
      <rect x="120" y="10" width="26" height="100" rx="4" stroke-width="3"/><rect x="150" y="22" width="18" height="76" rx="3" stroke-width="3"/>
      <rect x="754" y="10" width="26" height="100" rx="4" stroke-width="3"/><rect x="732" y="22" width="18" height="76" rx="3" stroke-width="3"/>
      <line x1="300" y1="56" x2="600" y2="56" stroke-width="1" stroke-dasharray="2 4"/>
    </svg>

    <svg style="left:3%;top:22%;width:120px;height:200px;opacity:.16" viewBox="0 0 120 200" fill="none" stroke="#22c55e" stroke-width="3">
      <line x1="60" y1="0" x2="60" y2="20" stroke-dasharray="3 4"/>
      <g class="swing">
        <line x1="60" y1="20" x2="60" y2="70"/>
        <path d="M42 92 Q42 70 60 70 Q78 70 78 92"/>
        <path d="M34 98 Q30 140 60 150 Q90 140 86 98 Q84 88 60 88 Q36 88 34 98 Z" fill="#22c55e" fill-opacity="0.15"/>
      </g>
    </svg>

    <svg class="ecg" style="left:0;bottom:24px;width:100%;height:60px;opacity:.22" viewBox="0 0 600 60" preserveAspectRatio="none" fill="none" stroke="#ef4444" stroke-width="1.5">
      <path d="M0 40 H180 L195 40 L205 12 L218 56 L228 30 L236 40 H400 L412 40 L420 20 L430 52 L438 40 H600"/>
    </svg>

    <svg class="chalk bg-full">${chalk}</svg>

    <svg class="bg-full" preserveAspectRatio="none"><rect width="100%" height="100%" fill="url(#vignette)"/></svg>`;
  document.body.prepend(bg);

  const h1 = document.querySelector('header h1');
  if (h1) h1.insertAdjacentHTML('afterbegin', `
    <svg class="lifter" viewBox="0 0 64 48" aria-hidden="true">
      <g class="arms" stroke="#a1a1aa" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="40" x2="18" y2="10"/><line x1="46" y1="40" x2="46" y2="10"/></g>
      <circle cx="32" cy="38" r="5" fill="#a1a1aa"/>
      <g class="bar">
        <path d="M6 10 Q32 14 58 10" stroke="#f4f4f5" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <rect x="2" y="1" width="5" height="18" rx="1.5" fill="#ef4444"/><rect x="57" y="1" width="5" height="18" rx="1.5" fill="#ef4444"/>
        <rect x="8" y="4" width="3" height="12" rx="1" fill="#3b82f6"/><rect x="53" y="4" width="3" height="12" rx="1" fill="#3b82f6"/>
      </g>
    </svg>`);
})();
