// Drawing only. The level's floor, walls and props are painted once into an offscreen layer per
// level; each frame adds water, the darkness with the lanterns' light cut out of it (the vision
// cones, clipped by walls), the wardens, the eyes, the sneak, pickups, effects, hints and the HUD.
// Everything is drawn with canvas paths: there are no image files.
LB.THEMES = {
  stone: { floor: '#2a303e', floor2: '#262b38', grout: '#1c2029', wall: '#424a5e', top: '#5b6480', dark: '#1d2029', prop: '#7a5a36', gravel: '#4a4c55', moss: null },
  cellar: { floor: '#30292a', floor2: '#2b2425', grout: '#1d1819', wall: '#4d3f37', top: '#685545', dark: '#211a17', prop: '#6f5232', gravel: '#57524b', moss: null },
  garden: { floor: '#1f3025', floor2: '#22352a', grout: '#17241c', wall: '#38443c', top: '#55665a', dark: '#141c17', prop: '#2c5a33', gravel: '#5c5a50', moss: '#3d6b3f' },
  archive: { floor: '#3a2b22', floor2: '#34271f', grout: '#21180f', wall: '#4b3a31', top: '#665042', dark: '#1d1511', prop: '#6b4a2c', gravel: '#55402f', moss: null },
  vault: { floor: '#28303d', floor2: '#222934', grout: '#161b23', wall: '#3b4659', top: '#58667f', dark: '#171c25', prop: '#5d4c3a', gravel: '#515869', moss: null },
};

LB.createRenderer = function (canvas) {
  const T = LB.TILE;
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const LW = LB.COLS * T;
  const LH = LB.ROWS * T;
  const HUD = LB.HUD;

  const layer = document.createElement('canvas');
  layer.width = LW;
  layer.height = LH;
  const light = document.createElement('canvas');
  light.width = LW;
  light.height = LH;
  const lctx = light.getContext('2d');
  const vignette = document.createElement('canvas');
  vignette.width = LB.W;
  vignette.height = LB.H;
  (function () {
    const v = vignette.getContext('2d');
    const g = v.createRadialGradient(LB.W / 2, LB.H / 2, 260, LB.W / 2, LB.H / 2, 820);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,8,0.62)');
    v.fillStyle = g;
    v.fillRect(0, 0, LB.W, LB.H);
  })();

  let theme = LB.THEMES.stone;
  let canopies = [];
  const fx = { rings: [], sparks: [], prints: [], floats: [] };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / LB.W, canvas.height / LB.H);
    view.x = (canvas.width - LB.W * view.scale) / 2;
    view.y = (canvas.height - LB.H * view.scale) / 2;
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = LB.clamp(((n >> 16) & 255) + amount, 0, 255);
    const g = LB.clamp(((n >> 8) & 255) + amount, 0, 255);
    const b = LB.clamp((n & 255) + amount, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---- the static layer -------------------------------------------------------------------
  function floorTile(c, world, tx, ty, rnd, name) {
    const x = tx * T;
    const y = ty * T;
    const v = Math.floor(rnd() * 10) - 5;
    if (name === 'archive') {
      for (let k = 0; k < 4; k += 1) {
        c.fillStyle = shade(theme.floor, v + Math.floor(rnd() * 8) - 4);
        c.fillRect(x, y + k * 8, T, 8);
        c.fillStyle = theme.grout;
        c.fillRect(x, y + k * 8 + 7, T, 1);
        const seam = ((tx * 13 + ty * 7 + k * 11) % 4) * 8;
        c.fillRect(x + seam, y + k * 8, 1, 8);
      }
      return;
    }
    if (name === 'cellar') {
      for (let k = 0; k < 2; k += 1) {
        const off = (ty * 2 + k) % 2 ? 8 : 0;
        for (let b = -1; b < 2; b += 1) {
          c.fillStyle = shade(theme.floor, v + Math.floor(rnd() * 10) - 5);
          c.fillRect(x + off + b * 16 + 1, y + k * 16 + 1, 15, 15);
        }
      }
      c.fillStyle = theme.grout;
      c.fillRect(x, y, T, 1);
      c.fillRect(x, y + 16, T, 1);
      return;
    }
    if (name === 'garden') {
      c.fillStyle = shade((tx + ty) % 2 ? theme.floor : theme.floor2, v);
      c.fillRect(x, y, T, T);
      for (let k = 0; k < 7; k += 1) {
        c.fillStyle = rnd() < 0.5 ? 'rgba(120,170,110,0.18)' : 'rgba(0,0,0,0.18)';
        c.fillRect(x + rnd() * 30, y + rnd() * 30, 2, 3);
      }
      return;
    }
    if (name === 'vault') {
      const checker = (Math.floor(tx / 2) + Math.floor(ty / 2)) % 2;
      c.fillStyle = shade(checker ? theme.floor : theme.floor2, Math.floor(v / 2));
      c.fillRect(x, y, T, T);
      c.strokeStyle = 'rgba(255,255,255,0.04)';
      c.beginPath();
      c.moveTo(x + rnd() * T, y);
      c.quadraticCurveTo(x + rnd() * T, y + T / 2, x + rnd() * T, y + T);
      c.stroke();
      c.fillStyle = theme.grout;
      if (tx % 2 === 0) c.fillRect(x, y, 1, T);
      if (ty % 2 === 0) c.fillRect(x, y, T, 1);
      return;
    }
    c.fillStyle = shade(theme.floor, v);
    c.fillRect(x, y, T, T);
    c.fillStyle = theme.grout;
    c.fillRect(x, y, T, 1);
    c.fillRect(x, y, 1, T);
    c.fillStyle = 'rgba(255,255,255,0.025)';
    c.fillRect(x + 1, y + 1, T - 1, 2);
  }

  function isWall(world, tx, ty) {
    return world.charAt(tx, ty) === '#';
  }

  function wallTile(c, world, tx, ty, rnd) {
    const x = tx * T;
    const y = ty * T;
    c.fillStyle = shade(theme.wall, Math.floor(rnd() * 8) - 4);
    c.fillRect(x, y, T, T);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let k = 0; k < 2; k += 1) {
      c.fillRect(x, y + k * 16 + 15, T, 1);
      c.fillRect(x + ((ty * 2 + k) % 2 ? 8 : 24), y + k * 16, 1, 16);
    }
    if (theme.moss && rnd() < 0.35) {
      c.fillStyle = theme.moss;
      c.globalAlpha = 0.5;
      c.beginPath();
      c.arc(x + rnd() * T, y + rnd() * T, 3 + rnd() * 5, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    c.fillStyle = theme.top;
    if (!isWall(world, tx, ty - 1)) c.fillRect(x, y, T, 3);
    if (!isWall(world, tx - 1, ty)) c.fillRect(x, y, 2, T);
    if (!isWall(world, tx, ty + 1) && ty < LB.ROWS - 1) {
      c.fillStyle = theme.dark;
      c.fillRect(x, y + T - 8, T, 8);
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(x, y + T - 8, T, 1);
    }
    if (!isWall(world, tx + 1, ty)) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(x + T - 2, y, 2, T);
    }
  }

  function crate(c, x, y, rnd) {
    const w = T - 4;
    c.fillStyle = shade(theme.prop, Math.floor(rnd() * 14) - 7);
    c.fillRect(x + 2, y + 2, w, w);
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = 2;
    c.strokeRect(x + 3, y + 3, w - 2, w - 2);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let k = 1; k < 4; k += 1) {
      c.beginPath();
      c.moveTo(x + 4, y + 2 + k * 7);
      c.lineTo(x + T - 4, y + 2 + k * 7);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,220,160,0.22)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x + 5, y + 5);
    c.lineTo(x + T - 5, y + T - 5);
    c.stroke();
    c.lineWidth = 1;
    c.fillStyle = 'rgba(255,230,180,0.12)';
    c.fillRect(x + 2, y + 2, w, 2);
  }

  const BOOKS = ['#8c3b3b', '#3b5a8c', '#5f8c3b', '#8c7a3b', '#6a3b8c', '#3b8c84', '#a0623a'];
  function shelf(c, x, y, rnd) {
    c.fillStyle = '#3a271a';
    c.fillRect(x + 1, y, T - 2, T);
    c.fillStyle = '#24170f';
    c.fillRect(x + 14, y, 4, T);
    for (let side = 0; side < 2; side += 1) {
      let by = y + 1;
      while (by < y + T - 2) {
        const h = 3 + Math.floor(rnd() * 3);
        c.fillStyle = BOOKS[Math.floor(rnd() * BOOKS.length)];
        const depth = 8 + Math.floor(rnd() * 4);
        c.fillRect(side ? x + 18 : x + 14 - depth, by, depth, h - 1);
        by += h;
      }
    }
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(x + 1, y, 1, T);
  }

  function pillar(c, x, y, name, rnd) {
    const cx = x + T / 2;
    const cy = y + T / 2;
    if (name === 'garden') {
      c.fillStyle = '#3b2a1c';
      c.beginPath();
      c.arc(cx, cy, 9, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#2a1c12';
      c.lineWidth = 2;
      for (let k = 0; k < 5; k += 1) {
        const a = rnd() * Math.PI * 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
        c.stroke();
      }
      c.lineWidth = 1;
      canopies.push({ x: cx, y: cy, seed: rnd() });
      return;
    }
    const g = c.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 15);
    g.addColorStop(0, shade(theme.top, 30));
    g.addColorStop(1, theme.wall);
    c.fillStyle = theme.dark;
    c.beginPath();
    c.arc(cx, cy, 15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 13, 0, Math.PI * 2);
    c.fill();
  }

  function hedge(c, world, tx, ty, rnd) {
    const x = tx * T;
    const y = ty * T;
    c.fillStyle = '#1d3b22';
    const join = function (dx, dy) {
      return world.charAt(tx + dx, ty + dy) === 'h';
    };
    c.fillRect(x + (join(-1, 0) ? 0 : 3), y + (join(0, -1) ? 0 : 3), T - (join(-1, 0) ? 0 : 3) - (join(1, 0) ? 0 : 3), T - (join(0, -1) ? 0 : 3) - (join(0, 1) ? 0 : 3));
    for (let k = 0; k < 9; k += 1) {
      c.fillStyle = rnd() < 0.5 ? '#2e5e35' : '#3a7242';
      c.beginPath();
      c.arc(x + 6 + rnd() * 20, y + 6 + rnd() * 20, 4 + rnd() * 4, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(190,240,170,0.14)';
    c.beginPath();
    c.arc(x + 10 + rnd() * 8, y + 9 + rnd() * 6, 3, 0, Math.PI * 2);
    c.fill();
  }

  function gravel(c, tx, ty, rnd, name) {
    const x = tx * T;
    const y = ty * T;
    if (name === 'archive') {
      for (let k = 0; k < 4; k += 1) {
        c.fillStyle = shade('#5c4532', Math.floor(rnd() * 12) - 6);
        c.fillRect(x, y + k * 8, T, 7);
        c.fillStyle = '#1b120b';
        c.fillRect(x, y + k * 8 + 7, T, 1);
        c.fillRect(x + Math.floor(rnd() * 28), y + k * 8 + 2, 4, 1);
        c.fillStyle = '#2b1d12';
        c.fillRect(x + 3, y + k * 8 + 3, 1, 1);
        c.fillRect(x + 28, y + k * 8 + 3, 1, 1);
      }
      return;
    }
    c.fillStyle = shade(theme.gravel, -18);
    c.fillRect(x, y, T, T);
    for (let k = 0; k < 26; k += 1) {
      c.fillStyle = shade(theme.gravel, Math.floor(rnd() * 50) - 20);
      c.beginPath();
      c.arc(x + rnd() * T, y + rnd() * T, 1 + rnd() * 2, 0, Math.PI * 2);
      c.fill();
    }
  }

  function buildLayer(world) {
    const name = world.state.def.theme;
    theme = LB.THEMES[name] || LB.THEMES.stone;
    canopies = [];
    const c = layer.getContext('2d');
    const rnd = LB.rng(1000 + world.state.level * 77);
    c.clearRect(0, 0, LW, LH);
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) floorTile(c, world, tx, ty, rnd, name);
    }
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        const ch = world.charAt(tx, ty);
        if (ch === ':') gravel(c, tx, ty, rnd, name);
        if (ch === 'w') {
          c.fillStyle = '#12303f';
          c.fillRect(tx * T, ty * T, T, T);
          if (world.charAt(tx, ty - 1) !== 'w') {
            c.fillStyle = 'rgba(0,0,0,0.45)';
            c.fillRect(tx * T, ty * T, T, 6);
          }
        }
      }
    }
    // soft shadows: shadow pools, then the props' cast shadows
    const soft = document.createElement('canvas');
    soft.width = LW;
    soft.height = LH;
    const s = soft.getContext('2d');
    s.fillStyle = '#000';
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        const ch = world.charAt(tx, ty);
        if (ch === '~') s.fillRect(tx * T - 2, ty * T - 2, T + 4, T + 4);
      }
    }
    c.save();
    c.globalAlpha = 0.72;
    c.filter = 'blur(7px)';
    c.drawImage(soft, 0, 0);
    c.restore();
    s.clearRect(0, 0, LW, LH);
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        const ch = world.charAt(tx, ty);
        if (ch === '#' || ch === 'C' || ch === 'B' || ch === 'O' || ch === 'h') s.fillRect(tx * T + 5, ty * T + 7, T, T);
      }
    }
    c.save();
    c.globalAlpha = 0.45;
    c.filter = 'blur(4px)';
    c.drawImage(soft, 0, 0);
    c.restore();
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        const ch = world.charAt(tx, ty);
        if (ch === '#') wallTile(c, world, tx, ty, rnd);
        else if (ch === 'C') crate(c, tx * T, ty * T, rnd);
        else if (ch === 'B') shelf(c, tx * T, ty * T, rnd);
        else if (ch === 'O') pillar(c, tx * T, ty * T, name, rnd);
        else if (ch === 'h') hedge(c, world, tx, ty, rnd);
        else if (ch === 'X') {
          c.fillStyle = '#0b0f12';
          c.fillRect(tx * T, ty * T, T, T);
        }
      }
    }
  }

  // ---- per-frame pieces -------------------------------------------------------------------
  function polygon(c, pts) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  }

  function coneColor(meter, alpha) {
    const r = 255;
    const g = Math.round(LB.lerp(214, 70, meter));
    const b = Math.round(LB.lerp(130, 50, meter));
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function drawWater(c, world, t) {
    c.strokeStyle = 'rgba(140,200,230,0.16)';
    c.lineWidth = 1.5;
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        if (world.charAt(tx, ty) !== 'w') continue;
        const x = tx * T;
        const y = ty * T;
        for (let k = 0; k < 2; k += 1) {
          const yy = y + 10 + k * 13 + Math.sin(t * 1.3 + tx * 0.9 + k * 2) * 2;
          c.beginPath();
          c.moveTo(x + 4, yy);
          c.quadraticCurveTo(x + 16, yy + Math.sin(t * 2 + tx + ty) * 3, x + 28, yy);
          c.stroke();
        }
      }
    }
  }

  /** Above the dark and the vignette: a bright frame and label on the way out, so it reads at a glance. */
  function drawExitMarks(c, world, t) {
    const st = world.state;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        if (world.charAt(tx, ty) !== 'X') continue;
        sx += tx;
        sy += ty;
        n += 1;
      }
    }
    if (!n) return;
    const cx = (sx / n) * T + T / 2;
    const cy = (sy / n) * T + T / 2;
    const open = st.hasKey;
    const pulse = 0.65 + Math.sin(t * 3) * 0.25;
    const col = open ? '120,255,205' : '255,196,92';
    c.save();
    c.strokeStyle = 'rgba(' + col + ',' + (0.55 + 0.35 * pulse) + ')';
    c.lineWidth = 2;
    c.shadowColor = 'rgba(' + col + ',0.9)';
    c.shadowBlur = 14;
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        if (world.charAt(tx, ty) === 'X') c.strokeRect(tx * T + 2, ty * T + 2, T - 4, T - 4);
      }
    }
    const ix = cx < T * 2 ? 1 : cx > (LB.COLS - 2) * T ? -1 : 0;
    const iy = cy < T * 2 ? 1 : cy > (LB.ROWS - 2) * T ? -1 : 0;
    const lx = cx + ix * 46;
    const ly = cy + iy * 34;
    c.font = 'bold 13px ' + LB.FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const label = open ? 'EXIT' : 'EXIT · KEY';
    const w = c.measureText(label).width + 16;
    c.shadowBlur = 10;
    c.fillStyle = 'rgba(8,10,16,0.82)';
    roundRect(c, lx - w / 2, ly - 11, w, 22, 6);
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = 'rgb(' + col + ')';
    c.fillText(label, lx, ly + 1);
    c.restore();
  }

  function drawExits(c, world, t) {
    const st = world.state;
    for (let ty = 0; ty < LB.ROWS; ty += 1) {
      for (let tx = 0; tx < LB.COLS; tx += 1) {
        if (world.charAt(tx, ty) !== 'X') continue;
        const x = tx * T;
        const y = ty * T;
        if (st.hasKey) {
          const pulse = 0.55 + Math.sin(t * 3) * 0.2;
          c.fillStyle = 'rgba(110,255,200,' + (0.35 * pulse) + ')';
          c.fillRect(x, y, T, T);
          const g = c.createRadialGradient(x + T / 2, y + T / 2, 2, x + T / 2, y + T / 2, 70);
          g.addColorStop(0, 'rgba(120,255,205,' + 0.32 * pulse + ')');
          g.addColorStop(1, 'rgba(120,255,205,0)');
          c.fillStyle = g;
          c.fillRect(x - 70, y - 70, T + 140, T + 140);
        } else {
          c.fillStyle = '#3a3226';
          for (let k = 0; k < 4; k += 1) {
            if (tx === 0 || tx === LB.COLS - 1) c.fillRect(x + 4 + k * 8, y, 3, T);
            else c.fillRect(x, y + 4 + k * 8, T, 3);
          }
          c.fillStyle = '#b08d3c';
          c.fillRect(x + 11, y + 11, 10, 10);
        }
      }
    }
  }

  /** Cut the lanterns out of the darkness, then lay a warm (or alarmed) tint over each cone. */
  function drawLight(c, world, t) {
    const st = world.state;
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, LW, LH);
    lctx.fillStyle = 'rgba(3,5,14,0.58)';
    lctx.fillRect(0, 0, LW, LH);
    lctx.globalCompositeOperation = 'destination-out';
    const G = LB.TUNE.guard;
    const E = LB.TUNE.eye;
    const flick = 1 + Math.sin(t * 11) * 0.015 + Math.sin(t * 7.3) * 0.02;
    for (let i = 0; i < st.guards.length; i += 1) {
      const g = st.guards[i];
      world.cone(g.x, g.y, g.face, G.half, G.range, g.cone);
      const grad = lctx.createRadialGradient(g.x, g.y, 8, g.x, g.y, G.range * flick);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.8)');
      grad.addColorStop(1, 'rgba(0,0,0,0.25)');
      lctx.fillStyle = grad;
      polygon(lctx, g.cone);
      lctx.fill();
      const halo = lctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 44);
      halo.addColorStop(0, 'rgba(0,0,0,0.8)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = halo;
      lctx.fillRect(g.x - 44, g.y - 44, 88, 88);
    }
    for (let i = 0; i < st.eyes.length; i += 1) {
      const e = st.eyes[i];
      world.cone(e.x, e.y, e.angle, E.half, E.range, e.cone);
      const grad = lctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, E.range);
      grad.addColorStop(0, 'rgba(0,0,0,0.95)');
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');
      lctx.fillStyle = grad;
      polygon(lctx, e.cone);
      lctx.fill();
    }
    const p = st.player;
    if (!p.hidden) {
      const halo = lctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 70);
      halo.addColorStop(0, 'rgba(0,0,0,0.45)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = halo;
      lctx.fillRect(p.x - 70, p.y - 70, 140, 140);
    }
    c.drawImage(light, 0, 0);

    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < st.guards.length; i += 1) {
      const g = st.guards[i];
      const grad = c.createRadialGradient(g.x, g.y, 6, g.x, g.y, G.range * flick);
      grad.addColorStop(0, coneColor(g.meter, 0.3));
      grad.addColorStop(1, coneColor(g.meter, 0.02));
      c.fillStyle = grad;
      polygon(c, g.cone);
      c.fill();
    }
    for (let i = 0; i < st.eyes.length; i += 1) {
      const e = st.eyes[i];
      const grad = c.createRadialGradient(e.x, e.y, 4, e.x, e.y, E.range);
      grad.addColorStop(0, 'rgba(255,' + Math.round(LB.lerp(120, 50, e.meter)) + ',90,0.28)');
      grad.addColorStop(1, 'rgba(255,90,90,0.02)');
      c.fillStyle = grad;
      polygon(c, e.cone);
      c.fill();
    }
    c.restore();
    c.lineWidth = 1.5;
    for (let i = 0; i < st.guards.length; i += 1) {
      const g = st.guards[i];
      c.strokeStyle = coneColor(g.meter, 0.28 + g.meter * 0.4);
      polygon(c, g.cone);
      c.stroke();
    }
    for (let i = 0; i < st.eyes.length; i += 1) {
      c.strokeStyle = 'rgba(255,110,90,' + (0.25 + st.eyes[i].meter * 0.4) + ')';
      polygon(c, st.eyes[i].cone);
      c.stroke();
    }
    c.lineWidth = 1;
  }

  function glow(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function diamond(c, x, y, s, fill, stroke) {
    c.beginPath();
    c.moveTo(x, y - s);
    c.lineTo(x + s * 0.75, y);
    c.lineTo(x, y + s);
    c.lineTo(x - s * 0.75, y);
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.stroke();
    }
  }

  function keyIcon(c, x, y, s, color) {
    c.strokeStyle = color;
    c.lineWidth = s * 0.28;
    c.beginPath();
    c.arc(x - s * 0.45, y, s * 0.4, 0, Math.PI * 2);
    c.moveTo(x - s * 0.05, y);
    c.lineTo(x + s * 0.9, y);
    c.moveTo(x + s * 0.6, y);
    c.lineTo(x + s * 0.6, y + s * 0.4);
    c.moveTo(x + s * 0.85, y);
    c.lineTo(x + s * 0.85, y + s * 0.3);
    c.stroke();
    c.lineWidth = 1;
  }

  function drawPickups(c, world, t) {
    const st = world.state;
    for (let i = 0; i < st.relics.length; i += 1) {
      const r = st.relics[i];
      if (r.taken) continue;
      const bob = Math.sin(t * 2.4 + i) * 2;
      glow(c, r.x, r.y, 26, 'rgba(160,190,255,0.45)');
      diamond(c, r.x, r.y + bob, 8, '#cfe0ff', '#7f9bff');
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(r.x - 2, r.y + bob - 4, 2, 2);
    }
    for (let i = 0; i < st.pouches.length; i += 1) {
      const r = st.pouches[i];
      if (r.taken) continue;
      glow(c, r.x, r.y, 18, 'rgba(255,230,170,0.25)');
      c.fillStyle = '#8a6a44';
      c.beginPath();
      c.arc(r.x, r.y + 2, 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#5c432a';
      c.fillRect(r.x - 3, r.y - 7, 6, 4);
      c.fillStyle = '#b9b3a6';
      c.beginPath();
      c.arc(r.x + 7, r.y + 6, 2.5, 0, Math.PI * 2);
      c.arc(r.x - 8, r.y + 7, 2, 0, Math.PI * 2);
      c.fill();
    }
    if (st.key && !st.key.taken) {
      const k = st.key;
      glow(c, k.x, k.y, 30, 'rgba(255,210,90,0.5)');
      keyIcon(c, k.x, k.y + Math.sin(t * 2) * 2, 11, '#f2c75c');
    }
  }

  function drawGuard(c, g, t, caught) {
    c.save();
    c.translate(g.x, g.y);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(3, 5, 15, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.rotate(g.face);
    const swing = g.speedNow > 1 ? Math.sin(g.walk * 0.22) * 5 : 0;
    c.fillStyle = '#1b1414';
    c.beginPath();
    c.ellipse(swing, -6, 5, 3.5, 0, 0, Math.PI * 2);
    c.ellipse(-swing, 6, 5, 3.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#5e1d28';
    c.beginPath();
    c.ellipse(-2, 0, 11, 13, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#7f2a37';
    c.beginPath();
    c.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c9a24a';
    c.fillRect(-2, -12, 3, 24);
    c.fillStyle = '#2b1a16';
    c.beginPath();
    c.arc(2, 0, 6.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d9b08a';
    c.beginPath();
    c.arc(6, 0, 2.5, 0, Math.PI * 2);
    c.fill();
    // the lantern, held out front
    c.strokeStyle = '#3a2a1a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(4, 9);
    c.lineTo(13, 8);
    c.stroke();
    c.lineWidth = 1;
    c.restore();
    const lx = g.x + Math.cos(g.face) * 14 - Math.sin(g.face) * 8;
    const ly = g.y + Math.sin(g.face) * 14 + Math.cos(g.face) * 8;
    glow(c, lx, ly, 18, coneColor(g.meter, 0.7));
    c.fillStyle = '#3a2a1a';
    c.fillRect(lx - 4, ly - 4, 8, 8);
    c.fillStyle = coneColor(g.meter, 1);
    c.fillRect(lx - 2.5, ly - 2.5, 5, 5);
    if (caught) {
      c.strokeStyle = 'rgba(255,80,60,' + (0.5 + Math.sin(t * 20) * 0.5) + ')';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(g.x, g.y, 20, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 1;
    }
  }

  function drawMarker(c, g, t, st) {
    if (g.meter > 0.01) {
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(g.x, g.y - 30, 9, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = coneColor(g.meter, 1);
      c.lineWidth = 3;
      c.beginPath();
      c.arc(g.x, g.y - 30, 9, -Math.PI / 2, -Math.PI / 2 + g.meter * Math.PI * 2);
      c.stroke();
      c.lineWidth = 1;
    }
    let mark = '';
    if (st.caughtBy === g || g.meter > 0.75) mark = '!';
    else if (g.state && g.state !== 'patrol') mark = '?';
    else if (!g.state && g.meter > 0.2) mark = '?';
    if (!mark) return;
    const bounce = Math.abs(Math.sin(t * 6)) * 2;
    c.font = 'bold 15px ' + LB.FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = mark === '!' ? '#ff5a46' : '#ffd166';
    c.fillText(mark, g.x, g.y - 30 - bounce);
  }

  function drawEye(c, e, t) {
    c.save();
    c.translate(e.mountX, e.mountY);
    c.rotate(e.angle);
    c.fillStyle = '#2a2a30';
    c.fillRect(-6, -7, 18, 14);
    c.fillStyle = '#8a7444';
    c.beginPath();
    c.arc(14, 0, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = e.meter > 0.3 ? '#ff4d3d' : '#ffb15c';
    c.beginPath();
    c.arc(16, 0, 4.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
    glow(c, e.x, e.y, 22, e.meter > 0.3 ? 'rgba(255,70,60,0.6)' : 'rgba(255,170,90,0.45)');
  }

  function drawPlayer(c, p, t, st) {
    if (p.hidden) return;
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = p.inShadow ? 0.6 : 1;
    if (p.inShadow) {
      c.setLineDash([3, 4]);
      c.strokeStyle = 'rgba(160,240,215,0.55)';
      c.beginPath();
      c.arc(0, 0, 17, t * 0.8, t * 0.8 + Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(2, 4, 12, 10, 0, 0, Math.PI * 2);
    c.fill();
    c.rotate(p.face);
    const s = p.sneak ? 0.86 : 1;
    c.scale(s, s);
    const wave = Math.sin(p.bob * 0.25) * 3;
    c.strokeStyle = '#46d6a6';
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-4, 2);
    c.quadraticCurveTo(-14, 4 + wave, -21, 1 - wave);
    c.stroke();
    c.lineCap = 'butt';
    c.lineWidth = 1;
    c.fillStyle = '#17142a';
    c.strokeStyle = '#4b4380';
    c.beginPath();
    c.moveTo(10, 0);
    c.quadraticCurveTo(6, -12, -6, -10);
    c.quadraticCurveTo(-15, 0, -6, 10);
    c.quadraticCurveTo(6, 12, 10, 0);
    c.fill();
    c.stroke();
    c.fillStyle = '#0c0a18';
    c.beginPath();
    c.arc(2, 0, 6.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#9ff7d8';
    c.beginPath();
    c.arc(6, -2.6, 1.6, 0, Math.PI * 2);
    c.arc(6, 2.6, 1.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.globalAlpha = 1;
    if (!p.inShadow) glow(c, p.x + Math.cos(p.face) * 6, p.y + Math.sin(p.face) * 6, 9, 'rgba(140,255,210,0.35)');
  }

  function drawThrown(c, st) {
    for (let i = 0; i < st.thrown.length; i += 1) {
      const b = st.thrown[i];
      const k = b.t / b.dur;
      const x = LB.lerp(b.sx, b.tx, k);
      const y = LB.lerp(b.sy, b.ty, k);
      const h = Math.sin(k * Math.PI) * 26;
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#d8d2c4';
      c.beginPath();
      c.arc(x, y - h, 3.5, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawFx(c, dt) {
    for (let i = fx.prints.length - 1; i >= 0; i -= 1) {
      const f = fx.prints[i];
      f.t += dt;
      if (f.t > 2.2) {
        fx.prints.splice(i, 1);
        continue;
      }
      c.fillStyle = 'rgba(150,230,210,' + 0.18 * (1 - f.t / 2.2) + ')';
      c.beginPath();
      c.ellipse(f.x, f.y, 3, 2, f.a, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = fx.rings.length - 1; i >= 0; i -= 1) {
      const f = fx.rings[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        fx.rings.splice(i, 1);
        continue;
      }
      c.strokeStyle = f.color + (1 - k) * f.alpha + ')';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(f.x, f.y, Math.max(1, f.r * Math.sqrt(k)), 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 1;
    }
    for (let i = fx.sparks.length - 1; i >= 0; i -= 1) {
      const f = fx.sparks[i];
      f.t += dt;
      if (f.t > f.life) {
        fx.sparks.splice(i, 1);
        continue;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.96;
      f.vy *= 0.96;
      c.fillStyle = f.color + (1 - f.t / f.life) + ')';
      c.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = fx.floats.length - 1; i >= 0; i -= 1) {
      const f = fx.floats[i];
      f.t += dt;
      if (f.t > 1.4) {
        fx.floats.splice(i, 1);
        continue;
      }
      c.font = 'bold 14px ' + LB.FONT;
      c.fillStyle = f.color + (1 - f.t / 1.4) + ')';
      c.fillText(f.text, f.x, f.y - 20 - f.t * 26);
    }
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      fx.sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.6 + Math.random() * 0.5, color: color });
    }
  }

  function onEvent(e) {
    if (e.type === 'noise') {
      const kind = e.extra.kind;
      fx.rings.push({ x: e.x, y: e.y, r: e.extra.radius, t: 0, life: kind === 'pebble' ? 0.9 : 0.55, alpha: kind === 'pebble' ? 0.7 : 0.4, color: kind === 'pebble' ? 'rgba(255,240,200,' : 'rgba(255,190,120,' });
    } else if (e.type === 'step') {
      fx.prints.push({ x: e.x, y: e.y, a: Math.random(), t: 0 });
    } else if (e.type === 'relic') {
      burst(e.x, e.y, 'rgba(190,210,255,', 22, 120);
      fx.floats.push({ x: e.x, y: e.y, text: 'moonstone', t: 0, color: 'rgba(200,220,255,' });
    } else if (e.type === 'pouch') {
      fx.floats.push({ x: e.x, y: e.y, text: '+2 pebbles', t: 0, color: 'rgba(255,230,180,' });
    } else if (e.type === 'key') {
      burst(e.x, e.y, 'rgba(255,215,110,', 26, 140);
      fx.floats.push({ x: e.x, y: e.y, text: 'the gate key!', t: 0, color: 'rgba(255,220,120,' });
    } else if (e.type === 'land') {
      burst(e.x, e.y, e.extra && e.extra.water ? 'rgba(150,210,240,' : 'rgba(230,220,200,', 8, 70);
    } else if (e.type === 'escape') {
      burst(e.x, e.y, 'rgba(120,255,205,', 40, 180);
    }
  }

  function drawCanopies(c, t, p) {
    for (let i = 0; i < canopies.length; i += 1) {
      const k = canopies[i];
      const near = !p.hidden && Math.hypot(p.x - k.x, p.y - k.y) < 50;
      c.globalAlpha = near ? 0.35 : 0.82;
      const sway = Math.sin(t * 0.8 + k.seed * 6) * 1.5;
      c.fillStyle = '#1e4226';
      c.beginPath();
      c.arc(k.x + sway, k.y, 42, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2b5a32';
      for (let j = 0; j < 7; j += 1) {
        const a = j * 0.9 + k.seed * 5;
        c.beginPath();
        c.arc(k.x + Math.cos(a) * 22 + sway, k.y + Math.sin(a) * 22, 17, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#3c7444';
      c.beginPath();
      c.arc(k.x - 8 + sway, k.y - 10, 14, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
  }

  function drawAim(c, world, aim) {
    const st = world.state;
    const p = st.player;
    if (!aim || st.pebbles <= 0 || p.hidden) return;
    const dx = aim.x - p.x;
    const dy = aim.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) return;
    const ux = dx / d;
    const uy = dy / d;
    const wall = world.castRay(p.x, p.y, ux, uy, Math.min(d, LB.TUNE.pebbleRange));
    const reach = Math.max(10, Math.min(d, LB.TUNE.pebbleRange, wall - 6));
    const lx = p.x + ux * reach;
    const ly = p.y + uy * reach;
    c.setLineDash([4, 6]);
    c.strokeStyle = 'rgba(255,240,210,0.35)';
    c.beginPath();
    c.moveTo(p.x + ux * 14, p.y + uy * 14);
    const mx = (p.x + lx) / 2;
    const my = (p.y + ly) / 2 - reach * 0.12;
    c.quadraticCurveTo(mx, my, lx, ly);
    c.stroke();
    c.strokeStyle = 'rgba(255,240,210,0.12)';
    c.beginPath();
    c.arc(lx, ly, LB.TUNE.pebbleNoise, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = 'rgba(255,240,210,0.7)';
    c.beginPath();
    c.arc(lx, ly, 6, 0, Math.PI * 2);
    c.stroke();
  }

  function drawHints(c, world, alpha) {
    const st = world.state;
    const hints = st.def.hints;
    const p = st.player;
    if (!hints || p.hidden) return;
    c.font = '15px ' + LB.FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < hints.length; i += 1) {
      const h = hints[i];
      const x = h[0] * T + T / 2;
      const y = h[1] * T + T / 2;
      const d = Math.hypot(p.x - x, p.y - y);
      const a = LB.clamp((150 - d) / 60, 0, 1) * alpha;
      c.fillStyle = 'rgba(255,230,170,' + (0.25 + 0.15 * (1 - a)) + ')';
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
      if (a <= 0) continue;
      const w = c.measureText(h[2]).width + 24;
      const bx = LB.clamp(x - w / 2, 6, LW - w - 6);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(12,12,22,0.86)';
      roundRect(c, bx, y - 44, w, 28, 8);
      c.fill();
      c.strokeStyle = 'rgba(255,220,150,0.5)';
      c.stroke();
      c.fillStyle = '#f3e6c8';
      c.fillText(h[2], bx + w / 2, y - 30);
      c.globalAlpha = 1;
    }
  }

  // ---- HUD and panels ---------------------------------------------------------------------
  function text(value, x, y, size, color, align, font, weight) {
    ctx.font = (weight || '') + ' ' + size + 'px ' + (font || LB.FONT);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.fillText(value, x, y);
  }

  function clock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function drawHud(world, label) {
    const st = world.state;
    const g = ctx.createLinearGradient(0, 0, 0, HUD);
    g.addColorStop(0, '#15131f');
    g.addColorStop(1, '#0d0c15');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LB.W, HUD);
    ctx.fillStyle = 'rgba(255,220,150,0.18)';
    ctx.fillRect(0, HUD - 1, LB.W, 1);
    ctx.textBaseline = 'middle';
    text('LAMPBLACK', 22, HUD / 2, 18, '#9ff7d8', 'left', LB.SERIF, 'bold');
    text(label, 150, HUD / 2, 17, '#e9dcc0', 'left');
    let x = 560;
    for (let i = 0; i < st.relics.length; i += 1) {
      diamond(ctx, x + i * 22, HUD / 2, 8, st.relics[i].taken ? '#cfe0ff' : null, '#7f9bff');
    }
    x += Math.max(1, st.relics.length) * 22 + 18;
    for (let i = 0; i < Math.min(st.pebbles, 8); i += 1) {
      ctx.fillStyle = '#d8d2c4';
      ctx.beginPath();
      ctx.arc(x + i * 12, HUD / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (st.pebbles === 0) text('no pebbles', x, HUD / 2, 14, '#6d6880', 'left');
    x += 108;
    if (st.def.needKey) keyIcon(ctx, x, HUD / 2, 10, st.hasKey ? '#f2c75c' : '#4a4556');
    const p = st.player;
    let status = 'IN THE OPEN';
    let color = '#e9dcc0';
    if (world.watched()) {
      status = 'SEEN!';
      color = '#ff6b55';
    } else if (p.inShadow) {
      status = 'HIDDEN';
      color = '#7ff0c8';
    } else if (p.sneak) {
      status = 'SNEAKING';
      color = '#b9a8ff';
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, 1010, 12, 132, 24, 12);
    ctx.fill();
    text(status, 1076, HUD / 2 + 1, 14, color, 'center', LB.FONT, 'bold');
    text(clock(st.time), LB.W - 22, HUD / 2, 18, '#e9dcc0', 'right');
    if (st.danger > 0.02) {
      ctx.fillStyle = coneColor(st.danger, 0.9);
      ctx.fillRect(0, HUD - 3, LB.W * st.danger, 3);
    }
  }

  /** A centred panel: a title, lines of text and buttons laid out by the caller. */
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10,9,18,0.9)';
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,150,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function button(b, hover) {
    ctx.fillStyle = hover ? 'rgba(159,247,216,0.22)' : 'rgba(255,255,255,0.07)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.strokeStyle = hover ? '#9ff7d8' : 'rgba(255,220,150,0.4)';
    ctx.stroke();
    ctx.textBaseline = 'middle';
    text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, 19, b.disabled ? '#5d586b' : '#f3e6c8', 'center', LB.FONT, 'bold');
    if (b.hint) text(b.hint, b.x + b.w / 2, b.y + b.h + 14, 12, '#7d7890', 'center');
  }

  function star(x, y, r, filled, t) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? '#ffd166' : 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = filled ? '#fff1c1' : 'rgba(255,255,255,0.25)';
    ctx.stroke();
  }

  function begin() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  }

  let lastT = 0;
  /** The level and everything in it, below the HUD strip. */
  function drawWorld(world, t, opts) {
    const dt = Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    const st = world.state;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD, LW, LH);
    ctx.clip();
    ctx.translate(0, HUD);
    ctx.drawImage(layer, 0, 0);
    drawWater(ctx, world, t);
    drawExits(ctx, world, t);
    drawLight(ctx, world, t);
    drawPickups(ctx, world, t);
    drawFx(ctx, dt);
    for (let i = 0; i < st.eyes.length; i += 1) drawEye(ctx, st.eyes[i], t);
    drawThrown(ctx, st);
    drawPlayer(ctx, st.player, t, st);
    for (let i = 0; i < st.guards.length; i += 1) drawGuard(ctx, st.guards[i], t, st.caughtBy === st.guards[i]);
    drawCanopies(ctx, t, st.player);
    if (opts.aim) drawAim(ctx, world, opts.aim);
    for (let i = 0; i < st.guards.length; i += 1) drawMarker(ctx, st.guards[i], t, st);
    for (let i = 0; i < st.eyes.length; i += 1) drawMarker(ctx, st.eyes[i], t, st);
    drawHints(ctx, world, opts.hints === false ? 0 : 1);
    ctx.restore();
    ctx.drawImage(vignette, 0, 0);
    ctx.save();
    ctx.translate(0, HUD);
    drawExitMarks(ctx, world, t);
    ctx.restore();
    if (st.danger > 0.3 || st.status === 'caught') {
      const k = st.status === 'caught' ? 0.35 : (st.danger - 0.3) * 0.3;
      ctx.fillStyle = 'rgba(150,10,20,' + k + ')';
      ctx.fillRect(0, HUD, LB.W, LB.H - HUD);
    }
  }

  function drawCursor(x, y) {
    ctx.strokeStyle = 'rgba(159,247,216,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    view: view,
    ctx: ctx,
    begin: begin,
    setLevel: function (world) {
      buildLayer(world);
      fx.rings.length = 0;
      fx.sparks.length = 0;
      fx.prints.length = 0;
      fx.floats.length = 0;
    },
    drawWorld: drawWorld,
    drawHud: drawHud,
    drawCursor: drawCursor,
    onEvent: onEvent,
    panel: panel,
    button: button,
    star: star,
    text: text,
    clock: clock,
    diamond: diamond,
    roundRect: roundRect,
  };
};
