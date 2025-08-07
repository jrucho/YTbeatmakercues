// Simple bootstrap for the standalone web app version
// Allows loading custom videos and ensures Beatmaker UI hooks into the video

document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('ytbm-video');
  const fileInput = document.getElementById('load-video');
  const searchInput = document.getElementById('search-query');
  const searchResults = document.getElementById('search-results');
  const progressBar = document.querySelector('.ytp-progress-bar');
  const playedBar = progressBar && progressBar.querySelector('.ytp-progress-bar-played');
  const playBtn = document.querySelector('.ytp-play-button');
  const currentTimeEl = document.querySelector('.ytp-time-current');
  const durationEl = document.querySelector('.ytp-time-duration');

  // iOS requires an explicit user gesture before AudioContext can start.
  function unlockAudio() {
    if (typeof ensureAudioContext === 'function') {
      ensureAudioContext();
      if (window.audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }
    }
  }
  ['touchstart', 'mousedown'].forEach(evt => {
    document.addEventListener(evt, function once() {
      unlockAudio();
      document.removeEventListener(evt, once, true);
    }, true);
  });

  // Load local files via the file picker
  if (fileInput && video) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      video.src = URL.createObjectURL(file);
      video.play().catch(() => {});
      ensureProgressBar();
    });
  }

  // Support loading a video via ?src=url
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');
  if (src) {
    video.src = src;
  }

  // Search YouTube via the Piped API
  async function searchYouTube(q) {
    if (!q) return;
    searchResults.innerHTML = '<div class="search-item">Searching...</div>';
    try {
      const res = await fetch('https://piped.video/api/search?q=' + encodeURIComponent(q));
      const data = await res.json();
      searchResults.innerHTML = '';
      (data.items || []).slice(0, 10).forEach(item => {
        if (!item.id) return;
        const div = document.createElement('div');
        div.className = 'search-item';
        div.textContent = item.title;
        div.addEventListener('click', () => loadVideoById(item.id));
        searchResults.appendChild(div);
      });
    } catch (err) {
      searchResults.innerHTML = '<div class="search-item">Search failed</div>';
    }
  }

  async function loadVideoById(id) {
    try {
      const res = await fetch('https://piped.video/api/streams/' + id);
      const data = await res.json();
      const stream = (data.videoStreams || [])[0];
      if (!stream) return;
      video.src = stream.url;
      video.play().catch(() => {});
      ensureProgressBar();
      unlockAudio();
    } catch (err) {
      console.error('loadVideoById failed', err);
    }
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchYouTube(searchInput.value.trim());
      }
    });
  }

  function syncProgress() {
    if (!playedBar || !video.duration) return;
    playedBar.style.width = (video.currentTime / video.duration * 100) + '%';
  }

  function formatTime(sec) {
    sec = sec || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return (h > 0 ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  function syncTimeDisplay() {
    if (currentTimeEl) currentTimeEl.textContent = formatTime(video.currentTime);
    if (durationEl) durationEl.textContent = formatTime(video.duration);
  }

  function syncPlayButton() {
    if (!playBtn) return;
    playBtn.textContent = video.paused ? '▶' : '❚❚';
    playBtn.setAttribute('aria-label', video.paused ? 'Play (k)' : 'Pause (k)');
  }

  function togglePlay() {
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function ensureProgressBar() {
    if (typeof getProgressBarElement === 'function') {
      getProgressBarElement();
      if (typeof updateCueMarkers === 'function') {
        updateCueMarkers();
      }
    }
    syncProgress();
    syncTimeDisplay();
  }

  if (video.readyState >= 1) {
    ensureProgressBar();
  } else {
    video.addEventListener('loadedmetadata', ensureProgressBar);
  }

  video.addEventListener('timeupdate', () => {
    syncProgress();
    syncTimeDisplay();
  });
  video.addEventListener('play', syncPlayButton);
  video.addEventListener('pause', syncPlayButton);
  video.addEventListener('dblclick', toggleFullScreen);

  if (progressBar) {
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      video.currentTime = pct * video.duration;
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', togglePlay);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    switch (e.key) {
      case ' ': // space
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'j':
        video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case 'l':
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        break;
      case 'ArrowLeft':
        video.currentTime = Math.max(0, video.currentTime - 5);
        break;
      case 'ArrowRight':
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
        break;
      case 'f':
        toggleFullScreen();
        break;
    }
  });

  syncPlayButton();
});

function toggleFullScreen() {
  const video = document.getElementById('ytbm-video');
  if (!video) return;
  if (!document.fullscreenElement) {
    video.requestFullscreen && video.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen && document.exitFullscreen();
  }
}
