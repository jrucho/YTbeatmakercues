// Audio helper functions extracted from content.js
export function getVideoElement() {
  return document.querySelector('video');
}

export function safeSeekVideo(_, t) {
  const vid = getVideoElement();
  if (!vid) return;
  vid.currentTime = t;
  vid.play();
}

export async function suggestCuesFromTransients() {
  await ensureAudioContext();
  const vid = getVideoElement();
  if (!vid || !audioContext || !videoGain) return;

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  const buf = new Uint8Array(analyser.fftSize);
  videoGain.connect(analyser);

  const SLICE_MS = 8000;
  const energies = [];
  const t0 = performance.now();
  const sampleRate = 60;

  while (performance.now() - t0 < SLICE_MS) {
    analyser.getByteTimeDomainData(buf);
    let rms = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] - 128;
      rms += v * v;
    }
    energies.push({ t: vid.currentTime, e: Math.sqrt(rms / buf.length) });
    await new Promise(r => setTimeout(r, 1000 / sampleRate));
  }

  videoGain.disconnect(analyser);
  const peaks = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i].e > energies[i - 1].e && energies[i].e > energies[i + 1].e) {
      peaks.push(energies[i]);
    }
  }
  peaks.sort((a, b) => b.e - a.e);
  const topPeaks = peaks.slice(0, 10).sort((a, b) => a.t - b.t);
  const keys = ["1","2","3","4","5","6","7","8","9","0"];
  topPeaks.forEach((p, i) => { cuePoints[keys[i]] = p.t; });
  saveCuePointsToURL();
  updateCueMarkers();
  refreshCuesButton();
}

export async function loadAudio(path) {
  try {
    const isExternal = /^(data:|blob:|https?:)/.test(path);
    const url = isExternal ? path : chrome.runtime.getURL(path);
    let r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP error ${r.status}`);
    let b = await r.arrayBuffer();
    return audioContext.decodeAudioData(b);
  } catch (e) {
    console.error('Failed to load audio file:', path, e);
    alert(`Error loading ${path}!`);
    return null;
  }
}

// expose globally for non-module scripts
window.getVideoElement = getVideoElement;
window.safeSeekVideo = safeSeekVideo;
window.suggestCuesFromTransients = suggestCuesFromTransients;
window.loadAudio = loadAudio;
