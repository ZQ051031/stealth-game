// The rules, with no drawing in them: the map, the sneak, the lampwardens and their lanterns,
// the wall-mounted eyes, noise, pebbles, pickups, detection, being caught and getting out.
// step() advances one fixed step and pushes what happened onto state.events, for sound and effects.
LB.createWorld = function (levelIndex, options) {
  const T = LB.TILE;
  const TUNE = LB.TUNE;
  const G = TUNE.guard;
  const D = TUNE.detect;
  const def = LB.LEVELS[levelIndex];
  const demo = Boolean(options && options.demo);
  const COLS = LB.COLS;
  const ROWS = LB.ROWS;

  const grid = [];
  const relics = [];
  const pouches = [];
  let key = null;
  let start = { x: T * 2, y: T * 2 };
  for (let y = 0; y < ROWS; y += 1) {
    const row = [];
    const line = def.map[y];
    for (let x = 0; x < COLS; x += 1) {
      let ch = line.charAt(x) || '#';
      const cx = x * T + T / 2;
      const cy = y * T + T / 2;
      if (ch === 'P') start = { x: cx, y: cy };
      else if (ch === '*') relics.push({ x: cx, y: cy, taken: false });
      else if (ch === 'o') pouches.push({ x: cx, y: cy, taken: false });
      else if (ch === 'K') key = { x: cx, y: cy, taken: false };
      if (!LB.KIND[ch]) ch = line.charAt(x - 1) === '~' || line.charAt(x + 1) === '~' ? '~' : '.';
      row.push(ch);
    }
    grid.push(row);
  }

  const state = {
    level: levelIndex,
    def: def,
    grid: grid,
    relics: relics,
    pouches: pouches,
    key: key,
    hasKey: !def.needKey,
    pebbles: def.pebbles || 0,
    cooldown: 0,
    thrown: [],
    player: {
      x: start.x,
      y: start.y,
      face: 0,
      sneak: false,
      moving: false,
      inShadow: false,
      stride: 0,
      bob: 0,
      hidden: demo,
    },
    guards: [],
    eyes: [],
    time: 0,
    status: 'play',
    caughtBy: null,
    statusT: 0,
    suspected: false,
    danger: 0,
    events: [],
  };

  function charAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
    return grid[ty][tx];
  }
  function solid(tx, ty) {
    const ch = charAt(tx, ty);
    if (ch === 'X') return !state.hasKey;
    return LB.KIND[ch].solid;
  }
  function opaque(tx, ty) {
    return LB.KIND[charAt(tx, ty)].opaque;
  }

  /** Distance along a unit direction from (x, y) to the first opaque tile, at most max (grid DDA). */
  function castRay(x, y, dx, dy, max) {
    let tx = Math.floor(x / T);
    let ty = Math.floor(y / T);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const deltaX = dx !== 0 ? Math.abs(T / dx) : Infinity;
    const deltaY = dy !== 0 ? Math.abs(T / dy) : Infinity;
    let maxX = dx > 0 ? ((tx + 1) * T - x) / dx : dx < 0 ? (tx * T - x) / dx : Infinity;
    let maxY = dy > 0 ? ((ty + 1) * T - y) / dy : dy < 0 ? (ty * T - y) / dy : Infinity;
    let t = 0;
    for (let guard = 0; guard < 200; guard += 1) {
      if (maxX < maxY) {
        t = maxX;
        maxX += deltaX;
        tx += stepX;
      } else {
        t = maxY;
        maxY += deltaY;
        ty += stepY;
      }
      if (t >= max) return max;
      if (opaque(tx, ty)) return t;
    }
    return max;
  }

  function clearLine(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return true;
    return castRay(x0, y0, dx / d, dy / d, d) >= d - 1;
  }

  /** Whether a circle of radius r at (x, y) overlaps no solid tile. */
  function openAt(x, y, r) {
    const x0 = Math.floor((x - r) / T);
    const x1 = Math.floor((x + r) / T);
    const y0 = Math.floor((y - r) / T);
    const y1 = Math.floor((y + r) / T);
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        if (!solid(tx, ty)) continue;
        const nx = LB.clamp(x, tx * T, tx * T + T);
        const ny = LB.clamp(y, ty * T, ty * T + T);
        if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return false;
      }
    }
    return true;
  }

  /** Push a circle out of the solid tiles it overlaps, so it slides along walls. */
  function collide(body, r) {
    for (let pass = 0; pass < 3; pass += 1) {
      const x0 = Math.floor((body.x - r) / T);
      const x1 = Math.floor((body.x + r) / T);
      const y0 = Math.floor((body.y - r) / T);
      const y1 = Math.floor((body.y + r) / T);
      let moved = false;
      for (let ty = y0; ty <= y1; ty += 1) {
        for (let tx = x0; tx <= x1; tx += 1) {
          if (!solid(tx, ty)) continue;
          const nx = LB.clamp(body.x, tx * T, tx * T + T);
          const ny = LB.clamp(body.y, ty * T, ty * T + T);
          const dx = body.x - nx;
          const dy = body.y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 === 0) {
            body.x = Math.abs(body.x - (tx * T + T / 2)) > Math.abs(body.y - (ty * T + T / 2)) ? body.x : body.x;
            body.y += body.y < ty * T + T / 2 ? -1 : 1;
          } else {
            const d = Math.sqrt(d2);
            body.x += (dx / d) * (r - d);
            body.y += (dy / d) * (r - d);
          }
          moved = true;
        }
      }
      if (!moved) return;
    }
  }

  function nearestOpen(tx, ty) {
    if (!solid(tx, ty)) return { x: tx, y: ty };
    for (let radius = 1; radius < 6; radius += 1) {
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          if (!solid(tx + ox, ty + oy)) return { x: tx + ox, y: ty + oy };
        }
      }
    }
    return { x: tx, y: ty };
  }

  const prev = new Int16Array(COLS * ROWS);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  /** Breadth-first search over open tiles, 8-way without cutting corners, then string-pulled. */
  function findPath(fromX, fromY, toX, toY) {
    const s = nearestOpen(Math.floor(fromX / T), Math.floor(fromY / T));
    const g = nearestOpen(Math.floor(toX / T), Math.floor(toY / T));
    prev.fill(-1);
    const startIndex = s.y * COLS + s.x;
    const goalIndex = g.y * COLS + g.x;
    prev[startIndex] = startIndex;
    const queue = [startIndex];
    for (let head = 0; head < queue.length && prev[goalIndex] === -1; head += 1) {
      const index = queue[head];
      const cx = index % COLS;
      const cy = (index - cx) / COLS;
      for (let k = 0; k < 8; k += 1) {
        const nx = cx + DIRS[k][0];
        const ny = cy + DIRS[k][1];
        if (solid(nx, ny)) continue;
        if (k >= 4 && (solid(cx + DIRS[k][0], cy) || solid(cx, cy + DIRS[k][1]))) continue;
        const next = ny * COLS + nx;
        if (prev[next] !== -1) continue;
        prev[next] = index;
        queue.push(next);
      }
    }
    if (prev[goalIndex] === -1) return [];
    const tiles = [];
    for (let index = goalIndex; index !== startIndex; index = prev[index]) tiles.push(index);
    tiles.reverse();
    const points = tiles.map(function (index) {
      const x = index % COLS;
      return { x: x * T + T / 2, y: ((index - x) / COLS) * T + T / 2 };
    });
    const exact = { x: toX, y: toY };
    if (points.length > 0 && openAt(toX, toY, 11) && Math.floor(toX / T) === g.x && Math.floor(toY / T) === g.y) points[points.length - 1] = exact;
    const smooth = [];
    let from = { x: fromX, y: fromY };
    let i = 0;
    while (i < points.length) {
      let j = i;
      while (j + 1 < points.length && walkable(from, points[j + 1])) j += 1;
      smooth.push(points[j]);
      from = points[j];
      i = j + 1;
    }
    return smooth;
  }
  function walkable(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(d / 8);
    for (let k = 1; k <= n; k += 1) {
      const t = k / n;
      if (!openAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 12)) return false;
    }
    return true;
  }

  def.guards.forEach(function (gd, index) {
    const first = gd.route[0];
    const route = gd.route.map(function (r) {
      return { x: r[0] * T + T / 2, y: r[1] * T + T / 2, wait: r[2] || 0, looks: (r[3] || []).map(LB.deg) };
    });
    const next = route[1 % route.length];
    state.guards.push({
      id: index,
      x: first[0] * T + T / 2,
      y: first[1] * T + T / 2,
      face: Math.atan2(next.y - route[0].y, next.x - route[0].x),
      want: 0,
      route: route,
      ri: 1 % route.length,
      path: null,
      pi: 0,
      waitT: -1,
      state: 'patrol',
      meter: 0,
      seeing: false,
      lostT: 0,
      react: 0,
      target: null,
      searchT: 0,
      searchBase: 0,
      walk: 0,
      speedNow: 0,
      cone: [],
    });
  });
  def.eyes.forEach(function (ed) {
    const from = LB.deg(ed.from);
    const to = LB.deg(ed.to);
    const mid = (from + to) / 2;
    state.eyes.push({
      x: ed.x * T + T / 2 + Math.cos(mid) * 17,
      y: ed.y * T + T / 2 + Math.sin(mid) * 17,
      mountX: ed.x * T + T / 2,
      mountY: ed.y * T + T / 2,
      from: from,
      to: to,
      angle: from,
      dir: 1,
      pauseT: 0,
      meter: 0,
      seeing: false,
      called: false,
      cone: [],
    });
  });

  function emit(type, x, y, extra) {
    state.events.push({ type: type, x: x, y: y, extra: extra });
  }

  /** How near the player is to a watcher's light, 0 (edge) to 1 (touching), or -1 when unseen. */
  function sees(ox, oy, face, range, half, feel) {
    const p = state.player;
    if (p.hidden) return -1;
    const dx = p.x - ox;
    const dy = p.y - oy;
    const d = Math.hypot(dx, dy);
    if (feel > 0 && d < feel) return 1;
    const reach = p.inShadow ? range * G.shadowRange : range;
    if (d > reach) return -1;
    if (Math.abs(LB.angleDiff(face, Math.atan2(dy, dx))) > half) return -1;
    if (!clearLine(ox, oy, p.x, p.y)) return -1;
    return 1 - d / range;
  }

  function fillRate(c, watcherAlert) {
    const p = state.player;
    let rate = D.base + D.near * c * c;
    if (!p.moving) rate *= D.still;
    if (p.sneak) rate *= D.sneak;
    if (watcherAlert) rate *= 1.25;
    return rate;
  }

  function caught(by) {
    if (state.status !== 'play') return;
    state.status = 'caught';
    state.caughtBy = by;
    state.statusT = 0;
    emit('caught', state.player.x, state.player.y);
  }

  /** A guard hears something at (x, y): unless already staring at the player, it goes to look. */
  function hear(g, x, y) {
    if (g.state === 'suspicious') return;
    g.state = 'investigate';
    g.target = { x: x, y: y };
    g.react = G.react;
    g.path = null;
    g.waitT = -1;
    emit('hear', g.x, g.y, g);
  }

  function noise(x, y, radius, kind) {
    emit('noise', x, y, { radius: radius, kind: kind });
    if (demo) return;
    for (let i = 0; i < state.guards.length; i += 1) {
      const g = state.guards[i];
      const d = Math.hypot(g.x - x, g.y - y);
      const reach = clearLine(g.x, g.y, x, y) ? radius : radius * 0.6;
      if (d <= reach) hear(g, x, y);
    }
  }

  function turnToward(g, angle, dt, rate) {
    const diff = LB.angleDiff(g.face, angle);
    const stepMax = (rate || G.turn) * dt;
    g.face += LB.clamp(diff, -stepMax, stepMax);
    return Math.abs(diff);
  }

  /** Walk a guard along its path; true when it has arrived. */
  function follow(g, speed, dt) {
    if (!g.path || g.pi >= g.path.length) return true;
    const target = g.path[g.pi];
    const dx = target.x - g.x;
    const dy = target.y - g.y;
    const d = Math.hypot(dx, dy);
    const off = turnToward(g, Math.atan2(dy, dx), dt);
    const pace = off > 1.1 ? speed * 0.2 : speed;
    const stepLength = pace * dt;
    g.speedNow = pace;
    if (d <= stepLength) {
      g.x = target.x;
      g.y = target.y;
      g.pi += 1;
    } else {
      g.x += (dx / d) * stepLength;
      g.y += (dy / d) * stepLength;
    }
    g.walk += stepLength;
    return g.pi >= g.path.length;
  }

  function goTo(g, x, y) {
    g.path = findPath(g.x, g.y, x, y);
    g.pi = 0;
  }

  function updateGuard(g, dt) {
    const p = state.player;
    g.speedNow = 0;
    const alert = g.state !== 'patrol';
    const c = state.status === 'play' ? sees(g.x, g.y, g.face, G.range, G.half, G.feel) : -1;
    if (c >= 0) {
      g.seeing = true;
      g.lostT = 0;
      g.meter += fillRate(c, alert) * dt;
      g.target = { x: p.x, y: p.y };
      if (g.meter >= 1) {
        g.meter = 1;
        caught(g);
      } else if (g.meter >= D.suspicious && g.state !== 'suspicious') {
        g.state = 'suspicious';
        g.path = null;
        g.waitT = -1;
        state.suspected = true;
        emit('suspect', g.x, g.y, g);
      }
    } else {
      g.seeing = false;
      g.meter = Math.max(0, g.meter - D.decay * dt);
    }
    if (state.status === 'caught') {
      if (state.caughtBy === g) turnToward(g, Math.atan2(p.y - g.y, p.x - g.x), dt, 8);
      return;
    }

    if (g.state === 'suspicious') {
      if (g.target) turnToward(g, Math.atan2(g.target.y - g.y, g.target.x - g.x), dt, G.turn * 1.4);
      if (!g.seeing) {
        g.lostT += dt;
        if (g.lostT > D.lose) {
          g.state = 'investigate';
          g.react = 0;
          g.path = null;
        }
      }
      return;
    }
    if (g.state === 'investigate') {
      if (g.react > 0) {
        g.react -= dt;
        turnToward(g, Math.atan2(g.target.y - g.y, g.target.x - g.x), dt, G.turn * 1.2);
        return;
      }
      if (!g.path) goTo(g, g.target.x, g.target.y);
      if (follow(g, G.investigate, dt)) {
        g.state = 'search';
        g.searchT = G.search;
        g.searchBase = g.face;
      }
      return;
    }
    if (g.state === 'search') {
      g.searchT -= dt;
      const phase = (G.search - g.searchT) * 1.7;
      turnToward(g, g.searchBase + Math.sin(phase) * 1.5, dt, G.turn * 0.9);
      if (g.searchT <= 0) {
        g.state = 'patrol';
        g.path = null;
        g.waitT = -1;
        emit('giveup', g.x, g.y, g);
      }
      return;
    }

    const wp = g.route[g.ri];
    if (g.waitT < 0) {
      if (!g.path) goTo(g, wp.x, wp.y);
      if (follow(g, G.patrol, dt)) {
        g.waitT = wp.wait;
        g.path = null;
      }
      return;
    }
    if (wp.looks.length > 0 && wp.wait > 0) {
      const k = Math.min(wp.looks.length - 1, Math.floor(((wp.wait - g.waitT) / wp.wait) * wp.looks.length));
      turnToward(g, wp.looks[k], dt, G.turn * 0.8);
    }
    g.waitT -= dt;
    if (g.waitT < 0) {
      g.ri = (g.ri + 1) % g.route.length;
      g.path = null;
    }
  }

  function updateEye(e, dt) {
    const E = TUNE.eye;
    const p = state.player;
    const c = state.status === 'play' ? sees(e.x, e.y, e.angle, E.range, E.half, 0) : -1;
    if (c >= 0) {
      e.seeing = true;
      e.meter += fillRate(c, e.meter > 0.3) * D.eye * dt;
      if (e.meter >= 1) {
        e.meter = 1;
        caught(e);
      } else if (e.meter >= D.suspicious) {
        state.suspected = true;
        if (!e.called) {
          e.called = true;
          emit('suspect', e.x, e.y, e);
          let best = null;
          let bestD = Infinity;
          for (let i = 0; i < state.guards.length; i += 1) {
            const g = state.guards[i];
            const d = Math.hypot(g.x - p.x, g.y - p.y);
            if (d < bestD) {
              bestD = d;
              best = g;
            }
          }
          if (best) hear(best, p.x, p.y);
        }
      }
    } else {
      e.seeing = false;
      e.meter = Math.max(0, e.meter - D.decay * dt);
      if (e.meter === 0) e.called = false;
    }
    if (state.status !== 'play') return;
    if (e.seeing && e.meter > 0.15) {
      const want = Math.atan2(p.y - e.y, p.x - e.x);
      e.angle += LB.clamp(LB.angleDiff(e.angle, want), -1.6 * dt, 1.6 * dt);
      return;
    }
    if (e.pauseT > 0) {
      e.pauseT -= dt;
      return;
    }
    e.angle += e.dir * E.sweep * dt;
    if (e.dir > 0 && e.angle >= e.to) {
      e.angle = e.to;
      e.dir = -1;
      e.pauseT = E.pause;
    } else if (e.dir < 0 && e.angle <= e.from) {
      e.angle = e.from;
      e.dir = 1;
      e.pauseT = E.pause;
    }
  }

  function updatePlayer(dt, input) {
    const p = state.player;
    let ix = input.x;
    let iy = input.y;
    const len = Math.hypot(ix, iy);
    p.sneak = input.sneak;
    p.moving = len > 0.01;
    if (p.moving) {
      ix /= len;
      iy /= len;
      const speed = p.sneak ? TUNE.sneak : TUNE.walk;
      const ox = p.x;
      const oy = p.y;
      p.x += ix * speed * dt;
      p.y += iy * speed * dt;
      collide(p, TUNE.radius);
      const moved = Math.hypot(p.x - ox, p.y - oy);
      p.moving = moved > speed * dt * 0.2;
      p.face += LB.clamp(LB.angleDiff(p.face, Math.atan2(iy, ix)), -12 * dt, 12 * dt);
      p.stride += moved;
      p.bob += moved;
      if (p.stride >= TUNE.stride) {
        p.stride -= TUNE.stride;
        const gravel = charAt(Math.floor(p.x / T), Math.floor(p.y / T)) === ':';
        const loud = gravel ? (p.sneak ? TUNE.noiseGravelSneak : TUNE.noiseGravelWalk) : p.sneak ? 0 : TUNE.noiseWalk;
        emit('step', p.x, p.y, { gravel: gravel, sneak: p.sneak, loud: loud });
        if (loud > 0) noise(p.x, p.y, loud, 'step');
      }
    } else if (input.aim) {
      p.face += LB.clamp(LB.angleDiff(p.face, Math.atan2(input.aim.y - p.y, input.aim.x - p.x)), -6 * dt, 6 * dt);
    }
    const tx = Math.floor(p.x / T);
    const ty = Math.floor(p.y / T);
    p.inShadow = charAt(tx, ty) === '~';

    const R = TUNE.pickupRadius + TUNE.radius;
    for (let i = 0; i < relics.length; i += 1) {
      const r = relics[i];
      if (!r.taken && Math.hypot(r.x - p.x, r.y - p.y) < R) {
        r.taken = true;
        emit('relic', r.x, r.y);
      }
    }
    for (let i = 0; i < pouches.length; i += 1) {
      const r = pouches[i];
      if (!r.taken && Math.hypot(r.x - p.x, r.y - p.y) < R) {
        r.taken = true;
        state.pebbles += 2;
        emit('pouch', r.x, r.y);
      }
    }
    if (key && !key.taken && Math.hypot(key.x - p.x, key.y - p.y) < R) {
      key.taken = true;
      state.hasKey = true;
      emit('key', key.x, key.y);
    }
    if (charAt(tx, ty) === 'X' && state.hasKey) {
      state.status = 'escaped';
      state.statusT = 0;
      emit('escape', p.x, p.y);
    }

    state.cooldown = Math.max(0, state.cooldown - dt);
    if (input.throwAt && state.pebbles > 0 && state.cooldown === 0) throwPebble(input.throwAt.x, input.throwAt.y);
  }

  function throwPebble(x, y) {
    const p = state.player;
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) return;
    const ux = dx / d;
    const uy = dy / d;
    const wall = castRay(p.x, p.y, ux, uy, Math.min(d, TUNE.pebbleRange));
    const reach = Math.max(10, Math.min(d, TUNE.pebbleRange, wall - 6));
    state.pebbles -= 1;
    state.cooldown = TUNE.pebbleCooldown;
    state.thrown.push({ sx: p.x, sy: p.y, tx: p.x + ux * reach, ty: p.y + uy * reach, t: 0, dur: 0.18 + reach / TUNE.pebbleSpeed });
    p.face = Math.atan2(uy, ux);
    emit('throw', p.x, p.y);
  }

  function updatePebbles(dt) {
    for (let i = state.thrown.length - 1; i >= 0; i -= 1) {
      const b = state.thrown[i];
      b.t += dt;
      if (b.t >= b.dur) {
        state.thrown.splice(i, 1);
        const water = charAt(Math.floor(b.tx / T), Math.floor(b.ty / T)) === 'w';
        emit('land', b.tx, b.ty, { water: water });
        noise(b.tx, b.ty, TUNE.pebbleNoise, 'pebble');
      }
    }
  }

  /** One fixed step. input: { x, y (-1..1), sneak, aim {x,y} | null, throwAt {x,y} | null }. */
  function step(dt, input) {
    state.events.length = 0;
    state.statusT += dt;
    if (state.status === 'play') {
      state.time += dt;
      if (!demo) updatePlayer(dt, input);
    }
    updatePebbles(dt);
    let danger = 0;
    for (let i = 0; i < state.guards.length; i += 1) {
      updateGuard(state.guards[i], dt);
      danger = Math.max(danger, state.guards[i].meter);
    }
    for (let i = 0; i < state.eyes.length; i += 1) {
      updateEye(state.eyes[i], dt);
      danger = Math.max(danger, state.eyes[i].meter);
    }
    state.danger = danger;
    return state.events;
  }

  /** The lit area of a watcher: a fan of rays clipped by opaque tiles, as [x0, y0, x1, y1, ...]. */
  function cone(ox, oy, face, half, range, out) {
    const rays = 56;
    out.length = 0;
    out.push(ox, oy);
    for (let i = 0; i <= rays; i += 1) {
      const a = face - half + (2 * half * i) / rays;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = castRay(ox, oy, dx, dy, range);
      out.push(ox + dx * d, oy + dy * d);
    }
    return out;
  }

  return {
    state: state,
    step: step,
    castRay: castRay,
    cone: cone,
    charAt: charAt,
    solid: solid,
    /** The player is lit and in some watcher's view right now. */
    watched: function () {
      for (let i = 0; i < state.guards.length; i += 1) if (state.guards[i].seeing) return true;
      for (let i = 0; i < state.eyes.length; i += 1) if (state.eyes[i].seeing) return true;
      return false;
    },
  };
};
