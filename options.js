// Save user-defined settings to Chrome Storage
document.getElementById("saveSettings").addEventListener("click", () => {
  const sampleKeys = {
    kick: document.getElementById("kickKey").value || "é",
    hihat: document.getElementById("hihatKey").value || "à",
    snare: document.getElementById("snareKey").value || "$"
  };

  const midiNotes = {
    kick: parseInt(document.getElementById("kickNote").value) || 36,
    hihat: parseInt(document.getElementById("hihatNote").value) || 42,
    snare: parseInt(document.getElementById("snareNote").value) || 38
  };

  chrome.storage.local.set({ sampleKeys, midiNotes }, () => {
    alert("Settings saved!");
  });
});

// Load existing settings from Chrome Storage
chrome.storage.local.get(["sampleKeys", "midiNotes"], (result) => {
  const sampleKeys = result.sampleKeys || { kick: "é", hihat: "à", snare: "$" };
  const midiNotes = result.midiNotes || { kick: 36, hihat: 42, snare: 38 };

  document.getElementById("kickKey").value = sampleKeys.kick;
  document.getElementById("hihatKey").value = sampleKeys.hihat;
  document.getElementById("snareKey").value = sampleKeys.snare;

  document.getElementById("kickNote").value = midiNotes.kick;
  document.getElementById("hihatNote").value = midiNotes.hihat;
  document.getElementById("snareNote").value = midiNotes.snare;
});
