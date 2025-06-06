chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'midi') return;
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(access => {
      access.inputs.forEach(input => {
        input.onmidimessage = e => {
          port.postMessage({type:'midi', data: Array.from(e.data)});
        };
      });
      access.addEventListener('statechange', e => {
        if (e.port.type === 'input' && e.port.state === 'connected') {
          e.port.onmidimessage = ev => {
            port.postMessage({type:'midi', data: Array.from(ev.data)});
          };
        }
      });
    }).catch(err => console.warn('MIDI access failed in worker:', err));
  }
});
