'use strict';
function democraticCallTracker() {
  const seen = new Set();
  let initialized = false;
  return function collect(national) {
    const additions = [];
    for (const [office,feed] of Object.entries(national)) {
      for (const [raceId,race] of Object.entries(feed.races)) {
        for (const name of race.call ?? []) {
          if (!race.cands.some(c => c.n===name && c.p==='D')) continue;
          const id = JSON.stringify([office,raceId,name]);
          if (seen.has(id)) continue;
          seen.add(id);
          if (initialized) additions.push({office,raceId,name,time:race.callTime});
        }
      }
    }
    initialized = true;
    return additions.sort((a,b) => (a.time ?? '').localeCompare(b.time ?? ''));
  };
}

function playCouchBurst(canvas, duration, isTV) {
  const context=canvas.getContext('2d');
  if (!context) return () => {};
  const themed=window.themeList?.('burst')??[];
  const colors=themed.length?themed:['#edf5ff','#a5ccff','#6c9efa','#8ce4f7','#d6f59d','#f6cf79'];
  const rings=window.themeList?.('burst-ring')??[];
  const particles=Array.from({length:isTV?160:105},(_,i)=>({
    angle:Math.random()*Math.PI*2,
    speed:.23+Math.random()*.93,
    depth:(Math.random()-.46)*1.36,
    scale:2+Math.random()*8,
    spin:(Math.random()-.5)*8,
    launch:Math.random()*.35,
    color:colors[i%colors.length],
    trail:i%5===0
  })).sort((a,b)=>a.depth-b.depth);
  let frame,width,height,density;
  const resize=()=>{
    width=canvas.clientWidth;height=canvas.clientHeight;
    density=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(3600000/Math.max(1,width*height)));
    canvas.width=Math.max(1,Math.round(width*density));
    canvas.height=Math.max(1,Math.round(height*density));
    context.setTransform(density,0,0,density,0,0);
  };
  resize();
  window.addEventListener('resize',resize);
  const start=performance.now();
  const length=Math.min(duration-350,isTV?5900:4800);
  function draw(time) {
    const elapsed=(time-start)/1000;
    const life=Math.min(1,(time-start)/length);
    const scale=Math.min(width,height);
    const fade=Math.min(1,(1-life)*3);
    context.clearRect(0,0,width,height);
    function project(x,y,z) {
      const depth=1.65/Math.max(.52,1.65-z);
      return [width*.5+x*scale*depth,height*.48+y*scale*depth,depth];
    }
    for(let ring=0;ring<3;ring++) {
      const radius=(1-Math.exp(-elapsed*2.4))*(.38+ring*.12);
      const yaw=elapsed*.48+ring*Math.PI/3;
      const twist=.28+ring*.29;
      context.beginPath();
      for(let point=0;point<=72;point++) {
        const angle=point/72*Math.PI*2;
        const x=Math.cos(angle)*radius;
        const y=Math.sin(angle)*radius;
        const [sx,sy]=project(x*Math.cos(yaw)-y*Math.sin(twist)*Math.sin(yaw),y*Math.cos(twist),x*Math.sin(yaw)+y*Math.sin(twist)*Math.cos(yaw));
        if(point===0) context.moveTo(sx,sy);else context.lineTo(sx,sy);
      }
      context.strokeStyle=ring===1?(rings[0]||'#d4f1a1'):(rings[1]||'#80b8fd');
      context.globalAlpha=fade*Math.min(1,elapsed*4)*(.24-ring*.04);
      context.lineWidth=ring===0?1.4:.9;
      context.stroke();
    }
    for (const item of particles) {
      const age=elapsed-item.launch;
      if(age<0) continue;
      const spread=(1-Math.exp(-age*1.9))*item.speed;
      const angle=item.angle+age*.15;
      const z=item.depth*(1-Math.exp(-age*1.3));
      const [x,y,depth]=project(Math.cos(angle)*spread,Math.sin(angle)*spread*.7+age*age*.026,z);
      const size=item.scale*depth*Math.max(.85,scale/950);
      context.globalAlpha=fade*Math.min(1,age*8)*Math.min(1,depth*.77);
      context.fillStyle=item.color;
      if(item.trail) {
        context.beginPath();
        context.moveTo(x-Math.cos(angle)*size*4,y-Math.sin(angle)*size*4);
        context.lineTo(x,y);
        context.strokeStyle=item.color;
        context.lineWidth=Math.max(1,depth);
        context.stroke();
      } else {
        context.save();
        context.translate(x,y);
        context.rotate(item.angle+age*item.spin);
        const flip=Math.cos(age*item.spin*.8+item.angle);
        context.fillRect(-size*.65,-size*.27,Math.max(1,Math.abs(flip)*size*1.3),size*.55);
        context.restore();
      }
    }
    context.globalAlpha=1;
    if(life<1) frame=requestAnimationFrame(draw);
    else context.clearRect(0,0,width,height);
  }
  frame=requestAnimationFrame(draw);
  return ()=>{
    window.removeEventListener('resize',resize);
    cancelAnimationFrame(frame);
    context.clearRect(0,0,width,height);
  };
}
