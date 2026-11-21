// Keyboard and mouse. Held keys give the move direction and sneak; one-shot presses and clicks are
// queued and taken once a frame. The pointer is kept in the 1280x720 logical space by the renderer's view.
LB.createInput = function (canvas, view) {
  const held = new Set();
  const presses = [];
  const pointer = { x: 0, y: 0, inside: false, clicked: false };
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'Tab']);

  window.addEventListener('keydown', function (event) {
    held.add(event.code);
    if (!event.repeat) presses.push(event.code);
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    LB.audio.unlock();
  });
  window.addEventListener('keyup', function (event) {
    held.delete(event.code);
  });
  window.addEventListener('blur', function () {
    held.clear();
  });
  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    pointer.x = ((event.clientX - rect.left) * ratio - view.x) / view.scale;
    pointer.y = ((event.clientY - rect.top) * ratio - view.y) / view.scale;
    pointer.inside = true;
  }
  canvas.addEventListener('pointermove', locate);
  canvas.addEventListener('pointerdown', function (event) {
    locate(event);
    if (event.button === 0) pointer.clicked = true;
    LB.audio.unlock();
  });
  canvas.addEventListener('pointerleave', function () {
    pointer.inside = false;
  });
  canvas.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  function down(a, b) {
    return held.has(a) || held.has(b);
  }
  return {
    pointer: pointer,
    move: function () {
      return {
        x: (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0),
        y: (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0),
        sneak: down('ShiftLeft', 'ShiftRight'),
      };
    },
    /** The key codes pressed since the last call. */
    takePresses: function () {
      const out = presses.slice();
      presses.length = 0;
      return out;
    },
    takeClick: function () {
      const c = pointer.clicked;
      pointer.clicked = false;
      return c;
    },
  };
};
