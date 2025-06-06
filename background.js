let ports = new Set();
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'midi') return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
});

if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(access => {
    function handlePort(port) {
      if (port.type !== 'input') return;
      port.onmidimessage = ev => {
        const data = Array.from(ev.data);
        ports.forEach(p => p.postMessage({ type: 'midi', data }));
      };
    }
    access.inputs.forEach(handlePort);
    access.addEventListener('statechange', e => handlePort(e.port));
  }).catch(err => console.warn('MIDI access failed', err));
}
