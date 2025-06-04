// MIDI helpers extracted from content.js
export async function initializeMIDI() {
  try {
    let access = await navigator.requestMIDIAccess({ sysex: false });
    access.inputs.forEach(inp => { inp.onmidimessage = handleMIDIMessage; });
  } catch (e) {
    console.warn('MIDI unavailable:', e);
  }
}

export function handleMIDIMessage(e) {
  let [st, note] = e.data;
  if (note === midiNotes.shift) {
    if (st === 144) isModPressed = true; else if (st === 128) isModPressed = false;
    return;
  }
  if (currentlyDetectingMidi && st === 144) {
    if (midiNotes[currentlyDetectingMidi] !== undefined) {
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
  if (st === 144) {
    if (Number(note) === Number(midiNotes.randomCues)) { randomizeCuesInOneClick(); return; }
    if (note === midiNotes.undo) { if (isModPressed) { redoAction(); } else { undoAction(); } return; }
    if (note === midiNotes.pitchDown) startPitchDownRepeat();
    if (note === midiNotes.pitchUp) startPitchUpRepeat();
    if (note === midiNotes.kick) playSample('kick');
    if (note === midiNotes.hihat) playSample('hihat');
    if (note === midiNotes.snare) playSample('snare');
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
          if (k in cuePoints) { sequencerTriggerCue(k); }
        }
      }
    }
  } else if (st === 128) {
    if (note === midiNotes.pitchDown) stopPitchDownRepeat();
    if (note === midiNotes.pitchUp) stopPitchUpRepeat();
    if (note === midiNotes.looper) onLooperButtonMouseUp();
    if (note === midiNotes.videoLooper) onVideoLooperButtonMouseUp();
  }
}

export function startPitchDownRepeat() {
  if (pitchDownInterval) return;
  pitchDownInterval = setInterval(() => updatePitch(Math.max(pitchPercentage - 1, -50)), 100);
}
export function stopPitchDownRepeat() {
  if (pitchDownInterval) { clearInterval(pitchDownInterval); pitchDownInterval = null; }
}
export function startPitchUpRepeat() {
  if (pitchUpInterval) return;
  pitchUpInterval = setInterval(() => updatePitch(Math.min(pitchPercentage + 1, 100)), 100);
}
export function stopPitchUpRepeat() {
  if (pitchUpInterval) { clearInterval(pitchUpInterval); pitchUpInterval = null; }
}

window.initializeMIDI = initializeMIDI;
window.handleMIDIMessage = handleMIDIMessage;
window.startPitchDownRepeat = startPitchDownRepeat;
window.stopPitchDownRepeat = stopPitchDownRepeat;
window.startPitchUpRepeat = startPitchUpRepeat;
window.stopPitchUpRepeat = stopPitchUpRepeat;
