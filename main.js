(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true });

  const levelsListEl = document.getElementById("levelsList");
  const statusPillEl = document.getElementById("statusPill");
  const screenTitleEl = document.getElementById("screenTitle");
  const screenSubEl = document.getElementById("screenSub");
  const bestPctEl = document.getElementById("bestPct");
  const runPctEl = document.getElementById("runPct");

  const btnPlay = document.getElementById("btnPlay");
  const btnLevels = document.getElementById("btnLevels");
  const btnRestart = document.getElementById("btnRestart");

  const musicToggle = document.getElementById("musicToggle");
  const fxToggle = document.getElementById("fxToggle");
  const liteToggle = document.getElementById("liteToggle");

  const clamp = (v,a,b)=>v<a?a:v>b?b:v;
  const lerp = (a,b,t)=>a+(b-a)*t;

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, (r.width * dpr) | 0);
    const h = Math.max(1, (r.height * dpr) | 0);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
  }
  function groundY(){ return canvas.height*0.84; }

  function enterPlayUI(){ document.body.classList.add("playmode"); }
  function exitPlayUI(){ document.body.classList.remove("playmode"); }

  // ----- Audio -----
  let audioCtx=null, music=null;
  function ensureAudio(){
    if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==="suspended") audioCtx.resume();
  }
  function beep(type,freq,dur,vol){
    if(!audioCtx||!fxToggle.checked) return;
    const o=audioCtx.createOscillator();
    const g=audioCtx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.value=0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const t=audioCtx.currentTime;
    g.gain.exponentialRampToValueAtTime(vol, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.start(t); o.stop(t+dur+0.02);
  }
  const sfx={
    jump(){beep("square",700,0.06,0.06);},
    pad(){beep("triangle",900,0.08,0.06);},
    orb(){beep("triangle",1040,0.08,0.06);},
    portal(){beep("sine",420,0.08,0.05);},
    die(){beep("sawtooth",160,0.12,0.08);},
    win(){beep("triangle",980,0.10,0.06);}
  };

  function stopMusic(){
    if(!music) return;
    try{clearInterval(music.timer);}catch{}
    try{music.o1.stop(); music.o2.stop();}catch{}
    music=null;
  }
  function startMusic(){
    if(!musicToggle.checked) return;
    ensureAudio(); stopMusic();
    const master=audioCtx.createGain(); master.gain.value=0.105; master.connect(audioCtx.destination);
    const o1=audioCtx.createOscillator(), o2=audioCtx.createOscillator();
    const g1=audioCtx.createGain(), g2=audioCtx.createGain();
    o1.type="sawtooth"; o2.type="triangle";
    g1.gain.value=0; g2.gain.value=0;
    o1.connect(g1); g1.connect(master);
    o2.connect(g2); g2.connect(master);
    o1.start(); o2.start();

    const bpm=128, stepDur=(60/bpm)/2;
    const seq=[0,7,12,7,0,10,12,10];
    const base=220; let step=0;
    const timer=setInterval(()=>{
      const t=audioCtx.currentTime;
      const n=seq[step++%seq.length];
      const hz=base*Math.pow(2,n/12);
      const a=t+0.01, r=t+stepDur*0.95;
      o1.frequency.setValueAtTime(hz,a);
      o2.frequency.setValueAtTime(hz*2,a);

      g1.gain.cancelScheduledValues(t);
      g2.gain.cancelScheduledValues(t);
      g1.gain.setValueAtTime(0.0001,t);
      g1.gain.linearRampToValueAtTime(0.14,a);
      g1.gain.exponentialRampToValueAtTime(0.0001,r);
      g2.gain.setValueAtTime(0.0001,t);
      g2.gain.linearRampToValueAtTime(0.08,a);
      g2.gain.exponentialRampToValueAtTime(0.0001,r);
    }, stepDur*1000);

    music={o1,o2,timer};
  }
  musicToggle.addEventListener("change",()=>{
    ensureAudio();
    if(!musicToggle.checked) stopMusic();
    else if(state==="play") startMusic();
  });

  // ----- Save best -----
  const bestKey="riftpulseBest";
  const bestById=(()=>{ try{return JSON.parse(localStorage.getItem(bestKey)||"{}");}catch{return{};} })();
  const saveBest=()=>{ try{localStorage.setItem(bestKey,JSON.stringify(bestById));}catch{} };

  // ----- Theme -----
  const THEMES={
    easy:{a:[0,255,190], b:[130,140,255], spike:[255,120,170], orb:[60,200,255], portal:[255,120,255]},
    mid:{a:[255,210,90], b:[0,255,190], spike:[255,120,170], orb:[60,200,255], portal:[120,200,255]},
    hard:{a:[255,80,120], b:[160,80,255], spike:[255,120,170], orb:[60,200,255], portal:[255,210,90]},
  };
  const rgb=(arr,a=1)=>`rgba(${arr[0]},${arr[1]},${arr[2]},${a})`;

  // Types:
  // 0 spike
  // 1 solid block (standable)
  // 2 falling block (sinks)
  // 3 pad
  // 4 orb (AUTO in-air boost when you touch it)
  // 5 speed portal

  const LEVELS=[
    {
      id:"l1", name:"Stereo Spark", diff:"Easy", theme:"easy",
      baseSpeed: 610, length: 6400,
      obs:[
        [0,1700,46,56],
        [1,2000,90,40],[1,2160,90,55],[1,2320,90,70],
        [0,2550,46,56],
        [1,2800,120,60],
        [4,3050, 325, 18], // reachable, OPTIONAL
        [3,3300,70,16],
        [1,3460,150,90],
        [2,3850,90,22],[2,4010,90,22],[2,4170,90,22],[2,4330,90,22],
        [0,4700,46,56],[0,4880,46,56],
        [1,5200,180,70],
      ]
    },
    {
      id:"l2", name:"Backbeat Blvd", diff:"Medium", theme:"mid",
      baseSpeed: 680, length: 7200,
      obs:[
        [1,1600,90,50],[1,1760,90,70],[1,1920,90,90],
        [0,2200,46,56],
        [4,2520, 325, 18],
        [3,2750,70,16],
        [1,2920,140,110],
        [2,3300,90,22],[2,3460,90,22],[2,3620,90,22],[2,3780,90,22],[2,3940,90,22],
        [5,4300, 220, 70, 140, 1.12],
        [0,5100,46,56],
        [1,5400,160,95],
        [0,6000,46,56],
      ]
    },
    {
      id:"l3", name:"Rage Circuit", diff:"Hard", theme:"hard",
      baseSpeed: 740, length: 8000,
      obs:[
        [1,1500,90,55],[1,1660,90,80],[1,1820,90,105],
        [0,2100,46,56],
        [4,2500, 325, 18],
        [4,2800, 295, 18],
        [2,3200,90,22],[2,3360,90,22],[2,3520,90,22],[2,3680,90,22],
        [0,4020,46,56],
        [5,4500, 220, 70, 140, 1.18],
        [3,5200,70,16],
        [1,5360,120,120],[1,5540,120,140],
        [0,6200,46,56],
        [1,6800,160,110],
      ]
    }
  ];

  let selected=LEVELS[0];

  function renderLevels(){
    levelsListEl.innerHTML="";
    for(const lvl of LEVELS){
      const best=((bestById[lvl.id]||0)*100)|0;
      const el=document.createElement("div");
      el.className="levelItem"+(lvl.id===selected.id?" sel":"");
      el.innerHTML=`<div class="n">${lvl.name}</div><div class="m">${lvl.diff} • Best ${best}% • Speed ${lvl.baseSpeed}</div>`;
      el.onclick=()=>{ selected=lvl; renderLevels(); updateBestUI(); };
      levelsListEl.appendChild(el);
    }
  }
  function updateBestUI(){
    bestPctEl.textContent=`${(((bestById[selected.id]||0)*100)|0)}%`;
  }

  // ----- Game state -----
  let state="menu";
  let paused=false;

  const GRAV=2850;
  const JUMP=930;
  const PADJ=1280;
  const ORBJ=1120;
  const MAXF=-1800;

  let coyote=0, buffer=0;
  const COYOTE_MAX=0.08, BUFFER_MAX=0.11;

  let orbCD=0;
  let speedMult=1;

  let deadTimer=0;
  const RESTART_IN=0.75;

  const world={x:0,t:0};
  const player={x:250, y:0, vy:0, s:36, alive:true, onGround:true};

  const sink=[];

  const stars=new Float32Array(400);
  for(let i=0;i<stars.length;i++) stars[i]=Math.random();

  function setStatus(t){ statusPillEl.textContent=t; }
  function goMenu(){
    exitPlayUI();
    state="menu"; paused=false;
    setStatus("Menu");
    screenTitleEl.textContent="Pick a Level";
    screenSubEl.textContent="Select one, then press Play";
  }

  function startRun(){
    ensureAudio();
    enterPlayUI();
    state="play"; paused=false;

    world.x=0; world.t=0;
    player.y=0; player.vy=0;
    player.alive=true; player.onGround=true;

    coyote=COYOTE_MAX; buffer=0;
    deadTimer=0; orbCD=0; speedMult=1;

    sink.length=selected.obs.length;
    for(let i=0;i<sink.length;i++) sink[i]=0;

    runPctEl.textContent="0%";
    setStatus("Playing");
    screenTitleEl.textContent=selected.name;
    screenSubEl.textContent="click/space to jump • orbs boost automatically";
    if(musicToggle.checked) startMusic();
    updateBestUI();
  }

  function die(){
    if(!player.alive) return;
    player.alive=false;
    deadTimer=RESTART_IN;
    setStatus("Crashed");
    sfx.die();
  }

  function win(){
    setStatus("Cleared!");
    sfx.win();
    const prog=clamp(world.x/selected.length,0,1);
    const prev=bestById[selected.id]||0;
    if(prog>prev){ bestById[selected.id]=prog; saveBest(); }
    renderLevels(); updateBestUI();
    setTimeout(()=>{ if(state==="play") goMenu(); }, 900);
  }

  btnPlay.onclick=startRun;
  btnRestart.onclick=startRun;
  btnLevels.onclick=goMenu;

  function queueJump(){
    if(state!=="play"||paused||!player.alive) return;
    buffer=BUFFER_MAX;
  }

  window.addEventListener("keydown",(e)=>{
    if(e.repeat) return;
    if(e.code==="Escape"){ goMenu(); return; }
    if(e.code==="KeyP"){ if(state==="play") paused=!paused; return; }
    if(e.code==="KeyR"){ startRun(); return; }
    if(e.code==="Space"||e.code==="ArrowUp"){ queueJump(); }
  });
  canvas.addEventListener("pointerdown",()=>{ ensureAudio(); queueJump(); });
  window.addEventListener("pointerdown",()=>ensureAudio(),{once:true});

  function aabb(ax,ay,aw,ah,bx,by,bw,bh){
    return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
  }

  function rr(x,y,w,h,r){
    const rad=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rad,y);
    ctx.arcTo(x+w,y,x+w,y+h,rad);
    ctx.arcTo(x+w,y+h,x,y+h,rad);
    ctx.arcTo(x,y+h,x,y,rad);
    ctx.arcTo(x,y,x+w,y,rad);
    ctx.closePath();
  }

  function drawBackground(ts){
    const theme=THEMES[selected.theme];
    const w=canvas.width,h=canvas.height;

    const p=0.16+Math.sin(ts*0.0012)*0.05;
    const q=0.14+Math.cos(ts*0.0010)*0.05;

    const g=ctx.createLinearGradient(0,0,w,h);
    g.addColorStop(0,rgb(theme.b,p));
    g.addColorStop(0.55,"rgba(0,0,0,0)");
    g.addColorStop(1,rgb(theme.a,q));
    ctx.fillStyle=g;
    ctx.fillRect(0,0,w,h);

    const lite=liteToggle.checked;
    const count=lite?70:150;
    ctx.save(); ctx.globalAlpha=0.8;
    for(let i=0;i<count;i++){
      const sx=(stars[i*2]*w + world.x*0.08)%w;
      const sy=(stars[i*2+1]*h + Math.sin(ts*0.00035+i)*4)%h;
      ctx.fillStyle="rgba(255,255,255,0.78)";
      ctx.fillRect(sx,sy,2,2);
    }
    ctx.restore();

    ctx.save(); ctx.globalAlpha=0.10;
    ctx.strokeStyle="rgba(255,255,255,0.22)";
    const step=Math.max(26,(w/26)|0);
    for(let x=(( -world.x*0.22) % step); x<w; x+=step){
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGround(){
    const gy=groundY();
    ctx.fillStyle="rgba(0,0,0,0.15)";
    ctx.fillRect(0,gy,canvas.width,canvas.height-gy);
    ctx.strokeStyle="rgba(0,255,190,0.55)";
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(canvas.width,gy); ctx.stroke();
  }

  function drawSpike(x,w,h){
    const theme=THEMES[selected.theme];
    const gy=groundY();
    const y=gy-h;
    ctx.save();
    ctx.fillStyle="rgba(255,255,255,0.05)";
    ctx.strokeStyle=rgb(theme.spike,0.9);
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(x,y+h);
    ctx.lineTo(x+w*0.5,y);
    ctx.lineTo(x+w,y+h);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawBlock(x,w,h,isFalling,sunk){
    const theme=THEMES[selected.theme];
    const gy=groundY();
    const y=(gy-h)+(sunk||0);

    ctx.save();
    ctx.fillStyle="rgba(255,255,255,0.06)";
    ctx.strokeStyle=rgb(theme.b,0.80);
    ctx.lineWidth=2;

    rr(x,y,w,h,10);
    ctx.fill(); ctx.stroke();

    ctx.globalAlpha=0.55;
    ctx.strokeStyle=isFalling?"rgba(255,210,90,0.65)":rgb(theme.a,0.55);
    ctx.beginPath(); ctx.moveTo(x+6,y+6); ctx.lineTo(x+w-6,y+6); ctx.stroke();

    ctx.globalAlpha=1;
    ctx.shadowColor=rgb(theme.a,0.9);
    ctx.shadowBlur=14;
    ctx.strokeStyle=rgb(theme.a,0.35);
    rr(x+1,y+1,w-2,h-2,10);
    ctx.stroke();
    ctx.restore();
  }

  function drawPad(x,w,h){
    const gy=groundY();
    ctx.save();
    ctx.fillStyle="rgba(255,230,90,0.18)";
    ctx.strokeStyle="rgba(255,230,90,0.95)";
    ctx.lineWidth=2;
    rr(x,gy-h,w,h,8);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawOrb(x,y,r){
    const theme=THEMES[selected.theme];
    ctx.save();
    ctx.fillStyle=rgb(theme.orb,0.14);
    ctx.strokeStyle=rgb(theme.orb,0.95);
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.shadowColor=rgb(theme.orb,0.9);
    ctx.shadowBlur=18;
    ctx.beginPath(); ctx.arc(x,y,r+3,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  function drawPortal(x,y,w,h,mult){
    const theme=THEMES[selected.theme];
    ctx.save();
    ctx.fillStyle=rgb(theme.portal,0.12);
    ctx.strokeStyle=rgb(theme.portal,0.95);
    ctx.lineWidth=2;
    rr(x-w/2,y,w,h,16);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha=0.85;
    ctx.fillStyle="rgba(255,255,255,0.75)";
    ctx.font=`${Math.max(12,(canvas.height*0.024)|0)}px system-ui`;
    ctx.fillText(`x${mult.toFixed(2)}`, x-18, y+h+18);
    ctx.restore();
  }

  function drawPlayer(){
    const theme=THEMES[selected.theme];
    const gy=groundY();
    const px=player.x;
    const py=gy-player.s-player.y;

    ctx.save();
    ctx.shadowColor=rgb(theme.a,0.95);
    ctx.shadowBlur=18;
    ctx.fillStyle=rgb(theme.a,0.18);
    ctx.strokeStyle=rgb(theme.a,0.9);
    ctx.lineWidth=2;

    const ang=world.t*0.0022;
    ctx.translate(px+player.s/2, py+player.s/2);
    ctx.rotate(ang);
    rr(-player.s/2, -player.s/2, player.s, player.s, 8);
    ctx.fill(); ctx.stroke();

    // face mood per level
    ctx.shadowBlur=0;
    ctx.fillStyle="rgba(255,255,255,0.9)";
    ctx.strokeStyle="rgba(255,255,255,0.9)";
    ctx.lineWidth=2;
    const eyeY=-4;
    ctx.beginPath(); ctx.arc(-8,eyeY,2.4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 8,eyeY,2.4,0,Math.PI*2); ctx.fill();

    if(selected.diff==="Easy"){
      ctx.beginPath(); ctx.arc(0,6,10,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
    } else if(selected.diff==="Medium"){
      ctx.beginPath(); ctx.moveTo(-10,8); ctx.lineTo(10,8); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-12,-10); ctx.lineTo(-4,-6);
      ctx.moveTo( 12,-10); ctx.lineTo( 4,-6);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0,12,10,1.15*Math.PI,1.85*Math.PI); ctx.stroke();
    }

    ctx.restore();
  }

  function drawHUD(){
    const h=canvas.height;
    ctx.save();
    ctx.globalAlpha=0.85;
    ctx.fillStyle="rgba(0,0,0,0.22)";
    rr(14,14,360,46,14); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.88)";
    ctx.font=`${(h*0.03)|0}px system-ui`;

    if(!player.alive) ctx.fillText("CRASHED — restarting…", 28, 44);
    else if(paused) ctx.fillText("PAUSED (P) • ESC menu", 28, 44);
    else ctx.fillText("Jump: click/space • Orbs boost automatically", 28, 44);
    ctx.restore();
  }

  function update(dt){
    if(state!=="play") return;

    world.t += dt*1000;
    if(paused) return;

    if(orbCD>0) orbCD-=dt;

    if(!player.alive){
      deadTimer-=dt;
      if(deadTimer<=0) startRun();
      return;
    }

    world.x += (selected.baseSpeed * speedMult) * dt;

    const prog=clamp(world.x/selected.length,0,1);
    runPctEl.textContent=`${(prog*100)|0}%`;

    if(buffer>0) buffer-=dt;
    if(player.onGround) coyote=COYOTE_MAX;
    else coyote=Math.max(0,coyote-dt);

   const prevPlayerY = player.y;
    player.vy -= GRAV*dt;
    player.vy = Math.max(player.vy, MAXF);
    player.y += player.vy*dt;

    if(player.y<=0){
      player.y=0; player.vy=0; player.onGround=true;
    } else player.onGround=false;

    if(buffer>0 && (player.onGround || coyote>0)){
      buffer=0; coyote=0;
      player.vy=JUMP; player.onGround=false;
      sfx.jump();
    }

    const gy=groundY();
    const px=player.x;
    const py=gy-player.s-player.y;

    const obs=selected.obs;
    for(let i=0;i<obs.length;i++){
      const o=obs[i];
      const type=o[0];
      const ox=o[1]-world.x;

      if(type<=3){
        const ow=o[2];
        if(ox+ow<-220) continue;
        if(ox>canvas.width+220) break;
      } else {
        if(ox<-260) continue;
        if(ox>canvas.width+260) break;
      }

      if(type===0){
        const ow=o[2], oh=o[3];
        const sy=gy-oh;
        if(aabb(px,py,player.s,player.s, ox,sy,ow,oh)){ die(); break; }
        continue;
      }

      if(type===3){
        const ow=o[2], oh=o[3];
        const ry=gy-oh;
        if(aabb(px,py,player.s,player.s, ox,ry,ow,oh) && player.y<=8){
          player.vy=PADJ; player.onGround=false;
          buffer=0; coyote=0;
          sfx.pad();
        }
        continue;
      }

      if(type===4){
        const oy=o[2], r=o[3];
        if(!player.onGround && orbCD<=0){
          const cx=px+player.s/2, cy=py+player.s/2;
          const dx=cx-ox, dy=cy-oy;
          const rr=(r+player.s*0.75);
          if(dx*dx+dy*dy<=rr*rr){
            orbCD=0.18;
            player.vy=ORBJ; player.onGround=false;
            sfx.orb();
          }
        }
        continue;
      }

      if(type===5){
        const yTop=o[2], pw=o[3], ph=o[4], mult=o[5];
        const rx=ox-pw/2;
        if(aabb(px,py,player.s,player.s, rx,yTop,pw,ph)){
          speedMult = lerp(speedMult, mult, 0.35);
          sfx.portal();
        }
        continue;
      }

    if (type === 1 || type === 2) {
  const ow = o[2], oh = o[3];
  const falling = (type === 2);
  const sunk = falling ? sink[i] : 0;

  // block rect in screen space
  const bx = ox;
  const by = (gy - oh) + sunk; // TOP of block
  const bw = ow;
  const bh = oh;

  // player rect
  const prx = px;
  const pry = py;
  const prw = player.s;
  const prh = player.s;

  // quick overlap test
  const hit = aabb(prx, pry, prw, prh, bx, by, bw, bh);
  if (!hit) continue;

  // --- LANDING CHECK (from above) ---
  const prevPy = gy - player.s - prevPlayerY; // REAL previous frame player top
const prevBottom = prevPy + prh;
  const nowBottom = pry + prh;

  const blockTop = by;
  const withinX = (prx + prw) > bx && prx < (bx + bw);

  // If we crossed the block top this frame, we LAND (and do NOT die)
 if (prevBottom <= blockTop + 6 && nowBottom >= blockTop - 6 && player.vy <= 0) {
    // snap onto top
    player.y = (gy - player.s) - blockTop;
    player.vy = 0;
    player.onGround = true;

    if (falling) sink[i] += 160 * dt;
    continue;
  }

  // --- AUTO STEP (optional help) ---
  // if you bump a SMALL block while on ground, step onto it instead of dying
  if (player.onGround && type === 1 && oh <= 80) {
    const stepMax = player.s * 0.55;
    const gapToTop = blockTop - (pry + prh);
    if (gapToTop <= stepMax && gapToTop >= -2 && withinX) {
      player.y = (gy - player.s) - blockTop;
      player.vy = 0;
      player.onGround = true;
      continue;
    }
  }

  // otherwise: side/bottom hit = death (Geometry Dash rule)
  die();
  break;
}

        if(falling && player.onGround && withinX && Math.abs((py+player.s)-by)<3){
          sink[i]+=160*dt;
        }

        if(aabb(px,py,player.s,player.s, bx,by,ow,oh)){ die(); break; }
      }
    }

    if(prog>=1) win();
  }

  function render(ts){
    resizeCanvas();
    ctx.clearRect(0,0,canvas.width,canvas.height);

    drawBackground(ts);
    drawGround();

    if(state==="play"){
      const obs=selected.obs;
      for(let i=0;i<obs.length;i++){
        const o=obs[i], type=o[0];
        if(type<=3){
          const ox=o[1]-world.x, w=o[2], h=o[3];
          if(ox+w<-220) continue;
          if(ox>canvas.width+220) break;
          if(type===0) drawSpike(ox,w,h);
          else if(type===1) drawBlock(ox,w,h,false,0);
          else if(type===2) drawBlock(ox,w,h,true,sink[i]);
          else if(type===3) drawPad(ox,w,h);
        } else if(type===4){
          const ox=o[1]-world.x;
          if(ox<-260) continue;
          if(ox>canvas.width+260) break;
          drawOrb(ox,o[2],o[3]);
        } else if(type===5){
          const ox=o[1]-world.x;
          if(ox<-280) continue;
          if(ox>canvas.width+280) break;
          drawPortal(ox,o[2],o[3],o[4],o[5]);
        }
      }

      drawPlayer();
      drawHUD();
    }
  }

  let last=0;
  function loop(ts){
    if(!last) last=ts;
    const dt=clamp((ts-last)/1000,0,0.033);
    last=ts;
    update(dt);
    render(ts);
    requestAnimationFrame(loop);
  }

  function boot(){
    renderLevels();
    updateBestUI();
    goMenu();
    window.addEventListener("resize", resizeCanvas);
    requestAnimationFrame(loop);
  }

  boot();
})();








