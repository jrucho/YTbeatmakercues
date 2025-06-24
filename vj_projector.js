let filterParams = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hue: 0,
  blur: 0
};
let reactive = { low: 0, mid: 0, high: 0 };
let audioSetup = false;
let analyser, freqData;
let videoStream;

const canvas = document.getElementById('vjCanvas');
const ctx = canvas.getContext('2d');
const video = document.getElementById('vjVideo');

window.addEventListener('message', async (e) => {
  const { type, data } = e.data || {};
  if (type === 'videoStream') {
    videoStream = data;
    video.srcObject = data;
    try { await video.play(); } catch (err) { console.error(err); }
    setupAudio();
    requestAnimationFrame(draw);
    const captureStream = canvas.captureStream();
    window.opener?.postMessage({ type:'projectorStream', data: captureStream }, '*');
  } else if (type === 'filterParams') {
    filterParams = { ...filterParams, ...data.params };
    reactive = { ...reactive, ...data.reactive };
  } else if (type === 'reset') {
    filterParams = { brightness:1, contrast:1, saturate:1, hue:0, blur:0 };
    reactive = { low:0, mid:0, high:0 };
  } else if (type === 'cornerMap') {
    console.log('Corner mapping requested');
  }
});

function setupAudio() {
  if (audioSetup || !videoStream?.getAudioTracks().length) return;
  audioSetup = true;
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(videoStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  freqData = new Uint8Array(analyser.frequencyBinCount);
}

function draw() {
  if (!video.paused && !video.ended) {
    let mod = { low:0, mid:0, high:0 };
    if (analyser) {
      analyser.getByteFrequencyData(freqData);
      const bass = avg(freqData, 0, 50);
      const mid = avg(freqData, 50, 150);
      const treble = avg(freqData, 150, 256);
      mod.low = (bass/255) * reactive.low;
      mod.mid = (mid/255) * reactive.mid;
      mod.high = (treble/255) * reactive.high;
    }
    const f = filterParams;
    const filt = `brightness(${f.brightness + mod.low}) contrast(${f.contrast}) saturate(${f.saturate}) hue-rotate(${f.hue + mod.mid*180}deg) blur(${f.blur}px)`;
    ctx.filter = filt;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
}

function avg(arr, from, to) {
  let sum=0, count=0;
  for (let i=from;i<to && i<arr.length;i++) { sum+=arr[i]; count++; }
  return count?sum/count:0;
}

document.getElementById('fsBtn').onclick = () => document.documentElement.requestFullscreen();
document.getElementById('hideBtn').onclick = () => { canvas.style.display = canvas.style.display === 'none' ? 'block' : 'none'; };
document.getElementById('resetBtn').onclick = () => { window.opener?.postMessage({type:'resetRequest'}, '*'); };
window.addEventListener('keydown', e => { if (e.key === 'Escape') document.exitFullscreen(); });

// notify opener that projector is ready
window.opener?.postMessage({type:'projectorReady'}, '*');
