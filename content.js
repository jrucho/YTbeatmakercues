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
  const MAX_AUDIO_LOOPS = 4; // limit simultaneous audio loops
  const PLAY_PADDING = 0.02; // shorter scheduling for lower latency
  const LOOP_CROSSFADE = 0.001; // smoother boundaries without changing length
  const LOOP_COLORS = ['#0ff', '#f0f', '#ff0', '#fa0'];
  let cuePoints = {},
      sampleKeys = { kick: "é", hihat: "à", snare: "$" },
      // Additional extension-wide keystrokes that can be rebound:
      extensionKeys = {
        looperA: "r",
        looperB: "s",
        looperC: "d",
        looperD: "f",
        videoLooper: "v",
        compressor: "c",
        eq: "e",
        undo: "u",
        pitchDown: ",",
        pitchUp: ".",
        // NEW: Reverb + Cassette toggles
        reverb: "q",
        cassette: "w",
        randomCues: "-",
        instrumentToggle: "n",
        fxPad: "x"
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
        looperA: 34,
        looperB: 60,
        looperC: 61,
        looperD: 62,
        undo: 35,
        eqToggle: 33,   // MIDI note to toggle EQ
        compToggle: 32, // MIDI note to toggle Compressor
        // NEW: VideoLooper at default note 31
        videoLooper: 31,
        // NEW: Reverb / Cassette
        reverbToggle: 29,
        cassetteToggle: 30,
        randomCues: 28,
        instrumentToggle: 27,
        fxPadToggle: 26,
        superKnob: 71,         // MIDI CC to move selected cue
        fxPadX: 16,            // MIDI CC for FX pad X axis
        fxPadY: 17             // MIDI CC for FX pad Y axis
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
      audioLoopBuffers = new Array(MAX_AUDIO_LOOPS).fill(null),
      activeLoopIndex = 0,
      loopSources = new Array(MAX_AUDIO_LOOPS).fill(null),
      loopGainNodes = new Array(MAX_AUDIO_LOOPS).fill(null),
      loopPlaying = new Array(MAX_AUDIO_LOOPS).fill(false),
      recordingNewLoop = false,
      newLoopStartTimeout = null,
      pendingPlayTimeout = null,
      pendingStopTimeouts = new Array(MAX_AUDIO_LOOPS).fill(null),
      scheduledStopTime = null,
      loopsBPM = null,
      baseLoopDuration = null,
      audioLoopRates = new Array(MAX_AUDIO_LOOPS).fill(1),
      loopDurations = new Array(MAX_AUDIO_LOOPS).fill(0),
      loopStartOffsets = new Array(MAX_AUDIO_LOOPS).fill(0),
      masterLoopIndex = null,
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
      fxPadButton = null,
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
      instrumentButton = null,
      instrumentButtonMin = null,
      instrumentPowerButton = null,
      detectBpmButton = null,
      minimalActive = true,
      loopProgressFills = new Array(MAX_AUDIO_LOOPS).fill(null),
      loopProgressFillsMin = new Array(MAX_AUDIO_LOOPS).fill(null),
      looperPulseEl = null,
      looperPulseElMin = null,
      loopProgressRAF = null,
      // Overdub timers
      overdubStartTimeout = null,
      overdubStopTimeout = null,
      // Double-press logic
      clickDelay = 300,
      holdEraseDelay = 400,
      lastClickTime = 0,
      isDoublePress = false,
      doublePressHoldStartTime = null,
      lastClickTimeVideo = 0,
      isDoublePressVideo = false,
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
      isShiftKeyDown = false,
      pitchDownInterval = null,
      pitchUpInterval = null,
      // Track last processed MIDI message to filter duplicates
      lastMidiTimestamp = 0,
      lastMidiData = [],
      currentlyDetectingMidiControl = null,
      selectedCueKey = null,
      lastSuperKnobValue = null,
      lastSuperKnobDirection = 0,
      cueSaveTimeout = null,
      superKnobSpeedSelect = null,
      superKnobSpeedLevel = parseInt(localStorage.getItem('ytbm_superKnobSpeed') || '1', 10),
      superKnobStep = 0.03,
      // 4-Bus Audio nodes
      audioContext = null,
      videoGain = null,
      samplesGain = null,
      loopAudioGain = null,
      instrumentGain = null,
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
      instrumentPreset = 0,
      instrumentLastPreset = 1,
      instrumentLayers = [1],
      instrumentOctave = 3,
      instrumentVoices = {},
      instrumentPitchSemitone = 0,
      instrumentPitchFollowVideo = true,
      instrumentTranspose = 0,
      instrumentPitchRatio = 1,
      instrumentPitchSlider = null,
      instrumentPitchValueLabel = null,
      instrumentPitchSyncCheck = null,
      instrumentTransposeSlider = null,
      instrumentTransposeValueLabel = null,
      instrumentOscSelect = null,
      instrumentEngineSelect = null,
      instrumentFilterSlider = null,
      instrumentQSlider = null,
      instrumentASlider = null,
      instrumentDSlider = null,
      instrumentSSlider = null,
      instrumentRSlider = null,
      instrumentSampleLabel = null,
      instrumentFilterValue = null,
      instrumentQValue = null,
      instrumentAValue = null,
      instrumentDValue = null,
      instrumentSValue = null,
      instrumentRValue = null,
      instrumentVolumeSlider = null,
      instrumentDelaySlider = null,
      instrumentDelayMixSlider = null,
      instrumentReverbMixSlider = null,
      instrumentCompThreshSlider = null,
      instrumentLimiterThreshSlider = null,
      instrumentLfoRateSlider = null,
      instrumentLfoDepthSlider = null,
      instrumentVoiceModeSelect = null,
      instrumentScaleSelect = null,
      instrumentTuneSlider = null,
      instrumentTuneValue = null,
      instrumentScale = 'chromatic',
      instDelayNode = null,
      instDelayMix = null,
      instReverbNode = null,
      instReverbMix = null,
      instCompNode = null,
      instLimiterNode = null,
      instVolumeNode = null,
      instLfoOsc = null,
      instLfoGain = null,
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
      instrumentWindowContainer = null,
      // We'll keep them to identify which button is which
      reverbButton = null,
      cassetteButton = null,
      reverbButtonMin = null,
      cassetteButtonMin = null,
      pitchTargetButton = null,
      pitchTargetButtonMin = null,
      fxPadContainer = null,
      fxPadCanvas = null,
      fxPadDragHandle = null,
      fxPadDropdowns = [],
      fxPadStickyBtn = null,
      fxPadModeBtn = null,
      fxPadMultiMode = false,
      fxPadAnimId = 0,
      fxPadPrev = {x:0,y:0},
      fxPadLastTime = 0,
      fxPadEngine = null,
      fxPadMasterIn = null,
      fxPadMasterOut = null,
      fxPadLeveler = null,
      fxPadSetEffect = null,
      fxPadTriggerCorner = null,
      fxPadActive = false,
      fxPadBall = {x:0.5,y:0.5,vx:0,vy:0},
      fxPadSticky = false,
      fxPadDragging = false;
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
  const BUILTIN_PRESET_COUNT = 12;
  const PRESET_COLORS = [
    "#52a3cc",
    "#cca352",
    "#cc5252",
    "#a352cc",
    "#cc00a3",
    "#7aa3cc",
    "#a3cccc",
    "#cca37a",
    "#7acc7a",
    "#cc7a7a",
    "#7a7acc"
  ];
  const MIDI_PRESET_STORAGE_KEY = "ytbm_midiPresets_v1";
  const INSTRUMENT_STATE_KEY = "ytbm_instrument_state_v1";
  const SAMPLE_PACK_STORAGE_KEY = "ytbm_samplePacks_v1";
  let WAVETABLES = {};
  let defaultSampleBuffer = null;
  function randomPresetColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue},70%,60%)`;
  }

  function createWavetable(harmonics) {
    const len = harmonics.length + 1;
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    for (let i = 1; i < len; i++) imag[i] = harmonics[i - 1];
    return audioContext.createPeriodicWave(real, imag);
  }

  function generateDefaultSample(ctx) {
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.sin(2 * Math.PI * 220 * i / ctx.sampleRate) * Math.exp(-3 * i / len);
    }
    return buf;
  }

  function initInstrumentAssets() {
    if (!audioContext) return;
    WAVETABLES.organ = createWavetable([0, 1, 0.5, 0.25, 0.1]);
    WAVETABLES.bright = createWavetable([1, 0.8, 0.6, 0.4, 0.2]);
    defaultSampleBuffer = generateDefaultSample(audioContext);
    instrumentPresets.forEach(p => {
      if (p && p.engine === 'sampler' && !p.sample) p.sample = defaultSampleBuffer;
    });
  }
  // Speed level 1 matches the old fastest rate. Levels 2 and 3 are
  // progressively quicker for rapid cue movement.
const superKnobSpeedMap = { 1: 0.12, 2: 0.25, 3: 0.5 };
  updateSuperKnobStep();

  // When the instrument is active, the number row becomes a mini keyboard
  // using twelve keys for chromatic notes starting from the selected octave.
  const KEYBOARD_INST_KEYS = ['1','2','3','4','5','6','7','8','9','0','-','='];
  function getScaleOffset(index) {
    if (instrumentScale === 'major') {
      const major = [0,2,4,5,7,9,11,12,14,16,17,19];
      return major[index];
    } else if (instrumentScale === 'minor') {
      const minor = [0,2,3,5,7,8,10,12,14,15,17,19];
      return minor[index];
    }
    return index; // chromatic
  }
  function getInstBaseMidi() {
    return instrumentOctave * 12 + instrumentTranspose;
  }

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

function updateSuperKnobStep() {
  superKnobStep = superKnobSpeedMap[superKnobSpeedLevel] || 0.03;
  localStorage.setItem('ytbm_superKnobSpeed', String(superKnobSpeedLevel));
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
    lastSuperKnobValue = null;
    lastSuperKnobDirection = 0;
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
      if (instrumentPreset > 0) return; // use number row for synth notes
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

function getNextBarTime(afterTime) {
  if (loopStartAbsoluteTime === null) return afterTime;
  const cycle = Math.max(baseLoopDuration || 0, ...loopDurations);
  if (!cycle) return afterTime;
  return loopStartAbsoluteTime + Math.ceil((afterTime - loopStartAbsoluteTime) / cycle) * cycle;
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
  const channels = frames.reduce((m, f) => Math.max(m, f.length), 0);
  const length = frames.reduce((t, f) => t + (f[0] ? f[0].length : 0), 0);
  const buf = audioContext.createBuffer(channels, length, audioContext.sampleRate);
  let offset = 0;
  for (const block of frames) {
    const len = block[0] ? block[0].length : 0;
    for (let c = 0; c < channels; c++) {
      const src = block[c] || block[0] || new Float32Array(len);
      buf.getChannelData(c).set(src, offset);
    }
    offset += len;
  }
  finalizeLoopBuffer(buf);
}

function finalizeLoopBuffer(buf) {
  // Older versions trimmed leading/trailing silence which sometimes
  // chopped short percussive sounds like hihats. Remove the automatic
  // trimming so the loop is kept exactly as recorded.

  let peak = measurePeak(buf);
  if (peak > 1.0) scaleBuffer(buf, 1.0 / peak);
  // Smooth the transition between loop boundaries
  crossfadeLoop(buf, LOOP_CROSSFADE);

  pushUndoState();
  let exactDur = buf.length / buf.sampleRate;
  if (!baseLoopDuration) {
    baseLoopDuration = exactDur;
    loopsBPM = Math.round((60 * 4) / baseLoopDuration);
  } else {
    const bars = Math.max(1, Math.round(exactDur / baseLoopDuration));
    const target = bars * baseLoopDuration;
    if (Math.abs(target - exactDur) > 0.0005) {
      const frames = Math.round(target * buf.sampleRate);
      const out = audioContext.createBuffer(buf.numberOfChannels, frames, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        out.getChannelData(c).set(buf.getChannelData(c).subarray(0, frames));
      }
      buf = out;
    }
    exactDur = target;
  }
  loopDurations[activeLoopIndex] = exactDur;
  audioLoopRates[activeLoopIndex] = 1;
  audioLoopBuffers[activeLoopIndex] = buf;
  const wasNew = recordingNewLoop;
  recordingNewLoop = false;
  loopBuffer = buf;
  loopPlaying[activeLoopIndex] = true;
  updateMasterLoopIndex();

  looperState = "playing";
  if (wasNew && loopSources.some(Boolean)) {
    const when = audioContext.currentTime + PLAY_PADDING;
    let offset = 0;
    if (scheduledStopTime !== null) {
      offset = Math.max(0, audioContext.currentTime - scheduledStopTime);
    }
    playSingleLoop(activeLoopIndex, when, offset);
  } else {
    playLoop();
  }
  scheduledStopTime = null;
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
  if (newLoopStartTimeout) { clearTimeout(newLoopStartTimeout); newLoopStartTimeout = null; }
  if (pendingPlayTimeout) { clearTimeout(pendingPlayTimeout); pendingPlayTimeout = null; }
  pendingStopTimeouts.forEach((t, i) => { if (t) clearTimeout(t); pendingStopTimeouts[i] = null; });
  loopPlaying.fill(false);
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
    audioLoopBuffers: audioLoopBuffers.slice(),
    audioLoopRates: audioLoopRates.slice(),
    loopPlaying: loopPlaying.slice(),
    baseLoopDuration,
    loopsBPM,
    activeLoopIndex,
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
  stopAllLoopSources();
  pendingStopTimeouts.forEach((t, i) => { if (t) clearTimeout(t); pendingStopTimeouts[i] = null; });
  if (newLoopStartTimeout) { clearTimeout(newLoopStartTimeout); newLoopStartTimeout = null; }

  loopBuffer = st.loopBuffer;
  looperState = st.looperState;
  audioLoopBuffers = st.audioLoopBuffers.slice();
  audioLoopRates = st.audioLoopRates.slice();
  loopPlaying = st.loopPlaying.slice();
  baseLoopDuration = st.baseLoopDuration;
  loopsBPM = st.loopsBPM;
  activeLoopIndex = st.activeLoopIndex;
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
    looperState = "idle";
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
  updateLooperButtonLabel();
  updateLoopProgressState();
}
function updateVideoLooperButtonColor() {
  if (!videoLooperButton) return;
  let c = "grey";
  if (videoLooperState === "recording") c = "red";
  else if (videoLooperState === "playing") c = "green";
  videoLooperButton.style.backgroundColor = (videoLooperState === "idle") ? "grey" : c;
}

function updateLooperButtonLabel() {
  if (!unifiedLooperButton) return;
  let active = [];
  for (let i = 0; i < MAX_AUDIO_LOOPS; i++) {
    if (audioLoopBuffers[i] && (loopPlaying[i] || (looperState !== "idle" && activeLoopIndex === i)))
      active.push(String.fromCharCode(65 + i));
  }
  if (active.length === 0) {
    unifiedLooperButton.innerText = "AudioLoops(R/S/D/F)";
  } else {
    unifiedLooperButton.innerText = "Loops:" + active.join(" ");
  }
}

function updateLoopProgressState() {
  if (looperState === "idle" && videoLooperState === "idle" && !loopPlaying.some(p => p)) {
    stopLoopProgress();
  } else {
    startLoopProgress();
  }
}

function startLoopProgress() {
  if (loopProgressRAF) return;
  loopProgressRAF = requestAnimationFrame(loopProgressStep);
}

function stopLoopProgress() {
  if (loopProgressRAF) cancelAnimationFrame(loopProgressRAF);
  loopProgressRAF = null;
  loopProgressFills.forEach(f => { if (f) { f.style.width = '0%'; f.style.opacity = 0; } });
  loopProgressFillsMin.forEach(f => { if (f) { f.style.width = '0%'; f.style.opacity = 0; } });
  if (looperPulseEl) looperPulseEl.style.opacity = 0;
  if (looperPulseElMin) looperPulseElMin.style.opacity = 0;
}

function loopProgressStep() {
  loopProgressRAF = requestAnimationFrame(loopProgressStep);
  if (!audioContext || !baseLoopDuration) return;
  const now = audioContext.currentTime;
  let elapsed = now - loopStartAbsoluteTime;
  if (elapsed < 0) elapsed = 0;
  let baseDur = baseLoopDuration;
  if (pitchTarget === "loop") baseDur /= getCurrentPitchRate();
  const beatDur = baseDur / 4;
  const beatProg = elapsed % beatDur;
  const pulse = 1 - (beatProg / beatDur);
  for (let i = 0; i < MAX_AUDIO_LOOPS; i++) {
    const active = loopPlaying[i] || (looperState !== "idle" && activeLoopIndex === i);
    const adv = loopProgressFills[i];
    const min = loopProgressFillsMin[i];
    const ld = loopDurations[i] || baseLoopDuration;
    let dur = ld;
    if (pitchTarget === "loop") dur /= getCurrentPitchRate();
    const offset = loopStartOffsets[i] || 0;
    const progress = (elapsed - offset) % dur;
    const adj = progress < 0 ? progress + dur : progress;
    const pct = (adj / dur) * 100;
    const bar = Math.floor((adj / dur) * 4);
    if (adv) {
      adv.style.width = pct + '%';
      adv.style.opacity = active ? 1 : 0;
      Array.from(adv.parentElement.querySelectorAll('.bar-ind'))
        .forEach((el, idx) => el.style.opacity = active && idx === bar ? 1 : 0.3);
    }
    if (min) {
      min.style.width = pct + '%';
      min.style.opacity = active ? 1 : 0;
      Array.from(min.parentElement.querySelectorAll('.bar-ind'))
        .forEach((el, idx) => el.style.opacity = active && idx === bar ? 1 : 0.3);
    }
  }
  const showPulse = looperState === "recording" || looperState === "overdubbing";
  if (looperPulseEl) looperPulseEl.style.opacity = showPulse ? pulse : 0;
  if (looperPulseElMin) looperPulseElMin.style.opacity = showPulse ? pulse : 0;
}

function blinkButton(element, updateFn, color = "magenta", duration = 150) {
  if (!element) return;
  const prev = element.style.backgroundColor;
  element.style.backgroundColor = color;
  setTimeout(() => {
    if (typeof updateFn === "function") updateFn();
    else element.style.backgroundColor = prev;
  }, duration);
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

function setInstrumentPreset(idx) {
  instrumentPreset = idx;
  instrumentLayers = idx > 0 ? [idx] : [];
  if (instrumentPreset > 0) instrumentLastPreset = instrumentPreset;
  if (instrumentPreset === 0) {
    for (const n of Object.keys(instrumentVoices)) stopInstrumentNote(Number(n));
  }
  const cfg = instrumentPresets[instrumentPreset];
  if (cfg) {
    if (instVolumeNode && typeof cfg.volume === 'number') instVolumeNode.gain.value = cfg.volume;
    if (instCompNode && typeof cfg.compThresh === 'number') instCompNode.threshold.value = cfg.compThresh;
    if (instLimiterNode && typeof cfg.limitThresh === 'number') instLimiterNode.threshold.value = cfg.limitThresh;
  }
  updateInstrumentButtonColor();
  refreshInstrumentEditFields();
  saveInstrumentStateToLocalStorage();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function setInstrumentLayers(indices) {
  instrumentLayers = indices.filter(i => i > 0 && i < instrumentPresets.length);
  if (instrumentLayers.length > 0) {
    instrumentPreset = instrumentLayers[0];
    instrumentLastPreset = instrumentPreset;
  } else {
    instrumentPreset = 0;
  }
  updateInstrumentButtonColor();
  refreshInstrumentEditFields();
  saveInstrumentStateToLocalStorage();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function deactivateInstrument() {
  if (audioContext && instVolumeNode) {
    const now = audioContext.currentTime;
    instVolumeNode.gain.cancelScheduledValues(now);
    instVolumeNode.gain.setValueAtTime(instVolumeNode.gain.value, now);
    instVolumeNode.gain.linearRampToValueAtTime(0, now + 0.03);
  }
  Object.values(instrumentVoices).flat().forEach(v => stopInstrumentVoiceInstant(v));
  instrumentVoices = {};
  setInstrumentPreset(0);
  if (instDelayNode) instDelayNode.delayTime.value = 0;
  if (instDelayMix) instDelayMix.gain.value = 0;
  if (instReverbMix) instReverbMix.gain.value = 0;
  if (instVolumeNode) instVolumeNode.gain.setValueAtTime(0.15, (audioContext||{currentTime:0}).currentTime + 0.05);
  if (instLfoOsc) instLfoOsc.frequency.value = 5;
  if (instLfoGain) instLfoGain.gain.value = 0;
}

function updateInstrumentButtonColor() {
  let name = "Off";
  let color = "#444";
  const firstIdx = instrumentLayers[0] || 0;
  if (firstIdx > 0) {
    const p = instrumentPresets[firstIdx];
    if (p) {
      name = p.name;
      color = p.color || PRESET_COLORS[(firstIdx - 1) % PRESET_COLORS.length];
    }
  }
  if (instrumentButton) {
    instrumentButton.innerText = `Instrument:${name}`;
    instrumentButton.style.backgroundColor = color;
  }
  if (instrumentButtonMin) {
    instrumentButtonMin.innerText = `Instrument:${name}`;
    instrumentButtonMin.style.backgroundColor = color;
  }
  if (instrumentPowerButton) {
    instrumentPowerButton.innerText = instrumentPreset === 0 ? "Power:Off" : "Power:On";
    instrumentPowerButton.style.backgroundColor = color;
  }
}

let instrumentPresets = [
  null,
  { name: 'Resonate', color: PRESET_COLORS[0], oscillator: 'sawtooth', filter: 120, q: 4, env: { a: 0.005, d: 0.1, s: 0.8, r: 0.3 }, engine: 'analog', mode: 'mono', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Precision', color: PRESET_COLORS[1], oscillator: 'triangle', filter: 250, q: 2, env: { a: 0.005, d: 0.15, s: 0.9, r: 0.25 }, engine: 'analog', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: '808 Boom', color: PRESET_COLORS[2], oscillator: 'sine', filter: 80, q: 0, env: { a: 0.005, d: 0.25, s: 1.0, r: 0.5 }, engine: 'analog', mode: 'mono', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Warm Organ', color: PRESET_COLORS[3], oscillator: 'square', filter: 400, q: 2, env: { a: 0.01, d: 0.3, s: 0.7, r: 0.3 }, engine: 'analog', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Moog Thump', color: PRESET_COLORS[4], oscillator: 'sawtooth', filter: 300, q: 2.5, env: { a: 0.005, d: 0.2, s: 0.8, r: 0.4 }, engine: 'analog', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Soft Pad', color: PRESET_COLORS[5], oscillator: 'organ', filter: 600, q: 1, env: { a: 0.05, d: 0.4, s: 0.7, r: 0.8 }, engine: 'wavetable', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'String Ensemble', color: PRESET_COLORS[6], oscillator: 'bright', filter: 900, q: 1.5, env: { a: 0.05, d: 0.3, s: 0.9, r: 0.6 }, engine: 'wavetable', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'FM Keys', color: PRESET_COLORS[7], oscillator: 'sine', filter: 500, q: 0.5, env: { a: 0.005, d: 0.25, s: 0.8, r: 0.4 }, engine: 'fm', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Pluck', color: PRESET_COLORS[8], oscillator: 'square', filter: 1200, q: 6, env: { a: 0.005, d: 0.2, s: 0, r: 0.2 }, engine: 'fm', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Sweep Lead', color: PRESET_COLORS[9], oscillator: 'sawtooth', filter: 1500, q: 5, env: { a: 0.05, d: 0.3, s: 0.4, r: 0.7 }, engine: 'fm', mode: 'poly', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Bass Cut', color: PRESET_COLORS[10], oscillator: 'sine', filter: 150, q: 0, env: { a: 0.005, d: 0.2, s: 0.9, r: 0.3 }, engine: 'analog', mode: 'poly', filterType: 'highpass', volume: 0.15, compThresh: -20, limitThresh: -3, tune: 0 },
  { name: 'Sample Tone', color: PRESET_COLORS[11], oscillator: 'sine', filter: 800, q: 0, env: { a: 0.01, d: 0.2, s: 0.8, r: 0.4 }, engine: 'sampler', mode: 'mono', filterType: 'lowpass', volume: 0.15, compThresh: -20, limitThresh: -3, sample: null, tune: 0 },
];

function randomizeInstrumentPreset() {
  const oscTypes = ['sine','square','sawtooth','triangle','organ','bright'];
  const engines = ['analog','fm','wavetable','sampler'];
  const p = instrumentPresets[instrumentPreset];
  if (!p) return;
  p.oscillator = oscTypes[Math.floor(Math.random()*oscTypes.length)];
  p.engine = engines[Math.floor(Math.random()*engines.length)];
  p.filter = 200 + Math.random()*2000;
  p.q = Math.random()*4;
  p.tune = [-24,-12,0,12,24][Math.floor(Math.random()*5)];
  p.env = { a: Math.random()*0.2, d: 0.1+Math.random()*0.3, s: 0.5+Math.random()*0.5, r: 0.2+Math.random()*0.6 };
  if (instDelayNode) instDelayNode.delayTime.value = Math.random()*0.5;
  if (instDelayMix) instDelayMix.gain.value = Math.random()*0.5;
  if (instReverbMix) instReverbMix.gain.value = 0.2+Math.random()*0.4;
  if (instVolumeNode) instVolumeNode.gain.value = 0.7+Math.random()*0.6;
  if (instCompNode) instCompNode.threshold.value = -30 + Math.random()*20;
  if (instLimiterNode) instLimiterNode.threshold.value = -12 + Math.random()*6;
  if (instLfoOsc) instLfoOsc.frequency.value = 2+Math.random()*4;
  if (instLfoGain) instLfoGain.gain.value = Math.random()*20;
  refreshInstrumentEditFields();
  saveInstrumentStateToLocalStorage();
}

function instrumentSettings() {
  return instrumentPresets[instrumentPreset];
}

function playInstrumentNote(midi) {
  if (!audioContext || instrumentLayers.length === 0) return;
  const baseMidi = midi + instrumentTranspose;
  const freqRatio = instrumentPitchRatio;
  const noteForPreset = (cfg) => baseMidi + (cfg.tune || 0);
  if (!instrumentVoices[midi]) instrumentVoices[midi] = [];

  instrumentLayers.forEach(idx => {
    const cfg = instrumentPresets[idx];
    if (!cfg) return;
    const noteMidi = noteForPreset(cfg);

    if (cfg.mode === 'legato') {
      let found = null, foundKey = null;
      for (const [k, arr] of Object.entries(instrumentVoices)) {
        for (const v of arr) {
          if (v.preset === idx) { found = v; foundKey = k; break; }
        }
        if (found) break;
      }
      if (found) {
        const freq = 440 * Math.pow(2, (noteMidi - 69) / 12) * freqRatio;
        if (found.osc) found.osc.frequency.setValueAtTime(freq, audioContext.currentTime);
        if (found.mod) found.mod.frequency.setValueAtTime((cfg.modFreq || 2) * Math.pow(2, (noteMidi - 69) / 12) * freqRatio, audioContext.currentTime);
        instrumentVoices[foundKey] = instrumentVoices[foundKey].filter(v => v !== found);
        if (!instrumentVoices[foundKey].length) delete instrumentVoices[foundKey];
        if (!instrumentVoices[midi]) instrumentVoices[midi] = [];
        instrumentVoices[midi].push(found);
        return;
      }
    }

    if (cfg.mode === 'mono') {
      for (const key of Object.keys(instrumentVoices)) {
        instrumentVoices[key] = instrumentVoices[key].filter(v => {
          if (v.preset === idx) { stopInstrumentVoiceInstant(v); return false; }
          return true;
        });
        if (!instrumentVoices[key].length) delete instrumentVoices[key];
      }
    }

    if (!instrumentVoices[midi]) instrumentVoices[midi] = [];

    if (cfg.engine === 'sampler' && cfg.sample) {
      const src = audioContext.createBufferSource();
      src.buffer = cfg.sample;
      src.playbackRate.value = Math.pow(2, (noteMidi - 60) / 12) * freqRatio;
      const g = audioContext.createGain();
      src.connect(g).connect(instrumentGain);
      src.start();
      instrumentVoices[midi].push({ src, g, env: { r: cfg.env?.r || 0 }, preset: idx });
      return;
    }

    const osc = audioContext.createOscillator();
    if (cfg.engine === 'wavetable' && WAVETABLES[cfg.oscillator]) {
      osc.setPeriodicWave(WAVETABLES[cfg.oscillator]);
    } else {
      osc.type = cfg.oscillator || 'sine';
    }
    osc.frequency.value = 440 * Math.pow(2, (noteMidi - 69) / 12) * freqRatio;
    instLfoGain.connect(osc.frequency);

    let mod = null;
    if (cfg.engine === 'fm') {
      mod = audioContext.createOscillator();
      const modGain = audioContext.createGain();
      modGain.gain.value = cfg.modIndex || 50;
      mod.frequency.value = (cfg.modFreq || 2) * Math.pow(2, (noteMidi - 69) / 12) * freqRatio;
      mod.connect(modGain).connect(osc.frequency);
      mod.start();
    }

    const f = audioContext.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cfg.filter;
    f.Q.value = cfg.q;
    const g = audioContext.createGain();
    const startT = audioContext.currentTime + 0.003;
    g.gain.setValueAtTime(0, audioContext.currentTime);
    osc.connect(f).connect(g).connect(instrumentGain);
    osc.start(startT);
    const e = cfg.env;
    let t = startT;
    g.gain.linearRampToValueAtTime(1, t + e.a);
    g.gain.linearRampToValueAtTime(e.s, t + e.a + e.d);
    instrumentVoices[midi].push({ osc, mod, filter: f, g, env: e, preset: idx });
  });
}

function stopInstrumentVoice(v) {
  const now = audioContext.currentTime;
  if (v.g) {
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setValueAtTime(v.g.gain.value, now);
    const rel = Math.max(0.02, v.env.r || 0);
    v.g.gain.linearRampToValueAtTime(0, now + rel);
  }
  const stopAt = now + Math.max(0.02, v.env.r || 0) + 0.05;
  if (v.mod) v.mod.stop(stopAt);
  if (v.osc) v.osc.stop(stopAt);
  if (v.src) v.src.stop(stopAt);
}

function stopInstrumentVoiceInstant(v) {
  const now = audioContext.currentTime;
  if (v.g) {
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setTargetAtTime(0, now, 0.005);
  }
  const stopAt = now + 0.01;
  if (v.mod) v.mod.stop(stopAt);
  if (v.osc) v.osc.stop(stopAt);
  if (v.src) v.src.stop();
}

function stopInstrumentNote(midi) {
  const voices = instrumentVoices[midi];
  if (!voices) return;
  voices.forEach(v => stopInstrumentVoice(v));
  delete instrumentVoices[midi];
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
  updateLoopProgressState();
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
      latencyHint: "interactive", // lowest possible latency
      sampleRate: 48000
    });
    setupAudioNodes();
    initInstrumentAssets();
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
    loadInstrumentStateFromLocalStorage();
    updateInstrumentPitchUI();
    updateInstrumentButtonColor();
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
  instrumentGain = audioContext.createGain(); // voice mix
  const instDelay = audioContext.createDelay();
  instDelay.delayTime.value = 0;
  instDelayMix = audioContext.createGain();
  instDelayMix.gain.value = 0;
  const instReverb = audioContext.createConvolver();
  instReverb.buffer = generateSimpleReverbIR(audioContext);
  const instRevMix = audioContext.createGain();
  instRevMix.gain.value = 0;
  const instComp = audioContext.createDynamicsCompressor();
  instComp.threshold.value = -20;
  instComp.ratio.value = 4;
  const instLimiter = audioContext.createDynamicsCompressor();
  instLimiter.threshold.value = -3;
  instLimiter.ratio.value = 20;
  const instVolume = audioContext.createGain();
  instVolume.gain.value = 0.15; // default 15% volume
  instLfoOsc = audioContext.createOscillator();
  instLfoGain = audioContext.createGain();
  instLfoOsc.type = 'sine';
  instLfoOsc.frequency.value = 5;
  instLfoGain.gain.value = 0;
  instLfoOsc.connect(instLfoGain);
  instLfoOsc.start();
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
  instrumentGain.connect(instDelay);
  instrumentGain.connect(instReverb);
  instrumentGain.connect(instComp);
  instDelay.connect(instDelayMix).connect(instComp);
  instReverb.connect(instRevMix).connect(instComp);
  instComp.connect(instLimiter).connect(instVolume).connect(bus2Gain);

  instDelayNode = instDelay;
  instReverbNode = instReverb;
  instReverbMix = instRevMix;
  instCompNode = instComp;
  instLimiterNode = instLimiter;
  instVolumeNode = instVolume;
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

  await setupFxPadNodes();

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

async function createVinylBreakNode(ctx) {
  const code = `
    class VinylBreakProc extends AudioWorkletProcessor {
      constructor(){
        super();
        this.speed = 1;
        this.len = sampleRate * 2;
        this.buf = [new Float32Array(this.len), new Float32Array(this.len)];
        this.w = 0; this.r = 0;
        this.port.onmessage = e=>{ if(e.data.speed!==undefined) this.speed=e.data.speed; };
      }
      process(inputs,outputs){
        const i=inputs[0],o=outputs[0];
        if(!i.length) return true;
        for(let n=0;n<i[0].length;n++){
          for(let c=0;c<i.length;c++){
            this.buf[c][this.w]=i[c][n];
            const ri = this.r|0;
            o[c][n]=this.buf[c][ri];
          }
          this.w=(this.w+1)%this.len;
          this.r+=this.speed;
          if(this.r>=this.len) this.r-=this.len;
        }
        return true;
      }
    }
    registerProcessor('vinyl-break', VinylBreakProc);
  `;
  const url = URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
  await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
  return new AudioWorkletNode(ctx,'vinyl-break');
}

async function createStutterNode(ctx) {
  const code = `
    class StutterProc extends AudioWorkletProcessor {
      constructor(){
        super();
        this.loop=false; this.length=2048; this.bufLen=sampleRate; this.buf=[new Float32Array(this.bufLen),new Float32Array(this.bufLen)]; this.pos=0;
        this.port.onmessage=e=>{ if(e.data.loop!==undefined) this.loop=e.data.loop; if(e.data.length) this.length=Math.min(this.bufLen,e.data.length); };
      }
      process(inputs,outputs){
        const i=inputs[0],o=outputs[0];
        if(!i.length) return true;
        for(let n=0;n<i[0].length;n++){
          for(let c=0;c<i.length;c++){
            if(!this.loop) this.buf[c][this.pos]=i[c][n];
            o[c][n]=this.buf[c][(this.pos)%this.length];
          }
          this.pos=(this.pos+1)%this.bufLen;
          if(this.loop) this.pos%=this.length;
        }
        return true;
      }
    }
    registerProcessor('stutter-proc', StutterProc);
  `;
  const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
  await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
  return new AudioWorkletNode(ctx,'stutter-proc');
}

async function createPhaserNode(ctx) {
  const code = `
    class PhaserProc extends AudioWorkletProcessor {
      constructor(){ super(); this.phase=0; this.rate=0.5; this.state=[]; }
      process(inputs,outputs){
        const i=inputs[0],o=outputs[0]; if(!i.length) return true;
        for(let c=0;c<i.length;c++) if(!this.state[c]) this.state[c]=new Array(8).fill(0);
        const len=i[0].length;
        for(let n=0;n<len;n++){
          const f=1000+800*Math.sin(this.phase); this.phase+=this.rate/sampleRate*2*Math.PI; const w=2*Math.PI*f/sampleRate; const a=(Math.sin(w)-1)/(Math.sin(w)+1);
          for(let c=0;c<i.length;c++){
            let x=i[c][n];
            for(let s=0;s<4;s++){ const y=-a*x+this.state[c][s*2]; this.state[c][s*2]=x; this.state[c][s*2+1]=y; x=y; }
            o[c][n]=x;
          }
        }
        return true;
      }
    }
    registerProcessor('phaser-proc', PhaserProc);
  `;
  const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
  await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
  return new AudioWorkletNode(ctx,'phaser-proc');
}

function createEchoBreakEffect(ctx){
  const input=ctx.createGain(); const delay=ctx.createDelay(); delay.delayTime.value=0.2; const fb=ctx.createGain(); fb.gain.value=0.3; input.connect(delay); delay.connect(fb).connect(delay); const out=ctx.createGain(); delay.connect(out); return {in:input,out,out,update(x,y){delay.delayTime.value=0.05+0.45*y; fb.gain.value=x;}};
}

function createFlangerEffect(ctx){
  const input=ctx.createGain(); const delay=ctx.createDelay(); const fb=ctx.createGain(); const lfo=ctx.createOscillator(); const lfoGain=ctx.createGain(); lfo.type='sine'; lfo.frequency.value=0.25; lfoGain.gain.value=0.005; lfo.connect(lfoGain).connect(delay.delayTime); lfo.start(); input.connect(delay); delay.connect(fb).connect(delay); const out=ctx.createGain(); delay.connect(out); return {in:input,out,out,update(x,y){lfoGain.gain.value=0.001+0.009*x; lfo.frequency.value=0.1+5*y; fb.gain.value=0.1+0.8*x;}};
}

function createTremoloEffect(ctx){
  const input=ctx.createGain(); const out=ctx.createGain(); const lfo=ctx.createOscillator(); const depth=ctx.createGain(); lfo.type='sine'; lfo.frequency.value=5; depth.gain.value=0; lfo.connect(depth).connect(out.gain); input.connect(out); lfo.start(); return {in:input,out,out,update(x,y){depth.gain.value=x; lfo.frequency.value=0.5+10*y;}};
}

function createAutopanEffect(ctx){
  const input=ctx.createGain(); const panner=ctx.createStereoPanner(); const lfo=ctx.createOscillator(); const depth=ctx.createGain(); depth.gain.value=0; lfo.type='sine'; lfo.frequency.value=2; lfo.connect(depth).connect(panner.pan); lfo.start(); input.connect(panner); const out=ctx.createGain(); panner.connect(out); return {in:input,out,out,update(x,y){depth.gain.value=x; lfo.frequency.value=0.5+8*y;}};
}

function createReverbEffect(ctx){
  const input=ctx.createGain(); const conv=ctx.createConvolver(); conv.buffer=generateSimpleReverbIR(ctx); const mix=ctx.createGain(); input.connect(conv).connect(mix); return {in:input,out:mix,update(x,y){mix.gain.value=Math.max(0,Math.min(1,x));}};
}

async function createVinylBreakEffect(ctx){
  const node=await createVinylBreakNode(ctx); return {in:node, out:node, update(x,y){ node.port.postMessage({speed:0.2+0.8*(1-y)}); }};
}

async function createStutterEffect(ctx){
  const node=await createStutterNode(ctx);
  const rate = ctx.sampleRate;
  return {
    in: node,
    out: node,
    update(x,y,held){
      const len = Math.floor(rate * (0.1 + 0.4 * y));
      node.port.postMessage({loop: held, length: len});
    }
  };
}

async function createBeatRepeatEffect(ctx){
  const input = ctx.createGain();
  const node = await createStutterNode(ctx);
  const mix = ctx.createGain();
  input.connect(node).connect(mix);
  const rate = ctx.sampleRate;
  return {
    in: input,
    out: mix,
    update(x,y){
      const len = Math.floor(rate * (0.05 + 0.45 * y));
      node.port.postMessage({loop: true, length: len});
      mix.gain.value = x;
    }
  };
}

async function createPhaserEffect(ctx){
  const node=await createPhaserNode(ctx); return {in:node,out:node,update(x,y){ node.port.postMessage({}); }};
}

function createDuckCompEffect(ctx){
  const input=ctx.createGain();
  const comp=ctx.createDynamicsCompressor();
  comp.threshold.value=-30;
  comp.ratio.value=12;
  const out=ctx.createGain();
  input.connect(comp).connect(out);
  return {in:input,out,out,update(x,y){comp.threshold.value=-60+30*x; comp.release.value=0.05+0.45*y;}};
}

function createOneShotDelayEffect(ctx){
  const input=ctx.createGain();
  const delay=ctx.createDelay();
  delay.delayTime.value=0.25;
  const out=ctx.createGain();
  input.connect(delay).connect(out);
  return {in:input,out,out,update(x,y){delay.delayTime.value=0.05+0.45*y; out.gain.value=x;}};
}

async function createStutterGrainEffect(ctx){
  return createStutterEffect(ctx);
}

function createFreezeLooperEffect(ctx){
  const del=ctx.createDelay(1);
  const fb=ctx.createGain(); fb.gain.value=0;
  del.connect(fb).connect(del);
  const input=ctx.createGain(); input.connect(del);
  const out=ctx.createGain(); del.connect(out);
  return {in:input,out,out,update(x,y,held){fb.gain.value=held?1:0; del.delayTime.value=0.1+0.9*y;}};
}

function createJagFilterEffect(ctx){
  const input=ctx.createGain();
  const lpf=ctx.createBiquadFilter(); lpf.type='lowpass'; lpf.frequency.value=1000;
  const gate=ctx.createGain(); const lfo=ctx.createOscillator(); lfo.type='square'; lfo.frequency.value=4; lfo.connect(gate.gain); lfo.start();
  input.connect(lpf).connect(gate);
  const out=ctx.createGain(); gate.connect(out);
  return {in:input,out,out,update(x,y){lpf.frequency.value=300+3000*y; lfo.frequency.value=1+9*x;}};
}

async function createBitDecimatorEffect(ctx){
  const code=`class BitDec extends AudioWorkletProcessor{constructor(){super();this.bits=4;this.port.onmessage=e=>{if(e.data.bits) this.bits=e.data.bits;};}process(i,o){const input=i[0],out=o[0];if(!input) return true;for(let c=0;c<input.length;c++){for(let n=0;n<input[c].length;n++){let v=input[c][n];const step=1/((1<<this.bits)-1);out[c][n]=Math.round(v/step)*step;}}return true;} }registerProcessor('bit-dec',BitDec);`;
  const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
  await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
  const node=new AudioWorkletNode(ctx,'bit-dec');
  return {in:node,out:node,update(x,y){node.port.postMessage({bits:4+Math.round(8*(1-x))});}};
}

function createCenterCancelEffect(ctx){
  const input=ctx.createGain();
  const splitter=ctx.createChannelSplitter(2);
  const invert=ctx.createGain(); invert.gain.value=-1;
  const merger=ctx.createChannelMerger(2);
  input.connect(splitter);
  splitter.connect(merger,0,0);
  splitter.connect(invert).connect(merger,1);
  const out=ctx.createGain(); merger.connect(out);
  return {in:input,out,out,update(x,y){out.gain.value=x;}};
}

async function createLoopBreakerEffect(ctx){
  const vinyl=await createVinylBreakEffect(ctx);
  const stut=await createStutterEffect(ctx);
  vinyl.out.connect(stut.in);
  return {in:vinyl.in,out:stut.out,update(x,y,held){vinyl.update(x,y); stut.update(x,y,held);}};
}

function createResonatorEffect(ctx){
  const input=ctx.createGain(); const out=ctx.createGain();
  const freqs=[400,800,1200]; const filters=freqs.map(f=>{const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=f; bp.Q.value=10; input.connect(bp); bp.connect(out); return bp;});
  return {in:input,out,out,update(x,y){filters.forEach((bp,i)=>{bp.frequency.value=freqs[i]*(0.5+y);}); out.gain.value=x;}};
}

function createReverbBreakEffect(ctx){
  const input=ctx.createGain(); const conv=ctx.createConvolver(); conv.buffer=generateSimpleReverbIR(ctx); const dry=ctx.createGain(); const wet=ctx.createGain(); input.connect(dry); input.connect(conv).connect(wet); const out=ctx.createGain(); dry.connect(out); wet.connect(out); return {in:input,out,out,update(x,y){dry.gain.value=1-x; wet.gain.value=x;}};
}

async function createPitchUpEffect(ctx){
  const node=await createVinylBreakNode(ctx); node.port.postMessage({speed:Math.pow(2,7/12)}); return {in:node,out:node,update(){}};
}

function createFlangerJetEffect(ctx){
  const input=ctx.createGain(); const delay=ctx.createDelay(); const fb=ctx.createGain(); const lfo=ctx.createOscillator(); const lfoGain=ctx.createGain(); lfo.type='triangle'; lfo.frequency.value=0.2; lfoGain.gain.value=0.005; lfo.connect(lfoGain).connect(delay.delayTime); lfo.start(); input.connect(delay); delay.connect(fb).connect(delay); const out=ctx.createGain(); delay.connect(out); return {in:input,out,out,update(x,y){lfoGain.gain.value=0.002+0.008*x; fb.gain.value=-0.5+1*y; lfo.frequency.value=0.1+4*y;}};
}

async function createPhaserSweepEffect(ctx){
  return createPhaserEffect(ctx);
}

function createLevelComp(ctx){
  const c=ctx.createDynamicsCompressor();
  c.threshold.value=-12;
  c.knee.value=10;
  c.ratio.value=4;
  c.attack.value=0.01;
  c.release.value=0.1;
  return c;
}

function makeDriveCurve(a){
  const n=1024;
  const curve=new Float32Array(n);
  for(let i=0;i<n;i++){const x=i*2/n-1;curve[i]=(1+a)*x/(1+a*Math.abs(x));}
  return curve;
}

function createFilterDriveEffect(ctx){
  const input=ctx.createGain();
  const filt=ctx.createBiquadFilter();
  filt.type='lowpass';
  const shaper=ctx.createWaveShaper();
  shaper.curve=makeDriveCurve(1);
  const out=createLevelComp(ctx);
  input.connect(filt).connect(shaper).connect(out);
  return {in:input,out,out,update(x,y){filt.frequency.value=300+15000*y;shaper.curve=makeDriveCurve(1+5*x);}};
}

function createPitchEffect(ctx){
  const input=ctx.createGain();
  const delay=ctx.createDelay();
  const lfo=ctx.createOscillator();
  const depth=ctx.createGain();
  depth.gain.value=0;
  lfo.type='sine';
  lfo.frequency.value=1;
  lfo.connect(depth).connect(delay.delayTime); lfo.start();
  input.connect(delay);
  const out=createLevelComp(ctx); delay.connect(out);
  return {in:input,out,out,update(x,y){depth.gain.value=0.002*x; lfo.frequency.value=0.5+5*y;}};
}

function createDelayEffect(ctx){
  const input=ctx.createGain();
  const del=ctx.createDelay();
  const fb=ctx.createGain(); fb.gain.value=0.3;
  del.connect(fb).connect(del);
  input.connect(del);
  const out=createLevelComp(ctx); del.connect(out);
  return {in:input,out,out,update(x,y){del.delayTime.value=0.05+0.45*y; fb.gain.value=x;}};
}

function createIsolatorEffect(ctx){
  const input=ctx.createGain();
  const hpf=ctx.createBiquadFilter(); hpf.type='highpass';
  const lpf=ctx.createBiquadFilter(); lpf.type='lowpass';
  input.connect(hpf).connect(lpf);
  const out=createLevelComp(ctx); lpf.connect(out);
  return {in:input,out,out,update(x,y){hpf.frequency.value=20+200*x; lpf.frequency.value=5000+15000*y;}};
}

function createVinylSimEffect(ctx){
  const input=ctx.createGain();
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=8000;
  const noise=ctx.createBufferSource();
  const buf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
  const data=buf.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*0.02;
  noise.buffer=buf; noise.loop=true; noise.start();
  const mix=ctx.createGain(); mix.gain.value=0.2;
  noise.connect(mix);
  const out=createLevelComp(ctx);
  input.connect(lp).connect(out);
  mix.connect(out);
  return {in:input,out,out,update(x,y){lp.frequency.value=4000+8000*y; mix.gain.value=0.05+0.4*x;}};
}

function createTapeEchoEffect(ctx){
  const e=createDelayEffect(ctx);
  return e;
}

function createChorusEffect(ctx){
  const input=ctx.createGain();
  const delay=ctx.createDelay(); delay.delayTime.value=0.03;
  const lfo=ctx.createOscillator(); const depth=ctx.createGain(); depth.gain.value=0.01;
  lfo.frequency.value=1.5; lfo.connect(depth).connect(delay.delayTime); lfo.start();
  input.connect(delay);
  const out=createLevelComp(ctx); delay.connect(out);
  return {in:input,out,out,update(x,y){depth.gain.value=0.002+0.02*x; lfo.frequency.value=0.2+5*y;}};
}

function createTremoloPanEffect(ctx){
  const input=ctx.createGain();
  const pan=ctx.createStereoPanner();
  const lfo=ctx.createOscillator(); const depth=ctx.createGain(); depth.gain.value=0;
  lfo.type='sine'; lfo.frequency.value=2; lfo.connect(depth).connect(pan.pan); lfo.start();
  input.connect(pan);
  const out=createLevelComp(ctx); pan.connect(out);
  return {in:input,out,out,update(x,y){depth.gain.value=x; lfo.frequency.value=0.5+10*y;}};
}

function createDistortionEffect(ctx,amt){
  const input=ctx.createGain();
  const sh=ctx.createWaveShaper(); sh.curve=makeDriveCurve(amt||2);
  const out=createLevelComp(ctx); input.connect(sh).connect(out);
  return {in:input,out,out,update(x){sh.curve=makeDriveCurve(1+amt*x*5);}};
}

function createWahEffect(ctx){
  const input=ctx.createGain();
  const bp=ctx.createBiquadFilter(); bp.type='bandpass';
  const lfo=ctx.createOscillator(); const depth=ctx.createGain(); depth.gain.value=300;
  lfo.frequency.value=2; lfo.connect(depth).connect(bp.frequency); lfo.start();
  input.connect(bp);
  const out=createLevelComp(ctx); bp.connect(out);
  return {in:input,out,out,update(x,y){depth.gain.value=200+2000*x; lfo.frequency.value=0.5+5*y;}};
}

function createOctaveEffect(ctx){
  return createPitchEffect(ctx);
}

function createCompressorEffect(ctx){
  const input=ctx.createGain();
  const comp=createLevelComp(ctx);
  input.connect(comp);
  return {in:input,out:comp,update(){}};
}

function createEqualizerEffect(ctx){
  const input=ctx.createGain();
  const low=ctx.createBiquadFilter(); low.type='lowshelf';
  const mid=ctx.createBiquadFilter(); mid.type='peaking'; mid.frequency.value=1000;
  const high=ctx.createBiquadFilter(); high.type='highshelf'; high.frequency.value=6000;
  input.connect(low).connect(mid).connect(high);
  const out=createLevelComp(ctx); high.connect(out);
  return {in:input,out,out,update(x,y){low.gain.value=10*(x-0.5); high.gain.value=10*(y-0.5);}};
}

async function createBitCrashEffect(ctx){
  return createBitDecimatorEffect(ctx);
}

function createNoiseGenEffect(ctx){
  const input=ctx.createGain();
  const noise=ctx.createBufferSource();
  const buf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
  const data=buf.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
  noise.buffer=buf; noise.loop=true; noise.start();
  const mix=ctx.createGain(); mix.gain.value=0.3;
  noise.connect(mix);
  const out=createLevelComp(ctx); input.connect(out); mix.connect(out);
  return {in:input,out,out,update(x){mix.gain.value=x;}};
}

function createVinylSimMfxEffect(ctx){
  const base=createVinylSimEffect(ctx);
  base.out.connect(base.out.context.createGain());
  return base;
}

function createRadioTuningEffect(ctx){
  const input=ctx.createGain();
  const bp=ctx.createBiquadFilter(); bp.type='bandpass';
  const noise=createNoiseGenEffect(ctx);
  input.connect(bp);
  const out=createLevelComp(ctx); bp.connect(out); noise.out.connect(out);
  return {in:input,out,out,update(x,y){bp.frequency.value=500+5000*y; noise.update(x);}};
}

function createSlicerFlangerEffect(ctx){
  const flg=createFlangerEffect(ctx);
  const gate=ctx.createGain(); gate.gain.value=1;
  const lfo=ctx.createOscillator(); lfo.type='square'; lfo.frequency.value=4; lfo.connect(gate.gain); lfo.start();
  const input=ctx.createGain();
  input.connect(gate).connect(flg.in);
  return {in:input,out:flg.out,update(x,y){gate.gain.value=x; flg.update(x,y);}};
}

function createRingModEffect(ctx){
  const input=ctx.createGain();
  const mult=ctx.createGain();
  const osc=ctx.createOscillator(); osc.frequency.value=440; osc.connect(mult.gain); osc.start();
  input.connect(mult);
  const out=createLevelComp(ctx); mult.connect(out);
  return {in:input,out,out,update(x,y){osc.frequency.value=50+1000*y; mult.gain.value=x;}};
}

function createChromPitchShiftEffect(ctx){
  return createPitchEffect(ctx);
}

function createPitchFineEffect(ctx){
  return createPitchEffect(ctx);
}

function createSubsonicEffect(ctx){
  const input=ctx.createGain();
  const bp=ctx.createBiquadFilter(); bp.type='lowpass'; bp.frequency.value=80;
  const out=createLevelComp(ctx); input.connect(bp).connect(out);
  return {in:input,out,out,update(x){bp.frequency.value=40+120*x;}};
}

function createBpmLooperEffect(ctx){
  return createBeatRepeatEffect(ctx);
}

async function createFxPadEngine(ctx){
  const nodeIn=ctx.createGain();
  const nodeOut=ctx.createGain();
  const wetGains=[0,1,2,3].map(()=>{const g=ctx.createGain(); g.gain.value=0; g.connect(nodeOut); return g;});
  const effects=[null,null,null,null];
  let multiMode=false;
  function setMultiMode(m){
    multiMode=m;
    if(!multiMode){
      wetGains[0].gain.setValueAtTime(1,ctx.currentTime);
      for(let i=1;i<4;i++) wetGains[i].gain.setValueAtTime(0,ctx.currentTime);
    }else{
      triggerCorner(0.5,0.5,false);
    }
  }
  async function setEffect(i,type){
    if(effects[i]){
      try{ nodeIn.disconnect(effects[i].in); }catch(e){}
      try{ effects[i].out.disconnect(wetGains[i]); }catch(e){}
    }
    let e=null;
    if(type==='filterDrive') e=createFilterDriveEffect(ctx);
    else if(type==='pitch') e=createPitchEffect(ctx);
    else if(type==='delay') e=createDelayEffect(ctx);
    else if(type==='isolator') e=createIsolatorEffect(ctx);
    else if(type==='vinylSim') e=createVinylSimEffect(ctx);
    else if(type==='reverb') e=createReverbEffect(ctx);
    else if(type==='tapeEcho') e=createTapeEchoEffect(ctx);
    else if(type==='chorus') e=createChorusEffect(ctx);
    else if(type==='flanger') e=createFlangerEffect(ctx);
    else if(type==='phaser') e=await createPhaserEffect(ctx);
    else if(type==='tremoloPan') e=createTremoloPanEffect(ctx);
    else if(type==='distortion') e=createDistortionEffect(ctx,2);
    else if(type==='overdrive') e=createDistortionEffect(ctx,4);
    else if(type==='fuzz') e=createDistortionEffect(ctx,8);
    else if(type==='wah') e=createWahEffect(ctx);
    else if(type==='octave') e=createOctaveEffect(ctx);
    else if(type==='compressor') e=createCompressorEffect(ctx);
    else if(type==='equalizer') e=createEqualizerEffect(ctx);
    else if(type==='bitCrash') e=await createBitCrashEffect(ctx);
    else if(type==='noiseGen') e=createNoiseGenEffect(ctx);
    else if(type==='vinylSimMfx') e=createVinylSimMfxEffect(ctx);
    else if(type==='radioTuning') e=createRadioTuningEffect(ctx);
    else if(type==='slicerFlanger') e=createSlicerFlangerEffect(ctx);
    else if(type==='ringMod') e=createRingModEffect(ctx);
    else if(type==='chromPitchShift') e=createChromPitchShiftEffect(ctx);
    else if(type==='pitchFine') e=createPitchFineEffect(ctx);
    else if(type==='centerCancel') e=createCenterCancelEffect(ctx);
    else if(type==='subsonic') e=createSubsonicEffect(ctx);
    else if(type==='bpmLooper') e=createBpmLooperEffect(ctx);
    if(e){ nodeIn.connect(e.in); e.out.connect(wetGains[i]); effects[i]=e; wetGains[i].gain.setTargetAtTime(0,ctx.currentTime,0.04); }
  }
  function triggerCorner(x,y,held){
    if(!multiMode){
      wetGains[0].gain.setValueAtTime(1,ctx.currentTime);
      if(effects[0]&&effects[0].update) effects[0].update(x,y,held);
      return;
    }
    const weights=[(1-x)*(1-y), x*(1-y), (1-x)*y, x*y];
    for(let k=0;k<4;k++){
      wetGains[k].gain.linearRampToValueAtTime(weights[k],ctx.currentTime+0.04);
      if(effects[k]&&effects[k].update) effects[k].update(x,y,held);
    }
  }
  await setEffect(0,'filterDrive');
  await setEffect(1,'delay');
  await setEffect(2,'flanger');
  await setEffect(3,'reverb');
  console.log('KaossPad OK');
  return {nodeIn,nodeOut,setEffect,triggerCorner,setMultiMode};
}

async function setupFxPadNodes() {
  fxPadEngine = await createFxPadEngine(audioContext);
  fxPadMasterIn = audioContext.createGain();
  fxPadMasterOut = audioContext.createGain();
  fxPadLeveler = createLevelComp(audioContext);
  fxPadSetEffect = fxPadEngine.setEffect;
  fxPadTriggerCorner = fxPadEngine.triggerCorner;
  fxPadEngine.setMultiMode(fxPadMultiMode);
  fxPadMasterIn.connect(fxPadEngine.nodeIn);
  fxPadEngine.nodeOut.connect(fxPadLeveler);
  fxPadLeveler.connect(fxPadMasterOut);
}


/**************************************
 * Single function to apply all FX routing
 **************************************/
function applyAllFXRouting() {
  if (!audioContext) return;
  if (!fxPadMasterIn) fxPadMasterIn = audioContext.createGain();
  if (!fxPadMasterOut) fxPadMasterOut = audioContext.createGain();
  if (!fxPadLeveler) fxPadLeveler = createLevelComp(audioContext);
  // First, disconnect everything that may have been connected:
  videoGain.disconnect();
  if (antiClickGain) antiClickGain.disconnect();
  loopAudioGain.disconnect();
  bus1Gain.disconnect();
  bus2Gain.disconnect();
  bus3Gain.disconnect();
  bus4Gain.disconnect();
  masterGain.disconnect();
  if (fxPadMasterIn) fxPadMasterIn.disconnect();
  if (fxPadMasterOut) fxPadMasterOut.disconnect();
  if (fxPadLeveler) fxPadLeveler.disconnect();
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

  masterGain.connect(fxPadMasterIn);
  if (fxPadActive && fxPadEngine) {
    fxPadMasterIn.connect(fxPadEngine.nodeIn);
    fxPadEngine.nodeOut.connect(fxPadLeveler);
    fxPadLeveler.connect(fxPadMasterOut);
  } else {
    fxPadMasterIn.connect(fxPadLeveler);
    fxPadLeveler.connect(fxPadMasterOut);
  }

  // -------------------------------------------
  // COMPRESSOR BYPASS LOGIC FOR BUS4:
  // -------------------------------------------
  // If the compressor is ON, bus1..3 get compressed,
  // but bus4 goes directly to the output (uncompressed).
  // If the compressor is OFF, bus4 merges with everyone else in masterGain.
  if (loFiCompActive) {
    // bus1..3 => masterGain => fxPad => loFiComp => postComp => destination
    fxPadMasterOut.connect(loFiCompNode);
    loFiCompNode.connect(postCompGain);
    postCompGain.connect(currentOutputNode || audioContext.destination);
    postCompGain.connect(videoDestination);

    // bus4 => directly to output (skips compressor)
    bus4Gain.connect(currentOutputNode || audioContext.destination);
    bus4Gain.connect(videoDestination);
  } else {
    // No compressor: just send everyone (including bus4) through masterGain => overallOutput => out
    bus4Gain.connect(masterGain);
    fxPadMasterOut.connect(overallOutputGain);
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
function beginLoopRecording() {
  ensureAudioContext().then(async () => {
    if (!audioContext) return;
    scheduledStopTime = null;
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

function startRecording() {
  ensureAudioContext().then(() => {
    if (!audioContext) return;
    if (recordingNewLoop && looperState !== "idle" && baseLoopDuration) {
      const now = audioContext.currentTime;
      let d = baseLoopDuration;
      if (pitchTarget === "loop") d /= getCurrentPitchRate();
      const elapsed = (now - loopStartAbsoluteTime) % d;
      const remain = d - elapsed;
      if (newLoopStartTimeout) clearTimeout(newLoopStartTimeout);
      newLoopStartTimeout = setTimeout(() => {
        beginLoopRecording();
      }, remain * 1000);
    } else {
      if (!recordingNewLoop && looperState !== "idle") return;
      beginLoopRecording();
    }
  });
}

function stopRecordingAndPlay() {
  if (loopRecorderNode) {
    loopRecorderNode.port.postMessage('stop');
  } else if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

function scheduleStopRecording() {
  ensureAudioContext().then(() => {
    if (!audioContext || looperState !== "recording") return;
    if (!baseLoopDuration || loopStartAbsoluteTime === null) {
      stopRecordingAndPlay();
      return;
    }
    let d = baseLoopDuration;
    if (pitchTarget === "loop") d /= getCurrentPitchRate();
    const now = audioContext.currentTime;
    const elapsed = (now - loopStartAbsoluteTime) % d;
    const remain = d - elapsed;
    scheduledStopTime = now + remain;
    setTimeout(() => {
      if (looperState === "recording") stopRecordingAndPlay();
    }, remain * 1000);
  });
}

function playLoop(startTime = null) {
  ensureAudioContext().then(() => {
    if (!audioContext) return;
    stopAllLoopSources();
    loopSources = new Array(MAX_AUDIO_LOOPS).fill(null);
    audioLoopBuffers.forEach((buf, i) => {
      if (!buf || !loopPlaying[i]) return;
      const src = audioContext.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      let rate = audioLoopRates[i] || 1;
      if (pitchTarget === "loop") rate *= getCurrentPitchRate();
      src.playbackRate.value = rate;
      src.connect(loopAudioGain);
      loopSources[i] = src;
    });
    if (!loopSources.some(Boolean)) return;
    const when = startTime !== null ? startTime : audioContext.currentTime;
    loopStartAbsoluteTime = when;
    loopSources.forEach((src, i) => {
      if (src) {
        src.start(when);
        loopStartOffsets[i] = 0;
      }
    });
    loopSource = loopSources.find(src => src) || null;
    masterLoopIndex = loopSources.findIndex(src => src);
    if (masterLoopIndex === -1) masterLoopIndex = null;
  });
}

function playNewLoop(index) {
  ensureAudioContext().then(() => {
    if (!audioContext || !audioLoopBuffers[index] || !baseLoopDuration) return;
    const buf = audioLoopBuffers[index];
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = audioContext.createGain();
    g.gain.value = 1;
    loopGainNodes[index] = g;
    let rate = audioLoopRates[index] || 1;
    if (pitchTarget === "loop") rate *= getCurrentPitchRate();
    src.playbackRate.value = rate;
    src.connect(g).connect(loopAudioGain);
    const when = loopSource ? getNextBarTime(audioContext.currentTime + PLAY_PADDING) : (audioContext.currentTime + PLAY_PADDING);
    src.start(when);
    if (!loopSource) loopStartAbsoluteTime = when;
    loopSources[index] = src;
    if (!loopSource) loopSource = src;
    loopPlaying[index] = true;
    loopStartOffsets[index] = when - loopStartAbsoluteTime;
    if (masterLoopIndex === null) masterLoopIndex = index;
  });
}

function playSingleLoop(index, startTime = null, offset = 0) {
  ensureAudioContext().then(() => {
    if (!audioContext || !audioLoopBuffers[index]) return;
    stopLoopSource(index);
    const buf = audioLoopBuffers[index];
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = audioContext.createGain();
    g.gain.value = 1;
    loopGainNodes[index] = g;
    let rate = audioLoopRates[index] || 1;
    if (pitchTarget === "loop") rate *= getCurrentPitchRate();
    src.playbackRate.value = rate;
    src.connect(g).connect(loopAudioGain);
    const when = startTime !== null ? startTime : (loopSource ? getNextBarTime(audioContext.currentTime + PLAY_PADDING) : audioContext.currentTime);
    const off = Math.max(0, offset % (audioLoopBuffers[index].duration || 1e-6));
    src.start(when, off);
    if (!loopSource) {
      loopStartAbsoluteTime = when;
      masterLoopIndex = index;
    }
    loopSources[index] = src;
    loopPlaying[index] = true;
    loopStartOffsets[index] = when - loopStartAbsoluteTime - off;
    if (!loopSource) loopSource = src;
  });
}

function schedulePlayLoop(index) {
  ensureAudioContext().then(() => {
    if (!audioContext) return;
    if (pendingStopTimeouts[index]) { clearTimeout(pendingStopTimeouts[index]); pendingStopTimeouts[index] = null; }
    let when = audioContext.currentTime + PLAY_PADDING;
    if (loopSource && baseLoopDuration && loopStartAbsoluteTime) {
      when = getNextBarTime(when);
    }
    playSingleLoop(index, when, 0);
    if (masterLoopIndex === null) masterLoopIndex = index;
  });
}

function scheduleResumeLoop(index) {
  ensureAudioContext().then(() => {
    if (!audioContext) return;
    if (pendingStopTimeouts[index]) {
      clearTimeout(pendingStopTimeouts[index]);
      pendingStopTimeouts[index] = null;
    }
    const when = audioContext.currentTime + PLAY_PADDING;
    const dur = loopDurations[index] || baseLoopDuration;
    let offset = 0;
    if (dur && loopStartAbsoluteTime !== null) {
      const elapsed = when - loopStartAbsoluteTime - loopStartOffsets[index];
      offset = ((elapsed % dur) + dur) % dur;
    }
    playSingleLoop(index, when, offset);
  });
}

function stopAllLoopSources() {
  loopSources.forEach((src, i) => {
    const g = loopGainNodes[i];
    if (src) { try { src.stop(); src.disconnect(); } catch {} }
    if (g) { try { g.disconnect(); } catch {} }
    loopGainNodes[i] = null;
    loopStartOffsets[i] = 0;
  });
  loopSources = new Array(MAX_AUDIO_LOOPS).fill(null);
  loopSource = null;
  masterLoopIndex = null;
}

function stopLoopSource(index) {
  const src = loopSources[index];
  if (src) {
    try { src.stop(); src.disconnect(); } catch {}
  }
  const g = loopGainNodes[index];
  if (g) {
    try { g.disconnect(); } catch {}
  }
  loopSources[index] = null;
  loopGainNodes[index] = null;
  loopPlaying[index] = false;
  loopStartOffsets[index] = 0;
  if (pendingStopTimeouts[index]) { clearTimeout(pendingStopTimeouts[index]); pendingStopTimeouts[index] = null; }
  if (loopSource === src) loopSource = loopSources.find(s => s) || null;
  if (index === masterLoopIndex) {
    masterLoopIndex = loopSources.findIndex(s => s);
    if (masterLoopIndex === -1) masterLoopIndex = null;
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
  audioLoopBuffers[activeLoopIndex] = loopBuffer;

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

function stopLoopImmediately(index) {
  if (typeof index === "number") {
    stopLoopSource(index);
    if (pendingStopTimeouts[index]) { clearTimeout(pendingStopTimeouts[index]); pendingStopTimeouts[index] = null; }
  } else {
    stopAllLoopSources();
    loopPlaying.fill(false);
    pendingStopTimeouts.forEach((t, i) => { if (t) clearTimeout(t); pendingStopTimeouts[i] = null; });
  }
  if (newLoopStartTimeout) { clearTimeout(newLoopStartTimeout); newLoopStartTimeout = null; }
  if (loopPlaying.every(p => !p)) looperState = "idle"; else looperState = "playing";
  updateLooperButtonColor();
  updateExportButtonColor();
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function stopLoop(index) {
  clearOverdubTimers();
  if (typeof index !== "number") {
    stopLoopImmediately();
    return;
  }
  if (!baseLoopDuration || !loopSources[index]) {
    stopLoopImmediately(index);
    return;
  }
  let now = audioContext.currentTime;
  let d = baseLoopDuration;
  if (pitchTarget === "loop") d /= getCurrentPitchRate();
  let elapsed = (now - loopStartAbsoluteTime) % d;
  let remain = d - elapsed;
  const src = loopSources[index];
  if (src) {
    const g = loopGainNodes[index];
    if (g) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
    }
    src.stop(now + remain);
  }
  if (pendingStopTimeouts[index]) clearTimeout(pendingStopTimeouts[index]);
  pendingStopTimeouts[index] = setTimeout(() => stopLoopImmediately(index), (remain + 0.05) * 1000);
}

function updateMasterLoopIndex() {
  let longest = 0;
  let idx = null;
  for (let i = 0; i < MAX_AUDIO_LOOPS; i++) {
    const dur = audioLoopBuffers[i] ? loopDurations[i] : 0;
    if (dur > longest) { longest = dur; idx = i; }
  }
  masterLoopIndex = idx;
}

function eraseAudioLoop() {
  const idx = activeLoopIndex;
  if (audioLoopBuffers[idx]) pushUndoState();
  clearOverdubTimers();
  stopLoopSource(idx);
  if (newLoopStartTimeout) { clearTimeout(newLoopStartTimeout); newLoopStartTimeout = null; }
  audioLoopBuffers[idx] = null;
  loopDurations[idx] = 0;
  loopStartOffsets[idx] = 0;
  audioLoopRates[idx] = 1;
  if (audioLoopBuffers.every(b => !b)) {
    loopBuffer = null;
    baseLoopDuration = null;
    loopsBPM = null;
    audioLoopRates = new Array(MAX_AUDIO_LOOPS).fill(1);
    looperState = "idle";
  } else {
    if (loopBuffer === null || !audioLoopBuffers.includes(loopBuffer)) {
      loopBuffer = audioLoopBuffers.find(b => b) || null;
    }
    if (loopPlaying.some(p => p)) looperState = "playing"; else looperState = "idle";
  }
  updateMasterLoopIndex();
  updateExportButtonColor();
  updateLooperButtonColor();
  blinkButton(unifiedLooperButton, updateLooperButtonColor);
  if (window.refreshMinimalState) window.refreshMinimalState();
}

function eraseAudioLoopAt(index) {
  const prev = activeLoopIndex;
  activeLoopIndex = index;
  eraseAudioLoop();
  activeLoopIndex = prev;
}

function eraseAllAudioLoops() {
  if (audioLoopBuffers.some(b => b)) pushUndoState();
  clearOverdubTimers();
  stopAllLoopSources();
  audioLoopBuffers.fill(null);
  loopPlaying.fill(false);
  audioLoopRates = new Array(MAX_AUDIO_LOOPS).fill(1);
  loopDurations.fill(0);
  loopStartOffsets.fill(0);
  baseLoopDuration = null;
  loopsBPM = null;
  loopBuffer = null;
  if (newLoopStartTimeout) { clearTimeout(newLoopStartTimeout); newLoopStartTimeout = null; }
  pendingStopTimeouts.forEach((t, i) => { if (t) clearTimeout(t); pendingStopTimeouts[i] = null; });
  looperState = "idle";
  updateMasterLoopIndex();
  updateExportButtonColor();
  updateLooperButtonColor();
  blinkButton(unifiedLooperButton, updateLooperButtonColor);
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
  blinkButton(videoLooperButton, updateVideoLooperButtonColor);
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
  if (!MediaRecorder.isTypeSupported(mime)) {
    mime = "video/webm;codecs=vp9,opus";
    if (!MediaRecorder.isTypeSupported(mime)) {
      mime = "video/webm";
    }
  }
  videoMediaRecorder = new MediaRecorder(finalStream, { mimeType: mime, videoBitsPerSecond: 6000000 });

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
  videoMediaRecorder.start(100);

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

function computeSuperKnobDelta(val) {
  // Stable algorithm used for both endless and standard 0–127 knobs.
  if (lastSuperKnobValue === null) {
    lastSuperKnobValue = val;
    return 0;
  }

  let diff = val - lastSuperKnobValue;
  if (diff > 64) diff -= 128;
  else if (diff < -64) diff += 128;

  lastSuperKnobValue = val;
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
  lastSuperKnobValue = null;
  lastSuperKnobDirection = 0;
  
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
  lastSuperKnobValue = null;
  lastSuperKnobDirection = 0;
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
  if (e.key === "Shift") {
    isShiftKeyDown = true;
    return;
  }
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

  const k = e.key.toLowerCase();

  if (k === extensionKeys.instrumentToggle.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    showInstrumentWindowToggle();
    return;
  }
  if (k === extensionKeys.fxPad.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    showFxPadWindowToggle();
    return;
  }

  if (instrumentPreset > 0) {
    const idx = KEYBOARD_INST_KEYS.indexOf(k);
    if (idx !== -1) {
      playInstrumentNote(getInstBaseMidi() + getScaleOffset(idx));
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  // Option+Cmd+R erases all audio loops
  if (e.metaKey && e.altKey && k === extensionKeys.looperA.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    eraseAllAudioLoops();
    return;
  }
  // Cmd+V erases the video loop
  if (e.metaKey && k === extensionKeys.videoLooper.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    eraseVideoLoop();
    return;
  }
  // Cmd+R/S/D/F erase loops A–D
  if (e.metaKey && k === extensionKeys.looperA.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    eraseAudioLoopAt(0);
    return;
  }
  if (e.metaKey && k === extensionKeys.looperB.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    eraseAudioLoopAt(1);
    return;
  }
  if (e.metaKey && k === extensionKeys.looperC.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    eraseAudioLoopAt(2);
    return;
  }
  if (e.metaKey && k === extensionKeys.looperD.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    eraseAudioLoopAt(3);
    return;
  }
  
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
      lastSuperKnobValue = null;
      lastSuperKnobDirection = 0;
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
    e.stopImmediatePropagation();
    toggleCompressor();
    return;
  }
  if (k === extensionKeys.eq.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    toggleEQFilter();
    return;
  }
  const loopKeys = [extensionKeys.looperA, extensionKeys.looperB, extensionKeys.looperC, extensionKeys.looperD];
  for (let i = 0; i < loopKeys.length; i++) {
    if (k === loopKeys[i].toLowerCase()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.repeat) return; // ignore repeat but still consume the event
      activeLoopIndex = i;
      if (looperState !== "idle" && !audioLoopBuffers[i]) recordingNewLoop = true;
      onLooperButtonMouseDown();
      return;
    }
  }
  if (k === extensionKeys.videoLooper.toLowerCase()) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.repeat) return;
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
  if (e.key === "Shift") {
    isShiftKeyDown = false;
    return;
  }
  const k = e.key.toLowerCase();
  if (isTypingInTextField(e)) {
  return;
}

  if (instrumentPreset > 0) {
    const idx = KEYBOARD_INST_KEYS.indexOf(k);
    if (idx !== -1) {
      stopInstrumentNote(getInstBaseMidi() + getScaleOffset(idx));
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
  const loopKeys = [extensionKeys.looperA, extensionKeys.looperB, extensionKeys.looperC, extensionKeys.looperD];
  for (let i = 0; i < loopKeys.length; i++) {
    if (k === loopKeys[i].toLowerCase()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activeLoopIndex = i;
      onLooperButtonMouseUp();
    }
  }
  if (k === extensionKeys.videoLooper.toLowerCase()) {
    onVideoLooperButtonMouseUp();
  }
  // Remove the undo handling here because it's handled in onKeyDown.
}
addTrackedListener(document, "keydown", onKeyDown, true);
addTrackedListener(document, "keyup", onKeyUp, true);

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
    doublePressHoldStartTime = now;
  } else {
    isDoublePress = false;
    doublePressHoldStartTime = null;
  }

  lastClickTime = now;
}

function onLooperButtonMouseUp() {
  // First check for triple press (3 quick presses within ~600ms)
  if (pressTimes.length === 3) {
    const tFirst = pressTimes[0];
    const tLast  = pressTimes[2];
    if (tLast - tFirst < clickDelay * 2) {
      console.log("TRIPLE PRESS => ERASE AUDIO LOOP");
      eraseAudioLoop();

      // Clear out so we don't also do single/double logic
      pressTimes = [];
      isDoublePress = false;
      return;
    }
  }

  // If not triple, either double or single
  if (isDoublePress) {
    const holdMs = doublePressHoldStartTime ? (Date.now() - doublePressHoldStartTime) : 0;
    if (holdMs >= holdEraseDelay) {
      console.log("DOUBLE PRESS HOLD => ERASE AUDIO LOOP");
      eraseAudioLoop();
    } else {
      console.log("DOUBLE PRESS => STOP LOOP");
      stopLoop(activeLoopIndex);
    }

    isDoublePress = false;
    pressTimes = [];
    doublePressHoldStartTime = null;

  } else {
    // SINGLE PRESS => start or overdub or resume playback
    console.log("SINGLE PRESS => START/OVERDUB/PLAY");
    singlePressAudioLooperAction();
    pressTimes = [];
  }
}

function singlePressAudioLooperAction() {
  if (looperState === "idle") {
    if (audioLoopBuffers[activeLoopIndex]) {
      looperState = "playing";
      loopPlaying[activeLoopIndex] = true;
      if (loopSources.some(Boolean)) {
        playNewLoop(activeLoopIndex);
      } else {
        schedulePlayLoop(activeLoopIndex);
      }
      updateLooperButtonColor();
      updateExportButtonColor();
      if (window.refreshMinimalState) window.refreshMinimalState();
    } else {
      startRecording();
    }
  } else if (looperState === "recording") {
    scheduleStopRecording();
  } else {
    if (!audioLoopBuffers[activeLoopIndex]) {
      recordingNewLoop = true;
      startRecording();
    } else if (!loopPlaying[activeLoopIndex]) {
      loopPlaying[activeLoopIndex] = true;
      if (loopSources.some(Boolean)) {
        scheduleResumeLoop(activeLoopIndex);
      } else {
        schedulePlayLoop(activeLoopIndex);
      }
    } else {
      toggleOverdub();
    }
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
    } else {
      const loops = audioLoopBuffers.map((b, i) => ({ buf: b, idx: i })).filter(o => o.buf);
      if (!loops.length) return;
      const rBase = (pitchTarget === "loop") ? getCurrentPitchRate() : 1;
      const pitched = Math.abs(rBase - 1) > 0.001;
      let bpm = loopsBPM ? loopsBPM : (baseLoopDuration ? Math.round((60 * 4) / baseLoopDuration) : 0);
      loops.forEach(({buf, idx}) => {
        const rate = rBase * (audioLoopRates[idx] || 1);
        const outBpm = pitched && bpm ? Math.round(bpm * rBase) : bpm;
        const base = `loop${String.fromCharCode(65 + idx)}`;
        const name = `${base}${pitched ? "-pitched" : ""}${outBpm ? "-" + outBpm + "bpm" : ""}.wav`;
        if (Math.abs(rate - 1) < 0.01) {
          const wav = encodeWAV(buf);
          const url = URL.createObjectURL(wav);
          let a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
        } else {
          exportAudioWithPitch(buf, rate, name);
        }
      });
    }
  });
}
async function exportAudioWithPitch(buf, rate, fileName = "loop-pitched.wav") {
  if (!buf) return;
  const len = Math.ceil((buf.duration / rate) * buf.sampleRate);
  const off = new OfflineAudioContext(buf.numberOfChannels, len, buf.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const wav = encodeWAV(rendered);
  const url = URL.createObjectURL(wav);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
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

  instrumentButtonMin = document.createElement("button");
  instrumentButtonMin.className = "looper-btn";
  instrumentButtonMin.innerText = "Instrument:Off";
  instrumentButtonMin.title = "Nova Bass";
  instrumentButtonMin.style.backgroundColor = "#444";
  instrumentButtonMin.addEventListener("click", () => {
    if (instrumentPreset === 0) {
      setInstrumentPreset(instrumentLastPreset || 1);
    } else {
      deactivateInstrument();
    }
  });
  minimalUIContainer.appendChild(instrumentButtonMin);

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
  loopBtnMin.style.position = "relative";
  loopBtnMin.innerText = "Looper(R/S/D/F/V)";
  loopBtnMin.title = "Audio/Video Looper";
  looperPulseElMin = document.createElement('div');
  looperPulseElMin.style.position = 'absolute';
  looperPulseElMin.style.left = '0';
  looperPulseElMin.style.top = '0';
  looperPulseElMin.style.right = '0';
  looperPulseElMin.style.bottom = '0';
  looperPulseElMin.style.borderRadius = '3px';
  looperPulseElMin.style.background = 'rgba(255,255,255,0.25)';
  looperPulseElMin.style.opacity = 0;
  looperPulseElMin.style.transition = 'opacity 0.1s';
  looperPulseElMin.style.pointerEvents = 'none';
  loopBtnMin.appendChild(looperPulseElMin);
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
  const pWrap = document.createElement('div');
  pWrap.style.position = 'absolute';
  pWrap.style.left = '0';
  pWrap.style.right = '0';
  pWrap.style.bottom = '-6px';
  pWrap.style.height = '6px';
  pWrap.style.background = '#222';
  pWrap.style.pointerEvents = 'none';
  pWrap.style.display = 'flex';
  pWrap.style.flexDirection = 'column';
  pWrap.style.justifyContent = 'space-between';
  for (let i = 0; i < MAX_AUDIO_LOOPS; i++) {
    const b = document.createElement('div');
    b.style.position = 'relative';
    b.style.height = '1.4px';
    b.style.background = '#333';
    const f = document.createElement('div');
    f.style.position = 'absolute';
    f.style.left = '0';
    f.style.right = 'auto';
    f.style.top = '0';
    f.style.bottom = '0';
    f.style.width = '0%';
    f.style.opacity = 0;
    f.style.background = LOOP_COLORS[i % 4];
    b.appendChild(f);
    for (let j=1;j<4;j++){
      const di=document.createElement('div');
      di.className='bar-ind';
      di.style.position='absolute';
      di.style.left=(j*25)+'%';
      di.style.top='0';
      di.style.bottom='0';
      di.style.width='1px';
      di.style.background='#555';
      di.style.opacity=0.3;
      b.appendChild(di);
    }
    pWrap.appendChild(b);
    loopProgressFillsMin[i] = f;
  }
  const loopWrapMin = document.createElement('div');
  loopWrapMin.style.position = 'relative';
  loopWrapMin.style.display = 'flex';
  loopWrapMin.style.overflow = 'visible';
  loopWrapMin.style.paddingBottom = '0';
  loopWrapMin.style.flexDirection = 'column';
  loopWrapMin.style.alignItems = 'stretch';
  loopWrapMin.appendChild(loopBtnMin);
  loopWrapMin.appendChild(pWrap);
  minimalUIContainer.appendChild(loopWrapMin);

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

    if (instrumentButtonMin) {
      let name = "Off";
      let color = "#222";
      if (instrumentPreset > 0) {
        const p = instrumentPresets[instrumentPreset];
        if (p) {
          name = p.name;
          color = p.color || PRESET_COLORS[(instrumentPreset - 1) % PRESET_COLORS.length];
        }
      }
      instrumentButtonMin.innerText = "Instrument:" + name;
      instrumentButtonMin.style.backgroundColor = color;
    }
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
  unifiedLooperButton.style.position = "relative";
  unifiedLooperButton.innerText = "AudioLoops(R/S/D/F)";
  unifiedLooperButton.addEventListener("mousedown", onLooperButtonMouseDown);
  unifiedLooperButton.addEventListener("mouseup", onLooperButtonMouseUp);
  looperPulseEl = document.createElement('div');
  looperPulseEl.style.position = 'absolute';
  looperPulseEl.style.left = '0';
  looperPulseEl.style.top = '0';
  looperPulseEl.style.right = '0';
  looperPulseEl.style.bottom = '0';
  looperPulseEl.style.borderRadius = '4px';
  looperPulseEl.style.background = 'rgba(255,255,255,0.25)';
  looperPulseEl.style.opacity = 0;
  looperPulseEl.style.transition = 'opacity 0.1s';
  looperPulseEl.style.pointerEvents = 'none';
  unifiedLooperButton.appendChild(looperPulseEl);

  const progressWrap = document.createElement("div");
  progressWrap.style.position = "absolute";
  progressWrap.style.left = "0";
  progressWrap.style.right = "0";
  progressWrap.style.bottom = "-8px";
  progressWrap.style.height = "8px";
  progressWrap.style.pointerEvents = "none";
  progressWrap.style.background = "#222";
  progressWrap.style.display = "flex";
  progressWrap.style.flexDirection = "column";
  progressWrap.style.justifyContent = "space-between";
  for (let i = 0; i < MAX_AUDIO_LOOPS; i++) {
    const barBg = document.createElement('div');
    barBg.style.position = 'relative';
    barBg.style.height = '1.4px';
    barBg.style.background = '#333';
    const fill = document.createElement('div');
    fill.style.position = 'absolute';
    fill.style.top = '0';
    fill.style.bottom = '0';
    fill.style.left = '0';
    fill.style.width = '0%';
    fill.style.opacity = 0;
    fill.style.background = LOOP_COLORS[i % 4];
    barBg.appendChild(fill);
    for (let j = 1; j < 4; j++) {
      const ind = document.createElement('div');
      ind.className = 'bar-ind';
      ind.style.position = 'absolute';
      ind.style.left = (j*25)+'%';
      ind.style.top = '0';
      ind.style.bottom = '0';
      ind.style.width = '1px';
      ind.style.background = '#555';
      ind.style.opacity = 0.3;
      barBg.appendChild(ind);
    }
    progressWrap.appendChild(barBg);
    loopProgressFills[i] = fill;
  }
  const unifiedWrap = document.createElement('div');
  unifiedWrap.style.position = 'relative';
  unifiedWrap.style.display = 'flex';
  unifiedWrap.style.overflow = 'visible';
  unifiedWrap.style.flexDirection = 'column';
  unifiedWrap.style.alignItems = 'stretch';
  unifiedWrap.appendChild(unifiedLooperButton);
  unifiedWrap.appendChild(progressWrap);
  looperButtonRow.appendChild(unifiedWrap);

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

  instrumentButton = document.createElement("button");
  instrumentButton.className = "looper-btn";
  instrumentButton.innerText = "Instrument:Off";
  instrumentButton.style.flex = '1 1 calc(50% - 4px)';
  instrumentButton.title = "Nova Bass";
  instrumentButton.addEventListener("click", showInstrumentWindowToggle);
  actionWrap.appendChild(instrumentButton);

  eqButton = document.createElement("button");
  eqButton.className = "looper-btn";
  eqButton.innerText = "EQ/Filter";
  eqButton.style.flex = '1 1 calc(50% - 4px)';
  eqButton.addEventListener("click", () => {
    showEQWindowToggle();
  });
  actionWrap.appendChild(eqButton);

  fxPadButton = document.createElement("button");
  fxPadButton.className = "looper-btn";
  fxPadButton.innerText = "FX Pad";
  fxPadButton.style.flex = '1 1 calc(50% - 4px)';
  fxPadButton.addEventListener("click", showFxPadWindowToggle);
  actionWrap.appendChild(fxPadButton);

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
  updateInstrumentButtonColor();
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
    loopSources.forEach((src, i) => {
      if (src) src.playbackRate.value = rate * (audioLoopRates[i] || 1);
    });
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
  applyInstrumentPitchSync();
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

function getGlobalPitchSemitone() {
  return 12 * Math.log2(getCurrentPitchRate());
}

function applyInstrumentPitchSync() {
  if (!instrumentPitchFollowVideo) return;
  instrumentPitchSemitone = getGlobalPitchSemitone();
  instrumentPitchRatio = Math.pow(2, instrumentPitchSemitone / 12);
  if (instrumentPitchSlider) {
    instrumentPitchSlider.value = instrumentPitchSemitone.toFixed(2);
    instrumentPitchSlider.disabled = true;
  }
  if (instrumentPitchValueLabel) {
    instrumentPitchValueLabel.innerText = instrumentPitchSemitone.toFixed(2) + ' st';
  }
  if (instrumentPitchSyncCheck) instrumentPitchSyncCheck.checked = true;
}

function updateInstrumentPitchUI() {
  if (instrumentPitchSlider) {
    instrumentPitchSlider.value = instrumentPitchSemitone.toFixed(2);
    instrumentPitchSlider.disabled = instrumentPitchFollowVideo;
  }
  if (instrumentPitchValueLabel) {
    instrumentPitchValueLabel.innerText = instrumentPitchSemitone.toFixed(2) + ' st';
  }
  if (instrumentPitchSyncCheck) {
    instrumentPitchSyncCheck.checked = instrumentPitchFollowVideo;
  }
  if (instrumentTransposeSlider) {
    instrumentTransposeSlider.value = instrumentTranspose;
  }
  if (instrumentTransposeValueLabel) {
    instrumentTransposeValueLabel.innerText = instrumentTranspose + ' st';
  }
  refreshInstrumentEditFields();
}

function refreshInstrumentEditFields() {
  const cfg = instrumentPreset > 0 ? instrumentPresets[instrumentPreset] : null;
  if (!cfg) return;
  if (instrumentOscSelect) instrumentOscSelect.value = cfg.oscillator || 'sine';
  if (instrumentEngineSelect) instrumentEngineSelect.value = cfg.engine || 'analog';
  if (instrumentVoiceModeSelect) instrumentVoiceModeSelect.value = cfg.mode || 'poly';
  if (instrumentFilterSlider) {
    instrumentFilterSlider.value = cfg.filter || 800;
    if (instrumentFilterValue) instrumentFilterValue.textContent = instrumentFilterSlider.value;
  }
  if (instrumentQSlider) {
    instrumentQSlider.value = cfg.q || 1;
    if (instrumentQValue) instrumentQValue.textContent = instrumentQSlider.value;
  }
  if (instrumentASlider) {
    instrumentASlider.value = (cfg.env?.a ?? 0.01);
    if (instrumentAValue) instrumentAValue.textContent = instrumentASlider.value;
  }
  if (instrumentDSlider) {
    instrumentDSlider.value = (cfg.env?.d ?? 0.2);
    if (instrumentDValue) instrumentDValue.textContent = instrumentDSlider.value;
  }
  if (instrumentSSlider) {
    instrumentSSlider.value = (cfg.env?.s ?? 0.8);
    if (instrumentSValue) instrumentSValue.textContent = instrumentSSlider.value;
  }
  if (instrumentRSlider) {
    instrumentRSlider.value = (cfg.env?.r ?? 0.3);
    if (instrumentRValue) instrumentRValue.textContent = instrumentRSlider.value;
  }
  if (instrumentTuneSlider) {
    instrumentTuneSlider.value = cfg.tune || 0;
    if (instrumentTuneValue) instrumentTuneValue.textContent = instrumentTuneSlider.value;
  }
  if (instrumentScaleSelect) instrumentScaleSelect.value = instrumentScale;
  if (instrumentVolumeSlider && instVolumeNode) {
    instrumentVolumeSlider.value = instVolumeNode.gain.value;
  }
  if (instrumentDelaySlider && instDelayNode) {
    instrumentDelaySlider.value = instDelayNode.delayTime.value;
  }
  if (instrumentDelayMixSlider && instDelayMix) {
    instrumentDelayMixSlider.value = instDelayMix.gain.value;
  }
  if (instrumentReverbMixSlider && instReverbMix) {
    instrumentReverbMixSlider.value = instReverbMix.gain.value;
  }
  if (instrumentCompThreshSlider && instCompNode) {
    instrumentCompThreshSlider.value = instCompNode.threshold.value;
  }
  if (instrumentLimiterThreshSlider && instLimiterNode) {
    instrumentLimiterThreshSlider.value = instLimiterNode.threshold.value;
  }
  if (instrumentLfoRateSlider && instLfoOsc) {
    instrumentLfoRateSlider.value = instLfoOsc.frequency.value;
  }
  if (instrumentLfoDepthSlider && instLfoGain) {
    instrumentLfoDepthSlider.value = instLfoGain.gain.value;
  }
  if (instrumentSampleLabel) instrumentSampleLabel.textContent = cfg.sample ? 'Loaded' : 'None';
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

  if (st === 144 && note === midiNotes.instrumentToggle) {
    showInstrumentWindowToggle();
    return;
  }
  if (st === 144 && note === midiNotes.fxPadToggle) {
    showFxPadWindowToggle();
    return;
  }

  if (instrumentPreset > 0) {
    if (command === 144 && e.data[2] > 0) {
      playInstrumentNote(note);
      return;
    } else if (command === 128 || (command === 144 && e.data[2] === 0)) {
      stopInstrumentNote(note);
      return;
    }
  }
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
    if (Number(note) === Number(midiNotes.fxPadX)) {
      const x = e.data[2] / 127;
      handleFxPadJoystick(x, fxPadBall.y);
      return;
    }
    if (Number(note) === Number(midiNotes.fxPadY)) {
      const y = 1 - (e.data[2] / 127);
      handleFxPadJoystick(fxPadBall.x, y);
      return;
    }
    if (Number(note) === Number(midiNotes.superKnob)) {
      if (selectedCueKey) {
        if (isModPressed || isShiftKeyDown) {
          lastSuperKnobValue = e.data[2];
          lastSuperKnobDirection = 0;
        } else {
          let diff = computeSuperKnobDelta(e.data[2]);
          if (diff !== 0) {
            adjustSelectedCue(diff * superKnobStep);
          }
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
    if (note === midiNotes.looperA) {
      activeLoopIndex = 0;
      if (isModPressed) {
        eraseAudioLoopAt(0);
      } else {
        if (looperState !== "idle" && !audioLoopBuffers[0]) recordingNewLoop = true;
        onLooperButtonMouseDown();
      }
    }
    if (note === midiNotes.looperB) {
      activeLoopIndex = 1;
      if (isModPressed) {
        eraseAudioLoopAt(1);
      } else {
        if (looperState !== "idle" && !audioLoopBuffers[1]) recordingNewLoop = true;
        onLooperButtonMouseDown();
      }
    }
    if (note === midiNotes.looperC) {
      activeLoopIndex = 2;
      if (isModPressed) {
        eraseAudioLoopAt(2);
      } else {
        if (looperState !== "idle" && !audioLoopBuffers[2]) recordingNewLoop = true;
        onLooperButtonMouseDown();
      }
    }
    if (note === midiNotes.looperD) {
      activeLoopIndex = 3;
      if (isModPressed) {
        eraseAudioLoopAt(3);
      } else {
        if (looperState !== "idle" && !audioLoopBuffers[3]) recordingNewLoop = true;
        onLooperButtonMouseDown();
      }
    }
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
        lastSuperKnobValue = null;
        lastSuperKnobDirection = 0;
        // jump with a 50 ms cross-fade, same as the keyboard path
        sequencerTriggerCue(k);
          }
        }
      }
    }
  } else if (st === 128) {
    if (note === midiNotes.pitchDown) stopPitchDownRepeat();
    if (note === midiNotes.pitchUp) stopPitchUpRepeat();
    if (note === midiNotes.looperA) { activeLoopIndex = 0; if (!isModPressed) onLooperButtonMouseUp(); }
    if (note === midiNotes.looperB) { activeLoopIndex = 1; if (!isModPressed) onLooperButtonMouseUp(); }
    if (note === midiNotes.looperC) { activeLoopIndex = 2; if (!isModPressed) onLooperButtonMouseUp(); }
    if (note === midiNotes.looperD) { activeLoopIndex = 3; if (!isModPressed) onLooperButtonMouseUp(); }
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
      <label>Loop A:</label>
      <input data-extkey="looperA" value="${escapeHtml(extensionKeys.looperA)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Loop B:</label>
      <input data-extkey="looperB" value="${escapeHtml(extensionKeys.looperB)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Loop C:</label>
      <input data-extkey="looperC" value="${escapeHtml(extensionKeys.looperC)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>Loop D:</label>
      <input data-extkey="looperD" value="${escapeHtml(extensionKeys.looperD)}" maxlength="1">
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
    <div class="keymap-row">
      <label>Instrument Toggle:</label>
      <input data-extkey="instrumentToggle" value="${escapeHtml(extensionKeys.instrumentToggle)}" maxlength="1">
    </div>
    <div class="keymap-row">
      <label>FX Pad:</label>
      <input data-extkey="fxPad" value="${escapeHtml(extensionKeys.fxPad)}" maxlength="1">
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
      <label>Loop A:</label>
      <input data-midiname="looperA" value="${escapeHtml(String(midiNotes.looperA))}" type="number">
      <button data-detect="looperA" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Loop B:</label>
      <input data-midiname="looperB" value="${escapeHtml(String(midiNotes.looperB))}" type="number">
      <button data-detect="looperB" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Loop C:</label>
      <input data-midiname="looperC" value="${escapeHtml(String(midiNotes.looperC))}" type="number">
      <button data-detect="looperC" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Loop D:</label>
      <input data-midiname="looperD" value="${escapeHtml(String(midiNotes.looperD))}" type="number">
      <button data-detect="looperD" class="detect-midi-btn">Detect</button>
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
    <div class="midimap-row">
      <label>Instrument Toggle:</label>
      <input data-midiname="instrumentToggle" value="${escapeHtml(String(midiNotes.instrumentToggle))}" type="number">
      <button data-detect="instrumentToggle" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>FX Pad:</label>
      <input data-midiname="fxPadToggle" value="${escapeHtml(String(midiNotes.fxPadToggle))}" type="number">
      <button data-detect="fxPadToggle" class="detect-midi-btn">Detect</button>
    </div>
    <h4>FX Pad Joystick</h4>
    <div class="midimap-row">
      <label>X CC:</label>
      <input data-midicc="fxPadX" value="${escapeHtml(String(midiNotes.fxPadX))}" type="number">
      <button data-ccdetect="fxPadX" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Y CC:</label>
      <input data-midicc="fxPadY" value="${escapeHtml(String(midiNotes.fxPadY))}" type="number">
      <button data-ccdetect="fxPadY" class="detect-midi-btn">Detect</button>
    </div>
    <h4>Super Knob</h4>
    <div class="midimap-row">
      <label>Knob:</label>
      <input data-midicc="superKnob" value="${escapeHtml(String(midiNotes.superKnob))}" type="number">
      <button data-ccdetect="superKnob" class="detect-midi-btn">Detect</button>
    </div>
    <div class="midimap-row">
      <label>Speed:</label>
      <select id="superKnobSpeedSelect" class="looper-btn">
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
      </select>
    </div>
    <button class="looper-midimap-save-btn looper-btn" style="margin-top:8px;">Save & Close</button>
  `;
  midiMapContentWrap.innerHTML = out;

  superKnobSpeedSelect = midiMapWindowContainer.querySelector('#superKnobSpeedSelect');
  if (superKnobSpeedSelect) {
    superKnobSpeedSelect.value = String(superKnobSpeedLevel);
    superKnobSpeedSelect.addEventListener('change', () => {
      superKnobSpeedLevel = parseInt(superKnobSpeedSelect.value, 10);
      updateSuperKnobStep();
    });
  }

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
    if (superKnobSpeedSelect) {
      superKnobSpeedLevel = parseInt(superKnobSpeedSelect.value, 10);
      updateSuperKnobStep();
    }
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
let   currentMidiPresetName   = null;   // which preset is ‘active’

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

/* Instrument Preset Window */
async function showInstrumentWindowToggle() {
  if (!instrumentWindowContainer) {
    buildInstrumentWindow();
  }
  const showing = instrumentWindowContainer.style.display === "block";
  if (showing) {
    instrumentWindowContainer.style.display = "none";
    deactivateInstrument();
  } else {
    instrumentWindowContainer.style.display = "block";
    await ensureAudioContext();
    if (instrumentPreset === 0) {
      setInstrumentPreset(instrumentLastPreset || 1);
    }
  }
}

function buildInstrumentWindow() {
  instrumentWindowContainer = document.createElement("div");
  instrumentWindowContainer.className = "looper-midimap-container";

  const dh = document.createElement("div");
  dh.className = "looper-midimap-drag-handle";
  dh.innerText = "Nova Bass";
  instrumentWindowContainer.appendChild(dh);

  const cw = document.createElement("div");
  cw.className = "looper-midimap-content";
  instrumentWindowContainer.appendChild(cw);

  const topRow = document.createElement("div");
  topRow.style.display = "flex";
  topRow.style.gap = "4px";
  topRow.style.marginBottom = "8px";
  cw.appendChild(topRow);

  const powerBtn = document.createElement("button");
  powerBtn.className = "looper-btn";
  instrumentPowerButton = powerBtn;
  powerBtn.addEventListener("click", () => {
    setInstrumentPreset(instrumentPreset === 0 ? instrumentLastPreset : 0);
    updateInstrumentButtonColor();
  });
  topRow.appendChild(powerBtn);

  const closeBtn = document.createElement("button");
  closeBtn.className = "looper-btn";
  closeBtn.innerText = "Close";
  closeBtn.addEventListener("click", () => {
    instrumentWindowContainer.style.display = "none";
    setInstrumentPreset(0);
  });
  topRow.appendChild(closeBtn);

  const presetSelect = document.createElement("select");
  presetSelect.multiple = true;
  presetSelect.size = 5;
  function refreshPresetSelect() {
    presetSelect.innerHTML = "";
    instrumentPresets.slice(1).forEach((p, i) => {
      const opt = new Option(p.name, String(i+1), false, instrumentLayers.includes(i+1));
      presetSelect.add(opt);
    });
  }
  refreshPresetSelect();
  presetSelect.addEventListener("change", () => {
    const indices = Array.from(presetSelect.selectedOptions).map(o => parseInt(o.value,10));
    setInstrumentLayers(indices);
    updateInstrumentPitchUI();
  });
  cw.appendChild(presetSelect);

  const addPresetBtn = document.createElement("button");
  addPresetBtn.className = "looper-btn";
  addPresetBtn.textContent = "Add";
  addPresetBtn.addEventListener("click", () => {
    const name = prompt("Preset name?");
    const osc = prompt("Oscillator type (sine, square, sawtooth, triangle)?", "sine");
    if (!name || !osc) return;
    instrumentPresets.push({ name, oscillator: osc, filter: 800, q: 1, env: { a: 0.01, d: 0.2, s: 0.8, r: 0.3 }, color: randomPresetColor() });
    saveInstrumentStateToLocalStorage();
    refreshPresetSelect();
  });
  cw.appendChild(addPresetBtn);

  const octaveSelect = document.createElement("select");
  for (let o = 1; o <= 7; o++) {
    const opt = new Option("Oct " + o, String(o), false, o === instrumentOctave);
    octaveSelect.add(opt);
  }
  octaveSelect.addEventListener("change", () => {
    instrumentOctave = parseInt(octaveSelect.value, 10);
    saveInstrumentStateToLocalStorage();
  });
  cw.appendChild(octaveSelect);

  const scaleRow = document.createElement("div");
  scaleRow.style.display = "flex";
  scaleRow.style.gap = "4px";
  scaleRow.style.marginTop = "4px";
  const scLbl = document.createElement("span");
  scLbl.textContent = "Scale";
  scLbl.style.width = "40px";
  instrumentScaleSelect = document.createElement("select");
  ["chromatic","major","minor"].forEach(s => instrumentScaleSelect.add(new Option(s, s, false, s===instrumentScale)));
  instrumentScaleSelect.addEventListener("change", () => {
    instrumentScale = instrumentScaleSelect.value;
    saveInstrumentStateToLocalStorage();
  });
  scaleRow.appendChild(scLbl);
  scaleRow.appendChild(instrumentScaleSelect);
  cw.appendChild(scaleRow);

  const pitchRow = document.createElement("div");
  pitchRow.style.display = "flex";
  pitchRow.style.alignItems = "center";
  pitchRow.style.gap = "4px";
  pitchRow.style.marginTop = "8px";
  cw.appendChild(pitchRow);

  const pitchLabel = document.createElement("span");
  pitchLabel.textContent = "Pitch";
  pitchLabel.style.width = "40px";
  pitchRow.appendChild(pitchLabel);

  instrumentPitchSlider = document.createElement("input");
  instrumentPitchSlider.className = "looper-knob";
  instrumentPitchSlider.type = "range";
  instrumentPitchSlider.min = -12;
  instrumentPitchSlider.max = 12;
  instrumentPitchSlider.step = 0.1;
  pitchRow.appendChild(instrumentPitchSlider);

  instrumentPitchValueLabel = document.createElement("span");
  instrumentPitchValueLabel.style.width = "50px";
  pitchRow.appendChild(instrumentPitchValueLabel);

  instrumentPitchSyncCheck = document.createElement("input");
  instrumentPitchSyncCheck.type = "checkbox";
  instrumentPitchSyncCheck.style.marginLeft = "4px";
  pitchRow.appendChild(instrumentPitchSyncCheck);
  const syncLbl = document.createElement("span");
  syncLbl.textContent = "Sync Video";
  pitchRow.appendChild(syncLbl);

  instrumentPitchSlider.addEventListener("input", () => {
    instrumentPitchSemitone = parseFloat(instrumentPitchSlider.value);
    instrumentPitchRatio = Math.pow(2, instrumentPitchSemitone / 12);
    updateInstrumentPitchUI();
    saveInstrumentStateToLocalStorage();
  });

  instrumentPitchSyncCheck.addEventListener("change", () => {
    instrumentPitchFollowVideo = instrumentPitchSyncCheck.checked;
    if (instrumentPitchFollowVideo) applyInstrumentPitchSync();
    updateInstrumentPitchUI();
    saveInstrumentStateToLocalStorage();
  });

  const transRow = document.createElement("div");
  transRow.style.display = "flex";
  transRow.style.alignItems = "center";
  transRow.style.gap = "4px";
  transRow.style.marginTop = "8px";
  cw.appendChild(transRow);

  const tLabel = document.createElement("span");
  tLabel.textContent = "Transpose";
  tLabel.style.width = "70px";
  transRow.appendChild(tLabel);

  instrumentTransposeSlider = document.createElement("input");
  instrumentTransposeSlider.className = "looper-knob";
  instrumentTransposeSlider.type = "range";
  instrumentTransposeSlider.min = -24;
  instrumentTransposeSlider.max = 24;
  instrumentTransposeSlider.step = 1;
  transRow.appendChild(instrumentTransposeSlider);

  instrumentTransposeValueLabel = document.createElement("span");
  instrumentTransposeValueLabel.style.width = "40px";
  transRow.appendChild(instrumentTransposeValueLabel);

  instrumentTransposeSlider.addEventListener("input", () => {
    instrumentTranspose = parseInt(instrumentTransposeSlider.value, 10);
    updateInstrumentPitchUI();
    saveInstrumentStateToLocalStorage();
  });

  const advToggle = document.createElement("button");
  advToggle.className = "looper-btn";
  advToggle.textContent = "Advanced ▶";
  let advancedWrap = document.createElement("div");
  advancedWrap.className = "instrument-advanced";
  advToggle.addEventListener("click", () => {
    const open = advancedWrap.style.display === "block";
    advancedWrap.style.display = open ? "none" : "block";
    advToggle.textContent = open ? "Advanced ▶" : "Advanced ▼";
  });
  cw.appendChild(advToggle);
  cw.appendChild(advancedWrap);

  const paramWrap = document.createElement("div");
  paramWrap.style.marginTop = "8px";
  paramWrap.style.display = "grid";
  paramWrap.style.gridTemplateColumns = "80px 1fr 40px";
  paramWrap.style.rowGap = "4px";
  advancedWrap.appendChild(paramWrap);

  function addParamRow(labelText, inputEl, valueEl) {
    const lbl = document.createElement("span");
    lbl.textContent = labelText;
    paramWrap.appendChild(lbl);
    paramWrap.appendChild(inputEl);
    paramWrap.appendChild(valueEl || document.createElement("span"));
  }

  instrumentOscSelect = document.createElement("select");
  ["sine","square","sawtooth","triangle","organ","bright"].forEach(t => instrumentOscSelect.add(new Option(t, t)));
  addParamRow("Oscillator", instrumentOscSelect);
  instrumentOscSelect.addEventListener("change", () => {
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].oscillator = instrumentOscSelect.value;
    Object.values(instrumentVoices).flat().forEach(v => {
      if (v.osc) {
        if (WAVETABLES[instrumentOscSelect.value]) {
          v.osc.setPeriodicWave(WAVETABLES[instrumentOscSelect.value]);
        } else {
          v.osc.type = instrumentOscSelect.value;
        }
      }
    });
    saveInstrumentStateToLocalStorage();
  });

  instrumentEngineSelect = document.createElement("select");
  ["analog","fm","wavetable","sampler"].forEach(t => instrumentEngineSelect.add(new Option(t, t)));
  addParamRow("Engine", instrumentEngineSelect);
  instrumentEngineSelect.addEventListener("change", () => {
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].engine = instrumentEngineSelect.value;
    saveInstrumentStateToLocalStorage();
  });

  instrumentVoiceModeSelect = document.createElement("select");
  ["poly","mono","legato"].forEach(m => instrumentVoiceModeSelect.add(new Option(m, m)));
  addParamRow("Mode", instrumentVoiceModeSelect);
  instrumentVoiceModeSelect.addEventListener("change", () => {
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].mode = instrumentVoiceModeSelect.value;
    saveInstrumentStateToLocalStorage();
  });

  instrumentTuneSlider = document.createElement("input");
  instrumentTuneSlider.className = "looper-knob";
  instrumentTuneSlider.type = "range";
  instrumentTuneSlider.min = -24;
  instrumentTuneSlider.max = 24;
  instrumentTuneSlider.step = 12;
  instrumentTuneValue = document.createElement("span");
  instrumentTuneSlider.addEventListener("input", () => {
    instrumentTuneValue.textContent = instrumentTuneSlider.value;
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].tune = parseInt(instrumentTuneSlider.value,10);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Tune", instrumentTuneSlider, instrumentTuneValue);

  instrumentFilterSlider = document.createElement("input");
  instrumentFilterSlider.className = "looper-knob";
  instrumentFilterSlider.type = "range";
  instrumentFilterSlider.min = 50;
  instrumentFilterSlider.max = 8000;
  instrumentFilterSlider.step = 1;
  instrumentFilterValue = document.createElement("span");
  instrumentFilterSlider.addEventListener("input", () => {
    instrumentFilterValue.textContent = instrumentFilterSlider.value;
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].filter = parseFloat(instrumentFilterSlider.value);
    Object.values(instrumentVoices).flat().forEach(v => { if (v.filter) v.filter.frequency.value = parseFloat(instrumentFilterSlider.value); });
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Filter", instrumentFilterSlider, instrumentFilterValue);

  instrumentQSlider = document.createElement("input");
  instrumentQSlider.className = "looper-knob";
  instrumentQSlider.type = "range";
  instrumentQSlider.min = 0;
  instrumentQSlider.max = 10;
  instrumentQSlider.step = 0.1;
  instrumentQValue = document.createElement("span");
  instrumentQSlider.addEventListener("input", () => {
    instrumentQValue.textContent = instrumentQSlider.value;
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].q = parseFloat(instrumentQSlider.value);
    Object.values(instrumentVoices).flat().forEach(v => { if (v.filter) v.filter.Q.value = parseFloat(instrumentQSlider.value); });
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Resonance", instrumentQSlider, instrumentQValue);

  instrumentASlider = document.createElement("input");
  instrumentASlider.className = "looper-knob";
  instrumentASlider.type = "range";
  instrumentASlider.min = 0;
  instrumentASlider.max = 1;
  instrumentASlider.step = 0.01;
  instrumentAValue = document.createElement("span");
  instrumentASlider.addEventListener("input", () => {
    instrumentAValue.textContent = instrumentASlider.value;
    if (instrumentPreset > 0) {
      instrumentPresets[instrumentPreset].env = instrumentPresets[instrumentPreset].env || {};
      instrumentPresets[instrumentPreset].env.a = parseFloat(instrumentASlider.value);
    }
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Attack", instrumentASlider, instrumentAValue);

  instrumentDSlider = document.createElement("input");
  instrumentDSlider.className = "looper-knob";
  instrumentDSlider.type = "range";
  instrumentDSlider.min = 0;
  instrumentDSlider.max = 1;
  instrumentDSlider.step = 0.01;
  instrumentDValue = document.createElement("span");
  instrumentDSlider.addEventListener("input", () => {
    instrumentDValue.textContent = instrumentDSlider.value;
    if (instrumentPreset > 0) {
      instrumentPresets[instrumentPreset].env = instrumentPresets[instrumentPreset].env || {};
      instrumentPresets[instrumentPreset].env.d = parseFloat(instrumentDSlider.value);
    }
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Decay", instrumentDSlider, instrumentDValue);

  instrumentSSlider = document.createElement("input");
  instrumentSSlider.className = "looper-knob";
  instrumentSSlider.type = "range";
  instrumentSSlider.min = 0;
  instrumentSSlider.max = 1;
  instrumentSSlider.step = 0.01;
  instrumentSValue = document.createElement("span");
  instrumentSSlider.addEventListener("input", () => {
    instrumentSValue.textContent = instrumentSSlider.value;
    if (instrumentPreset > 0) {
      instrumentPresets[instrumentPreset].env = instrumentPresets[instrumentPreset].env || {};
      instrumentPresets[instrumentPreset].env.s = parseFloat(instrumentSSlider.value);
    }
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Sustain", instrumentSSlider, instrumentSValue);

  instrumentRSlider = document.createElement("input");
  instrumentRSlider.className = "looper-knob";
  instrumentRSlider.type = "range";
  instrumentRSlider.min = 0;
  instrumentRSlider.max = 2;
  instrumentRSlider.step = 0.01;
  instrumentRValue = document.createElement("span");
  instrumentRSlider.addEventListener("input", () => {
    instrumentRValue.textContent = instrumentRSlider.value;
    if (instrumentPreset > 0) {
      instrumentPresets[instrumentPreset].env = instrumentPresets[instrumentPreset].env || {};
      instrumentPresets[instrumentPreset].env.r = parseFloat(instrumentRSlider.value);
    }
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Release", instrumentRSlider, instrumentRValue);

  instrumentVolumeSlider = document.createElement("input");
  instrumentVolumeSlider.className = "looper-knob";
  instrumentVolumeSlider.type = "range";
  instrumentVolumeSlider.min = 0;
  instrumentVolumeSlider.max = 2;
  instrumentVolumeSlider.step = 0.01;
  instrumentVolumeSlider.addEventListener("input", () => {
    if (instVolumeNode) instVolumeNode.gain.value = parseFloat(instrumentVolumeSlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].volume = parseFloat(instrumentVolumeSlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Volume", instrumentVolumeSlider);

  instrumentDelaySlider = document.createElement("input");
  instrumentDelaySlider.className = "looper-knob";
  instrumentDelaySlider.type = "range";
  instrumentDelaySlider.min = 0;
  instrumentDelaySlider.max = 1;
  instrumentDelaySlider.step = 0.01;
  instrumentDelaySlider.addEventListener("input", () => {
    if (instDelayNode) instDelayNode.delayTime.value = parseFloat(instrumentDelaySlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].delay = parseFloat(instrumentDelaySlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Delay Time", instrumentDelaySlider);

  instrumentDelayMixSlider = document.createElement("input");
  instrumentDelayMixSlider.className = "looper-knob";
  instrumentDelayMixSlider.type = "range";
  instrumentDelayMixSlider.min = 0;
  instrumentDelayMixSlider.max = 1;
  instrumentDelayMixSlider.step = 0.01;
  instrumentDelayMixSlider.addEventListener("input", () => {
    if (instDelayMix) instDelayMix.gain.value = parseFloat(instrumentDelayMixSlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].delayMix = parseFloat(instrumentDelayMixSlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Delay Mix", instrumentDelayMixSlider);

  instrumentReverbMixSlider = document.createElement("input");
  instrumentReverbMixSlider.className = "looper-knob";
  instrumentReverbMixSlider.type = "range";
  instrumentReverbMixSlider.min = 0;
  instrumentReverbMixSlider.max = 1;
  instrumentReverbMixSlider.step = 0.01;
  instrumentReverbMixSlider.addEventListener("input", () => {
    if (instReverbMix) instReverbMix.gain.value = parseFloat(instrumentReverbMixSlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].reverbMix = parseFloat(instrumentReverbMixSlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Reverb Mix", instrumentReverbMixSlider);

  instrumentCompThreshSlider = document.createElement("input");
  instrumentCompThreshSlider.className = "looper-knob";
  instrumentCompThreshSlider.type = "range";
  instrumentCompThreshSlider.min = -60;
  instrumentCompThreshSlider.max = 0;
  instrumentCompThreshSlider.step = 1;
  instrumentCompThreshSlider.addEventListener("input", () => {
    if (instCompNode) instCompNode.threshold.value = parseFloat(instrumentCompThreshSlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].compThresh = parseFloat(instrumentCompThreshSlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Comp Thresh", instrumentCompThreshSlider);

  instrumentLimiterThreshSlider = document.createElement("input");
  instrumentLimiterThreshSlider.className = "looper-knob";
  instrumentLimiterThreshSlider.type = "range";
  instrumentLimiterThreshSlider.min = -20;
  instrumentLimiterThreshSlider.max = 0;
  instrumentLimiterThreshSlider.step = 1;
  instrumentLimiterThreshSlider.addEventListener("input", () => {
    if (instLimiterNode) instLimiterNode.threshold.value = parseFloat(instrumentLimiterThreshSlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].limitThresh = parseFloat(instrumentLimiterThreshSlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("Limit Thresh", instrumentLimiterThreshSlider);

  instrumentLfoRateSlider = document.createElement("input");
  instrumentLfoRateSlider.className = "looper-knob";
  instrumentLfoRateSlider.type = "range";
  instrumentLfoRateSlider.min = 0.1;
  instrumentLfoRateSlider.max = 10;
  instrumentLfoRateSlider.step = 0.1;
  instrumentLfoRateSlider.addEventListener("input", () => {
    if (instLfoOsc) instLfoOsc.frequency.value = parseFloat(instrumentLfoRateSlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].lfoRate = parseFloat(instrumentLfoRateSlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("LFO Rate", instrumentLfoRateSlider);

  instrumentLfoDepthSlider = document.createElement("input");
  instrumentLfoDepthSlider.className = "looper-knob";
  instrumentLfoDepthSlider.type = "range";
  instrumentLfoDepthSlider.min = 0;
  instrumentLfoDepthSlider.max = 50;
  instrumentLfoDepthSlider.step = 1;
  instrumentLfoDepthSlider.addEventListener("input", () => {
    if (instLfoGain) instLfoGain.gain.value = parseFloat(instrumentLfoDepthSlider.value);
    if (instrumentPreset > 0) instrumentPresets[instrumentPreset].lfoDepth = parseFloat(instrumentLfoDepthSlider.value);
    saveInstrumentStateToLocalStorage();
  });
  addParamRow("LFO Depth", instrumentLfoDepthSlider);

  const sampRow = document.createElement("div");
  sampRow.style.gridColumn = "1 / span 3";
  sampRow.style.display = "flex";
  sampRow.style.alignItems = "center";
  sampRow.style.gap = "4px";
  instrumentSampleLabel = document.createElement("span");
  instrumentSampleLabel.textContent = "None";
  const loadBtn = document.createElement("button");
  loadBtn.className = "looper-btn";
  loadBtn.textContent = "Load Sample";
  loadBtn.addEventListener("click", async () => {
    const file = await pickPresetFile();
    if (!file) return;
    const arr = await file.arrayBuffer();
    await ensureAudioContext();
    const buf = await audioContext.decodeAudioData(arr);
    const cfg = instrumentPresets[instrumentPreset];
    cfg.sample = buf;
    instrumentSampleLabel.textContent = "Loaded";
    saveInstrumentStateToLocalStorage();
  });
  sampRow.appendChild(loadBtn);
  sampRow.appendChild(instrumentSampleLabel);
  paramWrap.appendChild(sampRow);

  function collectSettingsFromUI() {
    return {
      oscillator: instrumentOscSelect.value,
      engine: instrumentEngineSelect.value,
      filter: parseFloat(instrumentFilterSlider.value),
      q: parseFloat(instrumentQSlider.value),
      delay: parseFloat(instrumentDelaySlider.value),
      delayMix: parseFloat(instrumentDelayMixSlider.value),
      reverbMix: parseFloat(instrumentReverbMixSlider.value),
      compThresh: parseFloat(instrumentCompThreshSlider.value),
      limitThresh: parseFloat(instrumentLimiterThreshSlider.value),
      volume: parseFloat(instrumentVolumeSlider.value),
      lfoRate: parseFloat(instrumentLfoRateSlider.value),
      lfoDepth: parseFloat(instrumentLfoDepthSlider.value),
      tune: parseInt(instrumentTuneSlider.value, 10),
      scale: instrumentScaleSelect.value,
      mode: instrumentVoiceModeSelect.value,
      env: {
        a: parseFloat(instrumentASlider.value),
        d: parseFloat(instrumentDSlider.value),
        s: parseFloat(instrumentSSlider.value),
        r: parseFloat(instrumentRSlider.value)
      },
      sample: instrumentPresets[instrumentPreset]?.sample || null
    };
  }

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "4px";
  btnRow.style.marginTop = "8px";
  cw.appendChild(btnRow);

  const saveBtn = document.createElement("button");
  saveBtn.className = "looper-btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    const settings = collectSettingsFromUI();
    let idx = instrumentPreset;
    if (idx <= BUILTIN_PRESET_COUNT) {
      const name = prompt("Preset name?", "Custom");
      if (!name) return;
      instrumentPresets.push({ ...settings, name, color: randomPresetColor() });
      idx = instrumentPresets.length - 1;
      setInstrumentLayers([idx]);
      refreshPresetSelect();
    } else {
      Object.assign(instrumentPresets[idx], settings);
    }
    saveInstrumentStateToLocalStorage();
  });
  btnRow.appendChild(saveBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "looper-btn";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", () => {
    const idx = instrumentPreset;
    if (idx <= BUILTIN_PRESET_COUNT) { alert("Cannot delete built-in presets"); return; }
    if (!confirm("Delete preset?")) return;
    instrumentPresets.splice(idx,1);
    setInstrumentLayers([]);
    refreshPresetSelect();
    saveInstrumentStateToLocalStorage();
  });
  btnRow.appendChild(delBtn);

  const exportBtn = document.createElement("button");
  exportBtn.className = "looper-btn";
  exportBtn.textContent = "Export";
  exportBtn.addEventListener("click", () => {
    const p = instrumentPresets[instrumentPreset];
    if (!p) return;
    const exp = Object.assign({}, p);
    delete exp.sample;
    const blob = new Blob([JSON.stringify(exp)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (p.name || 'preset') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  btnRow.appendChild(exportBtn);

  const randBtn = document.createElement("button");
  randBtn.className = "looper-btn";
  randBtn.textContent = "Random";
  randBtn.addEventListener("click", () => {
    randomizeInstrumentPreset();
  });
  btnRow.appendChild(randBtn);

  document.body.appendChild(instrumentWindowContainer);
  makePanelDraggable(instrumentWindowContainer, dh, "ytbm_instrPos");
  updateInstrumentButtonColor();
  updateInstrumentPitchUI();
}

function buildFxPadWindow() {
  fxPadContainer = document.createElement("div");
  fxPadContainer.className = "looper-midimap-container";
  fxPadContainer.style.width = "260px";
  fxPadContainer.style.height = "260px";

  fxPadDragHandle = document.createElement("div");
  fxPadDragHandle.className = "looper-midimap-drag-handle";
  fxPadDragHandle.innerText = "FX Pad";
  fxPadContainer.appendChild(fxPadDragHandle);

  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "100%";
  wrap.style.height = "calc(100% - 24px)";
  fxPadContainer.appendChild(wrap);

  fxPadCanvas = document.createElement("canvas");
  fxPadCanvas.width = 260;
  fxPadCanvas.height = 260;
  fxPadCanvas.style.width = "100%";
  fxPadCanvas.style.height = "100%";
  fxPadCanvas.style.display = "block";
  fxPadCanvas.addEventListener('pointerdown',e=>{
    fxPadDragging=true;
    fxPadPrev={x:fxPadBall.x,y:fxPadBall.y};
    fxPadLastTime=performance.now();
    handleFxPadPointer(e);
    if(e.detail===2){
      fxPadSticky=!fxPadSticky;
      if(fxPadStickyBtn) fxPadStickyBtn.textContent = fxPadSticky ? 'Stick On' : 'Stick Off';
      drawFxPadBall();
    }
  });
  wrap.appendChild(fxPadCanvas);

  const types = [
    'filterDrive','pitch','delay','isolator','vinylSim','reverb','tapeEcho','chorus',
    'flanger','phaser','tremoloPan','distortion','overdrive','fuzz','wah','octave',
    'compressor','equalizer','bitCrash','noiseGen','vinylSimMfx','radioTuning',
    'slicerFlanger','ringMod','chromPitchShift','pitchFine','centerCancel',
    'subsonic','bpmLooper'
  ];
  for (let i=0;i<4;i++) {
    const sel=document.createElement('select');
    types.forEach(t=>sel.add(new Option(t,t)));
    sel.style.position='absolute';
    sel.style.zIndex='10';
    sel.style.backgroundColor='#222';
    sel.style.color='#fff';
    if(i===0){sel.style.left='0';sel.style.top='0';}
    if(i===1){sel.style.right='0';sel.style.top='0';}
    if(i===2){sel.style.left='0';sel.style.bottom='0';}
    if(i===3){sel.style.right='0';sel.style.bottom='0';}
    sel.addEventListener('change',()=>{fxPadSetEffect&&fxPadSetEffect(i,sel.value);});
    if(i>0 && !fxPadMultiMode) sel.style.display='none';
    fxPadDropdowns[i]=sel; wrap.appendChild(sel);
  }

  fxPadStickyBtn = document.createElement('button');
  fxPadStickyBtn.className = 'looper-btn';
  fxPadStickyBtn.textContent = fxPadSticky ? 'Stick On' : 'Stick Off';
  fxPadStickyBtn.style.position = 'absolute';
  fxPadStickyBtn.style.left = '4px';
  fxPadStickyBtn.style.bottom = '4px';
  fxPadStickyBtn.addEventListener('click',toggleFxPadSticky);
  wrap.appendChild(fxPadStickyBtn);

  fxPadModeBtn = document.createElement('button');
  fxPadModeBtn.className = 'looper-btn';
  fxPadModeBtn.textContent = fxPadMultiMode ? '4-Corner' : 'Single FX';
  fxPadModeBtn.style.position = 'absolute';
  fxPadModeBtn.style.right = '4px';
  fxPadModeBtn.style.bottom = '4px';
  fxPadModeBtn.addEventListener('click',toggleFxPadMode);
  wrap.appendChild(fxPadModeBtn);

  document.body.appendChild(fxPadContainer);
  makePanelDraggable(fxPadContainer, fxPadDragHandle, 'ytbm_fxPadPos');
  new ResizeObserver(resizeFxPadCanvas).observe(fxPadContainer);
  fxPadContainer.style.display='none';
}

function resizeFxPadCanvas(){
  if(!fxPadContainer||!fxPadCanvas) return;
  const rect=fxPadContainer.getBoundingClientRect();
  const size=Math.min(rect.width,rect.height);
  fxPadCanvas.width=fxPadCanvas.height=size;
  drawFxPadBall();
}

function drawFxPadBall(){
  if(!fxPadCanvas) return;
  const ctx=fxPadCanvas.getContext('2d');
  const w=fxPadCanvas.width; const h=fxPadCanvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#222'; ctx.fillRect(0,0,w,h);
  const x=fxPadBall.x*w; const y=fxPadBall.y*h;
  ctx.fillStyle=fxPadSticky?'#0f0':'orange';
  ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fill();
}

function handleFxPadPointer(e){
  const rect=fxPadCanvas.getBoundingClientRect();
  let x=(e.clientX-rect.left)/rect.width;
  let y=(e.clientY-rect.top)/rect.height;
  x=Math.max(0,Math.min(1,x));
  y=Math.max(0,Math.min(1,y));
  if(e.metaKey&&e.altKey){x=fxPadBall.x+(x-fxPadBall.x)*0.2;y=fxPadBall.y+(y-fxPadBall.y)*0.2;}
  else if(e.metaKey){x=fxPadBall.x+(x-fxPadBall.x)*0.5;y=fxPadBall.y+(y-fxPadBall.y)*0.5;}
  const now=performance.now();
  const dt=Math.max(1,now-fxPadLastTime);
  fxPadBall.vx=(x-fxPadBall.x)/(dt/16);
  fxPadBall.vy=(y-fxPadBall.y)/(dt/16);
  fxPadLastTime=now;
  fxPadBall.x=x; fxPadBall.y=y;
  drawFxPadBall();
  if(fxPadActive && fxPadTriggerCorner) fxPadTriggerCorner(x,y,fxPadSticky);
}

function startFxPadAnim(){
  cancelAnimationFrame(fxPadAnimId);
  const step=()=>{
    if(!fxPadDragging && !fxPadSticky){
      fxPadBall.x += (0.5 - fxPadBall.x) * 0.2;
      fxPadBall.y += (0.5 - fxPadBall.y) * 0.2;
      fxPadBall.vx = fxPadBall.vy = 0;
      if(Math.abs(fxPadBall.x-0.5)<0.001) fxPadBall.x=0.5;
      if(Math.abs(fxPadBall.y-0.5)<0.001) fxPadBall.y=0.5;
    }
    drawFxPadBall();
    if(fxPadActive && fxPadTriggerCorner) fxPadTriggerCorner(fxPadBall.x,fxPadBall.y,fxPadSticky);
    fxPadAnimId=requestAnimationFrame(step);
  };
  step();
}

async function handleFxPadJoystick(x, y) {
  await ensureAudioContext();
  if (!fxPadEngine) await setupFxPadNodes();
  fxPadBall.x = Math.max(0, Math.min(1, x));
  fxPadBall.y = Math.max(0, Math.min(1, y));
  if (!fxPadActive) {
    fxPadActive = true;
    applyAllFXRouting();
    startFxPadAnim();
  }
  if (fxPadTriggerCorner) fxPadTriggerCorner(fxPadBall.x, fxPadBall.y, fxPadSticky);
  if (fxPadContainer && fxPadContainer.style.display === 'block') drawFxPadBall();
}

function toggleFxPadSticky(){
  fxPadSticky = !fxPadSticky;
  if (fxPadStickyBtn) fxPadStickyBtn.textContent = fxPadSticky ? 'Stick On' : 'Stick Off';
  drawFxPadBall();
}

function toggleFxPadMode(){
  fxPadMultiMode = !fxPadMultiMode;
  if (fxPadModeBtn) fxPadModeBtn.textContent = fxPadMultiMode ? '4-Corner' : 'Single FX';
  if (fxPadEngine && fxPadEngine.setMultiMode){
    fxPadEngine.setMultiMode(fxPadMultiMode);
    fxPadEngine.triggerCorner(fxPadBall.x,fxPadBall.y,fxPadSticky);
  }
  for(let i=1;i<fxPadDropdowns.length;i++){
    fxPadDropdowns[i].style.display = fxPadMultiMode ? 'block' : 'none';
  }
}

async function showFxPadWindowToggle(){
  if(!fxPadContainer) buildFxPadWindow();
  if(fxPadContainer.style.display==='block'){
    fxPadContainer.style.display='none';
    fxPadActive=false;
    cancelAnimationFrame(fxPadAnimId);
    applyAllFXRouting();
    return;
  }
  fxPadContainer.style.display='block';
  await ensureAudioContext();
  if(!fxPadEngine) await setupFxPadNodes();
  fxPadActive=true; applyAllFXRouting();
  startFxPadAnim();
}

addTrackedListener(document,'pointermove',e=>{if(fxPadDragging) handleFxPadPointer(e);});
addTrackedListener(document,'pointerup',()=>{fxPadDragging=false; fxPadBall.vx=0; fxPadBall.vy=0;});

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

function saveInstrumentStateToLocalStorage() {
  try {
    const obj = {
      preset: instrumentPreset,
      octave: instrumentOctave,
      custom: instrumentPresets.slice(BUILTIN_PRESET_COUNT + 1),
      pitch: instrumentPitchSemitone,
      transpose: instrumentTranspose,
      followVideo: instrumentPitchFollowVideo,
      scale: instrumentScale,
      delay: instDelayNode ? instDelayNode.delayTime.value : 0,
      delayMix: instDelayMix ? instDelayMix.gain.value : 0,
      reverbMix: instReverbMix ? instReverbMix.gain.value : 0,
      compThresh: instCompNode ? instCompNode.threshold.value : -20,
      limitThresh: instLimiterNode ? instLimiterNode.threshold.value : -3,
      volume: instVolumeNode ? instVolumeNode.gain.value : 1,
      lfoRate: instLfoOsc ? instLfoOsc.frequency.value : 5,
      lfoDepth: instLfoGain ? instLfoGain.gain.value : 0,
      layers: instrumentLayers
    };
    localStorage.setItem(INSTRUMENT_STATE_KEY, JSON.stringify(obj));
  } catch (err) {
    console.warn("Failed saving instrument state", err);
  }
}

function loadInstrumentStateFromLocalStorage() {
  try {
    const raw = localStorage.getItem(INSTRUMENT_STATE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (Array.isArray(obj.custom)) {
      obj.custom.forEach(p => {
        if (!p.color) p.color = randomPresetColor();
        instrumentPresets.push(p);
      });
    }
    if (typeof obj.octave === 'number') instrumentOctave = obj.octave;
    if (Array.isArray(obj.layers)) {
      instrumentLayers = obj.layers.filter(i => i > 0 && i < instrumentPresets.length);
      instrumentLastPreset = instrumentLayers[0] || 1;
    }
    if (typeof obj.preset === 'number') instrumentLastPreset = obj.preset;
    if (typeof obj.pitch === 'number') {
      instrumentPitchSemitone = obj.pitch;
      instrumentPitchRatio = Math.pow(2, instrumentPitchSemitone / 12);
    }
    if (typeof obj.transpose === 'number') instrumentTranspose = obj.transpose;
    if (typeof obj.followVideo === 'boolean') instrumentPitchFollowVideo = obj.followVideo;
    if (typeof obj.scale === 'string') instrumentScale = obj.scale;
    if (typeof obj.delay === 'number' && instDelayNode) instDelayNode.delayTime.value = obj.delay;
    if (typeof obj.delayMix === 'number' && instDelayMix) instDelayMix.gain.value = obj.delayMix;
    if (typeof obj.reverbMix === 'number' && instReverbMix) instReverbMix.gain.value = obj.reverbMix;
    if (typeof obj.compThresh === 'number' && instCompNode) instCompNode.threshold.value = obj.compThresh;
    if (typeof obj.limitThresh === 'number' && instLimiterNode) instLimiterNode.threshold.value = obj.limitThresh;
    if (typeof obj.volume === 'number' && instVolumeNode) instVolumeNode.gain.value = obj.volume;
    if (typeof obj.lfoRate === 'number' && instLfoOsc) instLfoOsc.frequency.value = obj.lfoRate;
    if (typeof obj.lfoDepth === 'number' && instLfoGain) instLfoGain.gain.value = obj.lfoDepth;
    if (instrumentPitchFollowVideo) {
      applyInstrumentPitchSync();
    } else {
      instrumentPitchRatio = Math.pow(2, instrumentPitchSemitone / 12);
    }
    updateInstrumentPitchUI();
    refreshInstrumentEditFields();
  } catch (err) {
    console.warn("Failed loading instrument state", err);
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

async function pickPresetFile() {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json, audio/*";
    input.multiple = false;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", () => {
      const file = input.files ? input.files[0] : null;
      document.body.removeChild(input);
      resolve(file);
    }, { once: true });
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
    buildFxPadWindow();
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
