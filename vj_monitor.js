const tabSelect = document.getElementById('tabSelect');
const refreshBtn = document.getElementById('refresh');
const canvas = document.getElementById('vjCanvas');
const ctx = canvas.getContext('2d');
let streams = [];

async function refreshTabList() {
  tabSelect.innerHTML = '';
  chrome.tabs.query({url: '*://www.youtube.com/*'}, tabs => {
    tabs.forEach(t => {
      const opt = new Option(t.title, String(t.id));
      tabSelect.add(opt);
    });
  });
}

refreshBtn.addEventListener('click', refreshTabList);
refreshTabList();

function startCaptureForTab(tabId) {
  chrome.tabCapture.capture({audio: false, video: true, targetTabId: Number(tabId)}, stream => {
    if (!stream) return;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.play();
    streams.push({video});
  });
}

tabSelect.addEventListener('change', () => {
  streams = [];
  const ids = Array.from(tabSelect.selectedOptions).map(o => o.value);
  ids.forEach(id => startCaptureForTab(id));
});

function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const count = streams.length;
  streams.forEach((s, i) => {
    const w = canvas.width / count;
    ctx.drawImage(s.video, i * w, 0, w, canvas.height);
  });
  requestAnimationFrame(draw);
}

draw();
