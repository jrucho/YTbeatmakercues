const defaultParams = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hue: 0,
  blur: 0
};
const paramRanges = {
  brightness: [0,2,0.1],
  contrast: [0,2,0.1],
  saturate: [0,2,0.1],
  hue: [0,360,1],
  blur: [0,10,0.5]
};
let params = { ...defaultParams };
let reactive = { low:0, mid:0, high:0 };
const effectsDiv = document.getElementById('effects');

for (const key in paramRanges) {
  const [min,max,step] = paramRanges[key];
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.textContent = key + ':';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min; input.max = max; input.step = step; input.value = params[key];
  input.oninput = () => { params[key] = parseFloat(input.value); sendParams(); };
  label.appendChild(input);
  row.appendChild(label);
  effectsDiv.appendChild(row);
}

['low','mid','high'].forEach(band => {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.textContent = `Audio ${band}`;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = 0; input.max = 2; input.step = 0.1; input.value = 0;
  input.oninput = () => { reactive[band] = parseFloat(input.value); sendParams(); };
  label.appendChild(input);
  row.appendChild(label);
  effectsDiv.appendChild(row);
});

function sendParams() {
  window.opener?.postMessage({ type:'filterParams', data:{ params, reactive } }, '*');
}

document.getElementById('cornerMap').onchange = e => {
  window.opener?.postMessage({ type:'cornerMap', data:e.target.checked }, '*');
};
document.getElementById('useProj').onchange = e => {
  window.opener?.postMessage({ type:'useProjector', data:e.target.checked }, '*');
};

window.opener?.postMessage({type:'controlsReady'}, '*');
sendParams();

window.addEventListener('message', e => {
  if (e.data && e.data.type === 'resetUI') {
    params = { ...defaultParams };
    reactive = { low:0, mid:0, high:0 };
    const inputs = document.querySelectorAll('#effects input');
    let i = 0;
    for (const key in paramRanges) {
      inputs[i].value = params[key];
      i++;
    }
    ['low','mid','high'].forEach(b => { inputs[i].value = 0; i++; });
  }
});
