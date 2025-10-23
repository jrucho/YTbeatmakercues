const saveStatus = document.getElementById("saveStatus");

function showToast(message) {
  if (!saveStatus) {
    alert(message);
    return;
  }

  saveStatus.textContent = message;
  saveStatus.classList.add("visible");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    saveStatus.classList.remove("visible");
  }, 2400);
}

document.getElementById("saveSettings").addEventListener("click", () => {
  const sampleKeys = {
    kick: document.getElementById("kickKey").value || "é",
    hihat: document.getElementById("hihatKey").value || "à",
    snare: document.getElementById("snareKey").value || "$"
  };

  const midiNotes = {
    kick: parseInt(document.getElementById("kickNote").value, 10) || 36,
    hihat: parseInt(document.getElementById("hihatNote").value, 10) || 42,
    snare: parseInt(document.getElementById("snareNote").value, 10) || 38
  };

  chrome.storage.local.set({ sampleKeys, midiNotes }, () => {
    showToast("Settings saved");
  });
});

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
