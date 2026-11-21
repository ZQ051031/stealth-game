// Sound, all synthesised with Web Audio at run time (no files): soft footsteps, gravel crunch,
// pebble clinks, chimes, the warden's "hm?" and the caught sting, plus a slow generative score
// (a low drone, sparse plucked notes and a heartbeat that quickens with the danger meter).
LB.audio = (function () {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuffer = null;
  let muted = Boolean(LB.save.data.muted);
  let danger = 0;
  let mood = 'calm';
  let nextNote = 0;
  let nextBeat = 0;
  let drone = null;
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
  const ROOT = 110;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.42;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    const random = LB.rng(7);
    for (let i = 0; i < data.length; i += 1) data[i] = random() * 2 - 1;
    startDrone();
    nextNote = ctx.currentTime + 0.5;
    nextBeat = ctx.currentTime + 1;
    window.setInterval(schedule, 120);
    return true;
  }

  function startDrone() {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 4);
    filter.connect(gain);
    gain.connect(musicBus);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    [ROOT / 2, ROOT / 2 * 1.006, ROOT * 0.75].forEach(function (f, i) {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.5 : 0.35;
      o.connect(g);
      g.connect(filter);
      o.start();
    });
    drone = { filter: filter, gain: gain };
  }

  function tone(freq, start, length, type, volume, bus, glide) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, start + length);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);
    o.connect(g);
    g.connect(bus || sfxBus);
    o.start(start);
    o.stop(start + length + 0.05);
  }

  function hiss(start, length, volume, type, freq, q, bus) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + length);
    src.connect(f);
    f.connect(g);
    g.connect(bus || sfxBus);
    src.start(start, Math.random() * 0.5, length + 0.05);
  }

  function pluck(freq, start, volume) {
    tone(freq, start, 1.8, 'triangle', volume, musicBus);
    tone(freq * 2, start, 0.9, 'sine', volume * 0.35, musicBus);
  }

  function schedule() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const ahead = now + 0.3;
    while (nextNote < ahead) {
      const tense = danger > 0.2;
      const degree = SCALE[Math.floor(Math.random() * (tense ? 4 : SCALE.length))];
      const freq = ROOT * 2 * Math.pow(2, degree / 12) * (tense ? 0.5 : 1);
      if (mood !== 'menu' || Math.random() < 0.8) pluck(freq, nextNote, tense ? 0.05 : 0.07);
      if (Math.random() < 0.25) pluck(freq * 1.5, nextNote + 0.18, 0.03);
      nextNote += (tense ? 0.5 : 1.1) + Math.random() * (tense ? 0.4 : 1.6);
    }
    while (nextBeat < ahead) {
      if (danger > 0.05 && mood === 'play') {
        const v = 0.05 + danger * 0.22;
        tone(62, nextBeat, 0.18, 'sine', v, musicBus, 40);
        tone(58, nextBeat + 0.19, 0.16, 'sine', v * 0.7, musicBus, 38);
      }
      nextBeat += danger > 0.05 ? LB.lerp(0.95, 0.42, danger) : 0.5;
    }
    if (drone) drone.filter.Q.value = 2 + danger * 6;
  }

  const SFX = {
    step: function (t, e) {
      const x = e.extra;
      if (x.gravel) hiss(t, 0.09, x.sneak ? 0.07 : 0.2, 'bandpass', 2600 + Math.random() * 900, 0.8);
      else hiss(t, 0.06, x.sneak ? 0.015 : 0.05, 'lowpass', 500 + Math.random() * 200, 1);
    },
    throw: function (t) {
      hiss(t, 0.22, 0.08, 'bandpass', 1500, 2);
    },
    land: function (t, e) {
      if (e.extra && e.extra.water) {
        hiss(t, 0.35, 0.18, 'lowpass', 900, 3);
        tone(420, t, 0.25, 'sine', 0.07, sfxBus, 160);
        return;
      }
      tone(2350, t, 0.12, 'square', 0.04);
      tone(3170, t + 0.07, 0.1, 'triangle', 0.05);
      tone(2600, t + 0.16, 0.08, 'triangle', 0.025);
    },
    relic: function (t) {
      [0, 4, 7, 12].forEach(function (s, i) {
        tone(660 * Math.pow(2, s / 12), t + i * 0.07, 0.6, 'sine', 0.08);
      });
    },
    pouch: function (t) {
      hiss(t, 0.12, 0.08, 'bandpass', 1800, 1);
      tone(980, t + 0.05, 0.15, 'triangle', 0.06);
    },
    key: function (t) {
      tone(880, t, 0.3, 'triangle', 0.08);
      tone(1320, t + 0.12, 0.5, 'triangle', 0.08);
      tone(1760, t + 0.24, 0.6, 'sine', 0.05);
    },
    hear: function (t) {
      tone(300, t, 0.16, 'triangle', 0.05, sfxBus, 360);
    },
    suspect: function (t) {
      tone(330, t, 0.22, 'sawtooth', 0.04, sfxBus, 420);
      tone(420, t + 0.2, 0.35, 'sawtooth', 0.04, sfxBus, 560);
    },
    giveup: function (t) {
      tone(380, t, 0.3, 'triangle', 0.035, sfxBus, 250);
    },
    caught: function (t) {
      tone(220, t, 0.9, 'sawtooth', 0.12, sfxBus, 110);
      tone(233, t, 0.9, 'sawtooth', 0.1, sfxBus, 116);
      tone(311, t + 0.02, 0.8, 'square', 0.05, sfxBus, 150);
      hiss(t, 0.5, 0.25, 'lowpass', 300, 1);
    },
    escape: function (t) {
      [0, 7, 12, 16, 19, 24].forEach(function (s, i) {
        tone(330 * Math.pow(2, s / 12), t + i * 0.09, 0.9, 'triangle', 0.07);
      });
    },
    click: function (t) {
      tone(900, t, 0.05, 'triangle', 0.05);
    },
  };

  return {
    unlock: ensure,
    play: function (e) {
      if (!ctx || muted) return;
      const f = SFX[e.type];
      if (f) f(ctx.currentTime + 0.005, e);
    },
    setDanger: function (value) {
      danger = value;
    },
    setMood: function (value) {
      mood = value;
    },
    toggleMute: function () {
      muted = !muted;
      LB.save.data.muted = muted;
      LB.save.write();
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
      return muted;
    },
    get muted() {
      return muted;
    },
  };
})();
