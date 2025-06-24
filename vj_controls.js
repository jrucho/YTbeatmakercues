let params = {brightness:1, contrast:1, saturate:1, hue:0, blur:0};
let reactive = {low:0, mid:0, high:0};
let effect = 'none';

function send(msg){
  window.opener && window.opener.postMessage(msg, '*');
}

function buildUI(){
  const content = document.getElementById('content');
  const ranges = {
    brightness:[0,2,0.1],
    contrast:[0,2,0.1],
    saturate:[0,2,0.1],
    hue:[0,360,1],
    blur:[0,10,0.5]
  };
  Object.keys(ranges).forEach(k=>{
    const [min,max,step] = ranges[k];
    const row=document.createElement('div'); row.className='midimap-row';
    const label=document.createElement('label'); label.textContent=k; const input=document.createElement('input');
    input.type='range'; input.min=min; input.max=max; input.step=step; input.value=params[k];
    input.oninput=()=>{ params[k]=parseFloat(input.value); send({type:'params',params}); };
    label.appendChild(input); row.appendChild(label); content.appendChild(row);
  });
  ['low','mid','high'].forEach(b=>{
    const row=document.createElement('div'); row.className='midimap-row';
    const label=document.createElement('label'); label.textContent='Audio '+b; const input=document.createElement('input');
    input.type='range'; input.min=0; input.max=2; input.step=0.1; input.value=0;
    input.oninput=()=>{ reactive[b]=parseFloat(input.value); send({type:'reactive',reactive}); };
    label.appendChild(input); row.appendChild(label); content.appendChild(row);
  });
  const effects=['none','invert','grayscale','sepia','blur','pixel','rgbShift','kaleido','edge','wave'];
  const effRow=document.createElement('div'); effRow.className='midimap-row';
  const sel=document.createElement('select'); effects.forEach(n=>{ sel.add(new Option(n,n)); });
  sel.onchange=()=>{ effect=sel.value; send({type:'effect',effect}); };
  const lab=document.createElement('label'); lab.textContent='Effect'; lab.appendChild(sel); effRow.appendChild(lab); content.appendChild(effRow);
  const cornerChk=document.createElement('input'); cornerChk.type='checkbox'; cornerChk.onchange=()=>{send({type:'toggleCorners',enabled:cornerChk.checked});};
  const cornerLab=document.createElement('label'); cornerLab.textContent='Corner Mapping'; cornerLab.prepend(cornerChk); content.appendChild(cornerLab);
  const projChk=document.createElement('input'); projChk.type='checkbox'; projChk.onchange=()=>{send({type:'useProjector',enabled:projChk.checked});};
  const projLab=document.createElement('label'); projLab.textContent='Use in Video Looper'; projLab.prepend(projChk); content.appendChild(projLab);
  const reset=document.createElement('button'); reset.className='looper-btn'; reset.textContent='Reset Params'; reset.onclick=()=>{params={brightness:1,contrast:1,saturate:1,hue:0,blur:0}; reactive={low:0,mid:0,high:0}; send({type:'reset'});};
  content.appendChild(reset);
}

window.onload=()=>{buildUI();send({type:'controlsReady'});};
