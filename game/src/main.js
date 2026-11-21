// Boot, screens and the one loop. Input is read every frame, the world advances in fixed 1/60 s
// steps and the renderer paints what is there. Screens: title, level select, play, paused,
// caught, escaped and the finale. ?shot=NAME stages a screenshot scene instead (see shots.js).
(function () {
  const STEP = LB.STEP;
  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const renderer = LB.createRenderer(canvas);
  const input = LB.createInput(canvas, renderer.view);
  const save = LB.save.data;
  const params = new URLSearchParams(window.location.search);

  let screen = 'title';
  let world = null;
  let levelIndex = 0;
  let demoLevel = 0;
  let screenT = 0;
  let clock = 0;
  let result = null;
  let buttons = [];

  function announce(message) {
    status.textContent = message;
  }

  function startDemo(index) {
    demoLevel = index;
    world = LB.createWorld(index, { demo: true });
    renderer.setLevel(world);
    for (let i = 0; i < 240; i += 1) world.step(STEP, null);
  }

  function setScreen(next) {
    screen = next;
    screenT = 0;
    LB.audio.setMood(next === 'play' ? 'play' : 'menu');
  }

  function loadLevel(index) {
    levelIndex = index;
    world = LB.createWorld(index);
    renderer.setLevel(world);
    result = null;
    setScreen('play');
    announce('Level ' + (index + 1) + ', ' + LB.LEVELS[index].name + '. Reach the exit unseen.');
  }

  function toTitle() {
    startDemo(demoLevel);
    setScreen('title');
  }
  function toSelect() {
    if (!world || !world.state.player.hidden) startDemo(Math.min(save.unlocked, LB.LEVELS.length) - 1);
    setScreen('select');
  }

  function finishLevel() {
    const st = world.state;
    const all = st.relics.every(function (r) {
      return r.taken;
    });
    const stars = [true, all, !st.suspected];
    const count = stars.filter(Boolean).length;
    const prevBest = save.best[levelIndex];
    const record = prevBest === undefined || prevBest === null || st.time < prevBest;
    save.stars[levelIndex] = Math.max(save.stars[levelIndex] || 0, count);
    if (record) save.best[levelIndex] = st.time;
    save.unlocked = Math.max(save.unlocked, Math.min(LB.LEVELS.length, levelIndex + 2));
    LB.save.write();
    result = { stars: stars, count: count, time: st.time, record: record, relics: st.relics.filter((r) => r.taken).length, total: st.relics.length };
    announce('Escaped! ' + count + ' of 3 stars.');
  }

  function totalStars() {
    let n = 0;
    for (let i = 0; i < LB.LEVELS.length; i += 1) n += save.stars[i] || 0;
    return n;
  }

  // ---- actions ------------------------------------------------------------------------------
  function act(action) {
    LB.audio.play({ type: 'click' });
    if (action === 'play') {
      if (save.unlocked > 1) toSelect();
      else loadLevel(0);
    } else if (action === 'levels') toSelect();
    else if (action === 'title') toTitle();
    else if (action === 'resume') setScreen('play');
    else if (action === 'retry') loadLevel(levelIndex);
    else if (action === 'next') {
      if (levelIndex + 1 < LB.LEVELS.length) loadLevel(levelIndex + 1);
      else {
        startDemo(LB.LEVELS.length - 1);
        setScreen('finale');
      }
    } else if (action === 'mute') LB.audio.toggleMute();
    else if (action.indexOf('level:') === 0) {
      const i = Number(action.slice(6));
      if (i < save.unlocked) loadLevel(i);
    }
  }

  function handleKeys(presses) {
    for (let i = 0; i < presses.length; i += 1) {
      const code = presses[i];
      if (code === 'KeyM') {
        LB.audio.toggleMute();
        continue;
      }
      const confirm = code === 'Enter' || code === 'Space';
      if (screen === 'title') {
        if (confirm) act('play');
        else if (code === 'KeyL') act('levels');
      } else if (screen === 'select') {
        if (code === 'Escape') act('title');
        const n = Number(code.replace('Digit', '').replace('Numpad', ''));
        if (code.match(/^(Digit|Numpad)[1-9]$/) && n <= LB.LEVELS.length) act('level:' + (n - 1));
        if (confirm) act('level:' + (Math.min(save.unlocked, LB.LEVELS.length) - 1));
      } else if (screen === 'play') {
        if (code === 'Escape' || code === 'KeyP') setScreen('paused');
        else if (code === 'KeyR') act('retry');
      } else if (screen === 'paused') {
        if (code === 'Escape' || code === 'KeyP' || confirm) act('resume');
        else if (code === 'KeyR') act('retry');
        else if (code === 'KeyL') act('levels');
      } else if (screen === 'caught') {
        if (screenT > 0.6 && (confirm || code === 'KeyR')) act('retry');
        else if (code === 'Escape' || code === 'KeyL') act('levels');
      } else if (screen === 'escaped') {
        if (screenT > 0.5 && confirm) act('next');
        else if (code === 'KeyR') act('retry');
        else if (code === 'Escape' || code === 'KeyL') act('levels');
      } else if (screen === 'finale') {
        if (screenT > 1 && confirm) act('title');
      }
    }
  }

  // ---- screens ------------------------------------------------------------------------------
  const r = renderer;
  function centreButtons(list, y) {
    const w = 210;
    const gap = 18;
    const total = list.length * w + (list.length - 1) * gap;
    return list.map(function (b, i) {
      return Object.assign({ x: (LB.W - total) / 2 + i * (w + gap), y: y, w: w, h: 46 }, b);
    });
  }

  function hovered(b) {
    const p = input.pointer;
    return p.inside && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  function veil(alpha) {
    r.ctx.fillStyle = 'rgba(5,4,10,' + alpha + ')';
    r.ctx.fillRect(0, 0, LB.W, LB.H);
  }

  function drawTitle() {
    const c = r.ctx;
    veil(0.55);
    c.textBaseline = 'middle';
    c.save();
    c.shadowColor = 'rgba(159,247,216,0.6)';
    c.shadowBlur = 24;
    if ('letterSpacing' in c) c.letterSpacing = '14px';
    r.text('LAMPBLACK', LB.W / 2 + 7, 196, 92, '#e9f8f1', 'center', LB.SERIF, 'bold');
    c.restore();
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    r.text('a sneak through the Lantern Keep', LB.W / 2, 262, 24, '#cdbf9f', 'center', LB.SERIF, 'italic');
    r.text('You are Soot, a thief of shadow. The lampwardens carry their light everywhere they look.', LB.W / 2, 318, 17, '#b5aec4', 'center');
    r.text('Keep out of the light, steal what you can, and slip out of every gate unseen.', LB.W / 2, 342, 17, '#b5aec4', 'center');
    buttons = centreButtons([
      { label: 'Play', action: 'play', hint: 'Enter' },
      { label: 'Levels', action: 'levels', hint: 'L' },
      { label: LB.audio.muted ? 'Sound: off' : 'Sound: on', action: 'mute', hint: 'M' },
    ], 400);
    const rows = [
      ['WASD / arrows', 'move'],
      ['hold SHIFT', 'sneak: slow and silent'],
      ['mouse + click', 'aim and toss a pebble'],
      ['P / Esc   R', 'pause   restart'],
    ];
    for (let i = 0; i < rows.length; i += 1) {
      r.text(rows[i][0], LB.W / 2 - 14, 528 + i * 28, 16, '#9ff7d8', 'right', LB.FONT, 'bold');
      r.text(rows[i][1], LB.W / 2 + 14, 528 + i * 28, 16, '#d9cfb8', 'left');
    }
    r.text('Stars: ' + totalStars() + ' / ' + LB.LEVELS.length * 3, LB.W / 2, 666, 15, '#8d87a0', 'center');
  }

  function drawSelect() {
    veil(0.62);
    r.ctx.textBaseline = 'middle';
    r.text('The Lantern Keep', LB.W / 2, 110, 46, '#e9f8f1', 'center', LB.SERIF, 'bold');
    r.text('Choose a way in. Each gate opens the next.', LB.W / 2, 158, 18, '#b5aec4', 'center');
    buttons = [];
    const w = 220;
    const gap = 16;
    const x0 = (LB.W - (LB.LEVELS.length * w + (LB.LEVELS.length - 1) * gap)) / 2;
    for (let i = 0; i < LB.LEVELS.length; i += 1) {
      const b = { x: x0 + i * (w + gap), y: 220, w: w, h: 250, action: 'level:' + i };
      const locked = i >= save.unlocked;
      const hover = !locked && hovered(b);
      r.ctx.fillStyle = hover ? 'rgba(159,247,216,0.16)' : 'rgba(14,12,24,0.88)';
      r.roundRect(r.ctx, b.x, b.y, b.w, b.h, 14);
      r.ctx.fill();
      r.ctx.strokeStyle = hover ? '#9ff7d8' : 'rgba(255,220,150,0.3)';
      r.ctx.stroke();
      const cx = b.x + w / 2;
      r.text(String(i + 1), cx, b.y + 56, 54, locked ? '#3e3a4c' : '#ffd9a0', 'center', LB.SERIF, 'bold');
      r.text(LB.LEVELS[i].name, cx, b.y + 112, 19, locked ? '#5d586b' : '#f3e6c8', 'center', LB.FONT, 'bold');
      const def = LB.LEVELS[i];
      const info = def.guards.length + ' warden' + (def.guards.length > 1 ? 's' : '') + (def.eyes.length ? ' · ' + def.eyes.length + ' eye' + (def.eyes.length > 1 ? 's' : '') : '') + (def.needKey ? ' · key' : '');
      r.text(locked ? 'locked' : info, cx, b.y + 142, 14, '#8d87a0', 'center');
      for (let s = 0; s < 3; s += 1) r.star(cx - 36 + s * 36, b.y + 186, 13, (save.stars[i] || 0) > s);
      if (!locked && save.best[i] !== undefined && save.best[i] !== null) r.text('best ' + r.clock(save.best[i]), cx, b.y + 222, 14, '#9ff7d8', 'center');
      if (!locked) buttons.push(b);
    }
    r.text('Stars: escape · every moonstone · never suspected', LB.W / 2, 512, 16, '#cdbf9f', 'center');
    buttons = buttons.concat(centreButtons([{ label: 'Back', action: 'title', hint: 'Esc' }], 566));
  }

  function drawPanelScreen(title, titleColor, lines, list) {
    const h = 150 + lines.length * 30 + 80;
    const y = (LB.H - h) / 2 + 20;
    r.panel(LB.W / 2 - 330, y, 660, h);
    r.ctx.textBaseline = 'middle';
    r.text(title, LB.W / 2, y + 56, 44, titleColor, 'center', LB.SERIF, 'bold');
    for (let i = 0; i < lines.length; i += 1) r.text(lines[i], LB.W / 2, y + 110 + i * 30, 18, '#d9cfb8', 'center');
    buttons = centreButtons(list, y + h - 84);
    return y;
  }

  function drawResult() {
    const y = drawPanelScreen('Escaped', '#9ff7d8', ['', '', '', ''], [
      { label: levelIndex + 1 < LB.LEVELS.length ? 'Next gate' : 'Finish', action: 'next', hint: 'Enter' },
      { label: 'Retry', action: 'retry', hint: 'R' },
      { label: 'Levels', action: 'levels', hint: 'Esc' },
    ]);
    const labels = ['Got out', 'Moonstones ' + result.relics + '/' + result.total, 'Never suspected'];
    for (let s = 0; s < 3; s += 1) {
      const shown = screenT > 0.3 + s * 0.3;
      r.star(LB.W / 2 - 150 + s * 150, y + 130, 24, shown && result.stars[s]);
      r.text(labels[s], LB.W / 2 - 150 + s * 150, y + 172, 15, result.stars[s] ? '#f3e6c8' : '#6d6880', 'center');
    }
    r.text('Time ' + r.clock(result.time) + (result.record ? '   new best' : ''), LB.W / 2, y + 214, 17, '#cdbf9f', 'center');
  }

  function drawFinale() {
    veil(0.6);
    r.ctx.textBaseline = 'middle';
    r.text('The Keep sleeps on', LB.W / 2, 230, 56, '#e9f8f1', 'center', LB.SERIF, 'bold');
    r.text('Five gates, and not one lampwarden can say what they saw.', LB.W / 2, 300, 20, '#cdbf9f', 'center', LB.SERIF, 'italic');
    const n = totalStars();
    r.text('Stars ' + n + ' / ' + LB.LEVELS.length * 3 + (n === LB.LEVELS.length * 3 ? '  : a perfect ghost' : '  : go back for the rest'), LB.W / 2, 360, 20, '#ffd166', 'center');
    buttons = centreButtons([{ label: 'Title', action: 'title', hint: 'Enter' }, { label: 'Levels', action: 'levels', hint: 'L' }], 430);
  }

  function hudLabel() {
    return (world.state.level + 1) + '. ' + world.state.def.name;
  }

  function paint() {
    r.begin();
    const inGame = screen === 'play' || screen === 'paused' || screen === 'caught' || screen === 'escaped';
    const pointer = input.pointer;
    const aim = screen === 'play' && pointer.inside ? { x: pointer.x, y: pointer.y - LB.HUD } : null;
    r.drawWorld(world, clock, { aim: aim, hints: screen === 'play' });
    if (inGame) r.drawHud(world, hudLabel());
    else buttons = [];
    if (screen === 'title') drawTitle();
    else if (screen === 'select') drawSelect();
    else if (screen === 'finale') drawFinale();
    else if (screen === 'paused') {
      veil(0.35);
      drawPanelScreen('Paused', '#f3e6c8', ['The wardens keep walking when you come back.'], [
        { label: 'Resume', action: 'resume', hint: 'P / Esc' },
        { label: 'Restart', action: 'retry', hint: 'R' },
        { label: 'Levels', action: 'levels', hint: 'L' },
      ]);
    } else if (screen === 'caught' && screenT > 0.6) {
      drawPanelScreen('Spotted', '#ff6b55', [world.state.caughtBy && world.state.caughtBy.route ? 'A lampwarden caught you in the light.' : 'A watching eye caught you in the light.', 'Keep to the dark, sneak near them, or throw a pebble to lure them off.'], [
        { label: 'Try again', action: 'retry', hint: 'Enter / R' },
        { label: 'Levels', action: 'levels', hint: 'Esc' },
      ]);
    } else if (screen === 'escaped' && result && screenT > 0.5) drawResult();
    else if (screen === 'play' && pointer.inside) r.drawCursor(pointer.x, pointer.y);
    if (screen !== 'play') {
      for (let i = 0; i < buttons.length; i += 1) if (buttons[i].label) r.button(buttons[i], hovered(buttons[i]));
    }
    canvas.style.cursor = screen === 'play' ? 'none' : 'default';
  }

  // ---- the loop -----------------------------------------------------------------------------
  let acc = 0;
  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    screenT += dt;
    handleKeys(input.takePresses());
    const clicked = input.takeClick();
    if (clicked && screen !== 'play') {
      for (let i = 0; i < buttons.length; i += 1) {
        if (buttons[i].action && hovered(buttons[i])) {
          act(buttons[i].action);
          break;
        }
      }
    }
    let throwAt = clicked && screen === 'play' ? { x: input.pointer.x, y: input.pointer.y - LB.HUD } : null;
    if (screen !== 'paused') {
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        const m = input.move();
        const live = screen === 'play';
        const events = world.step(STEP, {
          x: live ? m.x : 0,
          y: live ? m.y : 0,
          sneak: live && m.sneak,
          aim: live && input.pointer.inside ? { x: input.pointer.x, y: input.pointer.y - LB.HUD } : null,
          throwAt: live ? throwAt : null,
        });
        throwAt = null;
        for (let i = 0; i < events.length; i += 1) {
          r.onEvent(events[i]);
          if (screen === 'play' || screen === 'caught' || screen === 'escaped') LB.audio.play(events[i]);
        }
        if (screen === 'play' && world.state.status === 'caught') {
          setScreen('caught');
          announce('Spotted. Press Enter to try again.');
        } else if (screen === 'play' && world.state.status === 'escaped') {
          finishLevel();
          setScreen('escaped');
        }
      }
      if (world.state.player.hidden && world.state.time > 40 && (screen === 'title' || screen === 'select' || screen === 'finale')) startDemo((demoLevel + 1) % LB.LEVELS.length);
    }
    LB.audio.setDanger(screen === 'play' ? world.state.danger : 0);
    paint();
    window.requestAnimationFrame(frame);
  }

  const shot = params.get('shot');
  if (shot) {
    const scene = LB.stageShot(shot);
    world = scene.world;
    levelIndex = world.state.level;
    renderer.setLevel(world);
    for (let i = 0; i < scene.events.length; i += 1) r.onEvent(scene.events[i]);
    screen = scene.screen;
    screenT = 5;
    result = scene.result || null;
    clock = scene.clock || 3;
    input.pointer.x = scene.aim ? scene.aim.x : 0;
    input.pointer.y = scene.aim ? scene.aim.y + LB.HUD : 0;
    input.pointer.inside = Boolean(scene.aim);
    let painted = 0;
    const once = function () {
      paint();
      painted += 1;
      if (painted < 2) window.requestAnimationFrame(once);
      else window.__shotReady = true;
    };
    window.requestAnimationFrame(once);
    return;
  }
  startDemo(0);
  announce('Lampblack. Press Enter or click Play.');
  window.requestAnimationFrame(frame);
})();
