(() => {
  // ---------- DOM ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const levelsListEl = document.getElementById("levelsList");
  const screenTitleEl = document.getElementById("screenTitle");
  const screenSubEl = document.getElementById("screenSub");
  const statusPillEl = document.getElementById("statusPill");
  const bestPctEl = document.getElementById("bestPct");
  const runPctEl = document.getElementById("runPct");

  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlayTitle");
  const overlayTextEl = document.getElementById("overlayText");
  const overlayPlayBtn = document.getElementById("overlayPlay");
  const overlayMenuBtn = document.getElementById("overlayMenu");

  const btnLevels = document.getElementById("btnLevels");
  const btnPlay = document.getElementById("btnPlay");
  const btnRestart = document.getElementById("btnRestart");

  const musicToggle = document.getElementById("musicToggle");
  const particlesToggle = document.getElementById("particlesToggle");

  // ---------- State ----------
  const State = { LEVELS: "levels", PLAY: "play", PAUSE: "pause" };
  let state = State.LEVELS;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Fit canvas to CSS size (for crisp drawing)
  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  }

  // ---------- Music (no files needed) ----------
  let audioCtx = null;
  let musicOn = true;
  let musicNode = null;

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function startMusic() {
    if (!musicOn) return;
    ensureAudio();
    stopMusic();

    // Tiny synth loop (soft neon vibe)
    const master = audioCtx.createGain();
    master.gain.value = 0.12;
    master.connect(audioCtx.destination);

    const filt = audioCtx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1200;
    filt.Q.value = 0.7;
    filt.connect(master);

    const beat = 120; // BPM
    const stepDur = (60 / beat) / 2; // 8th notes

    const notes = [0, 7, 10, 7, 0, 7, 12, 10]; // scale-ish
    const baseHz = 220;

    let step = 0;
    const startAt = audioCtx.currentTime + 0.02;

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "triangle";

    const g1 = audioCtx.createGain();
    const g2 = audioCtx.createGain();
    g1.gain.value = 0;
    g2.gain.value = 0;

    osc1.connect(g1); g1.connect(filt);
    osc2.connect(g2); g2.connect(filt);

    osc1.start();
    osc2.start();

    const noise = audioCtx.createBufferSource();
    const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.12;
    noise.buffer = noiseBuf;
    noise.loop = true;

    const ng = audioCtx.createGain();
    ng.gain.value = 0.03;
    noise.connect(ng); ng.connect(master);
    noise.start();

    const timer = setInterval(() => {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;

      const n = notes[step % notes.length];
      const freq = baseHz * Math.pow(2, n / 12);

      // gentle pluck envelope
      const a = t + 0.01;
      const r = t + stepDur * 0.95;

      osc1.frequency.setValueAtTime(freq, a);
      osc2.frequency.setValueAtTime(freq * 2, a);

      g1.gain.cancelScheduledValues(t);
      g2.gain.cancelScheduledValues(t);

      g1.gain.setValueAtTime(0.0, t);
      g1.gain.linearRampToValueAtTime(0.16, a);
      g1.gain.exponentialRampToValueAtTime(0.001, r);

      g2.gain.setValueAtTime(0.0, t);
      g2.gain.linearRampToValueAtTime(0.09, a);
      g2.gain.exponentialRampToValueAtTime(0.001, r);

      step++;
    }, stepDur * 1000);

    musicNode = { master, filt, osc1, osc2, g1, g2, noise, ng, timer };
  }

  function stopMusic() {
    if (!musicNode) return;
    try { clearInterval(musicNode.timer); } catch {}
    try { musicNode.osc1.stop(); } catch {}
    try { musicNode.osc2.stop(); } catch {}
    try { musicNode.noise.stop(); } catch {}
    musicNode = null;
  }

  // ---------- Levels ----------
  // Everything is embedded so there are NO fetch/path bugs on GitHub Pages.
  const LEVELS = [
    {
      id: "neon-start",
      name: "Neon Start",
      difficulty: "Easy",
      speed: 520,
      length: 4200,
      // obstacles are placed along x; each obstacle is {x,w,h}
      obstacles: [
        { x: 900, w: 60, h: 90 },
        { x: 1220, w: 70, h: 120 },
        { x: 1560, w: 60, h: 160 },
        { x: 1860, w: 90, h: 110 },
        { x: 2250, w: 65, h: 180 },
        { x: 2580, w: 80, h: 120 },
        { x: 2960, w: 70, h: 160 },
        { x: 3300, w: 110, h: 110 },
        { x: 3680, w: 70, h: 180 },
      ],
    },
    {
      id: "pulse-run",
      name: "Pulse Run",
      difficulty: "Medium",
      speed: 610,
      length: 5200,
      obstacles: [
        { x: 820, w: 70, h: 130 },
        { x: 1100, w: 70, h: 170 },
        { x: 1440, w: 70, h: 200 },
        { x: 1700, w: 120, h: 110 },
        { x: 2060, w: 70, h: 210 },
        { x: 2340, w: 90, h: 150 },
        { x: 2700, w: 70, h: 240 },
        { x: 3000, w: 140, h: 120 },
        { x: 3380, w: 80, h: 210 },
        { x: 3720, w: 80, h: 240 },
        { x: 4100, w: 160, h: 120 },
        { x: 4620, w: 100, h: 240 },
      ],
    },
    {
      id: "ion-storm",
      name: "Ion Storm",
      difficulty: "Hard",
      speed: 690,
      length: 6000,
      obstacles: [
        { x: 760, w: 80, h: 220 },
        { x: 1040, w: 80, h: 260 },
        { x: 1380, w: 130, h: 140 },
        { x: 1680, w: 90, h: 260 },
        { x: 1960, w: 120, h: 170 },
        { x: 2240, w: 90, h: 280 },
        { x: 2580, w: 170, h: 140 },
        { x: 2920, w: 90, h: 300 },
        { x: 3220, w: 140, h: 170 },
        { x: 3560, w: 90, h: 300 },
        { x: 3880, w: 190, h: 140 },
        { x: 4300, w: 90, h: 300 },
        { x: 4700, w: 140, h: 200 },
        { x: 5060, w: 90, h: 320 },
        { x: 5460, w: 200, h: 150 },
      ],
    },
  ];

  let selectedLevel = LEVELS[0];
  let bestById = loadBest();

  function loadBest() {
    try {
      const raw = localStorage.getItem("neonDashBest");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function saveBest() {
    try { localStorage.setItem("neonDashBest", JSON.stringify(bestById)); } catch {}
  }

  function renderLevelsList() {
    levelsListEl.innerHTML = "";
    LEVELS.forEach((lvl) => {
      const best = Math.floor((bestById[lvl.id] || 0) * 100);
      const el = document.createElement("div");
      el.className = "levelItem" + (lvl.id === selectedLevel.id ? " selected" : "");
      el.innerHTML = `
        <div class="name">${lvl.name}</div>
        <div class="meta">${lvl.difficulty} • Best ${best}% • Speed ${lvl.speed}</div>
      `;
      el.addEventListener("click", () => {
        selectedLevel = lvl;
        renderLevelsList();
        updateHeaderForLevels();
        updateBestUI();
        showOverlay(`Selected: ${lvl.name}`, `Hit Play (or press Space) to start.`);
      });
      levelsListEl.appendChild(el);
    });
  }

  function updateHeaderForLevels() {
    screenTitleEl.textContent = "Pick a Level";
    screenSubEl.textContent = `Selected: ${selectedLevel.name} (${selectedLevel.difficulty})`;
    statusPillEl.textContent = "Menu";
  }

  function updateHeaderForPlay() {
    screenTitleEl.textContent = selectedLevel.name;
    screenSubEl.textContent = "Jump over blocks — survive to the end";
    statusPillEl.textContent = "Playing";
  }

  function updateBestUI() {
    const best = bestById[selectedLevel.id] || 0;
    bestPctEl.textContent = `${Math.floor(best * 100)}%`;
  }

  // ---------- Game ----------
  const world = {
    x: 0, // scroll position
    t: 0,
  };

  const player = {
    x: 220,
    y: 0,
    r: 20,
    vy: 0,
    onGround: false,
    alive: true,
  };

  let runProgress = 0;
  let paused = false;
  let lastTs = 0;

  // Background particles
  const stars = Array.from({ length: 180 }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: Math.random() * 1.2 + 0.3,
    p: Math.random(),
  }));

  const sparks = [];
  function spawnSparks(x, y, n = 16) {
    if (!particlesToggle.checked) return;
    for (let i = 0; i < n; i++) {
      sparks.push({
        x, y,
        vx: (Math.random() * 2 - 1) * (220 + Math.random() * 240),
        vy: (Math.random() * -1) * (260 + Math.random() * 360),
        life: 0.6 + Math.random() * 0.4
      });
    }
  }

  function resetRun() {
    world.x = 0;
    world.t = 0;
    runProgress = 0;
    player.y = 0;
    player.vy = 0;
    player.onGround = false;
    player.alive = true;
    sparks.length = 0;
    paused = false;
    runPctEl.textContent = "0%";
  }

  function jump() {
    if (state !== State.PLAY || paused) return;
    ensureAudio(); // allow audio to start after interaction
    if (player.onGround && player.alive) {
      player.vy = -760;
      player.onGround = false;
      spawnSparks(player.x, getGroundY() - 8, 22);
      // quick click sound
      blip(540, 0.03);
    }
  }

  function blip(freq, dur) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  function getGroundY() {
    // ground is near bottom with some padding
    const { h } = resizeCanvasToDisplaySize();
    return h * 0.82;
  }

  function startLevel() {
    state = State.PLAY;
    updateHeaderForPlay();
    hideOverlay();
    resetRun();
    updateBestUI();
    if (musicToggle.checked) startMusic();
  }

  function goMenu() {
    state = State.LEVELS;
    updateHeaderForLevels();
    resetRun();
    showOverlay("Neon Dash", "Pick a level, then press Play. Space also starts if a level is selected.");
  }

  function winRun() {
    statusPillEl.textContent = "Cleared!";
    showOverlay("Level Cleared!", "Nice. Pick another level or press Restart to run again.");
    // store best
    const best = bestById[selectedLevel.id] || 0;
    if (runProgress > best) {
      bestById[selectedLevel.id] = runProgress;
      saveBest();
      renderLevelsList();
      updateBestUI();
    }
    state = State.LEVELS;
  }

  function loseRun() {
    statusPillEl.textContent = "Crashed";
    showOverlay("Crashed!", "Press Restart (R) to try again.");
    // store best
    const best = bestById[selectedLevel.id] || 0;
    if (runProgress > best) {
      bestById[selectedLevel.id] = runProgress;
      saveBest();
      renderLevelsList();
      updateBestUI();
    }
  }

  // ---------- Overlay ----------
  function showOverlay(title, text) {
    overlayTitleEl.textContent = title;
    overlayTextEl.textContent = text;
    overlayEl.classList.add("show");
  }
  function hideOverlay() {
    overlayEl.classList.remove("show");
  }

  // ---------- Input ----------
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    if (e.code === "Escape") {
      goMenu();
      return;
    }
    if (e.code === "KeyL") {
      goMenu();
      return;
    }
    if (e.code === "KeyP") {
      if (state === State.PLAY) paused = !paused;
      return;
    }
    if (e.code === "KeyR") {
      if (state === State.PLAY) resetRun();
      else startLevel();
      return;
    }
    if (e.code === "Space" || e.code === "ArrowUp") {
      if (state === State.LEVELS) startLevel();
      else jump();
    }
  });

  canvas.addEventListener("pointerdown", () => {
    ensureAudio();
    if (state === State.LEVELS) startLevel();
    else jump();
  });

  // UI buttons
  btnLevels.addEventListener("click", () => goMenu());
  btnPlay.addEventListener("click", () => startLevel());
  btnRestart.addEventListener("click", () => {
    if (state !== State.PLAY) startLevel();
    else resetRun();
  });

  overlayPlayBtn.addEventListener("click", () => startLevel());
  overlayMenuBtn.addEventListener("click", () => goMenu());

  musicToggle.addEventListener("change", () => {
    musicOn = musicToggle.checked;
    if (!musicOn) stopMusic();
    else if (state === State.PLAY) startMusic();
  });

  // ---------- Rendering ----------
  function drawBackground(w, h, time) {
    // animated gradient haze
    const g = ctx.createLinearGradient(0, 0, w, h);
    const a = 0.22 + Math.sin(time * 0.0007) * 0.04;
    const b = 0.18 + Math.cos(time * 0.0005) * 0.04;
    g.addColorStop(0, `rgba(90,140,255,${a})`);
    g.addColorStop(0.5, `rgba(0,0,0,0)`);
    g.addColorStop(1, `rgba(0,255,190,${b})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // starfield
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const s of stars) {
      const sx = (s.x * w + (world.x * 0.08)) % w;
      const sy = (s.y * h + Math.sin(time * 0.0003 + s.p) * 6) % h;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(sx, sy, s.s, s.s);
    }
    ctx.restore();
  }

  function drawGrid(w, h) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    const step = Math.max(24, Math.floor(w / 24));
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;

    for (let x = ((-world.x * 0.25) % step); x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGround(w, h) {
    const gy = getGroundY();
    // glow strip
    ctx.save();
    ctx.fillStyle = "rgba(0,255,190,0.10)";
    ctx.fillRect(0, gy, w, h - gy);

    ctx.strokeStyle = "rgba(0,255,190,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();

    // subtle perspective lines
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(90,140,255,0.35)";
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const y = gy + t * (h - gy);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacles() {
    const gy = getGroundY();
    const lvl = selectedLevel;
    const camX = world.x;

    for (const o of lvl.obstacles) {
      const x = o.x - camX;
      const y = gy - o.h;

      if (x + o.w < -60 || x > canvas.width + 60) continue;

      // body
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = "rgba(90,140,255,0.65)";
      ctx.lineWidth = 2;

      roundRect(ctx, x, y, o.w, o.h, 10);
      ctx.fill();
      ctx.stroke();

      // neon edge
      ctx.shadowColor = "rgba(90,140,255,0.7)";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = "rgba(0,255,190,0.55)";
      ctx.lineWidth = 2;
      roundRect(ctx, x + 1, y + 1, o.w - 2, o.h - 2, 10);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawPlayer() {
    const gy = getGroundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    ctx.save();

    // glow
    ctx.shadowColor = "rgba(0,255,190,0.9)";
    ctx.shadowBlur = 22;

    // main
    ctx.fillStyle = "rgba(0,255,190,0.24)";
    ctx.strokeStyle = "rgba(0,255,190,0.85)";
    ctx.lineWidth = 2;

    const angle = world.t * 0.010; // slow rotation effect
    ctx.translate(px, py);
    ctx.rotate(angle);

    roundRect(ctx, -player.r, -player.r, player.r * 2, player.r * 2, 8);
    ctx.fill();
    ctx.stroke();

    // inner detail
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-player.r * 0.6, 0);
    ctx.lineTo(player.r * 0.6, 0);
    ctx.stroke();

    ctx.restore();
  }

  function drawSparks(dt) {
    if (!particlesToggle.checked) return;
    const gy = getGroundY();
    const w = canvas.width;

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life -= dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }

      p.vy += 980 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = "rgba(0,255,190,0.8)";
      ctx.shadowColor = "rgba(0,255,190,0.9)";
      ctx.shadowBlur = 12;
      ctx.fillRect(p.x, (gy - p.y), 2, 2);
      ctx.restore();

      // if off-screen, kill
      if (p.x < -200 || p.x > w + 200) p.life = 0;
    }
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  // ---------- Physics & collision ----------
  function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx * dx + dy * dy) <= cr * cr;
  }

  function update(dt) {
    if (state !== State.PLAY) return;
    if (paused) return;

    world.t += dt * 1000;
    world.x += selectedLevel.speed * dt;

    // progress
    runProgress = clamp(world.x / selectedLevel.length, 0, 1);
    runPctEl.textContent = `${Math.floor(runProgress * 100)}%`;

    // player gravity
    player.vy += 1400 * dt;
    player.y += player.vy * dt;

    // ground
    if (player.y < 0) {
      player.y = 0;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // collision
    const gy = getGroundY();
    const px = player.x;
    const py = gy - player.r - player.y;

    for (const o of selectedLevel.obstacles) {
      const ox = o.x - world.x;
      const oy = gy - o.h;

      if (ox + o.w < -80 || ox > canvas.width + 80) continue;

      if (rectCircleCollide(ox, oy, o.w, o.h, px, py, player.r * 0.95)) {
        player.alive = false;
        spawnSparks(px, player.y + 20, 46);
        blip(140, 0.08);
        loseRun();
        state = State.PAUSE; // stop physics
        break;
      }
    }

    // win
    if (runProgress >= 1 && player.alive) {
      blip(820, 0.05);
      winRun();
    }
  }

  function render(dt, time) {
    const { w, h } = resizeCanvasToDisplaySize();
    ctx.clearRect(0, 0, w, h);

    drawBackground(w, h, time);
    drawGrid(w, h);
    drawGround(w, h);
    drawObstacles();
    drawPlayer();
    drawSparks(dt);

    // HUD overlay inside canvas
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(ctx, 16, 16, 220, 54, 14);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = `${Math.floor(h * 0.03)}px ui-sans-serif, system-ui`;
    ctx.fillText(paused && state === State.PLAY ? "PAUSED" : "RUNNING", 32, 48);

    ctx.globalAlpha = 0.75;
    ctx.fillText(`Speed ${selectedLevel.speed}`, 120, 48);
    ctx.restore();
  }

  // ---------- Loop ----------
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = clamp((ts - lastTs) / 1000, 0, 0.033);
    lastTs = ts;

    // keep overlay state consistent
    if (state === State.LEVELS) {
      statusPillEl.textContent = "Menu";
    } else if (state === State.PLAY) {
      statusPillEl.textContent = paused ? "Paused" : "Playing";
    }

    update(dt);
    render(dt, ts);

    requestAnimationFrame(loop);
  }

  // ---------- Boot ----------
  function boot() {
    renderLevelsList();
    updateHeaderForLevels();
    updateBestUI();
    showOverlay("Neon Dash", "Pick a level on the left, then press Play. Space also starts.");

    // start music only after user interacts, but keep it ready
    musicOn = musicToggle.checked;

    window.addEventListener("resize", () => resizeCanvasToDisplaySize());
    resizeCanvasToDisplaySize();
    requestAnimationFrame(loop);
  }

  boot();
})();
