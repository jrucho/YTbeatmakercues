// ---- Basic helpers (added by ChatGPT fix) ----
if (typeof getVideoElement === "undefined") {
  function getVideoElement() {
    return document.querySelector('video');
  }
}

if (typeof safeSeekVideo === "undefined") {
  /**
   * Seek the main YouTube player safely and resume playback.
   * @param {*} _  (kept for compatibility with old call‑sites that pass “evt”)
   * @param {number} t  target time in seconds
   */
  function safeSeekVideo(_, t) {
    const vid = getVideoElement();
    if (!vid) return;
    vid.currentTime = t;
    vid.play();
  }
}

if (typeof escapeHtml === "undefined") {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
// ----------------------------------------------
// --- Suggest Cues from Transients Helper ---
async function suggestCuesFromTransients() {
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
  const startTime = vid.currentTime;
  const sampleRate = 60; // 60 samples per second

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

  // Detect local maxima (simple peak detection)
  const peaks = [];
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i].e > energies[i - 1].e && energies[i].e > energies[i + 1].e) {
      peaks.push(energies[i]);
    }
  }

  // Sort by energy and take top 10
  peaks.sort((a, b) => b.e - a.e);
  const topPeaks = peaks.slice(0, 10).sort((a, b) => a.t - b.t);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  topPeaks.forEach((p, i) => {
    cuePoints[keys[i]] = p.t;
  });

  saveCuePointsToURL();
  updateCueMarkers();
  refreshCuesButton();
}
// --- Random Cues Button logic (normal and modified press) ---
if (typeof placeRandomCues === "undefined") {
  // Dummy fallback if not defined elsewhere
  function placeRandomCues() {
    // No-op, add your implementation elsewhere
  }
}
if (typeof refreshCuesButton === "undefined") {
  function refreshCuesButton() {}
}

if (typeof saveCuePointsToURL === "undefined") {
  function saveCuePointsToURL() {}
}
if (typeof updateCueMarkers === "undefined") {
  function updateCueMarkers() {}
}

// Attach to minimal random cues button
if (typeof randomCuesButtonMin !== "undefined" && randomCuesButtonMin) {
  randomCuesButtonMin.title = "Suggest cues from transients (Cmd-click = random)";
  randomCuesButtonMin.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey) {
      placeRandomCues();
    } else {
      suggestCuesFromTransients();
    }
  });
}
// Attach to advanced random cues button
if (typeof randomCuesButton !== "undefined" && randomCuesButton) {
  randomCuesButton.title = "Suggest cues from transients (Cmd-click = random)";
  randomCuesButton.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey) {
      placeRandomCues();
    } else {
      suggestCuesFromTransients();
    }
  });
}

(() => {
  let cleanupFunctions = [];
  let tapTimes = [];
  let padIndicators = [];
  const ref = document.referrer;
  const isSampletteEmbed = window !== window.top && (ref === '' || ref.includes('samplette.io'));
  function shouldRunOnThisPage() {
    const host = window.location.hostname;
    if (host === 'samplette.io' && window === window.top) {
      // Skip the outer Samplette page but run inside the YouTube iframe
      return false;
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      // Avoid duplicate initialization inside miscellaneous YouTube iframes
      if (window !== window.top && !isSampletteEmbed) {
        return false;
      }
    }
    return true;
  }

  async function setOutputDevice(deviceId) {
    if (!audioContext) return;
    localStorage.setItem('ytbm_outputDeviceId', deviceId);

    // Clean up any previous sink routing
    if (externalOutputDest) {
      try { externalOutputDest.disconnect(); } catch {}
      externalOutputDest = null;
    }
    if (outputAudio) {
      outputAudio.pause();
      outputAudio.srcObject = null;
      outputAudio.remove();
      outputAudio = null;
    }

    currentOutputNode = audioContext.destination;
    let success = true;

    const canUseCtxSink = typeof audioContext.setSinkId === 'function';

    if (deviceId && deviceId !== 'default') {
      if (canUseCtxSink) {
        try {
          await audioContext.setSinkId(deviceId);
        } catch (err) {
          console.warn('Failed to set AudioContext sinkId', err);
          success = false;
        }
      }
      if (!canUseCtxSink || !success) {
        success = true;
        try {
          outputAudio = new Audio();
          outputAudio.autoplay = true;
          outputAudio.playsInline = true;
          outputAudio.preload = 'auto';
          outputAudio.style.display = 'none';
          document.body.appendChild(outputAudio);
          externalOutputDest = audioContext.createMediaStreamDestination();
          outputAudio.srcObject = externalOutputDest.stream;
          if (outputAudio.setSinkId) await outputAudio.setSinkId(deviceId);
          await outputAudio.play().catch(() => {});
          currentOutputNode = externalOutputDest;
        } catch (err) {
          console.warn('Failed to apply output device', err);
          success = false;
          currentOutputNode = audioContext.destination;
        }
      }
    } else if (canUseCtxSink) {
      try {
        await audioContext.setSinkId('');
      } catch (err) {
        console.warn('Failed to reset AudioContext sinkId', err);
      }
    }

    if (!success && outputDeviceSelect) {
      outputDeviceSelect.value = 'default';
      localStorage.setItem('ytbm_outputDeviceId', 'default');
    }

    applyAllFXRouting();
  }

  let outputDeviceSelect = null;
  let inputDeviceSelect = null;
  let monitorInputSelect = null;
  let monitorToggleBtn = null;
  let currentOutputNode = null;
  let externalOutputDest = null;
  let outputAudio = null;
  let micDeviceId = localStorage.getItem('ytbm_inputDeviceId') || 'default';
  // Monitoring starts disabled on each page load
  let monitorMicDeviceId = localStorage.getItem('ytbm_monitorInputDeviceId') || 'off';
  let monitorEnabled = false;

  async function loadMonitorPrefs() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise(resolve => {
        chrome.storage.local.get(['ytbm_monitorInputDeviceId'], res => {
          if (res.ytbm_monitorInputDeviceId) {
            monitorMicDeviceId = res.ytbm_monitorInputDeviceId;
          }
          // fall back to localStorage value if present
          const lsDev = localStorage.getItem('ytbm_monitorInputDeviceId');
          if (lsDev) monitorMicDeviceId = lsDev;
          resolve();
        });
      });
    } else {
      monitorMicDeviceId = localStorage.getItem('ytbm_monitorInputDeviceId') || 'off';
    }
  }

  async function populateOutputDeviceSelect() {
    if (!outputDeviceSelect) return;
    const supportsSetSink = (HTMLMediaElement.prototype.setSinkId !== undefined);
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices || !supportsSetSink) {
      outputDeviceSelect.disabled = true;
      outputDeviceSelect.innerHTML = '<option>Unsupported</option>';
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      outputDeviceSelect.innerHTML = '';
      outputDeviceSelect.add(new Option('Default output', 'default'));
      outputs.forEach(d => {
        const opt = new Option(d.label || 'Device', d.deviceId);
        outputDeviceSelect.add(opt);
      });
      let saved = localStorage.getItem('ytbm_outputDeviceId');
      if (!saved) {
        saved = 'default';
        localStorage.setItem('ytbm_outputDeviceId', 'default');
      }
      outputDeviceSelect.value = saved;
      outputDeviceSelect.disabled = outputs.length === 0;
    } catch (err) {
      console.error('Failed to enumerate output devices', err);
    }
  }

  function buildOutputDeviceDropdown(parent) {
    if (outputDeviceSelect || !parent) return;
    outputDeviceSelect = document.createElement('select');
    outputDeviceSelect.className = 'looper-btn';
    outputDeviceSelect.style.flex = '1 1 auto';
    outputDeviceSelect.title = 'Choose audio output device';
    outputDeviceSelect.addEventListener('change', e => setOutputDevice(e.target.value));
    parent.appendChild(outputDeviceSelect);
    populateOutputDeviceSelect().then(applySavedOutputDevice);
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', populateOutputDeviceSelect);
    }
  }

  async function populateInputDeviceSelect() {
    if (!inputDeviceSelect) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      inputDeviceSelect.disabled = true;
      inputDeviceSelect.innerHTML = '<option>Unsupported</option>';
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      inputDeviceSelect.innerHTML = '';
      inputDeviceSelect.add(new Option('Default input', 'default'));
      inputs.forEach(d => {
        const opt = new Option(d.label || 'Device', d.deviceId);
        inputDeviceSelect.add(opt);
      });
      let saved = localStorage.getItem('ytbm_inputDeviceId');
      if (!saved) {
        saved = 'default';
        localStorage.setItem('ytbm_inputDeviceId', 'default');
      }
      inputDeviceSelect.value = saved;
      inputDeviceSelect.disabled = inputs.length === 0;
    } catch (err) {
      console.error('Failed to enumerate input devices', err);
    }
  }

  function buildInputDeviceDropdown(parent) {
    if (inputDeviceSelect || !parent) return;
    inputDeviceSelect = document.createElement('select');
    inputDeviceSelect.className = 'looper-btn';
    inputDeviceSelect.style.flex = '1 1 auto';
    inputDeviceSelect.title = 'Choose audio input device';
    inputDeviceSelect.addEventListener('change', e => {
      micDeviceId = e.target.value || 'default';
      localStorage.setItem('ytbm_inputDeviceId', micDeviceId);
    });
    parent.appendChild(inputDeviceSelect);
    populateInputDeviceSelect();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', populateInputDeviceSelect);
    }
  }

  async function populateMonitorInputSelect() {
    if (!monitorInputSelect) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      monitorInputSelect.disabled = true;
      monitorInputSelect.innerHTML = '<option>Unsupported</option>';
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      monitorInputSelect.innerHTML = '';
      monitorInputSelect.add(new Option('Default monitoring input off', 'off'));
      inputs.forEach(d => {
        const opt = new Option(d.label || 'Device', d.deviceId);
        monitorInputSelect.add(opt);
      });
      let saved;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const res = await new Promise(r => chrome.storage.local.get(['ytbm_monitorInputDeviceId'], r));
        saved = res.ytbm_monitorInputDeviceId;
      }
      if (!saved) {
        saved = localStorage.getItem('ytbm_monitorInputDeviceId') || 'off';
        localStorage.setItem('ytbm_monitorInputDeviceId', saved);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ ytbm_monitorInputDeviceId: saved });
        }
      }
      monitorInputSelect.value = saved;
      monitorInputSelect.disabled = inputs.length === 0;
      monitorMicDeviceId = saved;
      applyMonitorSelection();
    } catch (err) {
      console.error('Failed to enumerate input devices', err);
    }
  }

  function buildMonitorInputDropdown(parent) {
    if (monitorInputSelect || !parent) return;
    monitorInputSelect = document.createElement('select');
    monitorInputSelect.className = 'looper-btn';
    monitorInputSelect.style.flex = '1 1 auto';
    monitorInputSelect.title = 'Choose monitoring input device';
    monitorInputSelect.addEventListener('change', e => {
      monitorMicDeviceId = e.target.value || 'off';
      localStorage.setItem('ytbm_monitorInputDeviceId', monitorMicDeviceId);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ ytbm_monitorInputDeviceId: monitorMicDeviceId });
      }
      applyMonitorSelection();
    });
    parent.appendChild(monitorInputSelect);
    populateMonitorInputSelect();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', populateMonitorInputSelect);
    }
  }

  function buildMonitorToggle(parent) {
    if (monitorToggleBtn || !parent) return;
    monitorToggleBtn = document.createElement('button');
    monitorToggleBtn.className = 'looper-btn';
    monitorToggleBtn.style.flex = '0 0 auto';
    monitorToggleBtn.title = 'Toggle monitoring on/off';
    monitorToggleBtn.addEventListener('click', () => {
      monitorEnabled = !monitorEnabled;
      updateMonitorToggleColor();
      applyMonitorSelection();
    });
    parent.appendChild(monitorToggleBtn);
    updateMonitorToggleColor();
  }

  function updateMonitorToggleColor() {
    if (!monitorToggleBtn) return;
    monitorToggleBtn.style.backgroundColor = monitorEnabled ? 'green' : '';
    monitorToggleBtn.textContent = monitorEnabled ? 'Mon On' : 'Mon Off';
  }

  async function startMonitoring() {
    if (!monitorEnabled || monitoringActive) return;
    if (!monitorMicDeviceId || monitorMicDeviceId === 'off') return;
    try {
      const constraints = {
        audio: {
          latency: 0,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1
        },
        video: false
      };
      if (monitorMicDeviceId !== 'default') {
        constraints.audio.deviceId = { exact: monitorMicDeviceId };
      }
      monitorStream = await navigator.mediaDevices.getUserMedia(constraints);
      // Use a separate low-latency context so monitoring bypasses extension routing
      monitorContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 0 });
      const src = monitorContext.createMediaStreamSource(monitorStream);
      src.connect(monitorContext.destination);
      monitoringActive = true;
      console.log('Monitoring started');
    } catch (err) {
      console.error('monitor input error', err);
    }
    updateMonitorSelectColor();
  }

  function stopMonitoring() {
    if (monitorContext) {
      monitorContext.close().catch(() => {});
      monitorContext = null;
    }
    if (monitorStream) {
      monitorStream.getTracks().forEach(t => t.stop());
      monitorStream = null;
    }
    monitoringActive = false;
    console.log('Monitoring stopped');
    updateMonitorSelectColor();
  }

  function applyMonitorSelection() {
    if (monitorEnabled && monitorMicDeviceId !== 'off') {
      startMonitoring();
    } else {
      stopMonitoring();
    }
  }

  // Monitoring persists across tabs. Clean up only on page unload to
  // avoid doubling up when navigating between videos.


  async function applySavedOutputDevice() {
    let id = localStorage.getItem('ytbm_outputDeviceId');
    if (!id) {
      id = 'default';
      localStorage.setItem('ytbm_outputDeviceId', 'default');
    }
    await setOutputDevice(id);
    if (outputDeviceSelect) outputDeviceSelect.value = id;
  }
  /**************************************
   * Global Variables
   **************************************/
  let cuePoints = {},
      sampleKeys = { kick: "é", hihat: "à", snare: "$" },
      // Additional extension-wide keystrokes that can be rebound:
      extensionKeys = {
        looper: "r",
        videoLooper: "v",
        compressor: "c",
        eq: "e",
        undo: "u",
        pitchDown: ",",
        pitchUp: ".",
        // NEW: Reverb + Cassette toggles
        reverb: "q",
        cassette: "w",
        randomCues: "-"
      },
      midiPresets = [],
      presetSelect = null,
      userSamples = [],
      samplePacks = [],
      samplePackSelect = null,
      currentSamplePackName = null,
      activeSamplePackNames = [],
      sampleOrigin = { kick: [], hihat: [], snare: [] },
      midiNotes = {
        kick: 37,
        hihat: 38,
        snare: 39,
        shift: 36,
        pitchDown: 42,
        pitchUp: 43,
        cues: { 1: 48, 2: 49, 3: 50, 4: 51, 5: 44, 6: 45, 7: 46, 8: 47, 9: 40, 0: 41 },
        looper: 34,
        undo: 35,
        eqToggle: 33,   // MIDI note to toggle EQ
        compToggle: 32, // MIDI note to toggle Compressor
        // NEW: VideoLooper at default note 31
        videoLooper: 31,
        // NEW: Reverb / Cassette
        reverbToggle: 29,
        cassetteToggle: 30,
        randomCues: 28,
        cueAdjust: 71          // MIDI CC to move selected cue
      },
      sampleVolumes = { kick: 1, hihat: 1, snare: 1 },
      // Arrays of samples
      audioBuffers = { kick: [], hihat: [], snare: [] },
      currentSampleIndex = { kick: 0, hihat: 0, snare: 0 },
      // Audio Looper
      looperState = "idle",
      mediaRecorder = null,
      recordedChunks = [],
      loopRecorderNode = null,
      recordedFrames = [],
      loopBuffer = null,
      loopSource = null,
      // Video Looper
      videoLooperState = "idle",
      videoMediaRecorder = null,
      videoRecordedChunks = [],
      videoPreviewURL = null,
      videoPreviewElement = null,
      // Toggles
      videoAudioEnabled = true,
      audioLoopInVideo = true,
      // Undo/Redo
      undoStack = [],
      redoStack = [],
      // Panel / UI elements
      panelContainer = null,
      dragHandle = null,
      unifiedLooperButton = null,
      videoLooperButton = null,
      exportButton = null,
      undoButton = null,
      importAudioButton = null,
      cuesButton = null,
      randomCuesButton = null,
      videoAudioToggleButton = null,
      loopInVidButton = null,
      minimalUIButton = null,
      pitchSliderElement = null,
      advancedPitchLabel = null,
      minimalPitchLabel = null,
      manualButton = null,
      keyMapButton = null,
      midiMapButton = null,
      eqButton = null,
      loFiCompButton = null,
      // Sample faders
      kickFader = null, kickDBLabel = null,
      hihatFader = null, hihatDBLabel = null,
      snareFader = null, snareDBLabel = null,
      // Lo-Fi Compressor fader
      loFiCompFader = null,
      loFiCompFaderValueLabel = null,
      loFiCompDefaultValue = 150,
      loFiCompActive = false,
      // Minimal UI elements
      minimalUIContainer = null,
      randomCuesButtonMin = null,
      eqButtonMin = null,
      compButtonMin = null,
      micButton = null,          // <-- NEW: declare it here
      detectBpmButton = null,
      minimalActive = true,
      // Overdub timers
      overdubStartTimeout = null,
      overdubStopTimeout = null,
      // Double-press logic
      clickDelay = 300,
      lastClickTime = 0,
      isDoublePress = false,
      doublePressHoldStartTime = null,
      lastClickTimeVideo = 0,
      isDoublePressVideo = false,
      doublePressHoldStartTimeVideo = null,
      // Undo double-press
      undoLastClickTime = 0,
      undoIsDoublePress = false,
      // TRIPLE-PRESS TRACKING
      pressTimes = [],
	    looperHoldTimer = null,
      // Cue marker dragging
      draggingMarker = null,
      draggingCueIndex = null,
      progressBarRect = null,
      // MIDI
      currentlyDetectingMidi = null,
      isModPressed = false,
      pitchDownInterval = null,
      pitchUpInterval = null,
      // Track last processed MIDI message to filter duplicates
      lastMidiTimestamp = 0,
      lastMidiData = [],
      currentlyDetectingMidiControl = null,
      selectedCueKey = null,
      lastCueAdjustValue = null,
      lastCueAdjustDirection = 0,
      cueSaveTimeout = null,
      // 4-Bus Audio nodes
      audioContext = null,
      videoGain = null,
      samplesGain = null,
      loopAudioGain = null,
      bus1Gain = null,
      bus2Gain = null,
      bus3Gain = null,
      bus4Gain = null,
      masterGain = null,
      antiClickGain = null,
      loFiCompNode = null,
      postCompGain = null,
      mainRecorderMix = null,
      destinationNode = null,
      bus1RecGain = null,
      bus2RecGain = null,
      bus3RecGain = null,
      bus4RecGain = null,
      // Pitch
      pitchPercentage = 0,
      pitchTarget = "video", // "video" or "loop"
      videoPitchPercentage = 0,
      loopPitchPercentage = 0,
      loopStartAbsoluteTime = 0,
      // EQ / Filter
      eqFilterNode = null,
      eqFilterActive = false,
      eqFilterApplyTarget = "video", // can be "video" or "master"
      // REVERB
      reverbNode = null,
      reverbActive = false,
      // CASSETTE
      cassetteNode = null,
      cassetteActive = false,
      // UI windows
      eqWindowContainer = null,
      eqDragHandle = null,
      eqContentWrap = null,
      // We'll keep them to identify which button is which
      reverbButton = null,
      cassetteButton = null,
      reverbButtonMin = null,
      cassetteButtonMin = null,
      pitchTargetButton = null,
      pitchTargetButtonMin = null;
      deckA = null,
      deckB = null,
      gainA = null,
      gainB = null,
      dcBlockA = null,
      dcBlockB = null,
      activeDeck = "A",       // which deck is currently audible
      crossFadeTime = 0.20,   // 80 ms smoothed constant‑power fade
            compMode = "off";

  const BUILTIN_DEFAULT_COUNT = 10;

  // ---- Load saved keyboard / MIDI mappings from chrome.storage ----
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["sampleKeys", "midiNotes"], (res) => {
      if (res.sampleKeys) Object.assign(sampleKeys, res.sampleKeys);
      if (res.midiNotes)  Object.assign(midiNotes,  res.midiNotes);
      console.log("Restored prefs", { sampleKeys, midiNotes });
    });
  }
  // -----------------------------------------------------------------
  let micState = 0; // 0=off, 1=record, 2=monitor+record
  let micSourceNode = null;
  let micGainNode = null;
  let monitorStream = null;
  let monitorContext = null; // dedicated low-latency context for input monitoring
  let monitoringActive = false;
  let blindMode = false;
  
  // Global variable for the touch modifier mode
  let modTouchActive = false;
  let touchPopup = null;
  let currentPad = null; // current selected pad index (0–9)
  const padSequencers = []; // Array of sequencer data for each pad (16 booleans per pad)
  let sequencerBPM = 120; // default BPM
  let sequencerInterval = null;
  let sequencerPlaying = false;
  // Initialize pad sequencer data for 10 pads (all steps off)
  for (let i = 0; i < 10; i++) {
    padSequencers[i] = new Array(16).fill(false);
  }
  
// Global flag to track the toggle state.
let alwaysShowYTBar = false;
let playheadUpdaterStarted = false; // ensures we start the custom updater only once
let isUserInteracting = false;  // Already used to track mouse over/drag
// Observer to kill YouTube's autohide every time it toggles the class
let ytAutoHideObserver = null;
// Extra watchdog timer when MutationObserver misses a change
let enforceInterval = null;
// When true (default) every keyboard press or MIDI note briefly unhides YouTube’s progress bar.
// Toggle with the standalone “b” key handler below.

let unhideOnInput = true;

let ytbmMousemoveInterval = null;
let ytbmMousemoveCounter = 0;

function pulseShowYTControls() {
  const player = document.querySelector('.html5-video-player,#movie_player');
  if (!player) return;
  player.classList.remove('ytp-autohide', 'ytp-hide-controls');
  if (typeof player.showControls === 'function') player.showControls();

  function dispatchMove() {
    const rect = player.getBoundingClientRect();
    ytbmMousemoveCounter++;
    const wiggle = 4; // You can increase if needed
    const x = rect.left + rect.width / 2 + Math.sin(ytbmMousemoveCounter) * wiggle;
    const y = rect.top + rect.height / 2;

    // Dispatch to the main player
    player.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y
    }));

    // Dispatch also to progress bar and chrome bar
    const progress = document.querySelector('.ytp-progress-bar');
    const chrome = document.querySelector('.ytp-chrome-bottom');
    if (progress) progress.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    if (chrome) chrome.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }
  dispatchMove();

  if (!ytbmMousemoveInterval) {
    ytbmMousemoveInterval = setInterval(dispatchMove, 180);
  }
}

function stopPulseShowYTControls() {
  if (ytbmMousemoveInterval) {
    clearInterval(ytbmMousemoveInterval);
    ytbmMousemoveInterval = null;
  }
}

document.addEventListener("mousemove", stopPulseShowYTControls);

// ===== Mic Mode Handling =====
async function setMicMode(mode) {
  if (!audioContext) await ensureAudioContext();
  console.log('setMicMode', micState, '->', mode);

  // Clean up previous state
  if (micGainNode) {
    try { micGainNode.disconnect(); } catch {}
    try { micGainNode.disconnect(mainRecorderMix); } catch {}
    try { micGainNode.disconnect(bus4Gain); } catch {}
  }

  if (mode === 0) {
    stopMonitoring();
    if (micSourceNode?.mediaStream) {
      micSourceNode.mediaStream.getTracks().forEach(t => t.stop());
    }
    if (micSourceNode) micSourceNode.disconnect();
    micSourceNode = null;
    micGainNode = null;
  } else {
    if (!micSourceNode) {
      try {
        const constraints = {
          audio: {
            latency: 0,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 48000,
            channelCount: 1
          },
          video: false
        };
        if (micDeviceId && micDeviceId !== 'default') {
          constraints.audio.deviceId = { exact: micDeviceId };
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        micSourceNode = audioContext.createMediaStreamSource(stream);
        micGainNode = audioContext.createGain();
        micGainNode.gain.value = 1;
        micSourceNode.connect(micGainNode);
      } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone: ' + err.message);
        mode = 0;
      }
    }
    if (micGainNode) {
      micGainNode.connect(mainRecorderMix);
      if (mode === 2) {
        micGainNode.connect(bus4Gain);
      }
    }
  }

  micState = mode;
  applyMonitorSelection();
  updateMicButtonColor();
  updateMonitorSelectColor();
}

async function toggleMicInput() {
  const next = micState === 0 ? 1 : (micState === 1 ? 2 : 0);
  await setMicMode(next);
}

function updateMicButtonColor() {
  if (!micButton) return;
  if (micState === 0) {
    micButton.style.backgroundColor = "#333"; // Off
  } else if (micState === 1) {
    micButton.style.backgroundColor = "green"; // Recording only
  } else if (micState === 2) {
    micButton.style.backgroundColor = "red"; // Monitoring
  }
}

function updateMonitorSelectColor() {
  if (monitorInputSelect) {
    if (monitoringActive) {
      monitorInputSelect.style.backgroundColor = "green";
    } else {
      monitorInputSelect.style.backgroundColor = "";
    }
  }
  updateMonitorToggleColor();
}

// Add the mic button to the minimal UI
function addMicButtonToMinimalUI() {
  // If the mic button is already inside the container, do nothing
if (micButton && minimalUIContainer.contains(micButton)) return;
  if (!minimalUIContainer) return;
  micButton = document.createElement("button");
  micButton.className = "looper-btn";
  micButton.innerText = "Mic";
  micButton.title = "Toggle microphone input for looper and video looper";
  micButton.addEventListener("click", toggleMicInput);
  minimalUIContainer.appendChild(micButton);
  // Always (re)-attach the Detect-BPM button
addDetectBpmButtonToMinimalUI();
}

// ===== Detect‑BPM support (minimal UI) ===================================
function detectBpmFromVideo() {
  ensureAudioContext().then(() => {
    const vid = getVideoElement();
    if (!vid || !audioContext || !videoGain) return;

    // UI feedback: set to orange, show "Detecting…"
    detectBpmButton.textContent = "Detecting…";
    detectBpmButton.style.backgroundColor = "#f39c12";
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
      const bpm = analyseBPMFromEnergies(energies);   // helper from previous message
      if (bpm) bpms.push(bpm);
      if (slice + 1 < SLICES) return loop(slice + 1);

      // finish
      videoGain.disconnect(analyser);
      detectBpmButton.disabled = false;
      if (!bpms.length) {
        detectBpmButton.textContent = "Detect BPM";
        detectBpmButton.style.backgroundColor = "#e74c3c"; // red for failure
        return;
      }
      bpms.sort((a, b) => a - b);
      let bpmMedian = bpms[Math.floor(bpms.length / 2)];
      // Fold to 80–200 BPM range
      while (bpmMedian < 80) bpmMedian *= 2;
      while (bpmMedian > 200) bpmMedian /= 2;
      bpmMedian = Math.round(bpmMedian);
      sequencerBPM = bpmMedian;
      detectBpmButton.textContent = `${bpmMedian} BPM`;
      detectBpmButton.style.backgroundColor = "#2ecc71"; // green for success
      const bpmField = document.querySelector('#sequencerContainer input[type="number"]');
      if (bpmField) bpmField.value = bpmMedian;
    })();
  });
}

function addDetectBpmButtonToMinimalUI() {
  if (!minimalUIContainer || !micButton) return;   // guard

  detectBpmButton = document.createElement("button");
  detectBpmButton.className = "looper-btn";
  detectBpmButton.innerText = "Detect BPM";
  detectBpmButton.title = "Analyse 3×8 s slices and set BPM automatically";
  detectBpmButton.style.transition = "background 0.25s";
  detectBpmButton.addEventListener("click", detectBpmFromVideo);

  // BPM shortcut features: right-click/contextmenu and Alt-click
  detectBpmButton.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    // Divide BPM by 2, but don't go below 40
    sequencerBPM = Math.max(40, Math.round(sequencerBPM / 2));
    // Update input field if present
    const bpmField = document.querySelector('#sequencerContainer input[type="number"]');
    if (bpmField) bpmField.value = sequencerBPM;
    detectBpmButton.textContent = `${sequencerBPM} BPM`;
    detectBpmButton.style.backgroundColor = "#3498db";
  });
  detectBpmButton.addEventListener("click", function(e) {
    if (e.altKey) {
      // Multiply BPM by 2, but don't go above 400
      sequencerBPM = Math.min(400, Math.round(sequencerBPM * 2));
      const bpmField = document.querySelector('#sequencerContainer input[type="number"]');
      if (bpmField) bpmField.value = sequencerBPM;
      detectBpmButton.textContent = `${sequencerBPM} BPM`;
      detectBpmButton.style.backgroundColor = "#3498db";
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // place it *right after* the Mic button
  minimalUIContainer.insertBefore(detectBpmButton, micButton.nextSibling);
}

function toggleBlindMode() {
  blindMode = !blindMode;
  // Inject stylesheet to hide all extension UI when blindMode is on
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
    // Optionally hide minimalUIContainer directly, but stylesheet covers it
    // if (minimalUIContainer) {
    //   minimalUIContainer.style.display = "none";
    // }
    console.log("Blind mode is now ON");
  } else {
    if (styleEl) {
      styleEl.remove();
    }
    console.log("Blind mode is now OFF");
    // Optionally restore the minimal UI automatically when leaving blind mode:
    if (minimalActive) goMinimalUI();
  }
}


  
  // Build the Touch popup window (without layout toggle)
  function buildTouchPopup() {
    if (touchPopup) {
      touchPopup.style.display = "block";
      return;
    }
    
    touchPopup = document.createElement("div");
    touchPopup.id = "touchPopup";
    Object.assign(touchPopup.style, {
      position: "fixed",
      width: "700px",       // fixed width for two-row pads
      height: "330px",      // fixed height
      top: "50px",
      left: "50px",
      overflow: "hidden",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      zIndex: "100000",
      borderRadius: "8px",
      padding: "15px",
      color: "#fff",
      fontFamily: "sans-serif",
      boxSizing: "border-box"
    });
    
    // Header with title and close button
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "10px";
    header.innerHTML = `
      <span style="font-size:16px; font-weight:bold;">Touch Sequencer</span>
      <button id="touchCloseBtn" style="background:#333; color:#fff; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">Close</button>
    `;
    touchPopup.appendChild(header);
    
    const touchCloseBtn = header.querySelector("#touchCloseBtn");
    if (touchCloseBtn) {
      touchCloseBtn.addEventListener("click", () => {
        touchPopup.style.display = "none";
      });
    }
    
    // Utility row: Modifier button and Erase All Steps button
    const utilityRow = document.createElement("div");
    utilityRow.style.display = "flex";
    utilityRow.style.gap = "8px";
    utilityRow.style.marginBottom = "10px";
    touchPopup.appendChild(utilityRow);
    
    // Modifier Button
    const modifierBtn = document.createElement("button");
    modifierBtn.innerText = "Mark Cues: Off";
    modifierBtn.style.padding = "6px 10px";
    modifierBtn.style.borderRadius = "4px";
    modifierBtn.style.background = "#444";
    modifierBtn.style.color = "#fff";
    modifierBtn.style.cursor = "pointer";
    modifierBtn.addEventListener("click", () => {
      modTouchActive = !modTouchActive;
      modifierBtn.innerText = modTouchActive ? "Mark Cues: On" : "Mark Cues: Off";
      modifierBtn.style.background = modTouchActive ? "darkorange" : "#444";
    });
    utilityRow.appendChild(modifierBtn);
    
    // Erase All Steps Button (no confirmation popup)
    const eraseAllStepsBtn = document.createElement("button");
    eraseAllStepsBtn.innerText = "Erase All Steps";
    eraseAllStepsBtn.style.padding = "6px 10px";
    eraseAllStepsBtn.style.borderRadius = "4px";
    eraseAllStepsBtn.style.background = "#c22";
    eraseAllStepsBtn.style.color = "#fff";
    eraseAllStepsBtn.style.cursor = "pointer";
    eraseAllStepsBtn.addEventListener("click", () => {
      pushUndoState();
      for (let i = 0; i < padSequencers.length; i++) {
        padSequencers[i].fill(false);
      }
      updateSequencerUI();
      console.log("All sequencer steps erased.");
    });
    utilityRow.appendChild(eraseAllStepsBtn);
    
    // Pad grid container
    const padGrid = document.createElement("div");
    padGrid.style.display = "grid";
    padGrid.style.gap = "8px";
    padGrid.style.marginBottom = "15px";
    // Default layout is 2×5 (no layout toggle button)
    padGrid.style.gridTemplateColumns = "repeat(5, 1fr)";
    padGrid.style.gridTemplateRows = "repeat(2, auto)";
    touchPopup.appendChild(padGrid);
    
    // Create 10 pad buttons
for (let i = 0; i < 10; i++) {
  const padBtn = document.createElement("button");
  padBtn.innerText = `Pad ${i + 1}`;
  padBtn.style.padding = "20px";
  padBtn.style.fontSize = "14px";
  padBtn.style.borderRadius = "4px";
  padBtn.style.background = "#444";
  padBtn.style.color = "#fff";
  padBtn.style.cursor = "pointer";
  // NEW: add a class and a data attribute so we can find it later
  padBtn.classList.add("touch-pad-btn");
  padBtn.setAttribute("data-pad-index", i);
  
  padBtn.addEventListener("mousedown", () => {
    currentPad = i;
    updateSequencerUI();
    let cueKey = (i + 1) % 10;
    cueKey = cueKey === 0 ? "0" : String(cueKey);
    const vid = getVideoElement();
    if (modTouchActive && vid) {
      pushUndoState();
      cuePoints[cueKey] = vid.currentTime;
      saveCuePointsToURL();
      updateCueMarkers();
      refreshCuesButton();
      console.log(`Modifier active: Pad ${i} marked cue ${cueKey} at time ${vid.currentTime}`);
    } else {
      // For normal pad taps, mirror the digit‑key path:
      triggerPadCue(i);
    }
  });
  padGrid.appendChild(padBtn);
}
    
    // Sequencer container (16-step row)
    const seqContainer = document.createElement("div");
    seqContainer.id = "sequencerContainer";
    seqContainer.style.display = "flex";
    seqContainer.style.flexDirection = "column";
    seqContainer.style.alignItems = "center";
    seqContainer.style.gap = "8px";
    touchPopup.appendChild(seqContainer);
    
    // 16-step row
    const stepRow = document.createElement("div");
    stepRow.id = "stepRow";
    stepRow.style.display = "grid";
    stepRow.style.gridTemplateColumns = "repeat(16, 1fr)";
    stepRow.style.gap = "4px";
    seqContainer.appendChild(stepRow);
    
    for (let s = 0; s < 16; s++) {
      const stepBtn = document.createElement("button");
      stepBtn.className = "stepBtn";
      stepBtn.dataset.step = s;
      stepBtn.innerText = s + 1;
      stepBtn.style.padding = "10px";
      stepBtn.style.borderRadius = "4px";
      stepBtn.style.background = "#222";
      stepBtn.style.color = "#fff";
      stepBtn.style.cursor = "pointer";
      stepBtn.addEventListener("click", () => { toggleStep(s); });
      stepBtn.addEventListener("touchstart", e => { e.preventDefault(); toggleStep(s); });
      stepRow.appendChild(stepBtn);
    }
    
    // Control row for BPM and start/stop
    const controlRow = document.createElement("div");
    controlRow.style.display = "flex";
    controlRow.style.justifyContent = "space-around";
    controlRow.style.alignItems = "center";
    controlRow.style.width = "100%";
    
    const tapBpmBtn = document.createElement("button");
tapBpmBtn.innerText = "Tap BPM";
tapBpmBtn.style.padding = "10px";
tapBpmBtn.style.borderRadius = "4px";
tapBpmBtn.style.background = "#444";
tapBpmBtn.style.color = "#fff";
tapBpmBtn.style.cursor = "pointer";
tapBpmBtn.addEventListener("click", () => {
  let now = performance.now();
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();
  if (tapTimes.length >= 4) {
    let intervals = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }
    let avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    sequencerBPM = Math.round(60000 / avgInterval);
    if (bpmInput) bpmInput.value = sequencerBPM;
    console.log("New BPM:", sequencerBPM);
    // If sequencer is running, restart it with the new BPM:
    if (sequencerPlaying) {
      stopAllSequencers();
      startAllSequencers();
    }
  }
});
controlRow.appendChild(tapBpmBtn);

    
    const bpmInput = document.createElement("input");
bpmInput.type = "number";
bpmInput.value = sequencerBPM;
bpmInput.style.width = "50px";
bpmInput.style.marginLeft = "5px";
bpmInput.addEventListener("input", () => {
  const newBpm = parseInt(bpmInput.value, 10) || 120;
  if (newBpm !== sequencerBPM) {
    sequencerBPM = newBpm;
    console.log("Manual BPM change:", sequencerBPM);
    // If the sequencer is running, update it immediately:
    if (sequencerPlaying) {
      stopAllSequencers();
      startAllSequencers();
    }
  }
});
controlRow.appendChild(bpmInput);
    
    const startStopBtn = document.createElement("button");
    startStopBtn.innerText = "Start";
    startStopBtn.style.padding = "10px";
    startStopBtn.style.borderRadius = "4px";
    startStopBtn.style.background = "#444";
    startStopBtn.style.color = "#fff";
    startStopBtn.style.cursor = "pointer";
    startStopBtn.addEventListener("click", () => {
      if (sequencerPlaying) { stopSequencer(); startStopBtn.innerText = "Start"; }
      else { startSequencer(); startStopBtn.innerText = "Stop"; }
    });
    controlRow.appendChild(startStopBtn);
    
    seqContainer.appendChild(controlRow);
    
    document.body.appendChild(touchPopup);
    makeOverlayDraggable(touchPopup, header);
    currentPad = 0;
    updateSequencerUI();
  }
  
  // Helper to make overlays draggable
  function makeOverlayDraggable(overlay, handle) {
    let offsetX = 0, offsetY = 0, dragging = false;
    handle.addEventListener("mousedown", e => {
      dragging = true;
      let rect = overlay.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", e => { if (!dragging) return; overlay.style.left = (e.clientX - offsetX) + "px"; overlay.style.top = (e.clientY - offsetY) + "px"; });
    document.addEventListener("mouseup", () => { dragging = false; document.body.style.userSelect = ""; });
  }
  
  // Update sequencer UI for current pad
  function updateSequencerUI() {
    const stepRow = document.getElementById("stepRow");
    if (!stepRow) return;
    const steps = padSequencers[currentPad];
    Array.from(stepRow.children).forEach((btn, index) => {
      btn.style.background = steps[index] ? "#0a0" : "#222";
    });
  }
  
  // Toggle a step on/off for current pad
  function toggleStep(stepIndex) {
    if (currentPad === null) return;
    padSequencers[currentPad][stepIndex] = !padSequencers[currentPad][stepIndex];
    updateSequencerUI();
  }
  
  // Start all sequencers for all pads concurrently
  function startSequencer() {
    if (sequencerPlaying) return;
    sequencerPlaying = true;
    startAllSequencers();
    highlightCurrentStep(padSequencerSteps[currentPad]);
  }
  
  function stopSequencer() {
    sequencerPlaying = false;
    stopAllSequencers();
    clearStepHighlights();
  }
  

// Dummy sample playback
function playSamplePad(padIndex) {
  console.log(`Playing sample for pad ${padIndex}`);
}

function triggerPadCue(padIndex) {
  // 1 – fire the one‑shot sample assigned to this pad (if any)
  playSamplePad?.(padIndex);

  // 2 – jump to the linked cue using the cross‑fade helper
  const vid = getVideoElement();
  const cueKey = (padIndex === 9) ? "0" : String(padIndex + 1);
  if (vid && cuePoints[cueKey] !== undefined) {
    selectedCueKey = cueKey;
    lastCueAdjustValue = null;
    lastCueAdjustDirection = 0;
    safeSeekVideo(null, cuePoints[cueKey]);  // routes into jumpToCue()
  }
}
  
  // Highlight current step in UI
  function highlightCurrentStep(stepIndex) {
    const stepRow = document.getElementById("stepRow");
    if (!stepRow) return;
    Array.from(stepRow.children).forEach((btn, index) => {
      btn.style.outline = (index === stepIndex) ? "2px solid yellow" : "none";
    });
  }
  
  // Clear step highlights
  function clearStepHighlights() {
    const stepRow = document.getElementById("stepRow");
    if (!stepRow) return;
    Array.from(stepRow.children).forEach(btn => { btn.style.outline = "none"; });
  }
  
  // Arrays for pad sequencer intervals and steps
  let padSequencerIntervals = new Array(10).fill(null);
  let padSequencerSteps = new Array(10).fill(0);
  
  // Start sequencers for all pads
  function startAllSequencers() {
    const intervalTime = (60 / sequencerBPM) * 1000;
    for (let padIndex = 0; padIndex < padSequencers.length; padIndex++) {
      if (padSequencerIntervals[padIndex] !== null) continue;
      padSequencerSteps[padIndex] = 0;
      padSequencerIntervals[padIndex] = setInterval(() => {
        if (padSequencers[padIndex][padSequencerSteps[padIndex]]) {
          triggerPadCue(padIndex);
        }
        if (padIndex === currentPad) {
          highlightCurrentStep(padSequencerSteps[padIndex]);
        }
        padSequencerSteps[padIndex] = (padSequencerSteps[padIndex] + 1) % 16;
      }, intervalTime);
    }
    console.log("All pad sequencers started.");
  }
  
  // Stop all pad sequencers
  function stopAllSequencers() {
    for (let i = 0; i < padSequencerIntervals.length; i++) {
      if (padSequencerIntervals[i] !== null) {
        clearInterval(padSequencerIntervals[i]);
        padSequencerIntervals[i] = null;
      }
    }
    console.log("All pad sequencers stopped.");
  }
  
  /**************************************
   * Keyboard & MIDI shortcuts for Sequencer & Touch Popup
   **************************************/
  document.addEventListener("keydown", (e) => {
    if (isTypingInTextField(e)) return;
    // On every key press (before other handlers) optionally pulse‑show the bar
    if (unhideOnInput) pulseShowYTControls();
       // ‘b’ now toggles blind mode
   if (e.key.toLowerCase() === "b" && !e.repeat) {
     e.preventDefault();
     toggleBlindMode();
     return;
   }
    // Removed: if (e.metaKey && e.key.toLowerCase() === "b") { ... }
    if (touchPopup && touchPopup.style.display !== "none" && e.key.toLowerCase() === "s") {
      if (sequencerPlaying) { stopSequencer(); } else { startSequencer(); }
      e.preventDefault();
    }
    if (e.key.toLowerCase() === "t") {
      if (touchPopup && touchPopup.style.display !== "none") {
        touchPopup.style.display = "none";
      } else {
        buildTouchPopup();
      }
      e.preventDefault();
    }
    // --- independent “b” key handler: toggle pulse‑show mode ---
    // Removed: if (e.key.toLowerCase() === "b" && !e.repeat) { ... }
    // --- “a” key toggles Advanced panel (open/close) ---
    if (e.key.toLowerCase() === "a") {
      e.preventDefault();
      // Toggle advanced UI: close if open, open if closed
      if (panelContainer && panelContainer.style.display !== 'none') {
        panelContainer.style.display = 'none';
        // Also open minimal UI after closing advanced
        if (typeof goMinimalUI === "function") goMinimalUI();
      } else if (typeof goAdvancedUI === "function") {
        goAdvancedUI();
      }
      return;
    }
  }, true);
  
  function hideYouTubePopups() {
  const style = document.createElement("style");
  style.id = "hideYouTubePopups";
  style.textContent = `
    .ytp-ce-element,
    /* .ytp-popup, */  /* removed to re-enable quality menu */
    .ytp-pause-overlay,
    .ytp-error,
    #dialog.ytd-popup-container,
    #button.yt-confirm-dialog-renderer {
      display: none !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}
hideYouTubePopups();
  
  /**************************************
   * Integration into Minimal UI
   **************************************/
  function addTouchButtonToMinimalUI() {
  const touchBtn = document.createElement("button");
  touchBtn.className = "looper-btn";
  touchBtn.innerText = "Touch";
  touchBtn.title = "Toggle Touch Sequencer (MIDI: Note 27)";
  touchBtn.addEventListener("click", () => {
    if (touchPopup && touchPopup.style.display !== "none") {
      touchPopup.style.display = "none";
    } else {
      buildTouchPopup();
    }
  });
  if (minimalUIContainer) {
    minimalUIContainer.appendChild(touchBtn);
  }
}
  addTouchButtonToMinimalUI();

  
  function addTouchSequencerButtonToAdvancedUI() {
  const advancedTouchBtn = document.createElement("button");
  advancedTouchBtn.className = "looper-btn";
  advancedTouchBtn.innerText = "Touch Sequencer";
  advancedTouchBtn.title = "Toggle Touch Sequencer (MIDI: Note 27)";
  advancedTouchBtn.addEventListener("click", () => {
    if (touchPopup && touchPopup.style.display !== "none") {
      touchPopup.style.display = "none";
    } else {
      buildTouchPopup();
    }
  });
  if (panelContainer) {
    panelContainer.appendChild(advancedTouchBtn);
  }
}
  addTouchSequencerButtonToAdvancedUI();

  // Attach pulse‑show hook to every MIDI input
  if (shouldRunOnThisPage() && !isSampletteEmbed && navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(access => {
      function hook(port) {
        if (!port || port.type !== 'input') return;
        if (port._ytbmHooked) return; // avoid duplicate wrappers
        port._ytbmHooked = true;
        const orig = port.onmidimessage;
        port.onmidimessage = function(ev) {
          if (unhideOnInput) pulseShowYTControls();
          const [status, note, velocity] = ev.data;
          const command = status & 0xf0;
          // Handle Note On for cue marking
          if (command === 0x90 && velocity > 0) {
            for (const [key, midiNote] of Object.entries(midiNotes.cues)) {
              if (midiNote === note) {
                const vid = getVideoElement();
                if (vid && cuePoints[key] === undefined) {
                  pushUndoState();
                  cuePoints[key] = vid.currentTime;
                  saveCuePointsToURL();
                  updateCueMarkers();
                  refreshCuesButton();
                  return; // skip original to avoid playback
                }
                break;
              }
            }
          }
          // Fallback to original handler
          if (orig) orig.call(this, ev);
        };
      }
      access.inputs.forEach(hook);
      access.addEventListener('statechange', e => {
        if (e.port) hook(e.port);
      });
    }).catch(console.warn);
  }
  
  function updateCompUIButtons(label, color) {
    if (loFiCompButton) { loFiCompButton.innerText = "Comp: " + label; loFiCompButton.style.backgroundColor = color; }
    if (compButtonMin) { compButtonMin.innerText = "Comp: " + label; compButtonMin.style.backgroundColor = color; }
  }
  function makeSaturationCurve(amount) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; i++) {
      const x = i * 2 / n_samples - 1;
      curve[i] = Math.tanh(x * amount);
    }
    return curve;
  }

// ALWAYS intercept digit keys (unless using Ctrl/Meta) and trigger the pad
document.addEventListener(
  "keydown",
  (e) => {
    if (isTypingInTextField(e)) return;
    // Only handle plain digit keys (ignore if user holds Ctrl/Meta)
    if (!e.ctrlKey && !e.metaKey && /^[0-9]$/.test(e.key)) {
      // Prevent YouTube's default cue-jump behavior
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      // Map "1" to pad index 0, "2" to index 1, ..., "0" to index 9:
      const padIndex = e.key === "0" ? 9 : parseInt(e.key, 10) - 1;
      // If this cue is not yet marked, mark it now at the current time
            const key = e.key;
      const vid = getVideoElement();
      // If this cue isn't marked yet, mark it silently and skip playback
      if (cuePoints[key] === undefined && vid) {
        pushUndoState();
        cuePoints[key] = vid.currentTime;
        saveCuePointsToURL();
        updateCueMarkers();
        refreshCuesButton();
        return; // do not play on this first press
      }
      // Otherwise, play the existing cue
      triggerPadCue(padIndex);
      // (Optional) If the touch window exists, add visual feedback:
      if (touchPopup) {
        const padButton = touchPopup.querySelector(
          `button.touch-pad-btn[data-pad-index="${padIndex}"]`
        );
        if (padButton) {
          padButton.style.transform = "scale(0.95)";
          setTimeout(() => {
            padButton.style.transform = "";
          }, 100);
        }
      }
    }
  },
  true // capture phase so this fires before YouTube's handlers
);

function applyCompressorPreset(preset) {
  if (!loFiCompNode || !postCompGain || !audioContext) return;
  
  // Disconnect any previously connected nodes.
  loFiCompNode.disconnect();
  
  // Define native target level from default settings.
  const nativeTarget = loFiCompDefaultValue / 100; // e.g., 150/100 = 1.5
  
  switch (preset) {
    case 'boss303':
      // --- Boss SP303 Emulation (Ultra Warm, Tape-like) ---
      loFiCompNode.threshold.value = -18;
      loFiCompNode.knee.value = 10;
      loFiCompNode.ratio.value = 6;
      loFiCompNode.attack.value = 0.0015;
      loFiCompNode.release.value = 0.35;
      // Increase output gain to 1.8 (boost over native level).
      const boss303Gain = 1.8;
      
      // --- Multi-band Processing ---
      const splitter = audioContext.createChannelSplitter(3);
      const merger = audioContext.createChannelMerger(3);
      
      // Route compressor output to splitter.
      loFiCompNode.connect(splitter);
      
      // Low band: Below 300 Hz.
      const lowFilter = audioContext.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = 300;
      const wsLow = audioContext.createWaveShaper();
      wsLow.curve = makeSaturationCurve(1000);
      wsLow.oversample = '2x';
      const lowShelf = audioContext.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 120;
      lowShelf.gain.value = 8;
      splitter.connect(lowFilter, 0);
      lowFilter.connect(wsLow);
      wsLow.connect(lowShelf);
      lowShelf.connect(merger, 0, 0);
      
      // Mid band: 300 Hz – 1200 Hz.
      const midFilter = audioContext.createBiquadFilter();
      midFilter.type = 'bandpass';
      midFilter.frequency.value = 800;
      midFilter.Q.value = 1;
      const wsMid = audioContext.createWaveShaper();
      wsMid.curve = makeSaturationCurve(800);
      wsMid.oversample = '2x';
      const midPeaking = audioContext.createBiquadFilter();
      midPeaking.type = 'peaking';
      midPeaking.frequency.value = 800;
      midPeaking.gain.value = 4;
      splitter.connect(midFilter, 1);
      midFilter.connect(wsMid);
      wsMid.connect(midPeaking);
      midPeaking.connect(merger, 0, 1);
      
      // High band: Above 1200 Hz.
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 1200;
      const wsHigh = audioContext.createWaveShaper();
      wsHigh.curve = makeSaturationCurve(500);
      wsHigh.oversample = '4x';
      splitter.connect(highPass, 2);
      highPass.connect(wsHigh);
      wsHigh.connect(merger, 0, 2);
      
      // Advanced Look-Ahead: Add a dry branch with a 10ms delay.
      const dryDelay = audioContext.createDelay();
      dryDelay.delayTime.value = 0.01; // 10ms delay
      const dryGain = audioContext.createGain();
      loFiCompNode.connect(dryGain);
      dryGain.connect(dryDelay);
      
      // Merge the multi-band processing and the delayed dry signal.
      const finalMerger = audioContext.createGain();
      merger.connect(finalMerger);
      dryDelay.connect(finalMerger);
      
      // Connect final merger to postCompGain and set output gain.
      finalMerger.connect(postCompGain);
      postCompGain.gain.value = boss303Gain;
      
      if (loFiCompButton) {
        loFiCompButton.style.backgroundColor = "sandybrown";
        loFiCompButton.innerText = "LoFiComp: Boss SP303 (Ultra Tape)";
      }
      break;
      
    case 'roland404og':
      // --- Roland SP404OG Emulation (Bright, Open) ---
      loFiCompNode.threshold.value = -34;
      loFiCompNode.knee.value = 2;
      loFiCompNode.ratio.value = 24;
      loFiCompNode.attack.value = 0.015;
      loFiCompNode.release.value = 0.4;
      // Increase output gain to 1.8 (boost over native).
      const sp404Gain = 1.8;
      postCompGain.gain.value = sp404Gain;
      
      // Dry path remains transparent.
      loFiCompNode.connect(postCompGain);
      
      // Create a parallel saturation branch for brightness.
      const wsBright = audioContext.createWaveShaper();
      wsBright.curve = makeSaturationCurve(500);
      wsBright.oversample = '4x';
      
      const highShelf2 = audioContext.createBiquadFilter();
      highShelf2.type = "highshelf";
      highShelf2.frequency.value = 3500;
      highShelf2.gain.value = 6;
      
      const parallelGain = audioContext.createGain();
      parallelGain.gain.value = 0.7;
      
      loFiCompNode.connect(wsBright);
      wsBright.connect(highShelf2);
      highShelf2.connect(parallelGain);
      parallelGain.connect(postCompGain);
      
      if (loFiCompButton) {
        loFiCompButton.style.backgroundColor = "lightseagreen";
        loFiCompButton.innerText = "LoFiComp: Roland SP404OG (Bright Open)";
      }
      break;
      
    case 'default':
    default:
      // --- Default: Native Compressor Settings ---
      loFiCompNode.threshold.value = -30;
      loFiCompNode.knee.value = 0;
      loFiCompNode.ratio.value = 20;
      loFiCompNode.attack.value = 0.01;
      loFiCompNode.release.value = 0.2;
      postCompGain.gain.value = nativeTarget;
      loFiCompNode.connect(postCompGain);
      
      if (loFiCompButton) {
        loFiCompButton.style.backgroundColor = "#444";
        loFiCompButton.innerText = "LoFiComp: Default";
      }
      break;
  }
}

var visualsHidden = false;

function toggleHideVisuals() {
  if (!visualsHidden) {
    // Create a style element to hide YouTube and extension UI elements.
    var style = document.createElement("style");
    style.id = "hideVisualsStyle";
    style.textContent = `
      /* Hide YouTube standard UI elements */
      #masthead-container,
      #secondary,
      #comments,
      #related,
      ytd-guide,
      ytd-mini-guide-renderer {
        display: none !important;
      }
      
      /* Hide extension UI elements */
      .ytbm-minimal-bar,
      .cue-marker,
      .looper-panel-container,
      .looper-manual-container,
      .looper-keymap-container,
      .looper-midimap-container {
        display: none !important;
      }
      
      /* Optionally expand the video player */
      ytd-watch-flexy #player {
        width: 100% !important;
      }
      
      /* Optional: change the page background */
      body {
        background-color: black !important;
      }
    `;
    document.head.appendChild(style);
    visualsHidden = true;
  } else {
    // Remove the style element to restore the UI.
    var style = document.getElementById("hideVisualsStyle");
    if (style) {
      style.parentNode.removeChild(style);
    }
    visualsHidden = false;
  }
}

function attachAudioPriming() {
  const cueButton = document.querySelector('.looper-drag-handle');
  if (cueButton) {
    cueButton.addEventListener(
  'click',
  () => {
    ensureAudioContext();
  },
  { once: true }
);
  } else {
    console.warn('"YT Beatmaker Cues" button not found');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Ensure minimal view is active immediately
  if (typeof goMinimalUI === "function") goMinimalUI();
  // Also launch minimal view after audio context is ready
  ensureAudioContext()
    .then(() => { if (typeof goMinimalUI === "function") goMinimalUI(); })
    .catch(console.error);

  // If no cue points are loaded, generate random cues
  if (Object.keys(cuePoints).length === 0 && typeof placeRandomCues === "function") {
    placeRandomCues();
    updateCueMarkers();
    refreshCuesButton();
  }

  // Assuming your button is created as the drag handle for your panel:
  const cueButton = document.querySelector('.looper-drag-handle');
  if (cueButton) {
    // Attach a one-time click listener
    cueButton.addEventListener('click', () => {
      ensureAudioContext();
      goMinimalUI(); // Open the minimal view
    }, { once: true });
  }
});
document.addEventListener('click', () => {
  ensureAudioContext();
}, { once: true });
// For cue-marking: when ctrl/cmd + digit is pressed,
// capture the event in the capture phase, record the cue,
// and prevent YouTube's native seeking.
document.addEventListener(
  "keydown",
  (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key >= "0" && e.key <= "9") {
      const vid = getVideoElement();
      if (vid) {
        // Save current time before any jump occurs.
        const t = vid.currentTime;
        // Prevent YouTube's default behavior:
        e.preventDefault();
        e.stopImmediatePropagation();
        // Now mark the cue point:
        pushUndoState();
        cuePoints[e.key] = t;
        saveCuePointsToURL();
        updateCueMarkers();
        refreshCuesButton();
      }
    }
  },
  true // capture phase
);

const MAX_UNDO_STATES = 20;

function crossfadeLoop(buffer, fadeTime) {
  const fadeSamples = Math.floor(buffer.sampleRate * fadeTime);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < fadeSamples; i++) {
      const fadeIn  = i / fadeSamples;
      const fadeOut = 1 - fadeIn;
      const start   = data[i];
      const end     = data[data.length - fadeSamples + i];
      data[i] = start * fadeIn + end * fadeOut;
      data[data.length - fadeSamples + i] = start * fadeOut + end * fadeIn;
    }
  }
}

function trimSilence(buf, threshold = 0.001) {
  const len = buf.length;
  const chans = buf.numberOfChannels;
  let start = 0;
  let end = len;

  outer: for (; start < len; start++) {
    for (let c = 0; c < chans; c++) {
      if (Math.abs(buf.getChannelData(c)[start]) > threshold) break outer;
    }
  }

  outer2: for (end = len - 1; end >= start; end--) {
    for (let c = 0; c < chans; c++) {
      if (Math.abs(buf.getChannelData(c)[end]) > threshold) break outer2;
    }
  }
  end++;

  if (start === 0 && end === len) return buf;

  const newBuf = audioContext.createBuffer(chans, end - start, buf.sampleRate);
  for (let c = 0; c < chans; c++) {
    newBuf.getChannelData(c).set(buf.getChannelData(c).subarray(start, end));
  }
  return newBuf;
}

function alignToZeroCrossings(buf, searchTime = 0.05) {
  const searchSamples = Math.floor(buf.sampleRate * searchTime);
  const len = buf.length;
  const chans = buf.numberOfChannels;
  const data0 = buf.getChannelData(0);

  let start = 0;
  for (let i = 1; i < Math.min(searchSamples, len - 1); i++) {
    if (Math.sign(data0[i]) !== Math.sign(data0[i - 1])) {
      start = i;
      break;
    }
  }

  let end = len;
  for (let i = len - 1; i >= Math.max(len - searchSamples, 1); i--) {
    if (Math.sign(data0[i]) !== Math.sign(data0[i - 1])) {
      end = i;
      break;
    }
  }

  if (start === 0 && end === len) return buf;

  const newLen = end - start;
  const newBuf = audioContext.createBuffer(chans, newLen, buf.sampleRate);
  for (let c = 0; c < chans; c++) {
    newBuf.getChannelData(c).set(buf.getChannelData(c).subarray(start, end));
  }
  return newBuf;
}

async function processLoopFromBlob() {
  if (looperState !== "recording") return;
  let blob = new Blob(recordedChunks, { type: "audio/webm" });
  let arr = await blob.arrayBuffer();
  let buf = await audioContext.decodeAudioData(arr);
  finalizeLoopBuffer(buf);
}

function processLoopFromFrames(frames) {
  if (!frames || !frames.length) return;
  const channels = frames[0].length;
  const length = frames.reduce((t, f) => t + f[0].length, 0);
  const buf = audioContext.createBuffer(channels, length, audioContext.sampleRate);
  let offset = 0;
  for (const block of frames) {
    for (let c = 0; c < channels; c++) {
      buf.getChannelData(c).set(block[c], offset);
    }
    offset += block[0].length;
  }
  finalizeLoopBuffer(buf);
}

function finalizeLoopBuffer(buf) {
  buf = trimSilence(buf);
  buf = alignToZeroCrossings(buf);

  let peak = measurePeak(buf);
  if (peak > 1.0) scaleBuffer(buf, 1.0 / peak);
  // Smooth the transition between loop boundaries
  crossfadeLoop(buf, 0.005);

  pushUndoState();
  loopBuffer = buf;

  looperState = "playing";
  playLoop();
  updateLooperButtonColor();
  updateExportButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

/**************************************
 * Cleanup Helper
 **************************************/
function addTrackedListener(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  cleanupFunctions.push(() => target.removeEventListener(type, listener, options));
}
function cleanupResources() {
  [mediaRecorder, videoMediaRecorder].forEach(mr => {
    if (mr && mr.state === "recording") {
      mr.stop();
      mr.stream?.getTracks().forEach(track => track.stop());
    }
  });
  if (loopRecorderNode) {
    try { mainRecorderMix.disconnect(loopRecorderNode); } catch {}
    loopRecorderNode.disconnect();
    loopRecorderNode = null;
    recordedFrames = [];
  }
  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }
  stopMonitoring();
  if (videoPreviewURL) {
    URL.revokeObjectURL(videoPreviewURL);
    videoPreviewURL = null;
  }
  [
    panelContainer,
    videoPreviewElement,
    minimalUIContainer,
    eqWindowContainer
  ].forEach(el => {
    if (el && el.parentNode) el.remove();
  });
  cleanupFunctions.forEach(fn => fn());
  cleanupFunctions.length = 0;
  loopBuffer = null;
  audioBuffers = {};
  undoStack = [];
  redoStack = [];
}
addTrackedListener(window, "beforeunload", cleanupResources);

let videoDestination = null;

/**************************************
 * Unified Undo/Redo for Full State
 **************************************
 * We'll capture everything relevant in a single object,
 * push that object to undoStack, and restore it as needed.
 **************************************/

function captureAppState() {
  return {
    loopBuffer,
    looperState,
    cuePoints: JSON.parse(JSON.stringify(cuePoints)), // copy
    currentSampleIndex: { ...currentSampleIndex },

    eqFilterActive,
    eqFilterApplyTarget,
    eqFilterType: eqFilterNode ? eqFilterNode.type : 'lowpass',
    eqFilterFreq: eqFilterNode ? eqFilterNode.frequency.value : 250,
    eqFilterGain: eqFilterNode ? eqFilterNode.gain.value : 0,

    loFiCompActive,
    postCompGainValue: postCompGain.gain.value,

    // reverb + cassette
    reverbActive,
    cassetteActive,

    pitchPercentage,
    pitchTarget,
    videoPitchPercentage,
    loopPitchPercentage,

    videoAudioEnabled,
    audioLoopInVideo
  };
}

function restoreAppState(st) {
  loopBuffer = st.loopBuffer;
  looperState = st.looperState;
  cuePoints = JSON.parse(JSON.stringify(st.cuePoints));
  currentSampleIndex = { ...st.currentSampleIndex };

  eqFilterActive = st.eqFilterActive;
  eqFilterApplyTarget = st.eqFilterApplyTarget;
  if (eqFilterNode) {
    eqFilterNode.type = st.eqFilterType;
    eqFilterNode.frequency.value = st.eqFilterFreq;
    eqFilterNode.gain.value = st.eqFilterGain;
  }

  loFiCompActive = st.loFiCompActive;
  postCompGain.gain.value = st.postCompGainValue;

  // reverb / cassette
  reverbActive = st.reverbActive;
  cassetteActive = st.cassetteActive;

  pitchPercentage = st.pitchPercentage;
  pitchTarget = st.pitchTarget;
  videoPitchPercentage = st.videoPitchPercentage;
  loopPitchPercentage = st.loopPitchPercentage;

  videoAudioEnabled = st.videoAudioEnabled;
  audioLoopInVideo = st.audioLoopInVideo;

  // Re-apply everything
  saveCuePointsToURL();
  updateCueMarkers();
  refreshCuesButton();

  updateSampleDisplay("kick");
  updateSampleDisplay("hihat");
  updateSampleDisplay("snare");

  applyAllFXRouting();
  updateLooperButtonColor();
  updateVideoLooperButtonColor();
  updateEQButtonColor();
  updateCompButtonColor();
  updateExportButtonColor();
  updateReverbButtonColor();
  updateCassetteButtonColor();

  updatePitch(pitchPercentage);

  if (looperState === "playing") {
    playLoop();
  } else if (looperState === "overdubbing") {
    looperState = "playing";
    playLoop();
  } else if (looperState === "recording") {
    looperState = "idle";
  } else {
    stopLoop();
  }

  if (window.refreshMinimalState) {
    window.refreshMinimalState();
  }
}

function captureCurrentState() {
  // Capture only the key properties you want to be undoable.
  // Modify the list below to include all the variables you need.
  return {
    // For example, capture the current sample index and volumes:
    currentSampleIndex: { ...currentSampleIndex },
    sampleVolumes: { ...sampleVolumes },
    // If you have other state variables, add them here.
    // e.g., loopBuffer, eqFilter settings, cuePoints, etc.
  };
}

function restoreState(state) {
  // Restore the properties that were captured.
  if (state.currentSampleIndex) {
    currentSampleIndex = { ...state.currentSampleIndex };
    // Optionally, update the UI if needed:
    updateSampleDisplay("kick");
    updateSampleDisplay("hihat");
    updateSampleDisplay("snare");
  }
  if (state.sampleVolumes) {
    sampleVolumes = { ...state.sampleVolumes };
    // Also update any corresponding UI elements such as fader labels.
  }
  // Restore any other state properties as needed.
  
  // You may also need to reapply the state by re-routing audio nodes or updating the UI.
}

function pushUndoState() {
  const state = captureAppState();
  undoStack.push(state);
  if (undoStack.length > MAX_UNDO_STATES) {
    undoStack.shift();
  }
  redoStack = [];
}


function undoAction() {
  if (undoStack.length > 0) {
    const currentState = captureAppState();
    redoStack.push(currentState);
    const previousState = undoStack.pop();
    restoreAppState(previousState);
  }
}

function redoAction() {
  if (redoStack.length > 0) {
    const currentState = captureAppState();
    undoStack.push(currentState);
    const nextState = redoStack.pop();
    restoreAppState(nextState);
  }
}


/**************************************
 * Update Button Colors
 **************************************/
function updateLooperButtonColor() {
  if (!unifiedLooperButton) return;
  let c = "grey";
  if (looperState === "recording") c = "red";
  else if (looperState === "overdubbing") c = "orange";
  else if (looperState === "playing") c = "green";
  unifiedLooperButton.style.backgroundColor = (looperState === "idle") ? "grey" : c;
}
function updateVideoLooperButtonColor() {
  if (!videoLooperButton) return;
  let c = "grey";
  if (videoLooperState === "recording") c = "red";
  else if (videoLooperState === "playing") c = "green";
  videoLooperButton.style.backgroundColor = (videoLooperState === "idle") ? "grey" : c;
}
function updateExportButtonColor() {
  if (!exportButton) return;
  if (videoLooperState !== "idle" && videoPreviewURL) {
    exportButton.style.backgroundColor = "#A0F";
  } else if (loopBuffer) {
    exportButton.style.backgroundColor = "#449";
  } else {
    exportButton.style.backgroundColor = "#666";
  }
}
function updateEQButtonColor() {
  if (!eqButton) return;
  eqButton.style.backgroundColor = eqFilterActive ? "darkcyan" : "#444";
}
function updateCompButton(label, color) {
  if (loFiCompButton) {
    loFiCompButton.innerText = "Comp: " + label;
    loFiCompButton.style.backgroundColor = color;
  }
}
// Reverb + Cassette colors
function updateReverbButtonColor() {
  if (reverbButton) {
    reverbButton.style.backgroundColor = reverbActive ? "#4287f5" : "#444"; 
  }
}
function updateCassetteButtonColor() {
  if (cassetteButton) {
    cassetteButton.style.backgroundColor = cassetteActive ? "#b05af5" : "#444";
  }
}


/**************************************
 * Toggling FX (EQ, Reverb, Cassette, Compressor)
 **************************************/
function toggleEQFilter() {
  pushUndoState();
  eqFilterActive = !eqFilterActive;
  applyAllFXRouting();
  updateEQButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}
// Toggle compressor function cycling through off, native, SP303, and SP404
function toggleCompressor() {
  pushUndoState();
  switch (compMode) {
    case "off":
      compMode = "native";
      loFiCompActive = true;
      loFiCompNode.threshold.value = -30;
      loFiCompNode.knee.value = 0;
      loFiCompNode.ratio.value = 20;
      loFiCompNode.attack.value = 0.01;
      loFiCompNode.release.value = 0.2;
      postCompGain.gain.value = loFiCompDefaultValue / 100;
      updateCompUIButtons("Native", "darkorange");
      break;
    case "native":
      compMode = "boss303";
      loFiCompActive = true;
      loFiCompNode.threshold.value = -25;
      loFiCompNode.knee.value = 5;
      loFiCompNode.ratio.value = 12;
      loFiCompNode.attack.value = 0.005;
      loFiCompNode.release.value = 0.25;
      postCompGain.gain.value = 1.2;
      updateCompUIButtons("Ultra Tape", "cornflowerblue");
      break;
    case "boss303":
      compMode = "roland404";
      loFiCompActive = true;
      loFiCompNode.threshold.value = -28;
      loFiCompNode.knee.value = 3;
      loFiCompNode.ratio.value = 16;
      loFiCompNode.attack.value = 0.01;
      loFiCompNode.release.value = 0.3;
      postCompGain.gain.value = 1.1;
      updateCompUIButtons("Bright Open", "mediumorchid");
      break;
    case "roland404":
      compMode = "off";
      loFiCompActive = false;
      updateCompUIButtons("Off", "#222");
      break;
    default:
      compMode = "off";
      loFiCompActive = false;
      updateCompUIButtons("Off", "#222");
      break;
  }
  applyAllFXRouting();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function updateCompButtonColor() {
  // Optionally update additional UI elements related to the compressor.
  // For now, leave this empty if updateCompButton() already handles appearance.
}

// reverb
function toggleReverb() {
  pushUndoState();
  reverbActive = !reverbActive;
  applyAllFXRouting();
  updateReverbButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}
// cassette
function toggleCassette() {
  pushUndoState();
  cassetteActive = !cassetteActive;
  applyAllFXRouting();
  updateCassetteButtonColor();
  
  // Send the new active state to the cassette worklet node.
  if (cassetteNode && cassetteNode.port) {
    cassetteNode.port.postMessage({ active: cassetteActive });
  }
  
  if (window.refreshMinimalState) window.refreshMinimalState();
}
/**************************************
 * Audio Buffer Helpers
 **************************************/
function measurePeak(buf) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    let data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      let absVal = Math.abs(data[i]);
      if (absVal > peak) peak = absVal;
    }
  }
  return peak;
}
function scaleBuffer(buf, factor) {
  for (let c = 0; c < buf.numberOfChannels; c++) {
    let data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] *= factor;
    }
  }
}
function applyFadeToBuffer(b, secs) {
  if (!b) return;
  let fadeSamples = Math.floor(b.sampleRate * secs);
  for (let c = 0; c < b.numberOfChannels; c++) {
    let data = b.getChannelData(c);
    for (let i = 0; i < fadeSamples && i < data.length; i++) {
      data[i] *= i / fadeSamples;
    }
    for (let i = data.length - fadeSamples; i < data.length; i++) {
      if (i < 0) continue;
      data[i] *= (data.length - i) / fadeSamples;
    }
  }
}
function mixBuffers(b1, b2) {
  if (!b1) return b2;
  let channels = Math.min(b1.numberOfChannels, b2.numberOfChannels);
  let length = Math.min(b1.length, b2.length);
  let output = audioContext.createBuffer(b1.numberOfChannels, b1.length, b1.sampleRate);
  for (let c = 0; c < channels; c++) {
    let data1 = b1.getChannelData(c),
        data2 = b2.getChannelData(c),
        out = output.getChannelData(c);
    for (let i = 0; i < length; i++) {
      out[i] = data1[i] + data2[i];
    }
    for (let i = length; i < data1.length; i++) {
      out[i] = data1[i];
    }
  }
  return output;
}


/**************************************
 * Minimal UI Updates
 **************************************/
function updateMinimalLoopButtonColor(btn) {
  let color = "grey";
  if (looperState === "recording") color = "red";
  else if (looperState === "overdubbing") color = "orange";
  else if (looperState === "playing") color = "green";
  else if (videoLooperState === "recording") color = "red";
  else if (videoLooperState === "playing") color = "green";
  btn.style.backgroundColor = color;
}
function updateMinimalExportColor(btn) {
  if (videoLooperState !== "idle" && videoPreviewURL)
    btn.style.backgroundColor = "#A0F";
  else if (loopBuffer)
    btn.style.backgroundColor = "#449";
  else
    btn.style.backgroundColor = "#666";
}


/**************************************
 * Deferred AudioContext & Node Setup
 **************************************/
async function ensureAudioContext() {
  let created = false;
  if (!audioContext) {
    // Create the main AudioContext with minimal latency for responsive pads
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 0, // lowest possible latency
      sampleRate: 48000
    });
    setupAudioNodes();
    await loadDefaultSamples();
    await loadUserSamplesFromStorage();
    let vid = getVideoElement();
    if (vid && !vid._audioConnected) {
      if (!vid._mediaSource) {
        vid._mediaSource = audioContext.createMediaElementSource(vid);
        vid._mediaSource.connect(videoGain);
      }
      vid._audioConnected = true;
    }
    created = true;
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume().catch(err => console.error("AudioContext resume failed:", err.message));
  }
  if (!deckA) { initTwoDeck(); }
  if (!currentOutputNode) currentOutputNode = audioContext.destination;
  await applySavedOutputDevice();
  if (created) {
    applyMonitorSelection();
  }
  return audioContext;
}

/***** Two-deck initialisation (error-safe) *****/
function initTwoDeck() {
  deckA = getVideoElement();
  if (!deckA) return;

  /* -----  A-deck: visible player  ----- */
  let srcA = deckA._mediaSource;
  if (!srcA) {
    srcA = deckA._mediaSource = audioContext.createMediaElementSource(deckA);
  } else {
    try { srcA.disconnect(); } catch {}
  }

  gainA = audioContext.createGain();
  gainA.gain.value = 1;
  srcA.connect(gainA);
  // One‑time DC‑block filters so every deck path is filtered exactly once
  dcBlockA = audioContext.createBiquadFilter();
  dcBlockA.type = "highpass";
  dcBlockA.frequency.value = 20;

  dcBlockB = audioContext.createBiquadFilter();
  dcBlockB.type = "highpass";
  dcBlockB.frequency.value = 20;

  gainA.connect(dcBlockA);
  dcBlockA.connect(videoGain);
  deckA._audioConnected = "two-deck";

  /* -----  B-deck: hidden clone  ----- */
  deckB = deckA.cloneNode(false);
  deckB.style.display = "none";
  deckB.muted = true;               // autoplay guarantee
  deckB.playsInline = true;
  deckA.parentNode.insertBefore(deckB, deckA.nextSibling);

  const srcB = deckB._mediaSource = audioContext.createMediaElementSource(deckB);
  gainB = audioContext.createGain();
  gainB.gain.value = 0;
  srcB.connect(gainB);
  gainB.connect(dcBlockB);
  dcBlockB.connect(videoGain);
  deckB._audioConnected = "two-deck";

  deckB.pause();
  activeDeck = "A";
}

async function jumpToCue(targetTime) {
  const activeVid  = (activeDeck === "A") ? deckA : deckB;
  const silentVid  = (activeDeck === "A") ? deckB : deckA;
  const activeGain = (activeDeck === "A") ? gainA : gainB;
  const silentGain = (activeDeck === "A") ? gainB : gainA;

  if (!activeVid || !silentVid || !activeGain || !silentGain) {
    const vid = getVideoElement();
    if (vid) vid.currentTime = targetTime;
    return;
  }

  /* 1 – prepare the silent deck */
  const now = audioContext.currentTime;
  const EPS = 0.005;                 // −46 dB: low but never hard‑zero
  silentGain.gain.cancelScheduledValues(now);
  silentGain.gain.setValueAtTime(EPS, now);        // avoid 0 → EPS step
  silentVid.pause();
  silentVid.muted = false;           // ensure audio actually comes out
  silentVid.currentTime = targetTime;              // or fastSeek()
  try { await silentVid.play(); } catch (_) {}

  /* 2 – 80 ms constant‑power cross‑fade (starts 5 ms later so audio is ready) */
  const fadeStart = now + 0.005;     // 5 ms grace to let decoder queue data
  const xf  = Math.max(crossFadeTime, (audioContext.baseLatency || 0.012) * 2);

  // Cancel any still‑pending ramps
  activeGain.gain.cancelScheduledValues(now);
  silentGain.gain.cancelScheduledValues(now);

  // --- Fade OUT the current deck ---
  activeGain.gain.setValueAtTime(1, now);          // hold full level
  activeGain.gain.setValueAtTime(1, fadeStart);    // flat until fadeStart
  activeGain.gain.linearRampToValueAtTime(EPS, fadeStart + xf);

  // --- Fade IN the new deck ---
  silentGain.gain.setValueAtTime(EPS, now);        // hold low level
  silentGain.gain.setValueAtTime(EPS, fadeStart);  // flat until fadeStart
  silentGain.gain.linearRampToValueAtTime(1,  fadeStart + xf);

  /* 3 – swap */
  activeDeck = (activeDeck === "A") ? "B" : "A";
}

let videoCheckInterval = setInterval(() => {
  if (audioContext) {
    let vid = getVideoElement();
    if (vid && !vid._audioConnected) {
      if (!vid._mediaSource) {
        vid._mediaSource = audioContext.createMediaElementSource(vid);
        vid._mediaSource.connect(videoGain);
      }
      vid._audioConnected = true;
    }
  }
}, 2000);
cleanupFunctions.push(() => clearInterval(videoCheckInterval));

async function setupAudioNodes() {
  videoGain = audioContext.createGain();
  antiClickGain = audioContext.createGain();
  antiClickGain.gain.setValueAtTime(1, audioContext.currentTime);
  samplesGain = audioContext.createGain();
  loopAudioGain = audioContext.createGain();
  bus1Gain = audioContext.createGain();
  bus2Gain = audioContext.createGain();
  bus3Gain = audioContext.createGain();
  bus4Gain = audioContext.createGain();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 1;
  overallOutputGain = audioContext.createGain();
  overallOutputGain.gain.value = 1;

  loFiCompNode = audioContext.createDynamicsCompressor();
  loFiCompNode.threshold.value = -30;
  loFiCompNode.knee.value = 0;
  loFiCompNode.ratio.value = 20;
  loFiCompNode.attack.value = 0.01;
  loFiCompNode.release.value = 0.2;
  postCompGain = audioContext.createGain();
  postCompGain.gain.value = loFiCompDefaultValue / 100;

  mainRecorderMix = audioContext.createGain();
  destinationNode = audioContext.createMediaStreamDestination();

  bus1RecGain = audioContext.createGain();
  bus2RecGain = audioContext.createGain();
  bus3RecGain = audioContext.createGain();
  bus4RecGain = audioContext.createGain();
  bus1RecGain.gain.value = 1;
  bus2RecGain.gain.value = 1;
  bus3RecGain.gain.value = 0;
  bus4RecGain.gain.value = 1;

  mainRecorderMix.connect(destinationNode);
  videoDestination = audioContext.createMediaStreamDestination();

  samplesGain.connect(bus2Gain);
  loopAudioGain.connect(bus3Gain);
  bus1Gain.connect(masterGain);
  bus2Gain.connect(masterGain);
  bus3Gain.connect(masterGain);
  bus4Gain.connect(masterGain);

  eqFilterNode = audioContext.createBiquadFilter();
  eqFilterNode.type = "lowpass";
  eqFilterNode.frequency.value = 250;
  eqFilterNode.Q.value = 2.0;
  eqFilterNode.gain.value = 0;

  // Reverb node
  reverbNode = audioContext.createConvolver();
  reverbNode.buffer = generateSimpleReverbIR(audioContext);

  // Cassette node using the AudioWorklet version.
  cassetteNode = await createCassetteNode(audioContext);

  applyAllFXRouting();
}

// simple IR for reverb
function generateSimpleReverbIR(ctx) {
  const length = ctx.sampleRate * 1.2; // 1.2s
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    let chan = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      chan[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.5);
    }
  }
  return impulse;
}

async function createCassetteNode(ctx) {
  if (!ctx.audioWorklet) {
    throw new Error("AudioWorklet not supported in this browser.");
  }
  
  // Define the processor code as a string.
  // This processor applies a bit‐crusher (emulating a 303 sampler at 22 kHz)
  // plus a one‐pole low‐pass filter (default cutoff 5000 Hz) to warm the sound.
  const workletCode = `
    class CassetteProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        // The effect is off by default.
        this.active = false;
        // Bit crusher settings:
        this.bitDepth = 8; // target bit depth (8-bit quantization)
        this.targetSampleRate = 22000; // target effective sample rate (22 kHz)
        this.step = Math.max(1, Math.floor(sampleRate / this.targetSampleRate));
        this.counter = 0; // sample counter for bit crushing
        this.lastSamples = []; // per-channel held sample values
        
        // Noise amplitude:
        this.noiseAmp = 0.0002;
        
        // Lowpass filter settings:
        this.cutoff = 5000; // default cutoff frequency in Hz
        // We'll compute the filter coefficient (alpha) on each process call.
        // We also keep a per-channel state for the filtered output.
        this.prevFiltered = [];
        
        // Listen for messages from the main thread to update parameters.
        this.port.onmessage = (event) => {
          if (event.data) {
            if (event.data.hasOwnProperty('active')) {
              this.active = event.data.active;
            }
            if (event.data.hasOwnProperty('bitDepth')) {
              this.bitDepth = event.data.bitDepth;
            }
            if (event.data.hasOwnProperty('targetSampleRate')) {
              this.targetSampleRate = event.data.targetSampleRate;
              this.step = Math.max(1, Math.floor(sampleRate / this.targetSampleRate));
            }
            if (event.data.hasOwnProperty('cutoff')) {
              this.cutoff = event.data.cutoff;
            }
            if (event.data.hasOwnProperty('noiseAmp')) {
              this.noiseAmp = event.data.noiseAmp;
            }
          }
        };
      }
      
      process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0) return true;
        
        // If the effect is off, bypass the processing.
        if (!this.active) {
          for (let channel = 0; channel < input.length; channel++) {
            output[channel].set(input[channel]);
          }
          return true;
        }
        
        // Calculate quantization levels for bit reduction.
        const quantizationLevels = Math.pow(2, this.bitDepth) - 1;
        // Compute the one-pole lowpass filter coefficient:
        const RC = 1 / (2 * Math.PI * this.cutoff);
        const dt = 1 / sampleRate;
        const alpha = dt / (RC + dt);
        
        for (let channel = 0; channel < input.length; channel++) {
          const inputChannel = input[channel];
          const outputChannel = output[channel];
          // Initialize per-channel filter state if needed.
          if (this.prevFiltered[channel] === undefined) {
            this.prevFiltered[channel] = 0;
          }
          if (this.lastSamples[channel] === undefined) {
            this.lastSamples[channel] = 0;
          }
          
          for (let i = 0; i < inputChannel.length; i++) {
            // Bit crusher processing: update the held sample every "step" samples.
            let processedSample;
            if ((this.counter + i) % this.step === 0) {
              let sampleVal = inputChannel[i] + (Math.random() * 2 - 1) * this.noiseAmp;
              let quantized = Math.round(sampleVal * quantizationLevels) / quantizationLevels;
              this.lastSamples[channel] = quantized;
              processedSample = quantized;
            } else {
              processedSample = this.lastSamples[channel];
            }
            // Apply the one-pole lowpass filter:
            this.prevFiltered[channel] = this.prevFiltered[channel] + alpha * (processedSample - this.prevFiltered[channel]);
            outputChannel[i] = this.prevFiltered[channel];
          }
        }
        this.counter += input[0].length;
        return true;
      }
    }
    registerProcessor('cassette-processor', CassetteProcessor);
  `;
  
  // Create a Blob URL from the processor code.
  const blob = new Blob([workletCode], { type: "application/javascript" });
  const blobURL = URL.createObjectURL(blob);
  
  // Load the module into the AudioWorklet.
  await ctx.audioWorklet.addModule(blobURL);
  // Clean up the Blob URL.
  URL.revokeObjectURL(blobURL);
  
  // Create the AudioWorkletNode using our processor.
  const node = new AudioWorkletNode(ctx, 'cassette-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2]  // stereo output
  });
  
  // Initialize the processor's parameters.
  node.port.postMessage({
    active: false, 
    bitDepth: 12, 
    targetSampleRate: 22000,
    cutoff: 5000,
    noiseAmp: 0.0002
  });
  return node;
}

async function createLoopRecorderNode(ctx) {
  if (!ctx.audioWorklet) {
    throw new Error("AudioWorklet not supported in this browser.");
  }

  const code = `
    class LoopRecorder extends AudioWorkletProcessor {
      constructor() {
        super();
        this.recording = false;
        this.buffers = [];
        this.port.onmessage = (e) => {
          if (e.data === 'start') {
            this.recording = true;
            this.buffers = [];
          } else if (e.data === 'stop') {
            this.recording = false;
            this.port.postMessage(this.buffers);
            this.buffers = [];
          }
        };
      }

      process(inputs) {
        const input = inputs[0];
        if (this.recording && input && input.length) {
          const frame = [];
          for (let c = 0; c < input.length; c++) {
            frame[c] = new Float32Array(input[c]);
          }
          this.buffers.push(frame);
        }
        return true;
      }
    }
    registerProcessor('loop-recorder', LoopRecorder);
  `;

  const blob = new Blob([code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  return new AudioWorkletNode(ctx, 'loop-recorder');
}


/**************************************
 * Single function to apply all FX routing
 **************************************/
function applyAllFXRouting() {
  // First, disconnect everything that may have been connected:
  videoGain.disconnect();
  if (antiClickGain) antiClickGain.disconnect();
  loopAudioGain.disconnect();
  bus1Gain.disconnect();
  bus2Gain.disconnect();
  bus3Gain.disconnect();
  bus4Gain.disconnect();
  masterGain.disconnect();
  loFiCompNode.disconnect();
  postCompGain.disconnect();
  overallOutputGain.disconnect();

  // If you have a videoPreviewElement, ensure it has a MediaElementSource:
  if (videoPreviewElement) {
    if (!videoPreviewElement._mediaSource) {
      videoPreviewElement._mediaSource = audioContext.createMediaElementSource(videoPreviewElement);
    }
    // Disconnect it before re-routing:
    videoPreviewElement._mediaSource.disconnect();
  }

  // Decide how to chain the "video" path:
  // videoGain -> antiClickGain? -> (optionally eq->reverb->cassette) -> bus1Gain
  let currentVidNode;
  if (antiClickGain) {
    // Always feed the anti‑click gain from the video element
    videoGain.connect(antiClickGain);
    currentVidNode = antiClickGain;
  } else {
    currentVidNode = videoGain;
  }
  if (eqFilterActive && eqFilterApplyTarget === "video") {
    currentVidNode.connect(eqFilterNode);
    currentVidNode = eqFilterNode;
  }
  if (reverbActive) {
    currentVidNode.connect(reverbNode);
    currentVidNode = reverbNode;
  }
  if (cassetteActive) {
    currentVidNode.connect(cassetteNode);
    currentVidNode = cassetteNode;
  }
  // Finally go to bus1Gain:
  currentVidNode.connect(bus1Gain);

  // Do *the same chain* for loopAudioGain if you want it to share
  // the same “video” effects. (Below applies if eqFilterApplyTarget==="video")
  let currentLoopNode = loopAudioGain;
  if (eqFilterActive && eqFilterApplyTarget === "video") {
    currentLoopNode.connect(eqFilterNode);
    currentLoopNode = eqFilterNode;
  }
  if (reverbActive) {
    currentLoopNode.connect(reverbNode);
    currentLoopNode = reverbNode;
  }
  if (cassetteActive) {
    currentLoopNode.connect(cassetteNode);
    currentLoopNode = cassetteNode;
  }
  // Finally go to bus3Gain (loop’s existing bus):
  currentLoopNode.connect(bus3Gain);

  // If you also want the recorded videoPreviewElement to have the same FX:
  if (videoPreviewElement && videoPreviewElement._mediaSource) {
    let prev = videoPreviewElement._mediaSource;
    // Disconnect any existing connections
    prev.disconnect();
    // Connect the preview directly to bus4Gain (bypassing EQ, reverb, and cassette)
    prev.connect(bus4Gain);
  }

  // Now connect bus1..3 into masterGain, as normal:
  bus1Gain.connect(masterGain);
  bus2Gain.connect(masterGain);
  bus3Gain.connect(masterGain);

  // -------------------------------------------
  // COMPRESSOR BYPASS LOGIC FOR BUS4:
  // -------------------------------------------
  // If the compressor is ON, bus1..3 get compressed,
  // but bus4 goes directly to the output (uncompressed).
  // If the compressor is OFF, bus4 merges with everyone else in masterGain.
  if (loFiCompActive) {
    // bus1..3 => masterGain => loFiComp => postComp => destination
    masterGain.connect(loFiCompNode);
    loFiCompNode.connect(postCompGain);
    postCompGain.connect(currentOutputNode || audioContext.destination);
    postCompGain.connect(videoDestination);

    // bus4 => directly to output (skips compressor)
    bus4Gain.connect(currentOutputNode || audioContext.destination);
    bus4Gain.connect(videoDestination);
  } else {
    // No compressor: just send everyone (including bus4) through masterGain => overallOutput => out
    bus4Gain.connect(masterGain);
    masterGain.connect(overallOutputGain);
    overallOutputGain.connect(currentOutputNode || audioContext.destination);
    overallOutputGain.connect(videoDestination);
  }

  // If eqFilterApplyTarget === "master", route masterGain -> eqFilterNode -> etc.
  // (But the above logic already demonstrates separate compression paths.)
  // You can adapt it if you prefer "master" EQ. For example:
  if (eqFilterActive && eqFilterApplyTarget === "master") {
    // (You’d do masterGain => eqFilter => maybe comp => output, or similar)
    // ... but only if that’s your desired approach. Otherwise, skip.
  }

  // Connect the mainRecorderMix so you can record your buses (dry or wet):
  bus1Gain.connect(bus1RecGain);
  bus2Gain.connect(bus2RecGain);
  bus3Gain.connect(bus3RecGain);
  bus4Gain.connect(bus4RecGain);
  bus1RecGain.connect(mainRecorderMix);
  bus2RecGain.connect(mainRecorderMix);
  bus3RecGain.connect(mainRecorderMix);
  bus4RecGain.connect(mainRecorderMix);
  mainRecorderMix.connect(destinationNode);
}


/**************************************
 * Load Default Samples
 **************************************/
async function loadDefaultSamples() {
  if (!audioContext) {
    alert(
      "The extension defers AudioContext creation until you interact with the UI. Click on the “YT Beatmaker Cues” header (or any UI element) to start audio processing."
    );
    return;
  }
  try {
    audioBuffers.kick = [];
    audioBuffers.hihat = [];
    audioBuffers.snare = [];
    for (let i = 1; i <= 10; i++) {
      let kickSample = await loadAudio(`sounds/kick${i}.wav`);
      if (kickSample) audioBuffers.kick.push(kickSample);
      let hihatSample = await loadAudio(`sounds/hihat${i}.wav`);
      if (hihatSample) audioBuffers.hihat.push(hihatSample);
      let snareSample = await loadAudio(`sounds/snare${i}.wav`);
      if (snareSample) audioBuffers.snare.push(snareSample);
    }
    if (
      !audioBuffers.kick.length ||
      !audioBuffers.hihat.length ||
      !audioBuffers.snare.length
    ) {
      throw new Error("Missing sample files!");
    }
  } catch (e) {
    console.error("Error loading default samples:", e);
    alert("Missing sample files! Please ensure the extension contains the required sample files.");
  }

  if (!samplePacks.some(p => p.name === "Built-in")) {
    const kicks  = [], hats = [], snares = [];
    for (let i = 1; i <= 10; i++) {
      kicks.push(`sounds/kick${i}.wav`);
      hats.push(`sounds/hihat${i}.wav`);
      snares.push(`sounds/snare${i}.wav`);
    }
    samplePacks.unshift({ name: "Built-in", kick: kicks, hihat: hats, snare: snares });
    currentSamplePackName = "Built-in";
    if (!activeSamplePackNames.length) activeSamplePackNames.push("Built-in");
  }
}

function importMedia() {
  const input = document.createElement("input");
  input.type = "file";
  // Accept both video and audio files.
  input.accept = "video/*,audio/*";
  input.style.display = "none";
  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const media = getVideoElement();
    if (media) {
      // Replace the existing media source with the local file.
      media.src = url;
      media.load();
      // Use loadedmetadata to update progress bar width according to the media's duration
      media.addEventListener("loadedmetadata", () => {
        const progressBar = getProgressBarElement();
        if (media.tagName.toLowerCase() === "audio") {
          // For audio, use duration multiplied by a scale factor (e.g., 10px per second)
          const scaleFactor = 10;
          progressBar.style.width = (media.duration * scaleFactor) + "px";
        } else {
          // For video, simply match the video element's clientWidth
          progressBar.style.width = media.clientWidth + "px";
        }
        // Update cue markers as they depend on media duration
        updateCueMarkers();
      }, { once: true });
    } else {
      // If no media element exists, create a new video element.
      const customVideo = document.createElement("video");
      customVideo.src = url;
      customVideo.controls = true;
      customVideo.style.width = "100%";
      document.body.appendChild(customVideo);
      customVideo.addEventListener("loadedmetadata", () => {
        const progressBar = getProgressBarElement();
        if (customVideo.tagName.toLowerCase() === "audio") {
          const scaleFactor = 10;
          progressBar.style.width = (customVideo.duration * scaleFactor) + "px";
        } else {
          progressBar.style.width = customVideo.clientWidth + "px";
        }
        updateCueMarkers();
      }, { once: true });
    }
  });
  input.click();
}
/**************************************
 * Load User Samples
 **************************************/
async function loadUserSamplesFromStorage() {
  for (let type of ["kick", "hihat", "snare"]) {
    let key = "ytbm_userSamples_" + type;
    let arr = JSON.parse(localStorage.getItem(key) || "[]");
    for (let dataURL of arr) {
      try {
        let response = await fetch(dataURL);
        let arrayBuffer = await response.arrayBuffer();
        let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffers[type].push(audioBuffer);
      } catch (e) {
        console.error("Error loading user sample for", type, e);
      }
    }
  }
}

function safeSeekVideo(_, time) {
  jumpToCue(time);
}

// Define global variable for Reels support:
var enableReelsSupport = true;

function getVideoElement() {
  // First look for a video; if none, try for an audio.
  let media = document.querySelector("video") || document.querySelector("audio");
  if (!media && enableReelsSupport) {
    if (window.location.href.includes("/shorts/") || window.location.href.includes("/reels/")) {
      media = document.querySelector("ytd-reel-video-renderer video") ||
              document.querySelector("ytd-shorts video");
    }
  }
  return media;
}

// Updated progress bar lookup function
function getProgressBarElement() {
  let progressBar = document.querySelector('.ytp-progress-bar');
  
  if (!progressBar && enableReelsSupport) {
    progressBar = document.querySelector('ytd-reel-video-renderer .ytp-progress-bar') ||
                  document.querySelector('ytd-shorts .ytp-progress-bar');
  }
  
  if (!progressBar) {
    const media = getVideoElement();
    if (media) {
      progressBar = document.createElement("div");
      progressBar.className = "ytp-progress-bar";
      progressBar.style.position = "relative";
      
      // For audio elements, set width based on duration; for video, use media.clientWidth.
      if (media.tagName.toLowerCase() === "audio") {
        const scaleFactor = 10; // 10 pixels per second; adjust as needed
        if (media.duration && !isNaN(media.duration)) {
          progressBar.style.width = (media.duration * scaleFactor) + "px";
        } else {
          // Fallback if duration is not yet available.
          progressBar.style.width = "300px";
          media.addEventListener("loadedmetadata", function updateWidth() {
            progressBar.style.width = (media.duration * scaleFactor) + "px";
            // Remove the listener after updating
            media.removeEventListener("loadedmetadata", updateWidth);
          });
        }
      } else {
        progressBar.style.width = media.clientWidth + "px";
      }
      
      progressBar.style.height = "5px";  // adjust as needed
      progressBar.style.background = "#ccc"; // or your preferred background
      
      // Append the progress bar immediately after the media element.
      media.parentElement.insertBefore(progressBar, media.nextSibling);
    }
  }
  
  return progressBar;
}
 window.addEventListener("resize", () => {
  // Just call updateCueMarkers(), do NOT force .style.width
  updateCueMarkers();
});

document.addEventListener("fullscreenchange", () => {
  // Same here, no forced width
  updateCueMarkers();
});

// Ensure markers are updated when video is ready
const video = getVideoElement();
if (video) {
  video.addEventListener("loadeddata", () => {
    // Reapply cue markers when a new video (or ad) loads.
    updateCueMarkers();
  });
}

function updateVideoWithCues() {
  const video = getVideoElement();
  if (video) {
    // Attach the listener once (we flag it to avoid adding it repeatedly)
    if (!video._hasCueKeyListener) {
      video.addEventListener(
        "keydown",
        (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key >= "0" && e.key <= "9") {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        true // use capture phase
      );
      video._hasCueKeyListener = true;
    }
  }
  if (video && video.duration) {
    updateCueMarkers();
  }
}

// On Double-Click a Marker to Delete
function onMarkerDoubleClick(key) {
  delete cuePoints[key];
  saveCuePoints();
  updateCueMarkers();
}

// Add or Update Cue
function addCue(key, time) {
  cuePoints[key] = time;
  saveCuePoints();
  updateCueMarkers();
}

// Listen for video playback time and update markers
const videoEl = getVideoElement();
if (videoEl) {
  videoEl.addEventListener("timeupdate", updateVideoWithCues);
}

async function loadAudio(path) {
  try {
    const isExternal = /^(data:|blob:|https?:)/.test(path);
    const url = isExternal ? path : chrome.runtime.getURL(path);
    let r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP error ${r.status}`);
    let b = await r.arrayBuffer();
    return audioContext.decodeAudioData(b);
  } catch (e) {
    console.error("Failed to load audio file:", path, e);
    alert(`Error loading ${path}!`);
    return null;
  }
}

/**************************************
 * Audio Looper
 **************************************/
function startRecording() {
  ensureAudioContext().then(async () => {
    if (looperState !== "idle" || !audioContext) return;
    bus1RecGain.gain.value = videoAudioEnabled ? 1 : 1;
    bus2RecGain.gain.value = 1;
    bus3RecGain.gain.value = 0;
    bus4RecGain.gain.value = 1;

    if (audioContext.audioWorklet) {
      if (!loopRecorderNode) {
        loopRecorderNode = await createLoopRecorderNode(audioContext);
      }
      recordedFrames = [];
      loopRecorderNode.port.onmessage = (e) => {
        loopRecorderNode.port.onmessage = null;
        recordedFrames = e.data;
        mainRecorderMix.disconnect(loopRecorderNode);
        processLoopFromFrames(recordedFrames);
      };
      mainRecorderMix.connect(loopRecorderNode);
      loopRecorderNode.port.postMessage('start');
    } else {
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(destinationNode.stream);
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = processLoopFromBlob;
      mediaRecorder.start();
    }

    looperState = "recording";
    updateLooperButtonColor();
    updateExportButtonColor();
    if (window.refreshMinimalState) window.refreshMinimalState();
  });
}

function stopRecordingAndPlay() {
  if (loopRecorderNode) {
    loopRecorderNode.port.postMessage('stop');
  } else if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

function playLoop() {
  ensureAudioContext().then(() => {
    if (!loopBuffer || !audioContext) return;
    stopLoopSource();
    loopSource = audioContext.createBufferSource();
    loopSource.buffer = loopBuffer;
    loopSource.loop = true;
    loopSource.playbackRate.value = (pitchTarget === "loop") ? getCurrentPitchRate() : 1;
    loopSource.connect(loopAudioGain);
    loopStartAbsoluteTime = audioContext.currentTime;
    loopSource.start(0);
  });
}

function stopLoopSource() {
  if (loopSource) {
    loopSource.stop();
    loopSource.disconnect();
    loopSource = null;
  }
}

function toggleOverdub() {
  ensureAudioContext().then(() => {
    if (!loopBuffer || looperState === "idle") return;
    if (looperState === "playing") {
      looperState = "overdubbing";
      updateLooperButtonColor();
      updateExportButtonColor();
      if (window.refreshMinimalState) window.refreshMinimalState();
      doOverdubCycle();
    } else if (looperState === "overdubbing") {
      stopOverdubImmediately();
      if (window.refreshMinimalState) window.refreshMinimalState();
    }
  });
}

function doOverdubCycle() {
  if (!loopBuffer || looperState !== "overdubbing") return;
  clearOverdubTimers();

  bus1RecGain.gain.value = 1;
  bus2RecGain.gain.value = 1;
  bus3RecGain.gain.value = 0;
  bus4RecGain.gain.value = 1;

  let d = loopBuffer.duration;
  let now = audioContext.currentTime;
  let elapsed = (now - loopStartAbsoluteTime) % d;
  let remain = d - elapsed;

  overdubStartTimeout = setTimeout(() => startOverdubRecording(d), remain * 1000);
}

function startOverdubRecording(loopDur) {
  bus3RecGain.gain.value = 0;

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(destinationNode.stream);
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = processOverdub;
  mediaRecorder.start();

  overdubStopTimeout = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }, loopDur * 1000);
}

async function processOverdub() {
  if (looperState !== "overdubbing") return;
  let blob = new Blob(recordedChunks, { type: "audio/webm" });
  let arr = await blob.arrayBuffer();
  let overdubBuf = await audioContext.decodeAudioData(arr);

  let peak = measurePeak(overdubBuf);
  if (peak > 1.0) scaleBuffer(overdubBuf, 1.0 / peak);
  applyFadeToBuffer(overdubBuf, 0.01);

  pushUndoState();
  loopBuffer = mixBuffers(loopBuffer, overdubBuf);
  applyFadeToBuffer(loopBuffer, 0.01);

  looperState = "playing";
  playLoop();
  updateLooperButtonColor();
  updateExportButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function stopOverdubImmediately() {
  if (looperState === "overdubbing") {
    clearOverdubTimers();
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    } else {
      looperState = "playing";
      updateLooperButtonColor();
    }
  }
}

function stopLoop() {
  clearOverdubTimers();
  stopLoopSource();
  looperState = "idle";
  updateLooperButtonColor();
  updateExportButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function eraseAudioLoop() {
  if (loopBuffer) pushUndoState();
  clearOverdubTimers();
  stopLoopSource();
  looperState = "idle";
  loopBuffer = null;
  updateExportButtonColor();
  updateLooperButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function clearOverdubTimers() {
  if (overdubStartTimeout) clearTimeout(overdubStartTimeout);
  if (overdubStopTimeout) clearTimeout(overdubStopTimeout);
  overdubStartTimeout = null;
  overdubStopTimeout = null;
}


/**************************************
 * Video Looper
 **************************************/
function onVideoLooperButtonMouseDown() {
  let now = Date.now();
  let delta = now - lastClickTimeVideo;
  if (delta < clickDelay) {
    isDoublePressVideo = true;
    doublePressHoldStartTimeVideo = now;
  } else {
    isDoublePressVideo = false;
  }
  lastClickTimeVideo = now;
}

function onVideoLooperButtonMouseUp() {
  if (isDoublePressVideo) {
    eraseVideoLoop();
    isDoublePressVideo = false;
  } else {
    singlePressActionVideo();
  }
}

function singlePressActionVideo() {
  ensureAudioContext().then(() => {
    if (videoLooperState === "idle") {
      if (!videoPreviewURL) {
        startVideoRecording();
      } else {
        videoLooperState = "playing";
        playVideoLoop();
      }
    } else if (videoLooperState === "recording") {
      stopVideoRecording();
    } else if (videoLooperState === "playing") {
      stopVideoLoop();
    }
    updateVideoLooperButtonColor();
    updateExportButtonColor();
    if (window.refreshMinimalState) window.refreshMinimalState();
  });
}

function eraseVideoLoop() {
  if (videoPreviewURL) pushUndoState();
  stopVideoLoop();
  if (videoPreviewElement) {
    videoPreviewElement.remove();
    videoPreviewElement = null;
  }
  if (videoPreviewURL) {
    URL.revokeObjectURL(videoPreviewURL);
    videoPreviewURL = null;
  }
  updateVideoLooperButtonColor();
  updateExportButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function startVideoRecording() {
  if (videoLooperState !== "idle") return;
  videoRecordedChunks = [];

  let mv = getVideoElement();
  if (!mv) return;
  // forceVideoPlayOnce(mv);

  bus1RecGain.gain.value = videoAudioEnabled ? 1 : 0;
  bus2RecGain.gain.value = 1;
  bus3RecGain.gain.value = audioLoopInVideo ? 1 : 0;
  bus4RecGain.gain.value = 1;

  // —————————— REMOVE OR COMMENT OUT THIS LINE ——————————
  // if (loFiCompActive) {
  //   postCompGain.connect(mainRecorderMix); 
  // }
  // ————————————————————————————————————————————————

  let captureStream = mv.captureStream?.() || null;
  if (!captureStream) {
    alert("Unable to capture video stream!");
    return;
  }
  let videoTracks = captureStream.getVideoTracks();
  let allTracks = [...videoTracks, ...videoDestination.stream.getAudioTracks()];
  let finalStream = new MediaStream(allTracks);

  let mime = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
  try {
    videoMediaRecorder = new MediaRecorder(finalStream, { mimeType: mime });
  } catch (e) {
    mime = "video/webm;codecs=vp9,opus";
    videoMediaRecorder = new MediaRecorder(finalStream, { mimeType: mime });
  }

  videoMediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) videoRecordedChunks.push(e.data);
  };
  videoMediaRecorder.onstop = () => {
    bus1RecGain.gain.value = 1;
    bus2RecGain.gain.value = 1;
    bus3RecGain.gain.value = 0;
    bus4RecGain.gain.value = 1;
    if (videoLooperState === "recording") {
      pushUndoState();
      let blob = new Blob(videoRecordedChunks, { type: mime });
      videoPreviewURL = URL.createObjectURL(blob);
      createOrUpdateVideoPreviewElement();
      videoLooperState = "playing";
      updateVideoLooperButtonColor();
      updateExportButtonColor();
      playVideoLoop();
      if (window.refreshMinimalState) window.refreshMinimalState();
    }
  };
  videoMediaRecorder.onerror = err => {
    console.error("Video recording error:", err);
    alert("Video recording failed!");
  };
  videoMediaRecorder.start();

  videoLooperState = "recording";
  updateVideoLooperButtonColor();
  updateExportButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function stopVideoRecording() {
  if (videoMediaRecorder && videoMediaRecorder.state === "recording") {
    videoMediaRecorder.stop();
  }
}

function playVideoLoop() {
  if (!videoPreviewURL || !videoPreviewElement) return;
  videoPreviewElement.loop = true;
  videoPreviewElement.currentTime = 0;
  videoPreviewElement.play().catch(() => {});
}

function stopVideoLoop() {
  if (videoPreviewElement) {
    videoPreviewElement.pause();
    videoPreviewElement.currentTime = 0;
  }
  videoLooperState = "idle";
  updateVideoLooperButtonColor();
  updateExportButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function forceVideoPlayOnce(vid) {
  if (!vid) return;
  if (vid.paused) {
    vid.play().catch(() => {});
  }
}

function createOrUpdateVideoPreviewElement() {
  if (!videoPreviewElement) {
    videoPreviewElement = document.createElement("video");
    videoPreviewElement.style.position = "fixed";
    videoPreviewElement.style.bottom = "80px";
    videoPreviewElement.style.left = "20px";
    videoPreviewElement.style.width = "400px";
    videoPreviewElement.style.zIndex = "999999";
    makeVideoPreviewDraggable(videoPreviewElement);
    document.body.appendChild(videoPreviewElement);

    let dragThreshold = 5, isDragging = false, startX, startY;
    videoPreviewElement.addEventListener("mousedown", e => {
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
    });
    videoPreviewElement.addEventListener("mousemove", e => {
      if (Math.abs(e.clientX - startX) > dragThreshold ||
          Math.abs(e.clientY - startY) > dragThreshold) {
        isDragging = true;
      }
    });
    videoPreviewElement.addEventListener("mouseup", () => {
      if (!isDragging) {
        if (!videoPreviewElement.paused) {
          videoPreviewElement.pause();
          videoPreviewElement.currentTime = 0;
          videoLooperState = "idle";
        } else {
          videoLooperState = "playing";
          videoPreviewElement.play().catch(() => {});
        }
        updateVideoLooperButtonColor();
        updateExportButtonColor();
        if (window.refreshMinimalState) window.refreshMinimalState();
      }
    });
  }
  videoPreviewElement.src = videoPreviewURL;
  videoPreviewElement.preservesPitch = false;
  videoPreviewElement.playbackRate = 1;
  videoPreviewElement.style.display = "block";
}


/**************************************
 * Import Audio for Looper
 **************************************/
let isImporting = false;
async function onImportAudioClicked() {
  ensureAudioContext().then(async () => {
    if (isImporting) return;
    isImporting = true;
    try {
      let input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", async e => {
        let file = e.target.files[0];
        if (!file) { isImporting = false; return; }
        try {
          let arr = await file.arrayBuffer();
          let decoded = await audioContext.decodeAudioData(arr);

          pushUndoState();
          loopBuffer = decoded;
          applyFadeToBuffer(loopBuffer, 0.01);
          looperState = "playing";
          playLoop();
          updateLooperButtonColor();
          updateExportButtonColor();
          if (window.refreshMinimalState) window.refreshMinimalState();
        } catch (err) {
          console.error("Error importing audio loop:", err);
          alert("Error importing audio file!");
        } finally {
          document.body.removeChild(input);
          isImporting = false;
        }
      });
      input.click();
    } catch (err) {
      console.error("Import error:", err);
      isImporting = false;
    }
  });
}


/**************************************
 * User Sample Import & Persistence
 **************************************/
async function onImportSampleClicked(type) {
  await ensureAudioContext();
  const files = await pickSampleFiles(`Select ${type} samples to add`);
  if (!files.length) return;

  const pack = samplePacks.find(p => p.name === currentSamplePackName);
  const canSave = Boolean(pack);

  pushUndoState();

  for (const file of files) {
    try {
      const arr = await file.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arr);
      audioBuffers[type].push(decoded);
      currentSampleIndex[type] = audioBuffers[type].length - 1;

      if (canSave) {
        const url = await new Promise(r => {
          const fr = new FileReader();
          fr.onload = () => r(fr.result);
          fr.readAsDataURL(file);
        });
        pack[type].push(url);
        sampleOrigin[type].push({ packName: pack.name, index: pack[type].length - 1 });
      } else {
        sampleOrigin[type].push(null);
      }
    } catch (err) {
      console.error("Error importing sample:", err);
    }
  }

  saveSamplePacksToLocalStorage();
  saveMappingsToLocalStorage();
  updateSampleDisplay(type);
  refreshSamplePackDropdown();
}
function saveUserSampleDataURL(type, dataURL) {
  let key = "ytbm_userSamples_" + type;
  let arr = JSON.parse(localStorage.getItem(key) || "[]");
  arr.push(dataURL);
  localStorage.setItem(key, JSON.stringify(arr));
}


/**************************************
 * Cue Points
 **************************************/
function pasteCuesFromLink() {
  let pasted = prompt("Paste YouTube link with cues:");
  if (!pasted) return;
  try {
    let url = new URL(pasted);
    let param = url.searchParams.get("cue_points");
    if (param) {
      pushUndoState();
      cuePoints = {};
      param.split(",").forEach(pair => {
        let [k, t] = pair.split(":");
        if (k && t) cuePoints[k] = parseFloat(t);
      });
      saveCuePointsToURL();
      updateCueMarkers();
      refreshCuesButton();
      if (window.refreshMinimalState) window.refreshMinimalState();
      alert("Cues pasted and updated!");
    } else {
      alert("No cue_points parameter found in the URL.");
    }
  } catch (e) {
    alert("Invalid URL!");
  }
}

function randomizeCuesInOneClick() {
  const vid = getVideoElement();
  if (!vid || !vid.duration) return;
  pushUndoState();
  const cues = [];
  for (let i = 0; i < 10; i++) {
    cues.push(Math.random() * vid.duration);
  }
  cues.sort((a, b) => a - b);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  cuePoints = {};
  for (let i = 0; i < keys.length; i++) {
    cuePoints[keys[i]] = cues[i];
  }
  saveCuePointsToURL();
  updateCueMarkers();
  refreshCuesButton();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

// Call this function when the page first loads (or when you detect a new video)
setupVideoCueListener();

// Load cue points from URL or localStorage
function loadCuePoints() {
  let storedCuePoints = localStorage.getItem("cuePoints");
  if (storedCuePoints) {
    cuePoints = JSON.parse(storedCuePoints);
  } else {
    // Set default cue points or random ones
    cuePoints = { "1": 10, "2": 20, "3": 30 };
  }
}

// Save cue points to URL and localStorage
function saveCuePoints() {
  localStorage.setItem("cuePoints", JSON.stringify(cuePoints));
  let url = new URL(window.location.href);
  let cueParam = Object.entries(cuePoints).map(([key, time]) => `${key}:${time}`).join(',');
  url.searchParams.set('cue_points', cueParam);
  window.history.replaceState(null, "", url);
}

function setupVideoCueListener() {
  const video = getVideoElement();
  if (!video) return;
  // Remove any previously attached listener if needed.
  video.removeEventListener("loadedmetadata", loadCuePointsAtStartup);
  video.addEventListener("loadedmetadata", loadCuePointsAtStartup);
}

function loadCuePointsAtStartup() {
  const vid = getVideoElement();
  if (!vid || !vid.duration) return;

  // Always clear old cues
  cuePoints = {};

  // Try to load cues from the URL first.
  if (loadCuePointsFromURLParam()) return;

  const vidID = getCurrentVideoID();
  if (vidID) {
    const storeKey = "ytbm_cues_" + vidID;
    const stored = localStorage.getItem(storeKey);
    if (stored) {
      try {
        const obj = JSON.parse(stored);
        // Only keep cues within the video duration.
        for (let key in obj) {
          if (obj[key] <= vid.duration) {
            cuePoints[key] = obj[key];
          }
        }
      } catch (e) {
        console.warn("Error parsing stored cues:", e);
      }
    }
  }
  // If no valid cues, randomize.
  if (Object.keys(cuePoints).length === 0) {
    randomizeCuesInOneClick();
  } else {
    updateCueMarkers();
  refreshCuesButton();
  if (window.refreshMinimalState) {
    window.refreshMinimalState();
  }

  // --- ADD THESE LINES BELOW ---
  // Reset pitch to 0% so that when a new video starts, 
  // the pitch fader and video playback are back in sync.
  pitchPercentage = 0;      // Our main "percent" variable
  videoPitchPercentage = 0; // Optional, if you also want the "video" target to be 0
  loopPitchPercentage = 0;  // Optional, if you want the "loop" pitch to be 0
  updatePitch(0);           // This call updates all UI sliders and playback rates
}
}

function loadCuePointsFromURLParam() {
  let u = new URL(window.location.href);
  let p = u.searchParams.get("cue_points");
  if (!p) return false;
  let foundAny = false;
  p.split(",").forEach(pair => {
    let [k, t] = pair.split(":");
    if (k && t) {
      cuePoints[k] = parseFloat(t);
      foundAny = true;
    }
  });
  if (foundAny) {
    updateCueMarkers();
    refreshCuesButton();
  }
  return foundAny;
}

function getCurrentVideoID() {
  try {
    let url = new URL(window.location.href);
    return url.searchParams.get("v") || "";
  } catch (e) {
    return "";
  }
}

function saveCuePointsToURL() {
  let u = new URL(window.location.href);
  let s = Object.entries(cuePoints).map(([k, t]) => k + ":" + t.toFixed(3)).join(",");
  u.searchParams.set("cue_points", s);
  window.history.replaceState(null, "", u);

  let vidID = getCurrentVideoID();
  if (vidID) {
    localStorage.setItem("ytbm_cues_" + vidID, JSON.stringify(cuePoints));
  }
}

function scheduleSaveCuePoints() {
  if (cueSaveTimeout) clearTimeout(cueSaveTimeout);
  cueSaveTimeout = setTimeout(() => {
    cueSaveTimeout = null;
    saveCuePointsToURL();
  }, 150);
}

function observeProgressBar() {
  const progressBar = getProgressBarElement();
  if (!progressBar) return;
  
  const observer = new MutationObserver((mutationsList, observer) => {
    // When YouTube re‑renders the progress bar, update your cues.
    updateCueMarkers();
  });
  
  observer.observe(progressBar, { childList: true, subtree: true });
  
  // Optionally, disconnect the observer when no longer needed.
  return observer;
}

function updateCueMarkers() {
  const bar = getProgressBarElement();
  if (!bar) return;

  // If blind mode is active, skip rendering
  if (blindMode) {
    const existingOverlay = bar.querySelector('#ytbm-cue-overlay');
    if (existingOverlay) existingOverlay.innerHTML = "";
    return;
  }

  // Create/find the overlay that fills the bar
  let overlay = bar.querySelector('#ytbm-cue-overlay');
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "ytbm-cue-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.zIndex = "40"; 
    overlay.style.pointerEvents = "auto";
    bar.appendChild(overlay);
  }
  overlay.innerHTML = ""; // Clear existing markers

  const vid = getVideoElement();
  if (!vid || !vid.duration) return;

  // For each cue
  Object.entries(cuePoints).forEach(([key, time]) => {
    const marker = document.createElement("div");
    marker.className = "cue-marker";

    // Position horizontally as a fraction of the bar
    marker.style.position = "absolute";
    marker.style.left = (time / vid.duration) * 100 + "%";

    // *** This line ensures the marker is centered at that percentage: ***
    marker.style.transform = "translateX(-50%)";

    // Style your marker as you wish
    marker.style.width = "1px";
    marker.style.height = "15px";
    marker.style.top = "-10px";
    marker.style.backgroundColor = "black";
    marker.style.cursor = "pointer";
    marker.style.zIndex = "2147483647";

    // Optionally add a red circle on top:
    const topcap = document.createElement("div");
    topcap.style.position = "absolute";
    topcap.style.top = "-5px";
    topcap.style.left = "-3px";
    topcap.style.width = "7px";
    topcap.style.height = "7px";
    topcap.style.borderRadius = "50%";
    topcap.style.backgroundColor = "red";
    marker.appendChild(topcap);

    marker.addEventListener("dblclick", e => {
      e.preventDefault();
      e.stopPropagation();
      pushUndoState();
      delete cuePoints[key];
      saveCuePointsToURL();
      updateCueMarkers();
      refreshCuesButton();
      if (window.refreshMinimalState) window.refreshMinimalState();
    });

    // If you support dragging, keep your existing mousedown logic here:
    marker.addEventListener("mousedown", e => {
      onMarkerMouseDown(e, key, marker);
    });

    overlay.appendChild(marker);
  });
}

function updateVideoWithCues() {
  // If a cue marker is being dragged, do not update the markers.
  if (draggingMarker) return;

  let vid = getVideoElement();
  if (vid && vid.duration) {
    updateCueMarkers();
  }
}

function onMarkerMouseDown(e, key, marker) {
  e.stopPropagation();
  e.preventDefault();

// Make sure we know where the progress bar is, so mousemove calculations work:
const bar = getProgressBarElement();
if (bar) {
  progressBarRect = bar.getBoundingClientRect();
}

  draggingMarker = marker;
  draggingCueIndex = key;
  document.body.style.userSelect = "none";
}


function onDocumentMouseMove(e) {
  if (!draggingMarker || !progressBarRect) return;
  let vid = getVideoElement();
  if (!vid || !vid.duration) return;
  let rx = e.clientX - progressBarRect.left;
  let pc = Math.max(0, Math.min(1, rx / progressBarRect.width));
  draggingMarker.style.left = (pc * 100) + "%";
}

function onDocumentMouseUp(e) {
  if (!draggingMarker || !progressBarRect) return;
  let vid = getVideoElement();
  if (!vid || !vid.duration) {
    draggingMarker = null;
    draggingCueIndex = null;
    document.body.style.userSelect = "";
    return;
  }
  pushUndoState();
  let rx = e.clientX - progressBarRect.left;
  let pc = Math.max(0, Math.min(1, rx / progressBarRect.width));
  cuePoints[draggingCueIndex] = pc * vid.duration;
  saveCuePointsToURL();
  draggingMarker = null;
  draggingCueIndex = null;
  document.body.style.userSelect = "";
}

function handleProgressBarDoubleClickForNewCue() {
  const bar = document.querySelector(".ytp-progress-bar");
  if (!bar) return;
  addTrackedListener(bar, "dblclick", e => {
    if (e.metaKey) {
      e.stopPropagation();
      e.preventDefault();
      let vid = getVideoElement();
      if (!vid) return;
      let rx = e.clientX - bar.getBoundingClientRect().left;
      let pc = Math.max(0, Math.min(1, rx / bar.getBoundingClientRect().width));
      addCueAtTime(pc * vid.duration);
    }
  });
}

function addCueAtTime(t) {
  let c = Object.keys(cuePoints).length;
  if (c >= 10) return;
  pushUndoState();
  let k = ["1","2","3","4","5","6","7","8","9","0"].find(key => !(key in cuePoints)) || "0";
  cuePoints[k] = t;
  saveCuePointsToURL();
  updateCueMarkers();
  refreshCuesButton();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function addCueAtCurrentVideoTime() {
  let vid = getVideoElement();
  if (!vid) return;
  let c = Object.keys(cuePoints).length;
  if (c >= 10) return;
  pushUndoState();
  let k = ["1","2","3","4","5","6","7","8","9","0"].find(key => !(key in cuePoints)) || "0";
  cuePoints[k] = vid.currentTime;
  saveCuePointsToURL();
  updateCueMarkers();
  refreshCuesButton();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function adjustSelectedCue(dt) {
  if (!selectedCueKey) return;
  const vid = getVideoElement();
  if (!vid || cuePoints[selectedCueKey] === undefined) return;
  const dur = vid.duration || Infinity;
  let t = cuePoints[selectedCueKey] + dt;
  t = Math.max(0, Math.min(dur, t));
  cuePoints[selectedCueKey] = t;
  scheduleSaveCuePoints();
  updateCueMarkers();
  refreshCuesButton();
}

function computeCueAdjustDelta(val) {
  if (lastCueAdjustValue === null) {
    lastCueAdjustValue = val;
    lastCueAdjustDirection = 0;
    return 0;
  }

  let diff = val - lastCueAdjustValue;

  if (diff === 0) {
    diff = lastCueAdjustDirection;
  } else {
    if (diff > 64) diff -= 128;
    else if (diff < -64) diff += 128;
    lastCueAdjustDirection = diff > 0 ? 1 : diff < 0 ? -1 : lastCueAdjustDirection;
  }

  lastCueAdjustValue = val;
  return diff;
}

function refreshCuesButton() {
  if (!cuesButton) return;
  let c = Object.keys(cuePoints).length;
  if (c >= 10) {
    cuesButton.innerText = `EraseCues(${c}/10)`;
    cuesButton.style.background = "#C22";
    cuesButton.onclick = () => {
      pushUndoState();
      cuePoints = {};
      saveCuePointsToURL();
      updateCueMarkers();
      refreshCuesButton();
      if (window.refreshMinimalState) window.refreshMinimalState();
    };
  } else {
    cuesButton.innerText = `AddCue(${c}/10)`;
    cuesButton.style.background = "#333";
    cuesButton.onclick = e => {
      if (e.ctrlKey || e.metaKey) {
        if (c > 0) {
          pushUndoState();
          cuePoints = {};
          saveCuePointsToURL();
          updateCueMarkers();
          refreshCuesButton();
          if (window.refreshMinimalState) window.refreshMinimalState();
        }
      } else {
        addCueAtCurrentVideoTime();
      }
    };
  }
}

function copyCueLink() {
  let url = new URL(window.location.href);
  let s = Object.entries(cuePoints)
    .map(([k, t]) => k + ":" + t.toFixed(3))
    .join(",");
  url.searchParams.set("cue_points", s);
  let fullLink = url.toString();
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(fullLink)
      .then(() => alert("Link copied with cues!"))
      .catch(() => alert("Unable to copy link."));
  } else {
    prompt("Copy this link:", fullLink);
  }
}

function triggerPadCue(padIndex) {
    let cueKey = (padIndex + 1) % 10;
    cueKey = cueKey === 0 ? "0" : String(cueKey);
    sequencerTriggerCue(cueKey);
    console.log(`Pad ${padIndex} cue triggered via sequencer`);
  }

function sequencerTriggerCue(cueKey) {
  const video = getVideoElement();
  if (!video) return;
  selectedCueKey = cueKey;
  lastCueAdjustValue = null;
  lastCueAdjustDirection = 0;
  
  if (cuePoints.hasOwnProperty(cueKey)) {
    const fadeTime = 0.002; // fade duration in seconds (50ms)
    const now = audioContext.currentTime;
    
    // Fade out: cancel any previous gain changes, then ramp down
    videoGain.gain.cancelScheduledValues(now);
    videoGain.gain.setValueAtTime(videoGain.gain.value, now);
    videoGain.gain.linearRampToValueAtTime(0, now + fadeTime);
    
    // After fadeTime seconds, jump to cue and fade back in
    setTimeout(() => {
      video.currentTime = cuePoints[cueKey];
      const t = audioContext.currentTime;
      videoGain.gain.setValueAtTime(0, t);
      videoGain.gain.linearRampToValueAtTime(1, t + fadeTime);
      console.log(`Sequencer triggered cue ${cueKey} at time ${cuePoints[cueKey]}`);
    }, fadeTime * 1000);
  } else {
    console.warn(`No cue defined for key "${cueKey}"`);
  }
}


/**************************************
 * Sample Navigation
 **************************************/
function changeSample(type, direction) {
  if (!audioBuffers[type].length) return;
  pushUndoState();
  currentSampleIndex[type] += direction;
  const len = audioBuffers[type].length;
  if (currentSampleIndex[type] >= len) {
    currentSampleIndex[type] = 0;
  } else if (currentSampleIndex[type] < 0) {
    currentSampleIndex[type] = len - 1;
  }
  updateSampleDisplay(type);
}

function randomSample(type) {
  if (!audioBuffers[type].length) return;
  pushUndoState();
  currentSampleIndex[type] = Math.floor(Math.random() * audioBuffers[type].length);
  updateSampleDisplay(type);
}

function deleteCurrentSample(type) {
  const idx = currentSampleIndex[type];
  const meta = sampleOrigin[type][idx];
  if (!meta) return;
  const pack = samplePacks.find(p => p.name === meta.packName);
  if (!pack) return;
  if (pack.name === "Built-in" && meta.index < BUILTIN_DEFAULT_COUNT) return;
  if (!confirm(`Remove this ${type} sample from pack “${pack.name}”?`)) return;
  pack[type].splice(meta.index, 1);
  audioBuffers[type].splice(idx, 1);
  sampleOrigin[type].splice(idx, 1);
  sampleOrigin[type].forEach(m => {
    if (m.packName === meta.packName && m.index > meta.index) m.index--;
  });
  if (currentSampleIndex[type] >= audioBuffers[type].length) {
    currentSampleIndex[type] = audioBuffers[type].length - 1;
  }
  saveSamplePacksToLocalStorage();
  saveMappingsToLocalStorage();
  updateSampleDisplay(type);
  refreshSamplePackDropdown();
}

function updateSampleDisplay(type) {
  const displays = document.querySelectorAll(`.sample-display-${type}`);
  displays.forEach(display => {
    let total = audioBuffers[type].length;
    let idx = currentSampleIndex[type];
    display.textContent = `${idx + 1}/${total}`;
  });
}

function randomizeAllSamples() {
  pushUndoState();
  randomSample("kick");
  randomSample("hihat");
  randomSample("snare");
}

document.addEventListener("keydown", e => {
  console.log("Key:", e.key, "Code:", e.code, "KeyCode:", e.keyCode);
});

function sequencerTriggerCue(cueKey) {
  const video = getVideoElement();
  if (!video || !cuePoints[cueKey]) return;
  selectedCueKey = cueKey;
  lastCueAdjustValue = null;
  lastCueAdjustDirection = 0;
  const fadeTime = 0.002; // 50ms fade
  const now = audioContext.currentTime;
  
  // Cancel any scheduled changes and ramp down the gain
  videoGain.gain.cancelScheduledValues(now);
  videoGain.gain.setValueAtTime(videoGain.gain.value, now);
  videoGain.gain.linearRampToValueAtTime(0, now + fadeTime);
  
  // After the fade out, jump to the new cue and fade back in
  setTimeout(() => {
    video.currentTime = cuePoints[cueKey];
    const t = audioContext.currentTime;
    videoGain.gain.setValueAtTime(0, t);
    videoGain.gain.linearRampToValueAtTime(1, t + fadeTime);
  }, fadeTime * 1000);
  
  console.log(`Sequencer triggered cue ${cueKey} at time ${cuePoints[cueKey]}`);
}

function isTypingInTextField(e) {
  // Skip entirely if it's a range input
  if (e.target.tagName.toLowerCase() === "input") {
    const inputType = e.target.getAttribute("type")?.toLowerCase();
    if (inputType === "range") {
      // Range faders should NOT block keystrokes:
      return false;
    }
  }

  // Otherwise, block if it's a normal text input, textarea, or contentEditable
  const tag = e.target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    e.target.isContentEditable
  );
}

/**************************************
 * Keyboard & Sample Triggers
 **************************************/
function onKeyDown(e) {
  if (isTypingInTextField(e)) {
  return;
}
  // Check for Cmd+Delete to toggle visuals.
  if (e.metaKey && (e.key === "Delete" || e.key === "Backspace" || e.keyCode === 46)) {
    e.preventDefault();
    toggleHideVisuals();
    return;
  }
  // If Cmd+Enter is pressed, trigger the export function.
  if (e.metaKey && e.key === "Enter") {
    e.preventDefault();
    exportLoop();
    return;
  }
  
  // Declare a single lowercase key variable
  const k = e.key.toLowerCase();
  
  if (e.key.toLowerCase() === "i") {
  e.preventDefault();
  importMedia();
  return;
}

  
  // NEW: If "p" is pressed, randomize all samples.
  if (k === "p") {
    e.preventDefault();
    randomizeAllSamples();
    return;
  }
  
  // Trigger cue points when keys 1-0 are pressed.
  if ((e.key >= "1" && e.key <= "9") || e.key === "0") {
    let video = getVideoElement();
    if (video && cuePoints[e.key] !== undefined) {
      selectedCueKey = e.key;
      lastCueAdjustValue = null;
      lastCueAdjustDirection = 0;
      const fadeTime = 0.002; // 50ms fade duration
      const now = audioContext.currentTime;
      // Fade out the audio
      videoGain.gain.cancelScheduledValues(now);
      videoGain.gain.setValueAtTime(videoGain.gain.value, now);
      videoGain.gain.linearRampToValueAtTime(0, now + fadeTime);
      // After fade out, change cue and fade back in
      setTimeout(() => {
        video.currentTime = cuePoints[e.key];
        const t = audioContext.currentTime;
        videoGain.gain.setValueAtTime(0, t);
        videoGain.gain.linearRampToValueAtTime(1, t + fadeTime);
      }, fadeTime * 1000);
    }
  }
  
  // For other keys, e.g. randomizing cues:
  if (k === extensionKeys.randomCues.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    randomizeCuesInOneClick();
    return;
  }
  // Reverb/cassette
  if (k === extensionKeys.reverb.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    toggleReverb();
    return;
  }
  if (k === extensionKeys.cassette.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    toggleCassette();
    return;
  }
  if (k === extensionKeys.compressor.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    toggleCompressor();
    return;
  }
  if (k === extensionKeys.eq.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    toggleEQFilter();
    return;
  }
  if (k === extensionKeys.looper.toLowerCase()) {
    onLooperButtonMouseDown();
    return;
  }
  if (k === extensionKeys.videoLooper.toLowerCase()) {
    onVideoLooperButtonMouseDown();
    return;
  }
  if (k === extensionKeys.undo.toLowerCase()) {
    if (e.ctrlKey || e.metaKey) {
      redoAction();
    } else {
      undoAction();
    }
    return;
  }
  if (k === extensionKeys.pitchDown) {
    updatePitch(Math.max(pitchPercentage - 1, -50));
    return;
  }
  if (k === extensionKeys.pitchUp) {
    updatePitch(Math.min(pitchPercentage + 1, 100));
    return;
  }

  for (let [sn, kc] of Object.entries(sampleKeys)) {
    if (k === kc.toLowerCase()) {
      playSample(sn);
      return;
    }
  }
  for (let us of userSamples) {
    if (k === us.key?.toLowerCase()) {
      playUserSample(us);
      return;
    }
  }

  let vid = getVideoElement();
  if ((e.ctrlKey || e.metaKey) && k >= "0" && k <= "9") {
    // Prevent YouTube's default behavior (jumping in the video)
    e.preventDefault();
    e.stopPropagation();

    pushUndoState();
    cuePoints[e.key] = vid.currentTime;
    saveCuePointsToURL();
    updateCueMarkers();
    refreshCuesButton();
    if (window.refreshMinimalState) window.refreshMinimalState();
    return;
  }
}

function onKeyUp(e) {
  const k = e.key.toLowerCase();
  if (isTypingInTextField(e)) {
  return;
}
  if (k === extensionKeys.looper.toLowerCase()) {
    onLooperButtonMouseUp();
  }
  if (k === extensionKeys.videoLooper.toLowerCase()) {
    onVideoLooperButtonMouseUp();
  }
  // Remove the undo handling here because it's handled in onKeyDown.
}
addTrackedListener(document, "keydown", onKeyDown);
addTrackedListener(document, "keyup", onKeyUp);

function playSample(n) {
  ensureAudioContext().then(() => {
    let samples = audioBuffers[n];
    if (!samples.length) return;
    const buffer = samples[currentSampleIndex[n]];
    if (!buffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = sampleVolumes[n] || 1;
    source.connect(gainNode).connect(samplesGain);

    // When the sound is finished, disconnect the nodes.
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };

    source.start(0);
  });
}
function playUserSample(us) {
  ensureAudioContext().then(() => {
    if (!us.buffer) return;
    let s = audioContext.createBufferSource();
    s.buffer = us.buffer;
    s.playbackRate.value = 1;
    let g = audioContext.createGain();
    g.gain.value = 1;
    s.connect(g).connect(samplesGain);
    s.start(0);
  });
}

function onLooperButtonMouseDown() {
  const now = Date.now();

  // 1) Record this press time
  pressTimes.push(now);

  // 2) Clear out old presses (older than ~300ms)
  const cutoff = now - clickDelay;
  while (pressTimes.length && pressTimes[0] < cutoff) {
    pressTimes.shift();
  }

  // 3) Check if this press is within 300ms of the last press => double press
  const delta = now - lastClickTime;
  if (delta < clickDelay) {
    isDoublePress = true;
  } else {
    isDoublePress = false;
  }

  lastClickTime = now;
}

function onLooperButtonMouseUp() {
  // First check for triple press (3 quick presses within ~600ms)
  if (pressTimes.length === 3) {
    const tFirst = pressTimes[0];
    const tLast  = pressTimes[2];
    if (tLast - tFirst < clickDelay * 2) {
      console.log("TRIPLE PRESS => STOP AUDIO LOOP");
      stopLoop();

      // Clear out so we don't also do single/double logic
      pressTimes = [];
      isDoublePress = false;
      return;
    }
  }

  // If not triple, either double or single
  if (isDoublePress) {
    // DOUBLE PRESS => always STOP
    console.log("DOUBLE PRESS => STOP AUDIO LOOP");
    stopLoop();

    isDoublePress = false;
    pressTimes = [];

  } else {
    // SINGLE PRESS => start or overdub
    console.log("SINGLE PRESS => START/OVERDUB");
    singlePressAudioLooperAction();
    pressTimes = [];
  }
}

function singlePressAudioLooperAction() {
  if (looperState === "idle") {
    startRecording();
  } else if (looperState === "recording") {
    stopRecordingAndPlay();
  } else {
    toggleOverdub();
  }
}

function onUndoButtonMouseDown() {
  let now = Date.now();
  let delta = now - undoLastClickTime;
  undoIsDoublePress = (delta < clickDelay);
  undoLastClickTime = now;
}
function onUndoButtonMouseUp() {
  if (undoIsDoublePress) {
    redoAction();
    undoIsDoublePress = false;
  } else {
    undoAction();
  }
}


/**************************************
 * Export Functionality
 **************************************/
function exportLoop() {
  ensureAudioContext().then(() => {
    if (videoLooperState !== "idle" && videoPreviewURL) {
      let a = document.createElement("a");
      a.style.display = "none";
      a.href = videoPreviewURL;
      a.download = videoMediaRecorder?.mimeType?.includes("mp4") ? "loop.mp4" : "loop.webm";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (loopBuffer) {
      let r = (pitchTarget === "loop") ? getCurrentPitchRate() : 1;
      if (Math.abs(r - 1) < 0.01) {
        let wav = encodeWAV(loopBuffer);
        let url = URL.createObjectURL(wav);
        let a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = "loop.wav";
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
      } else {
        exportAudioWithPitch(r);
      }
    }
  });
}
async function exportAudioWithPitch(rate) {
  if (!loopBuffer) return;
  let dst = audioContext.createMediaStreamDestination();
  let chunks = [];
  let mr;
  try {
    mr = new MediaRecorder(dst.stream, { mimeType: "audio/webm" });
  } catch (e) {
    mr = new MediaRecorder(dst.stream);
  }
  mr.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mr.onstop = async () => {
    let blob = new Blob(chunks, { type: "audio/webm" });
    let arr = await blob.arrayBuffer();
    let decoded = await audioContext.decodeAudioData(arr);
    let wav = encodeWAV(decoded);
    let url = URL.createObjectURL(wav);
    let a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = "loop-pitched.wav";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
  };
  mr.start();

  let src = audioContext.createBufferSource();
  src.buffer = loopBuffer;
  src.playbackRate.value = rate;
  src.connect(dst);
  src.start();

  let dur = loopBuffer.duration / rate;
  setTimeout(() => {
    if (mr.state === "recording") mr.stop();
    src.stop();
  }, dur * 1000);
}

function encodeWAV(buf) {
  let ch = buf.numberOfChannels, sr = buf.sampleRate, dataCh = [];
  for (let i = 0; i < ch; i++) {
    dataCh.push(buf.getChannelData(i));
  }
  let interleaved;
  if (ch === 2) {
    let L = dataCh[0], R = dataCh[1],
        length = L.length + R.length;
    interleaved = new Float32Array(length);
    for (let i = 0, j = 0; i < L.length; i++, j += 2) {
      interleaved[j] = L[i];
      interleaved[j + 1] = R[i];
    }
  } else {
    interleaved = dataCh[0];
  }
  let buffer = floatToWav(interleaved, sr, ch);
  return new Blob([buffer], { type: "audio/wav" });
}
function floatToWav(i, sr, ch) {
  let bitsPerSample = 16,
      blockAlign = ch * bitsPerSample / 8,
      byteRate = sr * blockAlign,
      dataSize = i.length * 2;
  let buffer = new ArrayBuffer(44 + dataSize);
  let view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let n = 0; n < i.length; n++) {
    let s = Math.max(-1, Math.min(1, i[n]));
    s = s < 0 ? s * 32768 : s * 32767;
    view.setInt16(offset, s, true);
    offset += 2;
  }
  return buffer;
}
function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ─── DETECT-BPM UTIL ────────────────────────────────────────────
function analyseBPMFromEnergies(energies) {
  // ❶ get frame-to-frame RMS values
  const vals  = energies.map(o => o.e);
  const times = energies.map(o => o.t);

  // ❷ dynamic threshold = 60 % of the peak energy
  const thresh = Math.max(...vals) * 0.6;
  const peaks  = [];
  for (let i = 1; i < vals.length - 1; i++) {
    if (vals[i] > thresh && vals[i] > vals[i - 1] && vals[i] > vals[i + 1])
      peaks.push(times[i]);
  }
  if (peaks.length < 2) return null;

  // ❸ time gaps → BPM candidates
  const gaps = [];
  for (let i = 1; i < peaks.length; i++) gaps.push((peaks[i] - peaks[i - 1]) / 1000);
  gaps.sort((a, b) => a - b);
  const period = gaps[Math.floor(gaps.length / 2)];
  let bpm = 60 / period;

  // ❹ auto-correct double/half
  while (bpm > 200) bpm /= 2;
  while (bpm < 80)  bpm *= 2;
  return Math.round(bpm);
}

/**************************************
 * Minimal UI Bar
 **************************************/
// Updated minimal UI container builder
function buildMinimalUIBar() {
  // Try to get the container where you want to insert the minimal UI.
  let container = document.querySelector(".ytp-right-controls");
if (!container) {
  // Attempt a second known element, e.g. the main .ytp-chrome-controls
  container = document.querySelector(".ytp-chrome-controls");
}

// If still not found, fall back:
if (!container) {
  container = document.body;
}
  
  minimalUIContainer = document.createElement("div");
  minimalUIContainer.className = "ytbm-minimal-bar";
  minimalUIContainer.style.display = "none";
  minimalUIContainer.style.alignItems = "center";
  minimalUIContainer.style.gap = "8px";
  // Now proceed to insert your minimalUIContainer
container.insertBefore(minimalUIContainer, container.firstChild);

  let pitchWrap = document.createElement("div");
  pitchWrap.style.display = "flex";
  pitchWrap.style.alignItems = "center";
  pitchWrap.style.gap = "4px";

  let label = document.createElement("span");
  label.style.color = "#fff";
  label.style.fontSize = "11px";
  label.innerText = "Pitch";
  pitchWrap.appendChild(label);

  let sldr = document.createElement("input");
  sldr.type = "range";
  sldr.min = -50;
  sldr.max = 100;
  sldr.value = pitchPercentage;
  sldr.step = 1;
  sldr.style.width = "60px";
  sldr.className = "looper-btn";
  sldr.title = "Pitch (%)";
  sldr.addEventListener("input", e => updatePitch(parseInt(e.target.value, 10)));
  sldr.addEventListener("dblclick", () => {
    sldr.value = 0;
    updatePitch(0);
  });
  pitchWrap.appendChild(sldr);

  let valSpan = document.createElement("span");
  valSpan.style.marginLeft = "8px";
  valSpan.style.color = "#fff";
  valSpan.style.fontSize = "11px";
  valSpan.style.width = "40px";
  valSpan.style.textAlign = "right";
  valSpan.innerText = pitchPercentage + "%";
  pitchWrap.appendChild(valSpan);

  pitchTargetButtonMin = document.createElement("button");
  pitchTargetButtonMin.className = "looper-btn";
  pitchTargetButtonMin.innerText = (pitchTarget === "video") ? "Vid" : "Loop";
  pitchTargetButtonMin.title = "Toggle Pitch Target (Video / Loop)";
  pitchTargetButtonMin.addEventListener("click", () => {
    pushUndoState();
    togglePitchTarget();
    pitchTargetButtonMin.innerText = (pitchTarget === "video") ? "Vid" : "Loop";
  });
  pitchWrap.appendChild(pitchTargetButtonMin);

  minimalPitchLabel = valSpan;
  minimalUIContainer.appendChild(pitchWrap);

  eqButtonMin = document.createElement("button");
  eqButtonMin.className = "looper-btn";
  eqButtonMin.innerText = "EQ:Off";
  eqButtonMin.title = "Toggle EQ Filter On/Off";
  eqButtonMin.style.backgroundColor = "#444";
  eqButtonMin.addEventListener("click", () => {
    toggleEQFilter();
    refreshMinimalState();
  });
  minimalUIContainer.appendChild(eqButtonMin);

  compButtonMin = document.createElement("button");
  compButtonMin.className = "looper-btn";
  compButtonMin.innerText = "Comp:Off";
  compButtonMin.title = "Toggle Lo-Fi Compressor On/Off";
  compButtonMin.style.backgroundColor = "#444";
  compButtonMin.addEventListener("click", () => {
    toggleCompressor();
    refreshMinimalState();
  });
  minimalUIContainer.appendChild(compButtonMin);

  // Reverb + Cassette
  reverbButtonMin = document.createElement("button");
  reverbButtonMin.className = "looper-btn";
  reverbButtonMin.innerText = "Rev:Off";
  reverbButtonMin.title = "Toggle Reverb On/Off";
  reverbButtonMin.style.backgroundColor = "#444";
  reverbButtonMin.addEventListener("click", () => {
    toggleReverb();
    refreshMinimalState();
  });
  minimalUIContainer.appendChild(reverbButtonMin);

  cassetteButtonMin = document.createElement("button");
  cassetteButtonMin.className = "looper-btn";
  cassetteButtonMin.innerText = "Tape:Off";
  cassetteButtonMin.title = "Toggle Cassette On/Off";
  cassetteButtonMin.style.backgroundColor = "#444";
  cassetteButtonMin.addEventListener("click", () => {
    toggleCassette();
    refreshMinimalState();
  });
  minimalUIContainer.appendChild(cassetteButtonMin);

  let cuesBtnMin = document.createElement("button");
  cuesBtnMin.className = "looper-btn";
  cuesBtnMin.innerText = "Cue+";
  cuesBtnMin.title = "Add or Erase Cues (Cmd => Erase)";
  cuesBtnMin.addEventListener("click", e => {
    let cc = Object.keys(cuePoints).length;
    pushUndoState();
    if (e.metaKey || e.ctrlKey) {
      if (cc > 0) {
        cuePoints = {};
        saveCuePointsToURL();
        updateCueMarkers();
      }
    } else {
      if (cc >= 10) {
        cuePoints = {};
        saveCuePointsToURL();
        updateCueMarkers();
      } else {
        addCueAtCurrentVideoTime();
      }
    }
    refreshMinimalState();
  });
  minimalUIContainer.appendChild(cuesBtnMin);

  let loopBtnMin = document.createElement("button");
  loopBtnMin.className = "looper-btn";
  loopBtnMin.innerText = "Looper(R/V)";
  loopBtnMin.title = "Audio/Video Looper";
  addTrackedListener(loopBtnMin, "mousedown", e => {
    ensureAudioContext().then(() => {
      if (e.metaKey || e.ctrlKey) onVideoLooperButtonMouseDown();
      else onLooperButtonMouseDown();
    });
  });
  addTrackedListener(loopBtnMin, "mouseup", e => {
    ensureAudioContext().then(() => {
      if (e.metaKey || e.ctrlKey) onVideoLooperButtonMouseUp();
      else onLooperButtonMouseUp();
    });
  });
  minimalUIContainer.appendChild(loopBtnMin);

  let exportBtnMin = document.createElement("button");
  exportBtnMin.className = "looper-btn";
  exportBtnMin.innerText = "Export";
  exportBtnMin.title = "Export Loop";
  exportBtnMin.addEventListener("click", exportLoop);
  minimalUIContainer.appendChild(exportBtnMin);

  let undoBtnMin = document.createElement("button");
  undoBtnMin.className = "looper-btn";
  undoBtnMin.innerText = "Undo";
  undoBtnMin.title = "Undo/Redo (Double Press => Redo)";
  undoBtnMin.addEventListener("click", () => {
  // Single click triggers an undo
  undoAction();
});

undoBtnMin.addEventListener("dblclick", () => {
  // Double click triggers a redo
  redoAction();
});
  minimalUIContainer.appendChild(undoBtnMin);
  
  let importMediaBtn = document.createElement("button");
importMediaBtn.className = "looper-btn";
importMediaBtn.innerText = "Import Media";
importMediaBtn.title = "Import a local video or audio file (Cmd+I)";
importMediaBtn.addEventListener("click", importMedia);
minimalUIContainer.appendChild(importMediaBtn);

  let importBtnMin = document.createElement("button");
  importBtnMin.className = "looper-btn";
  importBtnMin.innerText = "Import loop";
  importBtnMin.title = "Import an Audio Loop for the Looper";
  importBtnMin.addEventListener("click", onImportAudioClicked);
  minimalUIContainer.appendChild(importBtnMin);
  
  // *** Add the Mic button here ***
    addMicButtonToMinimalUI();

  randomCuesButtonMin = document.createElement("button");
  randomCuesButtonMin.className = "looper-btn";
  randomCuesButtonMin.innerText = "RndCues";
  randomCuesButtonMin.title = "Randomize 10 cues (sorted)";
  randomCuesButtonMin.addEventListener("click", () => {
    pushUndoState();
    randomizeCuesInOneClick();
  });
  minimalUIContainer.appendChild(randomCuesButtonMin);

  let advBtnMin = document.createElement("button");
  advBtnMin.className = "looper-btn";
  advBtnMin.innerText = "Advanced";
  advBtnMin.title = "Open the Advanced Panel";
  advBtnMin.addEventListener("click", goAdvancedUI);
  minimalUIContainer.appendChild(advBtnMin);

  minimalUIContainer.style.display = minimalActive ? "flex" : "none";

  function refreshMinimalState() {
    if (minimalPitchLabel) minimalPitchLabel.innerText = pitchPercentage + "%";
    if (sldr) sldr.value = pitchPercentage;
    if (pitchTargetButtonMin) {
      pitchTargetButtonMin.innerText = (pitchTarget === "video") ? "Vid" : "Loop";
    }

    let cc = Object.keys(cuePoints).length;
    if (cuesBtnMin) {
      if (cc < 10) {
        cuesBtnMin.innerText = `Cue+(${cc}/10)`;
        cuesBtnMin.style.backgroundColor = "#333";
      } else {
        cuesBtnMin.innerText = `EraseCues(${cc}/10)`;
        cuesBtnMin.style.backgroundColor = "#C22";
      }
    }
    updateMinimalLoopButtonColor(loopBtnMin);
    updateMinimalExportColor(exportBtnMin);

    eqButtonMin.innerText = "EQ:" + (eqFilterActive ? "On" : "Off");
    eqButtonMin.style.backgroundColor = eqFilterActive ? "darkcyan" : "#444";

    // Update the minimal compressor button based on the current mode
  if (loFiCompActive) {
    switch (compMode) {
      case "native":
        compButtonMin.innerText = "Comp: Native";
        compButtonMin.style.backgroundColor = "darkorange";
        break;
      case "boss303":
        compButtonMin.innerText = "Comp: Ultra Tape";
        compButtonMin.style.backgroundColor = "cornflowerblue";
        break;
      case "roland404":
        compButtonMin.innerText = "Comp: Bright Open";
        compButtonMin.style.backgroundColor = "mediumorchid";
        break;
      default:
        compButtonMin.innerText = "Comp: On";
        compButtonMin.style.backgroundColor = "#444";
        break;
    }
  } else {
    compButtonMin.innerText = "Comp: Off";
    compButtonMin.style.backgroundColor = "#222";
  }

    reverbButtonMin.innerText = "Rev:" + (reverbActive ? "On" : "Off");
    reverbButtonMin.style.backgroundColor = reverbActive ? "#4287f5" : "#444";

    cassetteButtonMin.innerText = "Tape:" + (cassetteActive ? "On" : "Off");
    cassetteButtonMin.style.backgroundColor = cassetteActive ? "#b05af5" : "#444";
  }
  window.refreshMinimalState = refreshMinimalState;
}


/**************************************
 * UI Toggle
 **************************************/
function goAdvancedUI() {
  minimalActive = false;
  if (panelContainer) panelContainer.style.display = "block";
  // Remove any minimal UI containers present in the DOM.
  document.querySelectorAll('.ytbm-minimal-bar').forEach(el => el.remove());
  minimalUIContainer = null;
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function goMinimalUI() {
  if (blindMode) return; // do not show the minimal UI if blind mode is active
  minimalActive = true;
  if (panelContainer) panelContainer.style.display = "none";
  // Rebuild the minimal UI if it doesn't exist.
  if (!minimalUIContainer) {
    buildMinimalUIBar();
    addTouchButtonToMinimalUI();
  } else {
    minimalUIContainer.style.display = "flex";
  }
  if (window.refreshMinimalState) window.refreshMinimalState();
  // Make sure Mic + Detect-BPM buttons exist every time we return
  addMicButtonToMinimalUI();
}

/**************************************
 * Advanced Panel
 **************************************/
function addControls() {
  injectCustomCSS();

  panelContainer = document.createElement("div");
  panelContainer.className = "looper-panel-container vertical";
  panelContainer.style.position = "fixed";
  panelContainer.style.top = "20px";
  panelContainer.style.right = "20px";
  panelContainer.style.display = "none";
  document.body.appendChild(panelContainer);
  restorePanelPosition(panelContainer, "ytbm_panelPos");

  dragHandle = document.createElement("div");
  dragHandle.className = "looper-drag-handle";
  dragHandle.innerText = "YT Beatmaker Cues";
  panelContainer.appendChild(dragHandle);

  let cw = document.createElement("div");
  cw.className = "looper-content-wrap";
  panelContainer.appendChild(cw);

  buildSamplePackDropdown();

  buildOutputDeviceDropdown(cw);
  buildMonitorInputDropdown(cw);
  buildMonitorToggle(cw);

  buildInputDeviceDropdown(cw);
  updateMonitorSelectColor();

  makePanelDraggable(panelContainer, dragHandle, "ytbm_panelPos");

  let pitchWrap = document.createElement("div");
  pitchWrap.style.display = "flex";
  pitchWrap.style.alignItems = "center";
  pitchWrap.style.gap = "8px";
  pitchWrap.style.marginBottom = "8px";
  cw.appendChild(pitchWrap);

  let pitchLabel = document.createElement("span");
  pitchLabel.innerText = "Pitch:";
  pitchLabel.style.width = "50px";
  pitchWrap.appendChild(pitchLabel);

  pitchSliderElement = document.createElement("input");
  pitchSliderElement.type = "range";
  pitchSliderElement.min = -50;
  pitchSliderElement.max = 100;
  pitchSliderElement.value = pitchPercentage;
  pitchSliderElement.step = 1;
  pitchSliderElement.style.flex = "1";
  pitchSliderElement.style.maxWidth = "150px";
  pitchSliderElement.addEventListener("input", e => updatePitch(parseInt(e.target.value, 10)));
  pitchSliderElement.addEventListener("dblclick", () => {
    pitchSliderElement.value = 0;
    updatePitch(0);
  });
  pitchWrap.appendChild(pitchSliderElement);

  advancedPitchLabel = document.createElement("span");
  advancedPitchLabel.innerText = pitchPercentage + "%";
  advancedPitchLabel.style.width = "50px";
  advancedPitchLabel.style.textAlign = "right";
  pitchWrap.appendChild(advancedPitchLabel);

  pitchTargetButton = document.createElement("button");
  pitchTargetButton.className = "looper-btn";
  pitchTargetButton.innerText = (pitchTarget === "video") ? "Video" : "Loop";
  pitchTargetButton.style.width = "60px";
  pitchTargetButton.addEventListener("click", () => {
    pushUndoState();
    togglePitchTarget();
    pitchTargetButton.innerText = (pitchTarget === "video") ? "Video" : "Loop";
  });
  pitchWrap.appendChild(pitchTargetButton);

  let looperButtonRow = document.createElement("div");
  looperButtonRow.style.display = "flex";
  looperButtonRow.style.gap = "4px";
  looperButtonRow.style.marginBottom = "8px";

  unifiedLooperButton = document.createElement("button");
  unifiedLooperButton.className = "looper-btn";
  unifiedLooperButton.innerText = "AudioLooper(R)";
  unifiedLooperButton.addEventListener("mousedown", onLooperButtonMouseDown);
  unifiedLooperButton.addEventListener("mouseup", onLooperButtonMouseUp);
  looperButtonRow.appendChild(unifiedLooperButton);

  videoLooperButton = document.createElement("button");
  videoLooperButton.className = "looper-btn";
  videoLooperButton.innerText = "VideoLooper(V)";
  videoLooperButton.addEventListener("mousedown", onVideoLooperButtonMouseDown);
  videoLooperButton.addEventListener("mouseup", onVideoLooperButtonMouseUp);
  looperButtonRow.appendChild(videoLooperButton);

  cw.appendChild(looperButtonRow);

  const createSampleRow = (type, label) => {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.marginBottom = "8px";

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.alignItems = "center";
    topRow.style.gap = "4px";
    topRow.style.width = "100%";

    const typeLabel = document.createElement("span");
    typeLabel.innerText = label + ":";
    typeLabel.style.width = "50px";
    topRow.appendChild(typeLabel);

    const importBtn = document.createElement("button");
    importBtn.className = "looper-btn";
    importBtn.innerText = "Imp";
    importBtn.title = `Import ${label} sample`;
    importBtn.style.flexShrink = "0";
    importBtn.addEventListener("click", () => onImportSampleClicked(type));
    topRow.appendChild(importBtn);

    const navContainer = document.createElement("div");
    navContainer.style.display = "flex";
    navContainer.style.gap = "2px";
    navContainer.style.flexGrow = "1";

    const prevBtn = document.createElement("button");
    prevBtn.className = "looper-btn";
    prevBtn.innerText = "◀";
    prevBtn.style.flexShrink = "0";
    prevBtn.addEventListener("click", () => changeSample(type, -1));
    navContainer.appendChild(prevBtn);

    const nextBtn = document.createElement("button");
    nextBtn.className = "looper-btn";
    nextBtn.innerText = "▶";
    nextBtn.style.flexShrink = "0";
    nextBtn.addEventListener("click", () => changeSample(type, 1));
    navContainer.appendChild(nextBtn);

    const randBtn = document.createElement("button");
    randBtn.className = "looper-btn";
    randBtn.innerText = "Rand";
    randBtn.style.flexShrink = "0";
    randBtn.addEventListener("click", () => randomSample(type));
    navContainer.appendChild(randBtn);

    topRow.appendChild(navContainer);

    const sampleDisplay = document.createElement("span");
    sampleDisplay.className = `sample-display-${type}`;
    sampleDisplay.style.minWidth = "30px";
    sampleDisplay.textContent = `1/${audioBuffers[type].length}`;
    topRow.appendChild(sampleDisplay);

    const delBtn = document.createElement("button");
    delBtn.className = `looper-btn sample-del-btn-${type}`;
    delBtn.innerText = "🗑";
    delBtn.title = `Delete current ${label} sample`;
    delBtn.style.flexShrink = "0";
    delBtn.addEventListener("click", () => deleteCurrentSample(type));
    topRow.appendChild(delBtn);

    container.appendChild(topRow);

    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.alignItems = "center";
    bottomRow.style.justifyContent = "space-between";
    bottomRow.style.marginTop = "2px";
    bottomRow.style.marginLeft = "50px";

    const fader = document.createElement("input");
    fader.type = "range";
    fader.min = -60;
    fader.max = 6;
    fader.value = 0;
    fader.step = 1;
    fader.style.width = "100%";
    fader.style.flexGrow = "1";
    fader.addEventListener("input", e => {
      const dbVal = parseFloat(e.target.value);
      onSampleVolumeFaderChange(type, dbVal);
    });
    fader.addEventListener("dblclick", () => {
      fader.value = 0;
      onSampleVolumeFaderChange(type, 0);
    });
    bottomRow.appendChild(fader);

    const dbLabel = document.createElement("span");
    dbLabel.style.width = "40px";
    dbLabel.style.textAlign = "right";
    dbLabel.innerText = "0 dB";
    bottomRow.appendChild(dbLabel);

    container.appendChild(bottomRow);
    return { container, fader, dbLabel, sampleDisplay };
  };

  const kickControls = createSampleRow("kick", "Kick");
  cw.appendChild(kickControls.container);
  kickFader = kickControls.fader;
  kickDBLabel = kickControls.dbLabel;

  const hihatControls = createSampleRow("hihat", "Hihat");
  cw.appendChild(hihatControls.container);
  hihatFader = hihatControls.fader;
  hihatDBLabel = hihatControls.dbLabel;

  const snareControls = createSampleRow("snare", "Snare");
  cw.appendChild(snareControls.container);
  snareFader = snareControls.fader;
  snareDBLabel = snareControls.dbLabel;

  const actionWrap = document.createElement('div');
  actionWrap.style.display = 'flex';
  actionWrap.style.flexWrap = 'wrap';
  actionWrap.style.gap = '4px';
  cw.appendChild(actionWrap);

  const randomAllBtn = document.createElement("button");
  randomAllBtn.className = "looper-btn";
  randomAllBtn.innerText = "Rand All";
  randomAllBtn.style.flex = '1 1 calc(50% - 4px)';
  randomAllBtn.addEventListener("click", randomizeAllSamples);
  actionWrap.appendChild(randomAllBtn);

  exportButton = document.createElement("button");
  exportButton.className = "looper-btn";
  exportButton.innerText = "Export";
  exportButton.addEventListener("click", exportLoop);
  exportButton.style.flex = '1 1 calc(50% - 4px)';
  actionWrap.appendChild(exportButton);

  undoButton = document.createElement("button");
  undoButton.className = "looper-btn";
  undoButton.innerText = "Undo/Redo";
  undoButton.style.flex = '1 1 calc(50% - 4px)';
  undoButton.addEventListener("click", (e) => {
  if (e.detail === 1) {
    // Single click: undo
    undoAction();
  } else if (e.detail === 2) {
    // Double click: redo
    redoAction();
  }
});

  actionWrap.appendChild(undoButton);
  
  let importMediaAdvBtn = document.createElement("button");
  importMediaAdvBtn.className = "looper-btn";
  importMediaAdvBtn.innerText = "Import Media";
  importMediaAdvBtn.style.flex = '1 1 calc(50% - 4px)';
  importMediaAdvBtn.title = "Import a local video or audio file (Cmd+I)";
  importMediaAdvBtn.addEventListener("click", importMedia);
  actionWrap.appendChild(importMediaAdvBtn);

  importAudioButton = document.createElement("button");
  importAudioButton.className = "looper-btn";
  importAudioButton.innerText = "ImportLoop";
  importAudioButton.style.flex = '1 1 calc(50% - 4px)';
  importAudioButton.title = "Import an audio file as loop";
  importAudioButton.addEventListener("click", onImportAudioClicked);
  actionWrap.appendChild(importAudioButton);

  cuesButton = document.createElement("button");
  cuesButton.className = "looper-btn";
  cuesButton.innerText = "AddCue";
  cuesButton.style.flex = '1 1 calc(50% - 4px)';
  cuesButton.addEventListener("click", addCueAtCurrentVideoTime);
  actionWrap.appendChild(cuesButton);

  randomCuesButton = document.createElement("button");
  randomCuesButton.className = "looper-btn";
  randomCuesButton.innerText = "RndCues";
  randomCuesButton.style.flex = '1 1 calc(50% - 4px)';
  randomCuesButton.addEventListener("click", randomizeCuesInOneClick);
  actionWrap.appendChild(randomCuesButton);

  const copyCuesButton = document.createElement("button");
  copyCuesButton.className = "looper-btn";
  copyCuesButton.innerText = "Copy Cues";
  copyCuesButton.style.flex = '1 1 calc(50% - 4px)';
  copyCuesButton.title = "Copy YouTube link with cues embedded";
  copyCuesButton.addEventListener("click", copyCueLink);
  actionWrap.appendChild(copyCuesButton);

  const pasteCuesButton = document.createElement("button");
  pasteCuesButton.className = "looper-btn";
  pasteCuesButton.innerText = "Paste Cues";
  pasteCuesButton.style.flex = '1 1 calc(50% - 4px)';
  pasteCuesButton.title = "Paste a YouTube link with cues to update them";
  pasteCuesButton.addEventListener("click", pasteCuesFromLink);
  actionWrap.appendChild(pasteCuesButton);
/*
  videoAudioToggleButton = document.createElement("button");
  videoAudioToggleButton.className = "looper-btn";
  videoAudioToggleButton.innerText = "VideoAudio:On";
  videoAudioToggleButton.addEventListener("click", () => {
    pushUndoState();
    videoAudioEnabled = !videoAudioEnabled;
    videoAudioToggleButton.innerText = "VideoAudio:" + (videoAudioEnabled ? "On" : "Off");
  });
  cw.appendChild(videoAudioToggleButton);

  loopInVidButton = document.createElement("button");
  loopInVidButton.className = "looper-btn";
  loopInVidButton.innerText = "LoopInVid:On";
  loopInVidButton.addEventListener("click", () => {
    pushUndoState();
    audioLoopInVideo = !audioLoopInVideo;
    loopInVidButton.innerText = "LoopInVid:" + (audioLoopInVideo ? "On" : "Off");
  });
  cw.appendChild(loopInVidButton);
*/
  manualButton = document.createElement("button");
  manualButton.className = "looper-btn";
  manualButton.innerText = "Manual";
  manualButton.style.flex = '1 1 calc(50% - 4px)';
  manualButton.addEventListener("click", showManualWindowToggle);
  actionWrap.appendChild(manualButton);

  keyMapButton = document.createElement("button");
  keyMapButton.className = "looper-btn";
  keyMapButton.innerText = "KeyMap";
  keyMapButton.style.flex = '1 1 calc(50% - 4px)';
  keyMapButton.addEventListener("click", showKeyMapWindowToggle);
  actionWrap.appendChild(keyMapButton);

  midiMapButton = document.createElement("button");
  midiMapButton.className = "looper-btn";
  midiMapButton.innerText = "MIDIMap";
  midiMapButton.style.flex = '1 1 calc(50% - 4px)';
  midiMapButton.addEventListener("click", showMIDIMapWindowToggle);
  actionWrap.appendChild(midiMapButton);

  // Reverb + Cassette
  reverbButton = document.createElement("button");
  reverbButton.className = "looper-btn";
  reverbButton.innerText = "Reverb:Off";
  reverbButton.style.flex = '1 1 calc(50% - 4px)';
  reverbButton.addEventListener("click", () => {
    toggleReverb();
    reverbButton.innerText = "Reverb:" + (reverbActive ? "On" : "Off");
    updateReverbButtonColor();
  });
  actionWrap.appendChild(reverbButton);

  cassetteButton = document.createElement("button");
  cassetteButton.className = "looper-btn";
  cassetteButton.innerText = "Cassette:Off";
  cassetteButton.style.flex = '1 1 calc(50% - 4px)';
  cassetteButton.addEventListener("click", () => {
    toggleCassette();
    cassetteButton.innerText = "Cassette:" + (cassetteActive ? "On" : "Off");
    updateCassetteButtonColor();
  });
  actionWrap.appendChild(cassetteButton);

  eqButton = document.createElement("button");
  eqButton.className = "looper-btn";
  eqButton.innerText = "EQ/Filter";
  eqButton.style.flex = '1 1 calc(50% - 4px)';
  eqButton.addEventListener("click", () => {
    showEQWindowToggle();
  });
  actionWrap.appendChild(eqButton);

  loFiCompButton = document.createElement("button");
  loFiCompButton.className = "looper-btn";
  loFiCompButton.innerText = "LoFiComp:Off";
  loFiCompButton.style.flex = '1 1 calc(50% - 4px)';
  loFiCompButton.style.background = "#444";
  loFiCompButton.addEventListener("click", async () => {
    await ensureAudioContext();
    pushUndoState();
    toggleCompressor();
    loFiCompButton.innerText = "LoFiComp:" + (loFiCompActive ? "On" : "Off");
  });
  actionWrap.appendChild(loFiCompButton);

  let compFaderRow = document.createElement("div");
  compFaderRow.style.display = "flex";
  compFaderRow.style.alignItems = "center";
  compFaderRow.style.justifyContent = "space-between";

  let compFaderLabel = document.createElement("span");
  compFaderLabel.innerText = "CompLevel:";
  compFaderLabel.style.width = "70px";
  compFaderRow.appendChild(compFaderLabel);

  loFiCompFader = document.createElement("input");
  loFiCompFader.type = "range";
  loFiCompFader.min = "0";
  loFiCompFader.max = "200";
  loFiCompFader.value = String(loFiCompDefaultValue);
  loFiCompFader.step = "1";
  loFiCompFader.style.width = "80px";
  loFiCompFader.addEventListener("input", e => {
    let val = parseFloat(e.target.value);
    postCompGain.gain.value = val / 100;
    loFiCompFaderValueLabel.innerText = val + " %";
  });
  loFiCompFader.addEventListener("dblclick", () => {
    loFiCompFader.value = String(loFiCompDefaultValue);
    postCompGain.gain.value = loFiCompDefaultValue / 100;
    loFiCompFaderValueLabel.innerText = loFiCompDefaultValue + " %";
  });
  compFaderRow.appendChild(loFiCompFader);

  loFiCompFaderValueLabel = document.createElement("span");
  loFiCompFaderValueLabel.innerText = loFiCompDefaultValue + " %";
  loFiCompFaderValueLabel.style.width = "40px";
  loFiCompFaderValueLabel.style.textAlign = "right";
  compFaderRow.appendChild(loFiCompFaderValueLabel);
  cw.appendChild(compFaderRow);

  minimalUIButton = document.createElement("button");
  minimalUIButton.className = "looper-btn";
  minimalUIButton.innerText = "Close";
  minimalUIButton.addEventListener("click", goMinimalUI);
  cw.appendChild(minimalUIButton);

  updateLooperButtonColor();
  updateVideoLooperButtonColor();
  updateExportButtonColor();
  updateEQButtonColor();
  updateCompButtonColor();
  updateReverbButtonColor();
  updateCassetteButtonColor();
}


/**************************************
 * EQ / Filter Window
 **************************************/
async function showEQWindowToggle() {
  await ensureAudioContext();
  if (!eqWindowContainer) {
    buildEQWindow();
    eqWindowContainer.style.display = "block";
  } else {
    eqWindowContainer.style.display =
      eqWindowContainer.style.display === "block" ? "none" : "block";
  }
}

function buildEQWindow() {
  if (!eqFilterNode) return; // safety check
  eqWindowContainer = document.createElement("div");
  eqWindowContainer.className = "looper-midimap-container";
  eqWindowContainer.style.width = "280px";
  eqWindowContainer.style.overflowY = "auto"; // scrollable

  eqDragHandle = document.createElement("div");
  eqDragHandle.className = "looper-midimap-drag-handle";
  eqDragHandle.innerText = "EQ/Filter - YT Beatmaker";
  eqWindowContainer.appendChild(eqDragHandle);

  eqContentWrap = document.createElement("div");
  eqContentWrap.className = "looper-midimap-content";
  eqWindowContainer.appendChild(eqContentWrap);

  let eqHtml = `
    <h4>Filter Type</h4>
    <select id="eqFilterType">
      <option value="lowshelf">Low Shelf</option>
      <option value="lowpass">Low Pass</option>
      <option value="highpass">High Pass</option>
      <option value="peaking">Peaking</option>
      <option value="notch">Notch</option>
    </select>
    <h4>Frequency</h4>
    <input type="range" id="eqFilterFreq" min="20" max="12000" value="200" step="1">
    <span id="eqFilterFreqVal">200 Hz</span>
    <h4>Gain (for shelf/peaking)</h4>
    <input type="range" id="eqFilterGain" min="-30" max="30" value="-20" step="1">
    <span id="eqFilterGainVal">-20 dB</span>
    <h4>Apply To</h4>
    <select id="eqFilterTarget">
      <option value="video" selected>Video Audio Only</option>
      <option value="master">Master Bus</option>
    </select>
    <div style="margin-top:8px;">
      <label>
        <input type="checkbox" id="eqFilterActive">
        EQ/Filter Active
      </label>
    </div>
    <button id="eqCloseBtn" class="looper-midimap-save-btn looper-btn" style="margin-top:8px;">Close</button>
  `;

  eqContentWrap.innerHTML = eqHtml;
  document.body.appendChild(eqWindowContainer);

  makePanelDraggable(eqWindowContainer, eqDragHandle, "ytbm_eqWindowPos");
  restorePanelPosition(eqWindowContainer, "ytbm_eqWindowPos");

  let filterTypeSelect = eqWindowContainer.querySelector("#eqFilterType");
  let filterFreqSlider = eqWindowContainer.querySelector("#eqFilterFreq");
  let filterFreqVal = eqWindowContainer.querySelector("#eqFilterFreqVal");
  let filterGainSlider = eqWindowContainer.querySelector("#eqFilterGain");
  let filterGainVal = eqWindowContainer.querySelector("#eqFilterGainVal");
  let filterTargetSelect = eqWindowContainer.querySelector("#eqFilterTarget");
  let filterActiveCheck = eqWindowContainer.querySelector("#eqFilterActive");

  if (eqFilterNode) {
    filterTypeSelect.value = eqFilterNode.type;
    filterFreqSlider.value = eqFilterNode.frequency.value;
    filterFreqVal.innerText = eqFilterNode.frequency.value + " Hz";
    filterGainSlider.value = eqFilterNode.gain.value;
    filterGainVal.innerText = eqFilterNode.gain.value + " dB";
  }
  filterTargetSelect.value = eqFilterApplyTarget;
  filterActiveCheck.checked = eqFilterActive;

  filterTypeSelect.addEventListener("change", () => {
    pushUndoState();
    if (eqFilterNode) eqFilterNode.type = filterTypeSelect.value;
  });
  filterFreqSlider.addEventListener("input", () => {
    if (eqFilterNode) eqFilterNode.frequency.value = parseFloat(filterFreqSlider.value);
    filterFreqVal.innerText = filterFreqSlider.value + " Hz";
  });
  filterFreqSlider.addEventListener("change", () => {
    pushUndoState();
  });
  filterGainSlider.addEventListener("input", () => {
    if (eqFilterNode) eqFilterNode.gain.value = parseFloat(filterGainSlider.value);
    filterGainVal.innerText = filterGainSlider.value + " dB";
  });
  filterGainSlider.addEventListener("change", () => {
    pushUndoState();
  });
  filterTargetSelect.addEventListener("change", () => {
    pushUndoState();
    eqFilterApplyTarget = filterTargetSelect.value;
    applyAllFXRouting();
  });
  filterActiveCheck.addEventListener("change", () => {
    pushUndoState();
    eqFilterActive = filterActiveCheck.checked;
    applyAllFXRouting();
  });

  let closeBtn = eqWindowContainer.querySelector("#eqCloseBtn");
  closeBtn.addEventListener("click", () => {
    eqWindowContainer.style.display = "none";
  });
}


/**************************************
 * Pitch
 **************************************/
function updatePitch(v) {
  pitchPercentage = v;
  const rate = getCurrentPitchRate();

  // Apply pitch even while the video‑looper is recording
  if (pitchTarget === "video") {
    const vid = getVideoElement();
    if (vid) {
      vid.playbackRate = rate;
      vid.preservesPitch = false;
    }
    if (videoPreviewElement) {
      videoPreviewElement.playbackRate = rate;
      videoPreviewElement.preservesPitch = false;
    }
  } else {
    // pitchTarget === "loop"
    if (loopSource) {
      loopSource.playbackRate.value = rate;
    }
    // Keep the main video at normal speed
    if (videoPreviewElement) videoPreviewElement.playbackRate = 1;
    const mv = getVideoElement();
    if (mv && !mv.paused) mv.playbackRate = 1;
  }

  // Update UI elements
  if (pitchSliderElement) pitchSliderElement.value = v;
  if (advancedPitchLabel)  advancedPitchLabel.innerText = v + "%";
  if (minimalPitchLabel)   minimalPitchLabel.innerText  = v + "%";
  if (window.refreshMinimalState) window.refreshMinimalState();
}
function getCurrentPitchRate() {
  return 1 + pitchPercentage / 100;
}
function togglePitchTarget() {
  if (pitchTarget === "video") {
    videoPitchPercentage = pitchPercentage;
    pitchTarget = "loop";
    pitchPercentage = loopPitchPercentage;
    updatePitch(pitchPercentage);
  } else {
    loopPitchPercentage = pitchPercentage;
    pitchTarget = "video";
    pitchPercentage = videoPitchPercentage;
    updatePitch(pitchPercentage);
  }
}


/**************************************
 * Sample Fader
 **************************************/
function onSampleVolumeFaderChange(which, dbVal) {
  let gainVal = dbToLinear(dbVal);
  sampleVolumes[which] = gainVal;
  let labelEl = (which === "kick") ? kickDBLabel
    : (which === "hihat") ? hihatDBLabel
    : snareDBLabel;
  if (labelEl) {
    labelEl.innerText = dbVal + " dB";
  }
}
function dbToLinear(dbVal) {
  return Math.pow(10, dbVal / 20);
}


/**************************************
 * MIDI
 **************************************/
async function initializeMIDI() {
  try {
    let access = await navigator.requestMIDIAccess({ sysex: false });
    access.inputs.forEach(inp => {
      inp.onmidimessage = handleMIDIMessage;
    });
  } catch (e) {
    console.warn("MIDI unavailable:", e);
  }
}

function handleMIDIMessage(e) {
  // Filter out duplicate events which can happen on some controllers
  if (e.timeStamp === lastMidiTimestamp &&
      e.data[0] === lastMidiData[0] &&
      e.data[1] === lastMidiData[1] &&
      e.data[2] === lastMidiData[2]) {
    return;
  }
  lastMidiTimestamp = e.timeStamp;
  lastMidiData = [...e.data];

  let [st, note] = e.data;
  const command = st & 0xf0;
  if (command === 0xb0 && currentlyDetectingMidiControl) {
    midiNotes[currentlyDetectingMidiControl] = note;
    updateMidiMapInput(currentlyDetectingMidiControl, note);
    currentlyDetectingMidiControl = null;
    return;
  }

  if (note === midiNotes.shift) {
    if (st === 144) isModPressed = true;
    else if (st === 128) isModPressed = false;
    return;
	
  }
  if (currentlyDetectingMidi && st === 144) {
    if (midiNotes[currentlyDetectingMidi] !== undefined) {
      // Could be a base field or a cue
      if (typeof midiNotes[currentlyDetectingMidi] === 'number') {
        midiNotes[currentlyDetectingMidi] = note;
        updateMidiMapInput(currentlyDetectingMidi, note);
        currentlyDetectingMidi = null;
        return;
      }
    }
    if (midiNotes.cues[currentlyDetectingMidi] !== undefined) {
      midiNotes.cues[currentlyDetectingMidi] = note;
      updateMidiMapInput(currentlyDetectingMidi, note);
      currentlyDetectingMidi = null;
      return;
    }
  }

  if (command === 0xb0) {
    if (Number(note) === Number(midiNotes.cueAdjust)) {
      if (selectedCueKey) {
        let diff = computeCueAdjustDelta(e.data[2]);
        if (diff !== 0) {
          adjustSelectedCue(diff * 0.05);
        }
      }
    }
  } else if (st === 144) {
	if (Number(note) === Number(midiNotes.randomCues)) {
      randomizeCuesInOneClick();
      return;
    }
	if (note === midiNotes.undo) {
      if (isModPressed) {
        redoAction();
      } else {
        undoAction();
      }
      return;
    }
    if (note === midiNotes.pitchDown) startPitchDownRepeat();
    if (note === midiNotes.pitchUp) startPitchUpRepeat();
    if (note === midiNotes.kick) playSample("kick");
    if (note === midiNotes.hihat) playSample("hihat");
    if (note === midiNotes.snare) playSample("snare");
    if (note === midiNotes.looper) onLooperButtonMouseDown();
    if (note === midiNotes.undo) onUndoButtonMouseDown();
    if (note === midiNotes.videoLooper) onVideoLooperButtonMouseDown();
    if (note === midiNotes.eqToggle) toggleEQFilter();
    if (note === midiNotes.compToggle) toggleCompressor();
    if (note === midiNotes.reverbToggle) toggleReverb();
    if (note === midiNotes.cassetteToggle) toggleCassette();

    for (let [k, v] of Object.entries(midiNotes.cues)) {
      if (v === note) {
        let vid = getVideoElement();
        if (!vid) return;
        if (isModPressed) {
          pushUndoState();
          cuePoints[k] = vid.currentTime;
          saveCuePointsToURL();
          updateCueMarkers();
          refreshCuesButton();
          if (window.refreshMinimalState) window.refreshMinimalState();
        } else {
          if (k in cuePoints) {
        selectedCueKey = k;
        lastCueAdjustValue = null;
        lastCueAdjustDirection = 0;
        // jump with a 50 ms cross-fade, same as the keyboard path
        sequencerTriggerCue(k);
          }
        }
      }
    }
  } else if (st === 128) {
    if (note === midiNotes.pitchDown) stopPitchDownRepeat();
    if (note === midiNotes.pitchUp) stopPitchUpRepeat();
    if (note === midiNotes.looper) onLooperButtonMouseUp();
    // if (note === midiNotes.undo) onUndoButtonMouseUp();
    if (note === midiNotes.videoLooper) onVideoLooperButtonMouseUp();
  }
}

function startPitchDownRepeat() {
  if (pitchDownInterval) return;
  pitchDownInterval = setInterval(() => updatePitch(Math.max(pitchPercentage - 1, -50)), 100);
}
function stopPitchDownRepeat() {
  if (pitchDownInterval) {
    clearInterval(pitchDownInterval);
    pitchDownInterval = null;
  }
}
function startPitchUpRepeat() {
  if (pitchUpInterval) return;
  pitchUpInterval = setInterval(() => updatePitch(Math.min(pitchPercentage + 1, 100)), 100);
}
function stopPitchUpRepeat() {
  if (pitchUpInterval) {
    clearInterval(pitchUpInterval);
    pitchUpInterval = null;
  }
}


/**************************************
 * Draggable Helpers
 **************************************/
function makePanelDraggable(panel, handle, storageKey) {
  let offsetX = 0, offsetY = 0, dragging = false;
  handle.addEventListener("mousedown", e => {
    dragging = true;
    let rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = "none";
  });
  addTrackedListener(document, "mousemove", e => {
    if (!dragging) return;
    let nl = e.clientX - offsetX;
    let nt = e.clientY - offsetY;
    let rect = panel.getBoundingClientRect();
    nl = Math.max(0, Math.min(window.innerWidth - rect.width, nl));
    nt = Math.max(0, Math.min(window.innerHeight - rect.height, nt));
    panel.style.left = nl + "px";
    panel.style.top = nt + "px";
  });
  addTrackedListener(document, "mouseup", () => {
    if (dragging) {
      dragging = false;
      document.body.style.userSelect = "";
      storePanelPosition(panel, storageKey);
    }
  });
}
function storePanelPosition(panel, key) {
  let rect = panel.getBoundingClientRect();
  localStorage.setItem(key, JSON.stringify({ left: rect.left, top: rect.top }));
}
function restorePanelPosition(panel, key) {
  let pos = localStorage.getItem(key);
  if (!pos) return;
  try {
    let obj = JSON.parse(pos);
    panel.style.left = obj.left + "px";
    panel.style.top = obj.top + "px";
  } catch {}
}
function makeVideoPreviewDraggable(el) {
  // If already initialized, do nothing
  if (el._draggableInitialized) return;
  
  let offsetX = 0, offsetY = 0, dragging = false;
  
  el.addEventListener("mousedown", e => {
    dragging = true;
    offsetX = e.offsetX;
    offsetY = e.offsetY;
    el.style.userSelect = "none";
  });
  
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    let nl = e.pageX - offsetX;
    let nt = e.pageY - offsetY;
    let rect = el.getBoundingClientRect();
    nl = Math.max(0, Math.min(window.innerWidth - rect.width, nl));
    nt = Math.max(0, Math.min(window.innerHeight - rect.height, nt));
    el.style.left = nl + "px";
    el.style.top = nt + "px";
  });
  
  document.addEventListener("mouseup", () => {
    dragging = false;
    el.style.userSelect = "";
  });
  
  el._draggableInitialized = true;
}


/**************************************
 * Windows: Manual, KeyMap, MIDIMap
 **************************************/
let manualWindowContainer = null;
let manualDragHandle = null;
let manualContentWrap = null;

function showManualWindowToggle() {
  if (!manualWindowContainer) {
    buildManualWindow();
    manualWindowContainer.style.display = "block";
  } else {
    manualWindowContainer.style.display =
      (manualWindowContainer.style.display === "block") ? "none" : "block";
  }
}

function buildManualWindow() {
  manualWindowContainer = document.createElement("div");
  manualWindowContainer.className = "looper-manual-container";
  manualWindowContainer.style.width = "300px";

  manualDragHandle = document.createElement("div");
  manualDragHandle.className = "looper-manual-drag-handle";
  manualDragHandle.innerText = "YT Beatmaker Cues - Manual";
  manualWindowContainer.appendChild(manualDragHandle);

  manualContentWrap = document.createElement("div");
  manualContentWrap.className = "looper-manual-content";
  manualContentWrap.style.maxHeight = "400px";
  manualContentWrap.style.overflowY = "auto";
  manualWindowContainer.appendChild(manualContentWrap);

  manualContentWrap.innerHTML = `
    <h3>Overview</h3>
    <p>This extension lets you set up to 10 cue points on a YouTube video, trigger them via keyboard or MIDI, and record loops of both audio and video. It also provides a Lo-Fi compressor, an EQ/filter, a Reverb, and a Cassette effect for warm lo-fi vibes.</p>
    <p>You can use either the <strong>Advanced Panel</strong> or the <strong>Minimal UI Bar</strong> (top-right on the player).</p>
    <h3>Key Features</h3>
    <ul>
      <li><strong>Audio Looper</strong> (R)</li>
      <li><strong>Video Looper</strong> (V)</li>
      <li><strong>Cues</strong> (set up to 10 - keys 1..0)</li>
      <li><strong>Undo/Redo</strong> (U key, double press => Redo)</li>
      <li><strong>EQ, Reverb, Cassette, Compressor</strong></li>
      <li><strong>Pitch Control</strong> (keys , and .)</li>
    </ul>
    <p>Default keys: <em>C</em> toggles Compressor, <em>E</em> toggles EQ, <em>R</em> = audio looper, <em>V</em> = video looper, <em>U</em> = undo, <em>Q</em> = Reverb, <em>W</em> = Cassette, <em>,</em>/<em>.</em> for pitch down/up.</p>
    <h3>Contact</h3>
    <p>Instagram <a href="https://instagram.com/owae.ga" target="_blank">@owae.ga</a></p>
    <button class="looper-manual-close-btn looper-btn" style="margin-top:10px;">Close Manual</button>
  `;
  document.body.appendChild(manualWindowContainer);

  makePanelDraggable(manualWindowContainer, manualDragHandle, "ytbm_manualPos");
  restorePanelPosition(manualWindowContainer, "ytbm_manualPos");

  let closeBtn = manualWindowContainer.querySelector(".looper-manual-close-btn");
  closeBtn.addEventListener("click", () => {
    manualWindowContainer.style.display = "none";
  });
}


let keyMapWindowContainer = null;
let keyMapDragHandle = null;
let keyMapContentWrap = null;

function showKeyMapWindowToggle() {
  if (!keyMapWindowContainer) {
    buildKeyMapWindow();
    keyMapWindowContainer.style.display = "block";
  } else {
    keyMapWindowContainer.style.display =
      (keyMapWindowContainer.style.display === "block") ? "none" : "block";
  }
}

function buildKeyMapWindow() {
  keyMapWindowContainer = document.createElement("div");
  keyMapWindowContainer.className = "looper-keymap-container";

  keyMapDragHandle = document.createElement("div");
  keyMapDragHandle.className = "looper-keymap-drag-handle";
  keyMapDragHandle.innerText = "Key Mapping (QWERTY) - YT Beatmaker";
  keyMapWindowContainer.appendChild(keyMapDragHandle);

  keyMapContentWrap = document.createElement("div");
  keyMapContentWrap.className = "looper-keymap-content";
  keyMapWindowContainer.appendChild(keyMapContentWrap);

  keyMapContentWrap.innerHTML = `
    <h4>Built-in Samples</h4>
    <div class="keymap-row">
      <label>Kick:</label>
      <input data-sample="kick" value="${escapeHtml(sampleKeys.kick)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Hihat:</label>
      <input data-sample="hihat" value="${escapeHtml(sampleKeys.hihat)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Snare:</label>
      <input data-sample="snare" value="${escapeHtml(sampleKeys.snare)}" maxlength="1">
    </div>
    <h4>Other Keys</h4>
    <div class="keymap-row">
      <label>Looper:</label>
      <input data-extkey="looper" value="${escapeHtml(extensionKeys.looper)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>VideoLooper:</label>
      <input data-extkey="videoLooper" value="${escapeHtml(extensionKeys.videoLooper)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Compressor:</label>
      <input data-extkey="compressor" value="${escapeHtml(extensionKeys.compressor)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>EQ:</label>
      <input data-extkey="eq" value="${escapeHtml(extensionKeys.eq)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Undo:</label>
      <input data-extkey="undo" value="${escapeHtml(extensionKeys.undo)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>PitchDown:</label>
      <input data-extkey="pitchDown" value="${escapeHtml(extensionKeys.pitchDown)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>PitchUp:</label>
      <input data-extkey="pitchUp" value="${escapeHtml(extensionKeys.pitchUp)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Reverb:</label>
      <input data-extkey="reverb" value="${escapeHtml(extensionKeys.reverb)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Cassette:</label>
      <input data-extkey="cassette" value="${escapeHtml(extensionKeys.cassette)}" maxlength="1">
    </div>
    <div class="keymap-row">
  <label>RandomCues:</label>
  <input data-extkey="randomCues" value="${escapeHtml(extensionKeys.randomCues)}" maxlength="1">
</div>
    <h4></h4>
    <div id="user-samples-list"></div>
    <button class="looper-keymap-save-btn looper-btn" style="margin-top:8px;">Save & Close</button>
  `;
  document.body.appendChild(keyMapWindowContainer);

  makePanelDraggable(keyMapWindowContainer, keyMapDragHandle, "ytbm_keyMapPos");
  restorePanelPosition(keyMapWindowContainer, "ytbm_keyMapPos");
  populateUserSamplesList();

  let saveBtn = keyMapWindowContainer.querySelector(".looper-keymap-save-btn");
  saveBtn.addEventListener("click", () => {
    let sampleInputs = keyMapWindowContainer.querySelectorAll("input[data-sample]");
    sampleInputs.forEach(inp => {
      let sn = inp.getAttribute("data-sample");
      sampleKeys[sn] = inp.value.trim() || sampleKeys[sn];
    });
    let extInputs = keyMapWindowContainer.querySelectorAll("input[data-extkey]");
    extInputs.forEach(inp => {
      let ek = inp.getAttribute("data-extkey");
      extensionKeys[ek] = inp.value.trim() || extensionKeys[ek];
    });
    let usWrap = keyMapWindowContainer.querySelector("#user-samples-list");
    let rows = usWrap.querySelectorAll(".user-sample-row");
    rows.forEach(r => {
      let i = parseInt(r.getAttribute("data-idx"), 10);
      let inp = r.querySelector("input");
      userSamples[i].key = inp.value.trim() || userSamples[i].key;
    });
    saveMappingsToLocalStorage();
    alert("QWERTY KeyMap saved!");
    keyMapWindowContainer.style.display = "none";
  });
}

function populateUserSamplesList() {
  if (!keyMapWindowContainer) return;
  let c = keyMapWindowContainer.querySelector("#user-samples-list");
  if (!c) return;
  c.innerHTML = "";
  userSamples.forEach((us, i) => {
    let row = document.createElement("div");
    row.className = "user-sample-row";
    row.setAttribute("data-idx", i);
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";

    const label = document.createElement("label");
    label.textContent = us.name + ":";
    const input = document.createElement("input");
    input.value = us.key;
    input.maxLength = 1;

    row.appendChild(label);
    row.appendChild(input);
    c.appendChild(row);
  });
}


let midiMapWindowContainer = null;
let midiMapDragHandle = null;
let midiMapContentWrap = null;

function showMIDIMapWindowToggle() {
  if (!midiMapWindowContainer) {
    buildMIDIMapWindow();
    midiMapWindowContainer.style.display = "block";
  } else {
    midiMapWindowContainer.style.display =
      (midiMapWindowContainer.style.display === "block") ? "none" : "block";
  }
}

function buildMIDIMapWindow() {
  midiMapWindowContainer = document.createElement("div");
  midiMapWindowContainer.className = "looper-midimap-container";

  midiMapDragHandle = document.createElement("div");
  midiMapDragHandle.className = "looper-midimap-drag-handle";
  midiMapDragHandle.innerText = "MIDI Mapping - YT Beatmaker";
  midiMapWindowContainer.appendChild(midiMapDragHandle);

  midiMapContentWrap = document.createElement("div");
  midiMapContentWrap.className = "looper-midimap-content";
  midiMapWindowContainer.appendChild(midiMapContentWrap);

  let out = `
    <h4>Drum Notes</h4>
    <div class="midimap-row">
      <label>Kick:</label>
      <input data-midiname="kick" value="${escapeHtml(String(midiNotes.kick))}" type="number">
      <button data-detect="kick" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Hihat:</label>
      <input data-midiname="hihat" value="${escapeHtml(String(midiNotes.hihat))}" type="number">
      <button data-detect="hihat" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Snare:</label>
      <input data-midiname="snare" value="${escapeHtml(String(midiNotes.snare))}" type="number">
      <button data-detect="snare" class="detect-midi-btn">Detect</button>
    </div>
    <h4>Pitch / Shift</h4>
    <div class="midimap-row">
      <label>Shift Key:</label>
      <input data-midiname="shift" value="${escapeHtml(String(midiNotes.shift))}" type="number">
      <button data-detect="shift" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>PitchDown:</label>
      <input data-midiname="pitchDown" value="${escapeHtml(String(midiNotes.pitchDown))}" type="number">
      <button data-detect="pitchDown" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>PitchUp:</label>
      <input data-midiname="pitchUp" value="${escapeHtml(String(midiNotes.pitchUp))}" type="number">
      <button data-detect="pitchUp" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
  <label>RandomCues:</label>
  <input data-midiname="randomCues" value="${escapeHtml(String(midiNotes.randomCues))}" type="number">
  <button data-detect="randomCues" class="detect-midi-btn">Detect</button>
</div>
    <h4>Cues (0..9)</h4>
    <div class="midimap-cues">
  `;
  for (let k of Object.keys(midiNotes.cues)) {
    out += `
      <div class="midimap-row">
        <label>Cue ${k}:</label>
        <input data-midicue="${k}" value="${escapeHtml(String(midiNotes.cues[k]))}" type="number">
        <button data-cuedetect="${k}" class="detect-midi-btn">Detect</button>
      </div>
    `;
  }
  out += `
    </div>
    <h4>Looper / Undo / VideoLooper</h4>
    <div class="midimap-row">
      <label>Looper:</label>
      <input data-midiname="looper" value="${escapeHtml(String(midiNotes.looper))}" type="number">
      <button data-detect="looper" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Undo:</label>
      <input data-midiname="undo" value="${escapeHtml(String(midiNotes.undo))}" type="number">
      <button data-detect="undo" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>VideoLoop:</label>
      <input data-midiname="videoLooper" value="${escapeHtml(String(midiNotes.videoLooper))}" type="number">
      <button data-detect="videoLooper" class="detect-midi-btn">Detect</button>
    </div>
    <h4>EQ/Compressor Toggles</h4>
    <div class="midimap-row">
      <label>EQ Toggle:</label>
      <input data-midiname="eqToggle" value="${escapeHtml(String(midiNotes.eqToggle))}" type="number">
      <button data-detect="eqToggle" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Comp Toggle:</label>
      <input data-midiname="compToggle" value="${escapeHtml(String(midiNotes.compToggle))}" type="number">
      <button data-detect="compToggle" class="detect-midi-btn">Detect</button>
    </div>
    <h4>Reverb/Cassette Toggles</h4>
    <div class="midimap-row">
      <label>Reverb:</label>
      <input data-midiname="reverbToggle" value="${escapeHtml(String(midiNotes.reverbToggle))}" type="number">
      <button data-detect="reverbToggle" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Cassette:</label>
      <input data-midiname="cassetteToggle" value="${escapeHtml(String(midiNotes.cassetteToggle))}" type="number">
      <button data-detect="cassetteToggle" class="detect-midi-btn">Detect</button>
    </div>
    <h4>Cue Adjust (CC)</h4>
    <div class="midimap-row">
      <label>Adjust:</label>
      <input data-midicc="cueAdjust" value="${escapeHtml(String(midiNotes.cueAdjust))}" type="number">
      <button data-ccdetect="cueAdjust" class="detect-midi-btn">Detect</button>
    </div>
    <button class="looper-midimap-save-btn looper-btn" style="margin-top:8px;">Save & Close</button>
  `;
  midiMapContentWrap.innerHTML = out;

  document.body.appendChild(midiMapWindowContainer);
  makePanelDraggable(midiMapWindowContainer, midiMapDragHandle, "ytbm_midiMapPos");
  restorePanelPosition(midiMapWindowContainer, "ytbm_midiMapPos");
  
  loadMidiPresetsFromLocalStorage();
  buildPresetDropdown();

  let sv = midiMapWindowContainer.querySelector(".looper-midimap-save-btn");
  sv.addEventListener("click", () => {
    let baseFields = midiMapWindowContainer.querySelectorAll("input[data-midiname]");
    baseFields.forEach(inp => {
      let n = inp.getAttribute("data-midiname");
      let val = parseInt(inp.value, 10);
      if (!isNaN(val)) midiNotes[n] = val;
    });
    let cueFields = midiMapWindowContainer.querySelectorAll("input[data-midicue]");
    cueFields.forEach(inp => {
      let k = inp.getAttribute("data-midicue");
      let val = parseInt(inp.value, 10);
      if (!isNaN(val)) midiNotes.cues[k] = val;
    });
    let ccFields = midiMapWindowContainer.querySelectorAll("input[data-midicc]");
    ccFields.forEach(inp => {
      let k = inp.getAttribute("data-midicc");
      let val = parseInt(inp.value, 10);
      if (!isNaN(val)) midiNotes[k] = val;
    });
    saveMappingsToLocalStorage();
    alert("MIDI Map saved!");
    midiMapWindowContainer.style.display = "none";
  });

  let detectBtns = midiMapWindowContainer.querySelectorAll(".detect-midi-btn");
  detectBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      let d = btn.getAttribute("data-detect");
      let c = btn.getAttribute("data-cuedetect");
      let cc = btn.getAttribute("data-ccdetect");
      if (d) {
        currentlyDetectingMidi = d;
        alert(`Now press a MIDI key for "${d}"...`);
      } else if (c) {
        currentlyDetectingMidi = (c in midiNotes.cues) ? c : null;
        if (currentlyDetectingMidi) {
          alert(`Now press a MIDI key for "Cue ${c}"...`);
        }
      } else if (cc) {
        currentlyDetectingMidiControl = cc;
        alert(`Now move a MIDI knob for "${cc}"...`);
      }
    });
  });
}

function updateMidiMapInput(name, val) {
  if (!midiMapWindowContainer) return;
  let inp = midiMapWindowContainer.querySelector(`input[data-midiname="${name}"]`);
  if (!inp) {
    let cueInp = midiMapWindowContainer.querySelector(`input[data-midicue="${name}"]`);
    if (cueInp) cueInp.value = val;
    else {
      let ccInp = midiMapWindowContainer.querySelector(`input[data-midicc="${name}"]`);
      if (ccInp) ccInp.value = val;
    }
  } else {
    inp.value = val;
  }
}

/* ======================================================
   MIDI‑preset helpers  (rewrite 2025‑05‑07)
   =====================================================*/

/* ⚙️  Config */
const MIDI_PRESET_STORAGE_KEY = "ytbm_midiPresets_v1";
let   currentMidiPresetName   = null;   // which preset is ‘active’
const SAMPLE_PACK_STORAGE_KEY = "ytbm_samplePacks_v1";

/* ------------------------------------------------------
   0.  helper – pull values from the MIDI‑mapping window
   ---------------------------------------------------- */
function syncMidiNotesFromWindow() {
  if (!midiMapWindowContainer) return;  // window not open

  /* base (non‑cue) fields */
  midiMapWindowContainer
    .querySelectorAll("input[data-midiname]")
    .forEach(inp => {
      const key = inp.dataset.midiname;
      const v   = parseInt(inp.value, 10);
      if (!isNaN(v)) midiNotes[key] = v;
    });

  /* cc fields */
  midiMapWindowContainer
    .querySelectorAll("input[data-midicc]")
    .forEach(inp => {
      const key = inp.dataset.midicc;
      const v   = parseInt(inp.value, 10);
      if (!isNaN(v)) midiNotes[key] = v;
    });

  /* cue fields 0‑9 */
  midiMapWindowContainer
    .querySelectorAll("input[data-midicue]")
    .forEach(inp => {
      const cue = inp.dataset.midicue;
      const v   = parseInt(inp.value, 10);
      if (!isNaN(v)) midiNotes.cues[cue] = v;
    });
}

/* ------------------------------------------------------
   1.  Persistence
   ---------------------------------------------------- */
function loadMidiPresetsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(MIDI_PRESET_STORAGE_KEY);
    midiPresets = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("Could not parse stored presets – cleared.", err);
    midiPresets = [];
    localStorage.removeItem(MIDI_PRESET_STORAGE_KEY);
  }
}
function saveMidiPresetsToLocalStorage() {
  try {
    localStorage.setItem(MIDI_PRESET_STORAGE_KEY, JSON.stringify(midiPresets));
  } catch (err) {
    console.error("Failed saving MIDI presets:", err);
  }
}

/* ------------------------------------------------------
   2.  Create / update / delete
   ---------------------------------------------------- */
function saveCurrentMidiMappingAsPreset(name) {
  if (!name) { alert("Preset needs a name."); return; }

  syncMidiNotesFromWindow();                       // NEW 🔄
  const snapshot = JSON.parse(JSON.stringify(midiNotes));   // deep clone
  const idx      = midiPresets.findIndex(p => p.name === name);

  if (idx !== -1) {
    if (!confirm(`Overwrite the existing preset “${name}”?`)) return;
    midiPresets[idx].config = snapshot;
  } else {
    midiPresets.push({ name, config: snapshot });
    midiPresets.sort((a, b) => a.name.localeCompare(b.name));
  }
  currentMidiPresetName = name;
  saveMidiPresetsToLocalStorage();
  refreshPresetDropdown();
}
function deleteMidiPresetByName(name) {
  const idx = midiPresets.findIndex(p => p.name === name);
  if (idx === -1) return;
  if (!confirm(`Delete preset “${name}” permanently?`)) return;

  midiPresets.splice(idx, 1);
  if (currentMidiPresetName === name) currentMidiPresetName = null;
  saveMidiPresetsToLocalStorage();
  refreshPresetDropdown();
}

/* ------------------------------------------------------
   3.  Load
   ---------------------------------------------------- */
function applyMidiPresetByName(name) {
  const preset = midiPresets.find(p => p.name === name);
  if (!preset) { alert(`Preset “${name}” was not found.`); return; }

  Object.assign(midiNotes, preset.config);         // apply mapping
  saveMappingsToLocalStorage();                    // ← your existing util
  currentMidiPresetName = name;

  /* push the numbers back into the form so the UI matches */
  if (midiMapWindowContainer) {
    midiMapWindowContainer
      .querySelectorAll("input[data-midiname]")
      .forEach(inp => { inp.value = midiNotes[inp.dataset.midiname]; });
    midiMapWindowContainer
      .querySelectorAll("input[data-midicue]")
      .forEach(inp => { inp.value = midiNotes.cues[inp.dataset.midicue]; });
  }

  refreshPresetDropdown();
}

/* ------------------------------------------------------
   4.  UI helpers  (called from buildMIDIMapWindow)
   ---------------------------------------------------- */
let presetDeleteBtn   = null;
let presetBar         = null;                  // flex‑row that houses both

function buildPresetDropdown() {
  /* 1 · create DOM nodes once ----------------------------------------- */
  if (!presetSelect) {
    presetSelect = document.createElement("select");
    presetSelect.className = "looper-btn";
    presetSelect.style.flex = "1 1 auto";
    presetSelect.title = "Save / load complete MIDI maps";

    presetSelect.addEventListener("change", () => {
      const v = presetSelect.value;
      if (v === "__save") {
        const name = prompt("Name for the new preset?");
        if (name) saveCurrentMidiMappingAsPreset(name.trim());
      } else if (v) {
        applyMidiPresetByName(v);
      }
    });
  }

  if (!presetDeleteBtn) {
    presetDeleteBtn = document.createElement("button");
    presetDeleteBtn.className = "looper-btn";
    presetDeleteBtn.textContent = "🗑";
    presetDeleteBtn.style.flex = "0 0 auto";
    presetDeleteBtn.title = "Delete currently‑selected preset";
    presetDeleteBtn.addEventListener("click", () => {
      if (currentMidiPresetName) deleteMidiPresetByName(currentMidiPresetName);
    });
  }

  if (!presetBar) {
    presetBar = document.createElement("div");
    presetBar.style.display = "flex";
    presetBar.style.gap     = "4px";
    presetBar.appendChild(presetSelect);
    presetBar.appendChild(presetDeleteBtn);
  }

  /* 2 · (re)attach the bar when MIDI window exists -------------------- */
  if (midiMapWindowContainer && !presetBar.isConnected) {
    midiMapWindowContainer.insertBefore(
      presetBar,
      midiMapWindowContainer.firstChild.nextSibling   // right under drag‑handle
    );
  }

  /* 3 · populate options ---------------------------------------------- */
  refreshPresetDropdown();
}

function refreshPresetDropdown() {
  if (!presetSelect) return;

  // make sure stored “current” still exists
  if (currentMidiPresetName &&
      !midiPresets.some(p => p.name === currentMidiPresetName)) {
    currentMidiPresetName = null;
  }

  // rebuild <option>s
  presetSelect.innerHTML = "";
  if (!currentMidiPresetName) {
    const ph = new Option("-- Presets --", "", true, true);
    ph.disabled = true;
    presetSelect.add(ph);
  }
  midiPresets.forEach(p =>
    presetSelect.add(
      new Option(p.name, p.name, false, p.name === currentMidiPresetName)
    )
  );
  presetSelect.add(new Option("➕ Save current as…", "__save"));

  // update delete button
  if (presetDeleteBtn) {
    const enabled = Boolean(currentMidiPresetName);
    presetDeleteBtn.disabled = !enabled;
    presetDeleteBtn.style.opacity = enabled ? "1" : "0.4";
  }
}

/* ======================================================
   Sample-pack helpers
   =====================================================*/
async function loadSamplePacksFromLocalStorage() {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise(resolve => {
      chrome.storage.local.get([SAMPLE_PACK_STORAGE_KEY], res => {
        try {
          const raw = res[SAMPLE_PACK_STORAGE_KEY];
          samplePacks = raw ? JSON.parse(raw) : [];
        } catch (err) {
          console.warn("Could not parse stored packs – cleared.", err);
          samplePacks = [];
          chrome.storage.local.remove(SAMPLE_PACK_STORAGE_KEY);
        }
        resolve();
      });
    });
  } else {
    try {
      const raw = localStorage.getItem(SAMPLE_PACK_STORAGE_KEY);
      samplePacks = raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn("Could not parse stored packs – cleared.", err);
      samplePacks = [];
      localStorage.removeItem(SAMPLE_PACK_STORAGE_KEY);
    }
  }
}
function saveSamplePacksToLocalStorage() {
  const data = {};
  data[SAMPLE_PACK_STORAGE_KEY] = JSON.stringify(samplePacks);
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        console.error("Failed saving sample packs:", chrome.runtime.lastError);
      }
    });
  } else {
    try {
      localStorage.setItem(SAMPLE_PACK_STORAGE_KEY, data[SAMPLE_PACK_STORAGE_KEY]);
    } catch (err) {
      console.error("Failed saving sample packs:", err);
    }
  }
}

async function applySelectedSamplePacks() {
  await ensureAudioContext();
  audioBuffers.kick = [];
  audioBuffers.hihat = [];
  audioBuffers.snare = [];
  sampleOrigin.kick = [];
  sampleOrigin.hihat = [];
  sampleOrigin.snare = [];
  for (const name of activeSamplePackNames) {
    const pack = samplePacks.find(p => p.name === name);
    if (!pack) continue;
    for (let i = 0; i < pack.kick.length; i++) {
      const b = await loadAudio(pack.kick[i]);
      if (b) { audioBuffers.kick.push(b); sampleOrigin.kick.push({packName: name, index: i}); }
    }
    for (let i = 0; i < pack.hihat.length; i++) {
      const b = await loadAudio(pack.hihat[i]);
      if (b) { audioBuffers.hihat.push(b); sampleOrigin.hihat.push({packName: name, index: i}); }
    }
    for (let i = 0; i < pack.snare.length; i++) {
      const b = await loadAudio(pack.snare[i]);
      if (b) { audioBuffers.snare.push(b); sampleOrigin.snare.push({packName: name, index: i}); }
    }
  }
  currentSampleIndex = { kick: 0, hihat: 0, snare: 0 };
  saveMappingsToLocalStorage();
  updateSampleDisplay("kick");
  updateSampleDisplay("hihat");
  updateSampleDisplay("snare");
  refreshSamplePackDropdown();
}

async function applySamplePackByName(name) {
  activeSamplePackNames = [name];
  currentSamplePackName = name;
  await applySelectedSamplePacks();
}

function deleteSamplePackByName(name) {
  const idx = samplePacks.findIndex(p => p.name === name);
  if (idx === -1) return;
  if (name === "Built-in") { alert("Cannot delete built-in pack."); return; }
  if (!confirm(`Delete pack “${name}” permanently?`)) return;
  samplePacks.splice(idx, 1);
  activeSamplePackNames = activeSamplePackNames.filter(n => n !== name);
  if (currentSamplePackName === name) currentSamplePackName = null;
  saveSamplePacksToLocalStorage();
  saveMappingsToLocalStorage();
  applySelectedSamplePacks();
}

async function pickSampleFiles(promptText) {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      document.body.removeChild(input);
      resolve(files);
    }, { once: true });
    alert(promptText);
    input.click();
  });
}

async function createEmptySamplePack() {
  const name = prompt("Name for the new pack?");
  if (!name) return;

  if (samplePacks.some(p => p.name === name)) {
    alert("A pack with this name already exists.");
    return;
  }

  const pack = { name, kick: [], hihat: [], snare: [] };
  samplePacks.push(pack);
  currentSamplePackName = name;
  if (!activeSamplePackNames.includes(name)) {
    activeSamplePackNames.push(name);
  }


  saveSamplePacksToLocalStorage();
  saveMappingsToLocalStorage();
  await applySelectedSamplePacks();
}

let packDeleteBtn = null;
let packBar       = null;

function buildSamplePackDropdown() {
  if (!samplePackSelect) {
    samplePackSelect = document.createElement("select");
    samplePackSelect.className = "looper-btn";
    samplePackSelect.multiple = true;
    samplePackSelect.size = 4;
    samplePackSelect.style.flex = "1 1 auto";
    samplePackSelect.title = "Load / manage sample packs";
    samplePackSelect.addEventListener("change", async () => {
      const values = Array.from(samplePackSelect.selectedOptions).map(o => o.value);
      if (values.includes("__import")) {
        samplePackSelect.value = "";
        await createEmptySamplePack();
        return;
      }
      activeSamplePackNames = values;
      currentSamplePackName = values[0] || null;
      applySelectedSamplePacks();
    });
  }

  if (!packDeleteBtn) {
    packDeleteBtn = document.createElement("button");
    packDeleteBtn.className = "looper-btn";
    packDeleteBtn.textContent = "🗑";
    packDeleteBtn.style.flex = "0 0 auto";
    packDeleteBtn.title = "Delete current pack";
    packDeleteBtn.addEventListener("click", () => {
      if (currentSamplePackName) deleteSamplePackByName(currentSamplePackName);
    });
  }

  if (!packBar) {
    packBar = document.createElement("div");
    packBar.style.display = "flex";
    packBar.style.gap     = "4px";
    packBar.appendChild(samplePackSelect);
    packBar.appendChild(packDeleteBtn);
  }

  if (panelContainer && !packBar.isConnected) {
    panelContainer.insertBefore(packBar, panelContainer.children[1]);
  }

  refreshSamplePackDropdown();
}

function refreshSamplePackDropdown() {
  if (!samplePackSelect) return;
  activeSamplePackNames = activeSamplePackNames.filter(n => samplePacks.some(p => p.name === n));
  if (currentSamplePackName && !samplePacks.some(p => p.name === currentSamplePackName)) {
    currentSamplePackName = null;
  }
  samplePackSelect.innerHTML = "";
  samplePacks.forEach(p => {
    const opt = new Option(p.name, p.name, false, activeSamplePackNames.includes(p.name));
    samplePackSelect.add(opt);
  });
  samplePackSelect.add(new Option("➕ Import pack…", "__import"));

  if (packDeleteBtn) {
    const name = samplePackSelect.value;
    const en = Boolean(name) && name !== "Built-in";
    packDeleteBtn.disabled = !en;
    packDeleteBtn.style.opacity = en ? "1" : "0.4";
  }

  ["kick","hihat","snare"].forEach(type => {
    const btn = document.querySelector(`.sample-del-btn-${type}`);
    if (!btn) return;
    const idx = currentSampleIndex[type];
    const meta = sampleOrigin[type][idx];
    const disable = !meta || (meta.packName === "Built-in" && meta.index < BUILTIN_DEFAULT_COUNT);
    btn.disabled = disable;
    btn.style.opacity = disable ? "0.4" : "1";
  });
}

/**************************************
 * Mappings to Local Storage
 **************************************/
async function loadMappingsFromLocalStorage() {
  let s = localStorage.getItem("ytbm_mappings");
  if (!s) return;
  try {
    let o = JSON.parse(s);
    if (o.sampleKeys) {
      sampleKeys = Object.assign({}, sampleKeys, o.sampleKeys);
    }
    if (o.userSamples) {
      userSamples.forEach((u, i) => {
        if (i < o.userSamples.length) {
          userSamples[i].key = o.userSamples[i].key;
          userSamples[i].name = o.userSamples[i].name;
        }
      });
    }
    if (o.extensionKeys) {
      extensionKeys = Object.assign({}, extensionKeys, o.extensionKeys);
    }
    if (o.midiNotes) {
      Object.assign(midiNotes, o.midiNotes);
      if (!midiNotes.cues) midiNotes.cues = {};
    }
    if (o.activeSamplePackNames) {
      activeSamplePackNames = o.activeSamplePackNames;
    } else if (o.currentSamplePackName) {
      activeSamplePackNames = [o.currentSamplePackName];
    }
    if (o.currentSamplePackName) {
      currentSamplePackName = o.currentSamplePackName;
    }
  } catch (e) {
    console.warn("Error loading local storage mappings:", e);
  }
}

function saveMappingsToLocalStorage() {
  let obj = {
    sampleKeys,
    userSamples: userSamples.map(u => ({ name: u.name, key: u.key })),
    extensionKeys,
    midiNotes,
    currentSamplePackName,
    activeSamplePackNames
  };
  localStorage.setItem("ytbm_mappings", JSON.stringify(obj));
}


/**************************************
 * CSS
 **************************************/
function injectCustomCSS() {
  let css = `
    .looper-panel-container {
      z-index: 999999;
      background: rgba(30,30,30,0.96);
      color: #fff;
      font-family: sans-serif;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      width: 210px;
      max-height: 70vh;
      overflow-y: auto;
    }
    .looper-drag-handle {
      background: #222;
      padding: 6px 10px;
      font-weight: 600;
      border-bottom: 1px solid #444;
      cursor: move;
      user-select: none;
    }
    .looper-content-wrap {
      display: flex;
      flex-direction: column;
      padding: 6px;
      gap: 6px;
    }
    .looper-btn {
      background: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 3px 4px;
      cursor: pointer;
      font-size: 11px;
      transition: .2s;
      outline: none;
    }
    .looper-btn:hover {
      background: #444;
      border-color: #666;
    }
    .cue-marker {
      pointer-events: auto !important;
    }
    .ytbm-minimal-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      margin-right: 6px;
      overflow-x: auto;
    }
    .ytbm-minimal-bar .looper-btn {
      background: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 3px;
      padding: 3px 6px;
      font-size: 10px;
      cursor: pointer;
      transition: 0.2s;
    }
    .ytbm-minimal-bar .looper-btn:hover {
      background: #444;
      border-color: #666;
    }
    .looper-manual-container,
    .looper-keymap-container,
    .looper-midimap-container {
      position: fixed;
      top: 100px;
      left: 100px;
      background: rgba(30,30,30,0.95);
      color: #fff;
      border: 1px solid #444;
      border-radius: 6px;
      z-index: 999999999;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      display: none;
      font-family: sans-serif;
      padding-bottom: 4px;
    }
    .looper-manual-drag-handle,
    .looper-keymap-drag-handle,
    .looper-midimap-drag-handle {
      background: #222;
      padding: 6px 10px;
      font-weight: 600;
      border-bottom: 1px solid #444;
      cursor: move;
      user-select: none;
    }
    .looper-manual-content,
    .looper-keymap-content,
    .looper-midimap-content {
      padding: 8px;
      font-size: 13px;
      max-height: 400px;
      overflow-y: auto;
    }
    .looper-manual-close-btn,
    .looper-keymap-save-btn,
    .looper-midimap-save-btn {
      background: #333;
      border: 1px solid #666;
      color: #fff;
      border-radius: 4px;
      padding: 3px 6px;
      cursor: pointer;
      font-size: 11px;
    }
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 80px;
      height: 4px;
      background: #ccc;
      border-radius: 2px;
      outline: none;
      margin-top: 4px;
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: 12px;
      width: 12px;
      border-radius: 50%;
      background: #888;
      cursor: pointer;
    }
    input[type="range"]::-moz-range-thumb {
      height: 12px;
      width: 12px;
      border-radius: 50%;
      background: #888;
      cursor: pointer;
    }
    .keymap-row, .user-sample-row, .midimap-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .keymap-row label, .midimap-row label,
    .user-sample-row label {
      width: 80px;
    }
    .keymap-row input, .midimap-row input,
    .user-sample-row input {
      width: 40px;
      background: #222;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 2px 4px;
      font-size: 13px;
      text-align: center;
    }
  `;
  let st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);
}

// 1) Check if the user navigated to a new YouTube video every second
function detectVideoChanges() {
  let lastUrl = window.location.href;
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log("Video changed! Re-attaching loadedmetadata listener.");
      attachVideoMetadataListener();
    }
  }, 1000);
}

// 2) Re-attach a fresh 'loadedmetadata' listener for each new <video>
function attachVideoMetadataListener() {
  const vid = getVideoElement(); // your existing helper
  if (!vid) return;

  // Remove any old listener to avoid duplicates
  vid.removeEventListener("loadedmetadata", onNewVideoLoaded);
  // Attach a fresh one
  vid.addEventListener("loadedmetadata", onNewVideoLoaded);
}

// 3) In that listener, reset pitch back to 0
function onNewVideoLoaded() {
  console.log("New video loaded => resetting pitch to 0%");

  // Reset everything
  pitchPercentage = 0;
  videoPitchPercentage = 0;
  loopPitchPercentage = 0;

  updatePitch(0); // calls your function that resets slider & playbackRate
}

// Finally, start it once
detectVideoChanges();
attachVideoMetadataListener();

/**************************************
 * Initialization
 **************************************/
async function initialize() {
  try {
    if (!shouldRunOnThisPage()) return;
    let isAudioPrimed = false;

    document.addEventListener('click', function primeAudio() {
      if (isAudioPrimed) return;
      isAudioPrimed = true;

      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        setupAudioNodes();
      }
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      console.log("Audio primed on first click.");
    }, { once: true });
    
    await loadMappingsFromLocalStorage();
    loadMidiPresetsFromLocalStorage();
    await loadSamplePacksFromLocalStorage();
    await loadMonitorPrefs();
    await ensureAudioContext();
    if (activeSamplePackNames.length) {
      await applySelectedSamplePacks();
    } else if (currentSamplePackName) {
      activeSamplePackNames = [currentSamplePackName];
      await applySelectedSamplePacks();
    }
    if (!isSampletteEmbed) {
      initializeMIDI();
    }
    addControls();
    buildMinimalUIBar();
    addTouchButtonToMinimalUI();
    addTouchSequencerButtonToAdvancedUI();
    attachAudioPriming();
    loadCuePointsAtStartup();
    handleProgressBarDoubleClickForNewCue();
    updateSampleDisplay("kick");
    updateSampleDisplay("hihat");
    updateSampleDisplay("snare");
    addTrackedListener(document, "mousemove", onDocumentMouseMove);
    addTrackedListener(document, "mouseup", onDocumentMouseUp);
    document.addEventListener("click", function primeAudio() {
      ensureAudioContext();
    }, { once: true });
    detectVideoChanges();
    attachVideoMetadataListener();
    console.log("Initialized (AudioContext deferred until first user interaction).");

    // Insert custom CSS to raise the playhead's z-index above the cue markers.
    const playheadStyle = document.createElement("style");
    playheadStyle.textContent = `
      .ytp-play-progress {
        z-index: 2147483648 !important;
      }
    `;
    document.head.appendChild(playheadStyle);

  } catch (err) {
    console.error("Initialization error:", err.message || err);
  }
}

initialize();
})();

// --- MIDI integration for random cues / suggest cues ---
if (typeof midiNotes !== "undefined" && midiNotes.randomCues !== undefined) {
  // Attach MIDI handler if possible
  if (typeof window.handleMidiNote === "function") {
    // If there's a global MIDI handler, wrap it
    const origMidiHandler = window.handleMidiNote;
    window.handleMidiNote = function(note, velocity, opts) {
      // Check for randomCues note
      if (note === midiNotes.randomCues) {
        // If modifier is pressed (Shift note or isModPressed), suggest cues
        if ((typeof isModPressed !== "undefined" && isModPressed) ||
            (opts && opts.shift)) {
          suggestCuesFromTransients();
        } else {
          placeRandomCues();
        }
        return;
      }
      return origMidiHandler(note, velocity, opts);
    };
  } else if (typeof window.onMidiMessage === "function") {
    // If onMidiMessage exists, you could patch it here similarly
    // (left as a comment for further integration)
  }
}

// Make minimal UI bar responsive on smaller videos
(() => {
  const style = document.createElement('style');
  style.id = 'ytbm-minimal-ui-responsive';
  style.textContent = `
    .ytbm-minimal-bar {
      display: flex !important;
      flex-wrap: wrap !important;
      overflow-x: auto !important;
      gap: 4px !important;
    }
  `;
  document.head.appendChild(style);
})();
