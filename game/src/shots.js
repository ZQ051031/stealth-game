// The screenshot scenes behind ?shot=NAME: each builds a real level, places the sneak, runs the
// real rules forward a fixed number of steps (the guards walk their routes, the eyes sweep) and
// hands back the screen to paint over it. The same name always gives the same frame.
LB.stageShot = function (name) {
  const STEP = LB.STEP;
  const T = LB.TILE;
  const scenes = {
    cover: { level: 3, at: [11, 16], seconds: 9.5, aim: [15, 12], taken: [] },
    garden: { level: 2, at: [5, 8], seconds: 6, aim: [9, 12], taken: [] },
    caught: { level: 1, at: [17, 13], seconds: 4.2, caught: true },
    escape: { level: 4, at: [19, 1], seconds: 12, escape: true },
  };
  const s = scenes[name] || scenes.cover;
  const world = LB.createWorld(s.level);
  const st = world.state;
  const p = st.player;
  p.x = s.at[0] * T + T / 2;
  p.y = s.at[1] * T + T / 2;
  p.sneak = true;
  const events = [];
  const idle = { x: 0, y: 0, sneak: true, aim: null, throwAt: null };
  const frames = Math.round(s.seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    if (s.caught || s.escape) p.hidden = true;
    const out = world.step(STEP, idle);
    if (i > frames - 120) for (let k = 0; k < out.length; k += 1) events.push(out[k]);
  }
  p.hidden = false;
  if (s.aim) {
    world.step(STEP, { x: 0, y: 0, sneak: true, aim: { x: s.aim[0] * T, y: s.aim[1] * T }, throwAt: null });
    return { world: world, screen: 'play', events: events, aim: { x: s.aim[0] * T, y: s.aim[1] * T }, clock: s.seconds };
  }
  if (s.caught) {
    p.moving = true;
    for (let i = 0; i < 300 && st.status === 'play'; i += 1) world.step(STEP, { x: 0, y: 0, sneak: false, aim: null, throwAt: null });
    for (let i = 0; i < 30; i += 1) world.step(STEP, idle);
    return { world: world, screen: 'caught', events: [], clock: s.seconds };
  }
  st.relics.forEach(function (r) {
    r.taken = true;
  });
  st.hasKey = true;
  if (st.key) st.key.taken = true;
  st.time = 151.4;
  return {
    world: world,
    screen: 'escaped',
    events: [],
    clock: s.seconds,
    result: { stars: [true, true, true], count: 3, time: 151.4, record: true, relics: st.relics.length, total: st.relics.length },
  };
};
