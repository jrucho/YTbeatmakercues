let canvas, ctx, video;
let params = {brightness:1, contrast:1, saturate:1, hue:0, blur:0};
let effect = 'none';
let corners = [];
let handles = [], dragging = -1;

window.addEventListener('message', e => {
  const msg = e.data;
  if(msg.type === 'videoStream') {
    video = document.createElement('video');
    video.srcObject = msg.stream;
    video.muted = true;
    video.play().catch(()=>{});
  } else if(msg.type === 'params') {
    params = msg.params;
  } else if(msg.type === 'effect') {
    effect = msg.effect;
  } else if(msg.type === 'toggleCorners') {
    toggleCorners(msg.enabled);
  } else if(msg.type === 'resetCorners') {
    resetCorners();
  }
});

function sendReady(){
  window.opener && window.opener.postMessage({type:'projectorReady'}, '*');
}

function init(){
  canvas = document.getElementById('vjCanvas');
  ctx = canvas.getContext('2d');
  handles = [document.getElementById('h0'),document.getElementById('h1'),document.getElementById('h2'),document.getElementById('h3')];
  handles.forEach((h,i)=>{
    h.onmousedown = ev => { dragging = i; ev.preventDefault(); };
  });
  window.addEventListener('mousemove', ev => {
    if(dragging>=0){
      corners[dragging] = {x:ev.clientX, y:ev.clientY};
      updateHandles();
    }
  });
  window.addEventListener('mouseup', ()=>{dragging=-1;});
  document.getElementById('btnHide').onclick = ()=> window.close();
  document.getElementById('btnFull').onclick = ()=> document.documentElement.requestFullscreen();
  document.getElementById('btnReset').onclick = resetCorners;
  resetCorners();
  sendReady();
  const cs = canvas.captureStream();
  window.opener && window.opener.postMessage({type:'projectorStream', stream: cs}, '*', [cs]);
  requestAnimationFrame(loop);
}

function resetCorners(){
  const r = canvas.getBoundingClientRect();
  corners = [
    {x:r.left, y:r.top},
    {x:r.right, y:r.top},
    {x:r.right, y:r.bottom},
    {x:r.left, y:r.bottom}
  ];
  updateHandles();
}

function updateHandles(){
  handles.forEach((h,i)=>{ h.style.left = corners[i].x-6+'px'; h.style.top = corners[i].y-6+'px'; });
  applyTransform();
}

function applyTransform(){
  const w = canvas.width;
  const h = canvas.height;
  const src = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  const m = computeHomography(src, corners);
  const css = homographyToCss(m);
  canvas.style.transform = 'matrix3d('+css.join(',')+')';
}

function loop(){
  if(video){
    ctx.filter = `brightness(${params.brightness}) contrast(${params.contrast}) saturate(${params.saturate}) hue-rotate(${params.hue}deg) blur(${params.blur}px)`;
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    applyEffect();
  }
  requestAnimationFrame(loop);
}

function applyEffect(){
  if(effect==='invert'){
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);let d=img.data;for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}ctx.putImageData(img,0,0);
  }else if(effect==='grayscale'){
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);let d=img.data;for(let i=0;i<d.length;i+=4){const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];d[i]=d[i+1]=d[i+2]=g;}ctx.putImageData(img,0,0);
  }else if(effect==='sepia'){
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);let d=img.data;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];d[i]=r*0.393+g*0.769+b*0.189;d[i+1]=r*0.349+g*0.686+b*0.168;d[i+2]=r*0.272+g*0.534+b*0.131;}ctx.putImageData(img,0,0);
  }else if(effect==='pixel'){
    const size=10;const img=ctx.getImageData(0,0,canvas.width,canvas.height);let d=img.data;for(let y=0;y<canvas.height;y+=size){for(let x=0;x<canvas.width;x+=size){const i=(y*canvas.width+x)*4;const r=d[i],g=d[i+1],b=d[i+2];for(let yy=0;yy<size;yy++){for(let xx=0;xx<size;xx++){const p=((y+yy)*canvas.width+(x+xx))*4;d[p]=r;d[p+1]=g;d[p+2]=b;}}}}ctx.putImageData(img,0,0);
  }else if(effect==='rgbShift'){
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);let d=img.data;for(let i=0;i<d.length;i+=4){d[i]=d[i+5]||d[i];d[i+2]=d[i+2-5]||d[i+2];}ctx.putImageData(img,0,0);
  }else if(effect==='kaleido'){
    // simple 4-way mirror
    const temp=ctx.getImageData(0,0,canvas.width/2,canvas.height/2);ctx.putImageData(temp,canvas.width/2,0);ctx.putImageData(temp,0,canvas.height/2);ctx.putImageData(temp,canvas.width/2,canvas.height/2);
  }else if(effect==='edge'){
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);let d=img.data;const w=canvas.width;const h=canvas.height;const out=ctx.createImageData(w,h);let o=out.data;for(let y=1;y<h-1;y++){for(let x=1;x<w-1;x++){const i=(y*w+x)*4;const gx=(-d[i-4-w*4]-2*d[i-w*4]-d[i+4-w*4]+d[i-4+w*4]+2*d[i+w*4]+d[i+4+w*4]);const gy=(-d[i-4-w*4]-2*d[i-4]-d[i-4+w*4]+d[i+4-w*4]+2*d[i+4]+d[i+4+w*4]);const g=Math.sqrt(gx*gx+gy*gy);o[i]=o[i+1]=o[i+2]=g;o[i+3]=255;}}ctx.putImageData(out,0,0);
  }else if(effect==='wave'){
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);let d=img.data;const out=ctx.createImageData(canvas.width,canvas.height);let o=out.data;for(let y=0;y<canvas.height;y++){const shift=Math.sin(y/10)*10;for(let x=0;x<canvas.width;x++){const src=((y*canvas.width+((x+shift+canvas.width)%canvas.width)))*4;const dst=(y*canvas.width+x)*4;o[dst]=d[src];o[dst+1]=d[src+1];o[dst+2]=d[src+2];o[dst+3]=255;}}ctx.putImageData(out,0,0);
  }
}

function computeHomography(src, dst){
  // Solve for 3x3 homography matrix
  const A = [];
  for(let i=0;i<4;i++){
    const xs = src[i].x, ys = src[i].y;
    const xd = dst[i].x, yd = dst[i].y;
    A.push([xs, ys, 1, 0, 0, 0, -xs*xd, -ys*xd, xd]);
    A.push([0, 0, 0, xs, ys, 1, -xs*yd, -ys*yd, yd]);
  }
  // gaussian elimination
  for(let i=0;i<8;i++){
    let maxRow=i;
    for(let j=i+1;j<8;j++) if(Math.abs(A[j][i])>Math.abs(A[maxRow][i])) maxRow=j;
    const tmp=A[i];A[i]=A[maxRow];A[maxRow]=tmp;
    for(let j=i+1;j<9;j++) A[i][j]/=A[i][i];
    for(let k=0;k<8;k++){
      if(k===i) continue;
      const factor=A[k][i];
      for(let j=i;j<9;j++) A[k][j]-=factor*A[i][j];
    }
  }
  const h = A.map(row=>row[8]);
  h[8]=1;
  return h;
}

function homographyToCss(m){
  return [m[0],m[3],0,m[6], m[1],m[4],0,m[7], 0,0,1,0, m[2],m[5],0,m[8]];
}

function toggleCorners(en){
  handles.forEach(h=>{h.style.display = en?'block':'none';});
}

window.onload = init;
