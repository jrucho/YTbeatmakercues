// UI related helpers extracted from content.js
export function detectBpmFromVideo() {
  ensureAudioContext().then(() => {
    const vid = getVideoElement();
    if (!vid || !audioContext || !videoGain) return;
    detectBpmButton.textContent = 'Detecting…';
    detectBpmButton.style.backgroundColor = '#f39c12';
    detectBpmButton.disabled = true;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const buf = new Uint8Array(analyser.fftSize);
    videoGain.connect(analyser);
    const SLICE_MS = 8000, SLICES = 3;
    const bpms = [];
    (async function loop(slice = 0) {
      const energies = [];
      const t0 = performance.now();
      while (performance.now() - t0 < SLICE_MS) {
        analyser.getByteTimeDomainData(buf);
        let rms = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i] - 128;
          rms += v * v;
        }
        energies.push({ t: performance.now(), e: Math.sqrt(rms / buf.length) });
        await new Promise(r => requestAnimationFrame(r));
      }
      const bpm = analyseBPMFromEnergies(energies);
      if (bpm) bpms.push(bpm);
      if (slice + 1 < SLICES) return loop(slice + 1);
      videoGain.disconnect(analyser);
      detectBpmButton.disabled = false;
      if (!bpms.length) {
        detectBpmButton.textContent = 'Detect BPM';
        detectBpmButton.style.backgroundColor = '#e74c3c';
        return;
      }
      bpms.sort((a, b) => a - b);
      let bpmMedian = bpms[Math.floor(bpms.length / 2)];
      while (bpmMedian < 80) bpmMedian *= 2;
      while (bpmMedian > 200) bpmMedian /= 2;
      bpmMedian = Math.round(bpmMedian);
      sequencerBPM = bpmMedian;
      detectBpmButton.textContent = `${bpmMedian} BPM`;
      detectBpmButton.style.backgroundColor = '#2ecc71';
      const bpmField = document.querySelector('#sequencerContainer input[type="number"]');
      if (bpmField) bpmField.value = bpmMedian;
    })();
  });
}

export function addDetectBpmButtonToMinimalUI() {
  if (!minimalUIContainer || !micButton) return;
  detectBpmButton = document.createElement('button');
  detectBpmButton.className = 'looper-btn';
  detectBpmButton.innerText = 'Detect BPM';
  detectBpmButton.title = 'Analyse 3×8 s slices and set BPM automatically';
  detectBpmButton.style.transition = 'background 0.25s';
  detectBpmButton.addEventListener('click', detectBpmFromVideo);
  detectBpmButton.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    sequencerBPM = Math.max(40, Math.round(sequencerBPM / 2));
    const bpmField = document.querySelector('#sequencerContainer input[type="number"]');
    if (bpmField) bpmField.value = sequencerBPM;
    detectBpmButton.textContent = `${sequencerBPM} BPM`;
    detectBpmButton.style.backgroundColor = '#3498db';
  });
  detectBpmButton.addEventListener('click', function(e) {
    if (e.altKey) {
      sequencerBPM = Math.min(400, Math.round(sequencerBPM * 2));
      const bpmField = document.querySelector('#sequencerContainer input[type="number"]');
      if (bpmField) bpmField.value = sequencerBPM;
      detectBpmButton.textContent = `${sequencerBPM} BPM`;
      detectBpmButton.style.backgroundColor = '#3498db';
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);
  minimalUIContainer.insertBefore(detectBpmButton, micButton.nextSibling);
}

export function toggleBlindMode() {
  blindMode = !blindMode;
  const styleId = 'ytbm-blind-mode-style';
  let styleEl = document.getElementById(styleId);
  if (blindMode) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
  [class*="ytbm"],
  .looper-btn,
  .cue-marker,
  #touchPopup {
    display: none !important;
    pointer-events: none !important;
  }
`;
      document.head.appendChild(styleEl);
    }
    console.log('Blind mode is now ON');
  } else {
    if (styleEl) styleEl.remove();
    console.log('Blind mode is now OFF');
    if (minimalActive) goMinimalUI();
  }
}

window.detectBpmFromVideo = detectBpmFromVideo;
window.addDetectBpmButtonToMinimalUI = addDetectBpmButtonToMinimalUI;
window.toggleBlindMode = toggleBlindMode;
