/*
Ranged Combat Simulator
- Canvas 1000x1000 world
- Sidebar for types and units
- Create types, place instances for Comp1/Comp2
- Play simulation turn-based until one side has no units
*/

const canvas = document.getElementById('grid');
const ctx = canvas.getContext('2d');
const createTypeBtn = document.getElementById('createTypeBtn');
const modal = document.getElementById('modal');
const typeForm = document.getElementById('typeForm');
const cancelModal = document.getElementById('cancelModal');
const typesList = document.getElementById('typesList');
const typeSelect = document.getElementById('typeSelect');
const placePlayer = document.getElementById('placePlayer');
const unitsList = document.getElementById('unitsList');
const playBtn = document.getElementById('playBtn');
const clearBtn = document.getElementById('clearBtn');
const resetBtn = document.getElementById('resetBtn');
const logEl = document.getElementById('logArea'); // now a textarea for CSV

// Revision log popup
document.getElementById('revBtn')?.addEventListener('click', async ()=>{
  try {
    const res = await fetch('rev_log.txt');
    const text = res.ok ? await res.text() : 'Could not load revision log.';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:10000';
    overlay.innerHTML = `<div style="background:#fff;padding:16px;border-radius:8px;max-width:600px;width:90%;max-height:80vh;overflow:auto;box-shadow:0 6px 18px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Revision Log</h3><button id="revCloseBtn" style="padding:4px 10px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer">Close</button></div>
      <div style="font-size:13px;font-family:monospace">${text.trim().split('\n').filter(l=>l.trim()).map(l => { const m = l.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*-\s*(.*)/); return m ? '<p style="margin:0 0 12px 0"><b>'+m[1]+'</b> - '+m[2].replace(/</g,'&lt;')+'</p>' : '<p style="margin:0 0 12px 0">'+l.replace(/</g,'&lt;')+'</p>'; }).join('')}</div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#revCloseBtn').addEventListener('click', ()=> overlay.remove());
    overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
  } catch(e){ alert('Failed to load revision log.'); }
});

// When the placePlayer dropdown changes, if there are selected units convert their owner to the chosen owner,
// then recalculate placement numbers by unit age and refresh UI/draw.
if(placePlayer){
  placePlayer.addEventListener('change', (e)=>{
    const newOwner = e.target.value;
    if(!newOwner) return;
    if(selectedUnits.size === 0) return;
    for(const id of Array.from(selectedUnits)){
      const u = units.find(z=>z.id===id);
      if(!u) continue;
      u.owner = newOwner;
    }
    // Recalculate placement numbers purely based on unit age (id order) per owner
    renumberPlaced();
    refreshUnitsUI();
    draw();
    saveState();
    log(`Converted ${selectedUnits.size} unit(s) to ${newOwner}`);
  });
}

// If user selects a type from the main "Select type to place" dropdown while some units are selected,
// convert those selected units to the chosen type.
if(typeSelect){
  typeSelect.addEventListener('change', (e) => {
    const newTypeId = Number(e.target.value) || null;
    if(!newTypeId) return;
    if(selectedUnits.size === 0) return;
    let converted = 0;
    for(const id of Array.from(selectedUnits)){
      const u = units.find(z => z.id === id);
      if(!u) continue;
      u.typeId = newTypeId;
      // reset HP to the new type's max health
      const t = unitTypes.find(tt => tt.id === newTypeId);
      if(t) u.hp = t.health;
      converted++;
    }
    if(converted > 0){
      renumberPlaced();
      refreshUnitsUI();
      draw();
      saveState();
      log(`Converted ${converted} selected unit(s) to type #${newTypeId}`);
    }
  });
}

 // Speed slider controls per-turn delay (ms); slider is visually reversed via CSS so leftmost appears as 300ms.
 const speedSlider = document.getElementById('speedSlider');
 const speedValueLabel = document.getElementById('speedValue');
 let delayMs = Number(speedSlider?.value || 180);
 if(speedValueLabel) speedValueLabel.textContent = `${delayMs}ms`;
 if(speedSlider){
   speedSlider.addEventListener('input', (e)=>{
     delayMs = Number(e.target.value || 0);
     if(speedValueLabel) speedValueLabel.textContent = `${delayMs}ms`;
   });
 }

 // Tab elements
 const tabButtons = Array.from(document.querySelectorAll('.tabButton'));
 const tabContents = {
   types: document.getElementById('tab-types'),
   units: document.getElementById('tab-units'),
   graph: null, // graph is a popup, not a tab panel
   log: document.getElementById('tab-log')
 };

function showTab(name){
  // update buttons
  tabButtons.forEach(b=>{
    const is = b.dataset.tab === name;
    b.classList.toggle('active', is);
    b.setAttribute('aria-selected', is ? 'true' : 'false');
  });
  // update panels (skip entries that don't have a panel element, e.g. graph popup)
  Object.keys(tabContents).forEach(k=>{
    const el = tabContents[k];
    if(!el) return; // safety: some tabs (like 'graph') aren't actual panel elements
    if(k === name){
      el.classList.remove('hidden');
      el.removeAttribute('aria-hidden');
    } else {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden','true');
    }
  });
}
// wire tab buttons
tabButtons.forEach(b=>{
  b.addEventListener('click', ()=>{
    const name = b.dataset.tab;
    // open a popup for 'log' instead of showing sidebar content
    if(name === 'log'){
      if(typeof openLogModal === 'function') openLogModal();
      return;
    }
    showTab(name);
  });
});
 // default
 showTab('types');

 // Graph popup button (opens a heatmap of Comp1 vs Comp2 starting counts)
 const graphBtn = document.querySelector('.tabButton[data-tab="graph"]');
 async function openGraphModal(){
  // build modal if not present
  let modal = document.getElementById('graphModal');
  if(modal) { modal.remove(); } // rebuild fresh
  modal = document.createElement('div');
  modal.id = 'graphModal';
  modal.className = 'graphModal';
  modal.innerHTML = `
    <div class="panel">
      <div class="graphControls">
        <div style="display:flex;gap:12px;align-items:center;width:100%;justify-content:space-between">
          <div id="graphTitleText" class="titleText" style="font-weight:600">Average Health Totals After Battle - Health</div>
          <div style="display:flex;gap:8px;align-items:center">
            <label style="font-size:13px;">
              Metric
              <select id="graphMetricSelect" style="margin-left:6px;padding:6px;border-radius:6px;border:1px solid #e6e6e6;">
                <option value="health">Health</option>
                <option value="units">Units</option>
                <option value="healthPct">Health %</option>
                <option value="unitsPct">Units %</option>
              </select>
            </label>
            <label style="font-size:13px;">
              Batch
              <select id="graphBatchSelect" style="margin-left:6px;padding:6px;border-radius:6px;border:1px solid #e6e6e6;">
                <option value="__ALL__">All</option>
              </select>
            </label>
            <button id="graphDownloadBtn">Download PNG</button>
            <button id="graphCloseBtn">Close</button>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:12px;align-items:center">
          <label style="font-size:13px;display:flex;align-items:center;gap:8px">
            Gradient Slope
            <input id="graphSlopeSlider" type="range" min="-1" max="1" step="0.01" value="0" style="width:240px" />
          </label>
          <div style="font-size:13px;color:#666">Slope: <span id="graphSlopeLabel">linear</span></div>
        </div>
      </div>
      <div class="graphCanvasWrap">
        <canvas id="graphCanvas" width="720" height="720" style="max-width:100%;border:1px solid #eee;background:#fff"></canvas>
      </div>
      <div style="width:100%;display:flex;justify-content:space-between;align-items:center">
        <div class="graphLegend"><span style="width:14px;height:14px;display:inline-block;background:rgba(43,122,120,0.8)"></span> Blue 1 wins</div>
        <div class="graphLegend"><span style="width:14px;height:14px;display:inline-block;background:rgba(217,83,79,0.8)"></span> Red 2 wins</div>
        <div class="graphLegend"><span style="width:14px;height:14px;display:inline-block;background:#fff;border:1px solid #ddd"></span> Tie</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('graphCloseBtn').addEventListener('click', ()=> modal.remove());

  const canvasG = document.getElementById('graphCanvas');
  const ctxG = canvasG.getContext('2d');

  // wire download button
  const dlBtn = document.getElementById('graphDownloadBtn');

  if(dlBtn){
    dlBtn.addEventListener('click', ()=>{
      try{
        const scale = 2; // 2x resolution
        const hiW = canvasG.width * scale;
        const hiH = canvasG.height * scale;
        const titleEl = modal.querySelector('.graphControls > div > #graphTitleText');
        const titleText = titleEl ? String(titleEl.textContent || '').trim() : '';

        const titlePx = Math.max(32, 24 * scale);
        const tmp = document.createElement('canvas');
        tmp.width = hiW;
        tmp.height = hiH + titlePx;
        const tctx = tmp.getContext('2d');

        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0,0,tmp.width,tmp.height);

        if(titleText){
          tctx.fillStyle = '#111';
          tctx.textAlign = 'center';
          tctx.textBaseline = 'middle';
          const fontSize = Math.max(14 * scale, 14);
          tctx.font = `${fontSize}px sans-serif`;
          tctx.fillText(titleText, tmp.width / 2, titlePx / 2);
        }

        tctx.drawImage(canvasG, 0, titlePx, hiW, hiH);

        tmp.toBlob((blob)=>{
          if(!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;

          // Build filename from selected batch and metric: "[Batch] - [Metric].png"
          // Prefer the UI selections; fall back to lastBatchName or 'graph' and metric value or 'metric'
          const batchSelEl = document.getElementById('graphBatchSelect');
          const metricSelEl = document.getElementById('graphMetricSelect');
          // if the UI selection is the special "__ALL__" option use lowercase 'all' for filenames,
          // otherwise prefer the selected batch name or fallback to lastBatchName
          const batchName = (batchSelEl && batchSelEl.value && batchSelEl.value !== '__ALL__') ? batchSelEl.value : 'all';
          const metricName = (metricSelEl && metricSelEl.value) ? metricSelEl.value : 'metric';

          // sanitize filename by replacing problematic characters
          const sanitize = (s) => String(s).replace(/[\/\\:?%*"<>|]/g, '-').trim();
          const filenameBase = `${sanitize(batchName)} - ${sanitize(metricName)}` || 'graph';
          a.download = filenameBase + '.png';

          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }, 'image/png');
      }catch(e){
        console.error('Download failed', e);
      }
    });
  }

  // If there is no CSV log data, render a blank canvas and return (still populate batch dropdown with "All")
  if(!Array.isArray(csvEntries) || csvEntries.length === 0){
    // still ensure batch select has only All
    const batchSelEmpty = document.getElementById('graphBatchSelect');
    if(batchSelEmpty){
      batchSelEmpty.innerHTML = '<option value="__ALL__">All</option>';
    }

    ctxG.fillStyle = '#ffffff';
    ctxG.fillRect(0,0,canvasG.width,canvasG.height);
    ctxG.fillStyle = '#666';
    ctxG.font = '14px sans-serif';
    ctxG.textAlign = 'center';
    ctxG.textBaseline = 'middle';
    ctxG.fillText('No log data', canvasG.width/2, canvasG.height/2);
    return;
  }

  // First, combine CSV rows that belong to the same BatchBattle (same batch_name+batch_ind+battle_ind)
  // so multiple unit-type rows for one battle are aggregated into a single battle summary.
  const battlesById = new Map();
  let maxC1 = 1, maxC2 = 1;

  for (const e of csvEntries) {
    // new schema uses lowercase keys: batch_name, batch_ind, battle_ind, commander, starting_*, ending_*
    const batchName = String(e.batch_name || '');
    const attempt = String(e.batch_ind ?? '');
    const battleNum = String(e.battle_ind ?? '');
    const battleKey = `${batchName}|${attempt}|${battleNum}`;

    // sums per battle (aggregate across unit-type rows for each commander)
    const existingBattle = battlesById.get(battleKey) || {
      batch_name: batchName,
      batch_ind: attempt,
      battle_ind: battleNum,
      C1StartCount: 0,
      C1StartHealth: 0,
      C2StartCount: 0,
      C2StartHealth: 0,
      C1EndCount: 0,
      C1EndHealth: 0,
      C2EndCount: 0,
      C2EndHealth: 0,
      occurrences: 0 // number of type-rows combined for this battle
    };

    const cmd = Number(e.commander) || 0;
    // normalize numeric fields (some entries might be strings)
    const sCount = Number(e.starting_count || e.startingCount || 0) || 0;
    const sHealth = Number(e.starting_health || e.startingHealth || 0) || 0;
    const eCount = Number(e.ending_count || e.endingCount || 0) || 0;
    const eHealth = Number(e.ending_health || e.endingHealth || 0) || 0;

    if (cmd === 1) {
      existingBattle.C1StartCount += sCount;
      existingBattle.C1StartHealth += sHealth;
      existingBattle.C1EndCount += eCount;
      existingBattle.C1EndHealth += eHealth;
    } else if (cmd === 2) {
      existingBattle.C2StartCount += sCount;
      existingBattle.C2StartHealth += sHealth;
      existingBattle.C2EndCount += eCount;
      existingBattle.C2EndHealth += eHealth;
    } else {
      // unknown commander rows: ignore but still track occurrences
    }

    existingBattle.occurrences += 1;
    battlesById.set(battleKey, existingBattle);
  }

  // Now aggregate by (C1StartCount, C2StartCount) across battles (each battle counted once)
  const cellMap = new Map();
  for (const [, b] of battlesById) {
    const c1 = Number(b.C1StartCount) || 0;
    const c2 = Number(b.C2StartCount) || 0;
    maxC1 = Math.max(maxC1, c1);
    maxC2 = Math.max(maxC2, c2);
    const key = `${c1}_${c2}`;

    const existing = cellMap.get(key) || {
      count: 0,
      sumC1StartHealth: 0,
      sumC2StartHealth: 0,
      sumC1EndHealth: 0,
      sumC2EndHealth: 0,
      sumC1EndCount: 0,
      sumC2EndCount: 0,
      sumC1StartCount: 0,
      sumC2StartCount: 0
    };

    existing.count += 1; // count battles (not unit-types)
    existing.sumC1StartHealth += Number(b.C1StartHealth) || 0;
    existing.sumC2StartHealth += Number(b.C2StartHealth) || 0;
    existing.sumC1EndHealth += Number(b.C1EndHealth) || 0;
    existing.sumC2EndHealth += Number(b.C2EndHealth) || 0;
    existing.sumC1EndCount += Number(b.C1EndCount) || 0;
    existing.sumC2EndCount += Number(b.C2EndCount) || 0;
    existing.sumC1StartCount += Number(b.C1StartCount) || 0;
    existing.sumC2StartCount += Number(b.C2StartCount) || 0;

    cellMap.set(key, existing);
  }

  // Build list of unique batch names for the batch dropdown (include "All") using new schema key
  const batchNames = Array.from(new Set(csvEntries.map(e => String(e.batch_name || '').trim()).filter(Boolean)));
  const batchSelect = document.getElementById('graphBatchSelect');
  if(batchSelect){
    batchSelect.innerHTML = '<option value="__ALL__">All</option>';
    for(const bn of batchNames){
      const o = document.createElement('option');
      o.value = bn;
      o.textContent = bn;
      batchSelect.appendChild(o);
    }
  }

  // determine canvas layout based on logged max counts
  // reserve extra margin for axis labels so numbers are completely visible
  const outerPad = 48; // larger padding to ensure axis numbers never clip
  // compute the drawable area inside the padding and size each cell to fit
  const drawableW = Math.max(0, canvasG.width - outerPad * 2);
  const drawableH = Math.max(0, canvasG.height - outerPad * 2);
  const cellW = Math.floor(drawableW / Math.max(1, maxC1));
  const cellH = Math.floor(drawableH / Math.max(1, maxC2));
  // grid dimensions (may be smaller than drawable if integer rounding occurs)
  const gridWidth = cellW * maxC1;
  const gridHeight = cellH * maxC2;
  // position grid inside padding and center within drawable area so axis labels have room
  const offsetX = outerPad + Math.floor((drawableW - gridWidth) / 2);
  const offsetY = outerPad + Math.floor((drawableH - gridHeight) / 2);

  // helper to draw empty cell
  function drawEmpty(x,y,w,h){
    ctxG.fillStyle = '#ffffff';
    ctxG.fillRect(x,y,w,h);
    ctxG.strokeStyle = '#ddd';
    ctxG.strokeRect(x+0.5,y+0.5,w-1,h-1);
  }

  // render function supports metrics: 'health'|'units'|'healthPct'|'unitsPct'
  // added optional batchFilter argument: if provided (string, not "__ALL__") will aggregate only battles from that batch name
  function renderGraph(metric = 'health', batchFilter = '__ALL__'){
    // read slope from slider (range -1..1), where negative skews toward dark end and positive toward light end
    const slopeEl = document.getElementById('graphSlopeSlider');
    const slopeLabel = document.getElementById('graphSlopeLabel');
    let slope = 0;
    if(slopeEl) slope = Number(slopeEl.value) || 0;
    if(slopeLabel){
      if(slope <= -0.66) slopeLabel.textContent = 'high dark';
      else if(slope <= -0.2) slopeLabel.textContent = 'dark bias';
      else if(slope >= 0.66) slopeLabel.textContent = 'high light';
      else if(slope >= 0.2) slopeLabel.textContent = 'light bias';
      else slopeLabel.textContent = 'linear';
    }

    // helper to remap linear intensity [0,1] using slope into a non-linear curve:
    // slope < 0 -> emphasize high end (darker colors stronger), slope > 0 -> emphasize low end (lighter colors stronger)
    function applySlope(i){
      i = Math.max(0, Math.min(1, i));
      if(Math.abs(slope) < 1e-6) return i;
      const maxExp = 4;
      const minExp = 0.25;
      const exp = slope < 0 ? (1 + (-slope) * (maxExp - 1)) : (1 - slope * (1 - minExp));
      return Math.pow(i, exp);
    }

    ctxG.fillStyle = '#ffffff';
    ctxG.fillRect(0,0,canvasG.width,canvasG.height);

    // If a batch filter is active, rebuild a filtered battles map and cellMap for that batch only
    let filteredCellMap = cellMap;
    let filteredMaxC1 = maxC1;
    let filteredMaxC2 = maxC2;

    if(batchFilter && batchFilter !== '__ALL__'){
      // Build filteredCellMap by selecting pre-aggregated battles from battlesById that match the batch name
      const cm = new Map();
      let mC1 = 1, mC2 = 1;
      for(const [key, b] of battlesById.entries()){
        if(String(b.batch_name || '').trim() !== batchFilter) continue;
        const c1 = Number(b.C1StartCount) || 0;
        const c2 = Number(b.C2StartCount) || 0;
        mC1 = Math.max(mC1, c1);
        mC2 = Math.max(mC2, c2);
        const k = `${c1}_${c2}`;
        const existing = cm.get(k) || {
          count: 0,
          sumC1StartHealth: 0,
          sumC2StartHealth: 0,
          sumC1EndHealth: 0,
          sumC2EndHealth: 0,
          sumC1EndCount: 0,
          sumC2EndCount: 0,
          sumC1StartCount: 0,
          sumC2StartCount: 0
        };
        existing.count += 1;
        existing.sumC1StartHealth += Number(b.C1StartHealth) || 0;
        existing.sumC2StartHealth += Number(b.C2StartHealth) || 0;
        existing.sumC1EndHealth += Number(b.C1EndHealth) || 0;
        existing.sumC2EndHealth += Number(b.C2EndHealth) || 0;
        existing.sumC1EndCount += Number(b.C1EndCount) || 0;
        existing.sumC2EndCount += Number(b.C2EndCount) || 0;
        existing.sumC1StartCount += Number(b.C1StartCount) || 0;
        existing.sumC2StartCount += Number(b.C2StartCount) || 0;
        cm.set(k, existing);
      }
      filteredCellMap = cm;
      filteredMaxC1 = mC1;
      filteredMaxC2 = mC2;

      // adjust layout sizes based on filtered maxima
      const drawableW2 = Math.max(0, canvasG.width - outerPad * 2);
      const drawableH2 = Math.max(0, canvasG.height - outerPad * 2);
      const cellW2 = Math.floor(drawableW2 / Math.max(1, filteredMaxC1));
      const cellH2 = Math.floor(drawableH2 / Math.max(1, filteredMaxC2));
      var local_layout = {cellW: cellW2, cellH: cellH2, gridWidth: cellW2 * filteredMaxC1, gridHeight: cellH2 * filteredMaxC2, offsetX: outerPad + Math.floor((drawableW2 - (cellW2 * filteredMaxC1)) / 2), offsetY: outerPad + Math.floor((drawableH2 - (cellH2 * filteredMaxC2)) / 2)};
    } else {
      var local_layout = {cellW, cellH, gridWidth, gridHeight, offsetX, offsetY};
    }

    // compute overall maxima used for normalization depending on metric
    let globalMax = 1;
    if(metric === 'health' || metric === 'healthPct'){
      for(const [, entry] of filteredCellMap){
        const s1 = entry.sumC1StartHealth / Math.max(1, entry.count);
        const s2 = entry.sumC2StartHealth / Math.max(1, entry.count);
        globalMax = Math.max(globalMax, s1, s2);
      }
    } else {
      for(const [, entry] of filteredCellMap){
        const c1 = entry.sumC1StartCount / Math.max(1, entry.count);
        const c2 = entry.sumC2StartCount / Math.max(1, entry.count);
        globalMax = Math.max(globalMax, c1, c2);
      }
    }

    // draw grid background
    ctxG.strokeStyle = '#f0f0f0';

    // draw all cells using local_layout
    for(let iy=1; iy<=Math.max(1, (batchFilter && batchFilter !== '__ALL__' ? filteredMaxC2 : maxC2)); iy++){
      for(let ix=1; ix<=Math.max(1, (batchFilter && batchFilter !== '__ALL__' ? filteredMaxC1 : maxC1)); ix++){
        const x = local_layout.offsetX + (ix - 1) * local_layout.cellW;
        const y = local_layout.offsetY + (iy - 1) * local_layout.cellH;
        const key = `${ix}_${iy}`;
        const entry = filteredCellMap.get(key);
        if(!entry){
          drawEmpty(x,y,local_layout.cellW,local_layout.cellH);
          continue;
        }

        const cnt = Math.max(1, entry.count || 1);
        const C1StartHealth = (entry.sumC1StartHealth || 0) / cnt;
        const C2StartHealth = (entry.sumC2StartHealth || 0) / cnt;
        const C1EndHealth = (entry.sumC1EndHealth || 0) / cnt;
        const C2EndHealth = (entry.sumC2EndHealth || 0) / cnt;
        const C1StartCount = (entry.sumC1StartCount || 0) / cnt;
        const C2StartCount = (entry.sumC2StartCount || 0) / cnt;
        const C1EndCount = (entry.sumC1EndCount || 0) / cnt;
        const C2EndCount = (entry.sumC2EndCount || 0) / cnt;

        let winner = 'draw';
        if(C1EndCount > C2EndCount) winner = 'comp1';
        else if(C2EndCount > C1EndCount) winner = 'comp2';
        else {
          if(C1EndHealth > C2EndHealth) winner = 'comp1';
          else if(C2EndHealth > C1EndHealth) winner = 'comp2';
          else winner = 'draw';
        }

        let metricValue = 0;
        if(metric === 'health'){
          metricValue = winner === 'comp1' ? C1EndHealth : (winner === 'comp2' ? C2EndHealth : 0);
          var intensity = Math.min(1, metricValue / Math.max(1, globalMax));
        } else if(metric === 'units'){
          metricValue = winner === 'comp1' ? C1EndCount : (winner === 'comp2' ? C2EndCount : 0);
          intensity = Math.min(1, metricValue / Math.max(1, globalMax));
        } else if(metric === 'healthPct'){
          if(winner === 'comp1'){
            metricValue = C1StartHealth > 0 ? (C1EndHealth / C1StartHealth) * 100 : 0;
          } else if(winner === 'comp2'){
            metricValue = C2StartHealth > 0 ? (C2EndHealth / C2StartHealth) * 100 : 0;
          } else metricValue = 0;
          intensity = Math.min(1, metricValue / 100);
        } else if(metric === 'unitsPct'){
          if(winner === 'comp1'){
            metricValue = C1StartCount > 0 ? (C1EndCount / C1StartCount) * 100 : 0;
          } else if(winner === 'comp2'){
            metricValue = C2StartCount > 0 ? (C2EndCount / C2StartCount) * 100 : 0;
          } else metricValue = 0;
          intensity = Math.min(1, metricValue / 100);
        } else {
          intensity = 0;
        }

        if(winner === 'draw'){
          drawEmpty(x,y,local_layout.cellW,local_layout.cellH);
        // show a centered "0" for tie cells
        ctxG.fillStyle = '#000';
        const zeroFont = Math.max(8, Math.floor(Math.min(local_layout.cellW, local_layout.cellH) * 0.45));
        ctxG.font = `${zeroFont}px sans-serif`;
        ctxG.textAlign = 'center';
        ctxG.textBaseline = 'middle';
        ctxG.fillText('0', x + local_layout.cellW / 2, y + local_layout.cellH / 2);
        } else if(winner === 'comp1'){
          const base = [43,122,120];
          ctxG.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${0.25 + 0.75 * intensity})`;
          ctxG.fillRect(x,y,local_layout.cellW,local_layout.cellH);
        } else {
          const base = [217,83,79];
          ctxG.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${0.25 + 0.75 * intensity})`;
          ctxG.fillRect(x,y,local_layout.cellW,local_layout.cellH);
        }

        ctxG.strokeStyle = '#ccc';
        ctxG.strokeRect(x+0.5,y+0.5,local_layout.cellW-1,local_layout.cellH-1);

        if(winner !== 'draw'){
          const display = Math.round(metricValue);
          ctxG.fillStyle = '#000';
          // base font for the main number
          const baseFontSize = Math.max(8, Math.floor(Math.min(local_layout.cellW, local_layout.cellH) * 0.45));
          ctxG.font = `${baseFontSize}px sans-serif`;
          ctxG.textBaseline = 'middle';
          // For percentage metrics, draw the number and a smaller "%" to the right at ~20% size
          if(metric === 'healthPct' || metric === 'unitsPct'){
            // draw numeric percentage value only (no '%' sign)
            ctxG.textAlign = 'center';
            const cx = x + local_layout.cellW / 2;
            const cy = y + local_layout.cellH / 2;
            ctxG.fillText(String(display), cx, cy);
          } else {
            ctxG.textAlign = 'center';
            ctxG.fillText(String(display), x + local_layout.cellW / 2, y + local_layout.cellH / 2);
          }
        }
      }
    }

    // Draw axis tick numbers for X and Y using local_layout and filtered maxima
    ctxG.fillStyle = '#111';
    ctxG.font = '12px sans-serif';
    ctxG.textAlign = 'center';
    ctxG.textBaseline = 'top';

    const drawMaxC1 = batchFilter && batchFilter !== '__ALL__' ? filteredMaxC1 : maxC1;
    const drawMaxC2 = batchFilter && batchFilter !== '__ALL__' ? filteredMaxC2 : maxC2;

    for(let ix=1; ix<=Math.max(1, drawMaxC1); ix++){
      const cx = local_layout.offsetX + (ix - 1) * local_layout.cellW + local_layout.cellW / 2;
      ctxG.textAlign = 'center';
      ctxG.textBaseline = 'bottom';
      ctxG.fillStyle = '#000';
      ctxG.fillText(String(ix), cx, local_layout.offsetY - 6);
      ctxG.textBaseline = 'top';
      ctxG.fillText(String(ix), cx, local_layout.offsetY + local_layout.gridHeight + 6);
    }

    ctxG.font = '12px sans-serif';
    for(let iy=1; iy<=Math.max(1, drawMaxC2); iy++){
      const cy = local_layout.offsetY + (iy - 1) * local_layout.cellH + local_layout.cellH / 2;
      ctxG.textAlign = 'right';
      ctxG.textBaseline = 'middle';
      ctxG.fillStyle = '#000';
      ctxG.fillText(String(iy), local_layout.offsetX - 8, cy);
      ctxG.textAlign = 'left';
      ctxG.fillText(String(iy), local_layout.offsetX + local_layout.gridWidth + 8, cy);
    }

    ctxG.font = '13px sans-serif';
    ctxG.textAlign = 'center';
    ctxG.textBaseline = 'bottom';
    ctxG.fillText('Comp1 start count (X)', local_layout.offsetX + local_layout.gridWidth / 2, local_layout.offsetY - 18);

    ctxG.save();
    ctxG.translate(local_layout.offsetX - 26, local_layout.offsetY + local_layout.gridHeight / 2);
    ctxG.rotate(-Math.PI / 2);
    ctxG.textAlign = 'center';
    ctxG.textBaseline = 'bottom';
    ctxG.fillText('Comp2 start count (Y)', 0, 0);
    ctxG.restore();
  }

  // default metric = 'health'
  let currentMetric = 'health';
  let currentBatchFilter = '__ALL__';

  // update modal title to include chosen metric label
  function updateGraphTitle(metric){
    const el = document.getElementById('graphTitleText');
    if(!el) return;
    const labels = {
      health: 'Health',
      units: 'Units',
      healthPct: 'Health %',
      unitsPct: 'Units %'
    };
    const label = labels[metric] || '';
    el.textContent = `Average Health Totals After Battle${label ? ' - ' + label : ''}`;
  }

  const metricSelect = document.getElementById('graphMetricSelect');
  const batchSelectEl = document.getElementById('graphBatchSelect');

  if(metricSelect){
    metricSelect.value = currentMetric;
    metricSelect.addEventListener('change', ()=>{
      currentMetric = metricSelect.value || 'health';
      updateGraphTitle(currentMetric);
      renderGraph(currentMetric, currentBatchFilter);
    });
  }

  if(batchSelectEl){
    batchSelectEl.addEventListener('change', ()=>{
      currentBatchFilter = batchSelectEl.value || '__ALL__';
      renderGraph(currentMetric, currentBatchFilter);
    });
  }

  // slope slider wiring: re-render when changed
  const slopeSlider = document.getElementById('graphSlopeSlider');
  if(slopeSlider){
    slopeSlider.addEventListener('input', ()=>{
      renderGraph(currentMetric, currentBatchFilter);
    });
  }

  // initial render
  updateGraphTitle(currentMetric);
  renderGraph(currentMetric, currentBatchFilter);
}

 if(graphBtn) graphBtn.addEventListener('click', ()=>{
   openGraphModal();
 });

 // Log popup (opens a modal similar to graph modal showing CSV entries in a scrollable table)
 function openLogModal(){
   // rebuild fresh
   let modal = document.getElementById('logModal');
   if(modal) modal.remove();
   modal = document.createElement('div');
   modal.id = 'logModal';
   modal.className = 'graphModal';
   modal.innerHTML = `
     <div class="panel" role="dialog" aria-modal="true">
       <div style="width:100%;display:flex;justify-content:space-between;align-items:center">
         <div style="font-weight:600">Log (CSV)</div>
         <div style="display:flex;gap:8px;align-items:center">
           <button id="logDownloadBtn">Download CSV</button>
           <button id="logResetBtn">Reset CSV</button>
           <button id="logCloseBtn">Close</button>
         </div>
       </div>
       <div style="width:100%;margin-top:10px;overflow:auto;max-height:64vh;border:1px solid #eee;background:#fff;border-radius:6px;padding:8px">
         <table id="logTable" style="width:100%;border-collapse:collapse;font-family:monospace">
           <thead id="logTableHead"></thead>
           <tbody id="logTableBody"></tbody>
         </table>
       </div>
     </div>
   `;
   document.body.appendChild(modal);

   const closeBtn = document.getElementById('logCloseBtn');
   if(closeBtn) closeBtn.addEventListener('click', ()=> modal.remove());

   const downloadBtn = document.getElementById('logDownloadBtn');
   if(downloadBtn){
     downloadBtn.addEventListener('click', ()=>{
       const blob = new Blob([logEl.value], {type:'text/csv'});
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = (localStorage.getItem('lastBatchName') || 'batches') + '.csv';
       document.body.appendChild(a);
       a.click();
       a.remove();
       URL.revokeObjectURL(url);
     });
   }

   const resetBtn = document.getElementById('logResetBtn');
   if(resetBtn){
     resetBtn.addEventListener('click', ()=>{
       csvEntries.length = 0;
       csvIdCounter = 1;
       for(const k in batchAttempts) delete batchAttempts[k];
       renderCsvArea();
       // also refresh modal contents
       populateTable();
     });
   }

   // populate the table from csvEntries
   function populateTable(){
     const head = document.getElementById('logTableHead');
     const body = document.getElementById('logTableBody');
     if(!head || !body) return;
     head.innerHTML = '';
     body.innerHTML = '';
     // header row (match CSV header used in renderCsvArea)
     const headers = ['id','batch_name','batch_ind','battle_ind','commander','unit_name','starting_health','starting_count','ending_health','ending_count','won','turns'];
     const hr = document.createElement('tr');
     for(const h of headers){
       const th = document.createElement('th');
       th.textContent = h;
       th.style.borderBottom = '1px solid #eee';
       th.style.padding = '6px';
       th.style.textAlign = 'left';
       th.style.fontSize = '13px';
       hr.appendChild(th);
     }
     head.appendChild(hr);

     for(const r of csvEntries){
       const tr = document.createElement('tr');
       tr.style.borderBottom = '1px solid #fafafa';
       for(const h of headers){
         const td = document.createElement('td');
         td.style.padding = '6px';
         td.style.fontSize = '13px';
         td.style.verticalAlign = 'top';
         let v = r[h] ?? '';
         // ensure values are string-friendly
         td.textContent = String(v);
         tr.appendChild(td);
       }
       body.appendChild(tr);
     }
   }

   populateTable();
 }

 // Batch Definitions modal: allows multiple columns (batches) each defining per-type property overrides.
 const batchDefsBtn = document.querySelector('.tabButton[data-tab="batchdefs"]');

 function openBatchDefsModal(){
  // helper for escaping html in values inserted into innerHTML (defined early to avoid ReferenceError)
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

  // remove existing and rebuild fresh
  let modal = document.getElementById('batchDefsModal');
  if(modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'batchDefsModal';
  modal.className = 'graphModal';
  // collect properties to include (exclude Name and Symbol)
  const props = ['health','range','power','attacks','accuracy','dodge','armor','speed','tactic'];
  // build initial columns (if previously saved to localStorage rehydrate)
  const saved = (()=>{ try{ return JSON.parse(localStorage.getItem('batchDefs')||'null'); }catch(e){return null;} })();
  // default one batch if none saved
  const cols = saved && Array.isArray(saved) && saved.length>0 ? saved : [
    {name:'Batch A', repeat:1, overrides:{}}
  ];

  // ensure each column has overrides for each type (fill from current unitTypes) and ensure repeat exists
  for(const col of cols){
    col.repeat = Number(col.repeat) || 1;
    for(const t of unitTypes){
      col.overrides = col.overrides || {};
      if(!col.overrides[t.id]) col.overrides[t.id] = Object.assign({}, t); // copy existing fields
    }
  }

  // build HTML (added total count display)
  modal.innerHTML = `
    <div class="panel" style="max-height:88vh;overflow:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:8px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-weight:600">Batch Definitions</div>
          <div style="font-size:13px;color:#666">Total batches to play: <span id="batchDefsTotal">0</span></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="batchDefsAddCol">Add Batch</button>
          <button id="batchDefsPlayAll">Play Batches</button>
          <button id="batchDefsSaveClose">Save & Close</button>
        </div>
      </div>
      <div id="batchDefsTableWrap" style="margin-top:10px;overflow:auto;border:1px solid #eee;padding:8px;background:#fff"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const wrap = document.getElementById('batchDefsTableWrap');

  function updateTotalDisplay(){
    const total = cols.reduce((s,c)=> s + (Number(c.repeat)||0), 0);
    const el = document.getElementById('batchDefsTotal');
    if(el) el.textContent = String(total);
  }

  // Synchronize current DOM input values back into the cols model so user edits are preserved across re-renders.
  function syncColsFromDom(){
    if(!wrap) return;
    // name inputs
    Array.from(wrap.querySelectorAll('.batchNameInput')).forEach(inp=>{
      const idx = Number(inp.dataset.col);
      if(Number.isFinite(idx) && cols[idx]){
        cols[idx].name = inp.value;
      }
    });
    // repeat inputs
    Array.from(wrap.querySelectorAll('.batchRepeatInput')).forEach(inp=>{
      const idx = Number(inp.dataset.repeatCol);
      if(Number.isFinite(idx) && cols[idx]){
        cols[idx].repeat = Math.max(1, Number(inp.value) || 1);
      }
    });
    // per-type override inputs/selects
    Array.from(wrap.querySelectorAll('[data-col][data-type][data-prop]')).forEach(el=>{
      const c = Number(el.dataset.col);
      const tid = String(el.dataset.type);
      const prop = el.dataset.prop;
      if(!Number.isFinite(c) || !cols[c]) return;
      cols[c].overrides = cols[c].overrides || {};
      cols[c].overrides[tid] = cols[c].overrides[tid] || {};
      // coerce numeric props, leave tactic as string
      if(prop === 'tactic'){
        cols[c].overrides[tid][prop] = el.value;
      } else {
        const num = Number(el.value);
        cols[c].overrides[tid][prop] = Number.isFinite(num) ? num : el.value;
      }
    });
  }

  function renderTable(){
    // Before rebuilding the table, synchronize any existing DOM inputs into cols so user edits aren't lost.
    syncColsFromDom();

    wrap.innerHTML = '';
    // create table element
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    // header row: empty leading cell then one header per column with Batch Name input and Repeat input
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    htr.appendChild(document.createElement('th')); // spacer
    cols.forEach((col, idx)=>{
      const th = document.createElement('th');
      th.style.border = '1px solid #eee';
      th.style.padding = '6px';
      th.style.verticalAlign = 'top';
      // use the current model values for initial input values so they reflect saved user edits
      const nameVal = escapeHtml(col.name || '');
      const repeatVal = Number(col.repeat) || 1;
      th.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-direction:column">
        <input data-col="${idx}" class="batchNameInput" value="${nameVal}" style="padding:6px;border:1px solid #ddd;border-radius:6px;width:140px" />
        <div style="margin-top:6px;display:flex;gap:6px;align-items:center">
          <label style="font-size:12px;color:#444">Repeat
            <input data-repeat-col="${idx}" class="batchRepeatInput" type="number" min="1" value="${repeatVal}" style="width:64px;margin-left:6px;padding:6px;border:1px solid #ddd;border-radius:6px" />
          </label>
          <button data-col="${idx}" class="removeBatchBtn">Remove</button>
        </div>
      </div>`;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    // body rows: for each unit type and each property produce a descriptive row cell on the left and inputs per column
    const tbody = document.createElement('tbody');

    for(const t of unitTypes){
      // type header row
      const thRow = document.createElement('tr');
      const leftCell = document.createElement('td');
      leftCell.colSpan = 1;
      leftCell.style.padding = '6px';
      leftCell.style.border = '1px solid #eee';
      leftCell.style.background = '#fafafa';
      leftCell.style.fontWeight = '600';
      leftCell.textContent = `${t.name} (type #${t.id})`;
      thRow.appendChild(leftCell);
      // add empty cells per column
      for(let c=0;c<cols.length;c++){
        const td = document.createElement('td');
        td.style.border = '1px solid #eee';
        td.style.padding = '6px';
        td.innerHTML = '';
        thRow.appendChild(td);
      }
      tbody.appendChild(thRow);

      // property rows
      for(const p of props){
        const tr = document.createElement('tr');
        const label = document.createElement('td');
        label.style.padding = '6px';
        label.style.border = '1px solid #eee';
        label.textContent = p;
        tr.appendChild(label);
        for(let c=0;c<cols.length;c++){
          const td = document.createElement('td');
          td.style.padding = '6px';
          td.style.border = '1px solid #eee';
          // determine initial value from cols[c].overrides[t.id][p] or from current type
          const initial = (cols[c].overrides && cols[c].overrides[t.id] && cols[c].overrides[t.id][p] !== undefined)
            ? cols[c].overrides[t.id][p]
            : (t[p] !== undefined ? t[p] : '');
          // tactic should be a select
          if(p === 'tactic'){
            td.innerHTML = `<select data-col="${c}" data-type="${t.id}" data-prop="${p}" style="padding:6px;border:1px solid #ddd;border-radius:6px">
              <option value="closest"${initial==='closest'?' selected':''}>closest</option>
              <option value="damaged"${initial==='damaged'?' selected':''}>damaged</option>
            </select>`;
          } else {
            td.innerHTML = `<input data-col="${c}" data-type="${t.id}" data-prop="${p}" value="${escapeHtml(String(initial))}" style="padding:6px;border:1px solid #ddd;border-radius:6px;width:100px" />`;
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    wrap.appendChild(table);

    // wire remove buttons
    Array.from(wrap.querySelectorAll('.removeBatchBtn')).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const col = Number(btn.dataset.col);
        cols.splice(col,1);
        renderTable();
        updateTotalDisplay();
      });
    });
    // wire name inputs
    Array.from(wrap.querySelectorAll('.batchNameInput')).forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const col = Number(inp.dataset.col);
        cols[col].name = inp.value;
      });
    });
    // wire repeat inputs
    Array.from(wrap.querySelectorAll('.batchRepeatInput')).forEach(inp=>{
      inp.addEventListener('input', ()=>{
        const col = Number(inp.dataset.repeatCol);
        cols[col].repeat = Math.max(1, Number(inp.value) || 1);
        updateTotalDisplay();
      });
    });

    // update total display after rendering
    updateTotalDisplay();
  }

  // helpers for escaping html in values inserted into innerHTML
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

  renderTable();

  document.getElementById('batchDefsAddCol').addEventListener('click', ()=>{
    // copy previous column (including name, repeat, and overrides) if exists, otherwise create a default new
    let newCol;
    if(cols.length > 0){
      const prev = cols[cols.length - 1];
      // deep clone previous column so user edits are preserved only when intentionally duplicated
      newCol = { name: String(prev.name), repeat: Number(prev.repeat) || 1, overrides: {} };
      for(const tid in prev.overrides){
        // ensure we clone each property object, not reference it
        newCol.overrides[tid] = Object.assign({}, prev.overrides[tid]);
      }
    } else {
      newCol = { name: `Batch ${cols.length+1}`, repeat:1, overrides:{} };
      for(const t of unitTypes) newCol.overrides[t.id] = Object.assign({}, t);
    }
    cols.push(newCol);
    renderTable();
    updateTotalDisplay();
  });

  // Close button removed (users should Save & Close or Play Batches)
  document.getElementById('batchDefsSaveClose').addEventListener('click', ()=>{
    // persist current columns by reading inputs from the table
    const tableWrap = document.getElementById('batchDefsTableWrap');
    // rebuild saved structure
    const savedCols = [];
    for(let c=0;c<cols.length;c++){
      const colObj = { name: cols[c].name, repeat: Number(cols[c].repeat) || 1, overrides: {} };
      for(const t of unitTypes){
        colObj.overrides[t.id] = {};
        for(const p of ['health','range','power','attacks','accuracy','dodge','armor','speed','tactic']){
          const selector = tableWrap.querySelector(`[data-col="${c}"][data-type="${t.id}"][data-prop="${p}"]`);
          if(selector){
            let val = selector.value;
            // coerce numeric props to numbers
            if(p !== 'tactic'){
              const num = Number(val);
              colObj.overrides[t.id][p] = Number.isFinite(num) ? num : val;
            } else {
              colObj.overrides[t.id][p] = val;
            }
          } else {
            // fallback to original
            colObj.overrides[t.id][p] = t[p];
          }
        }
      }
      // also ensure repeat is captured from current cols array (inputs already wired to update cols)
      savedCols.push(colObj);
    }
    localStorage.setItem('batchDefs', JSON.stringify(savedCols));
    modal.remove();
  });

  // Play All: save current defs and sequentially run every batch column name in order respecting repeat counts
  document.getElementById('batchDefsPlayAll').addEventListener('click', async ()=>{
    // first persist current edits
    const tableWrap = document.getElementById('batchDefsTableWrap');
    const savedCols = [];
    for(let c=0;c<cols.length;c++){
      const colObj = { name: cols[c].name || `Batch ${c+1}`, repeat: Number(cols[c].repeat) || 1, overrides: {} };
      for(const t of unitTypes){
        colObj.overrides[t.id] = {};
        for(const p of ['health','range','power','attacks','armor','speed','tactic']){
          const selector = tableWrap.querySelector(`[data-col="${c}"][data-type="${t.id}"][data-prop="${p}"]`);
          if(selector){
            let val = selector.value;
            if(p !== 'tactic'){
              const num = Number(val);
              colObj.overrides[t.id][p] = Number.isFinite(num) ? num : val;
            } else {
              colObj.overrides[t.id][p] = val;
            }
          } else {
            colObj.overrides[t.id][p] = t[p];
          }
        }
      }
      savedCols.push(colObj);
    }
    localStorage.setItem('batchDefs', JSON.stringify(savedCols));
    modal.remove();

    // sequentially run each saved column name, repeat times
    for(const col of savedCols){
      const repeats = Math.max(1, Number(col.repeat) || 1);
      for(let r=0;r<repeats;r++){
        try{
          // performBatchRun expects the batch name string and will read batchDefs from localStorage
          // we attempt to call the existing performBatchRun function if available (defined in play batch logic)
          if(typeof performBatchRun === 'function'){
            await performBatchRun(col.name);
          } else {
            // fallback: enqueue a single attempt by mimicking basic behavior:
            // create a single attempt: build batchConfigs from current map and run sequentially
            // We'll reuse the existing runBattleUntilEnd function; below is a minimal single-attempt runner.

            // Build base unit sets from current map snapshot (use renumbered placed indices)
            const comp1Units = units.filter(u=>u.owner==='comp1').slice().sort((a,b)=> (a.placedIndex||0) - (b.placedIndex||0));
            const comp2Units = units.filter(u=>u.owner==='comp2').slice().sort((a,b)=> (a.placedIndex||0) - (b.placedIndex||0));
            const n1 = comp1Units.length, n2 = comp2Units.length;
            if(n1===0 || n2===0){
              alert('Both players need at least one unit for batch play.');
              return;
            }
            const batchConfigs = [];
            for(let bCount=1;bCount<=n2;bCount++){
              for(let aCount=1;aCount<=n1;aCount++){
                const left = comp1Units.slice(0, aCount).map(u=>({ ...u }));
                const right = comp2Units.slice(0, bCount).map(u=>({ ...u }));
                batchConfigs.push({left, right});
              }
            }

            const originalUnits = units.map(u=>({ ...u }));
            const originalNextUnitId = nextUnitId;

            // increment batch attempt once per repeat (before running all battles for this column)
            batchAttempts[col.name] = (batchAttempts[col.name] || 0) + 1;
            const attemptNum = batchAttempts[col.name];

            for(let idx=0; idx<batchConfigs.length; idx++){
              const cfg = batchConfigs[idx];
              // prepare staged battle units fresh
              units = [];
              // build type map from saved batch defs column overrides
              const batchDefsLocal = savedCols;
              const colDef = batchDefsLocal[idx % batchDefsLocal.length];
              let typeMap = {};
              if(colDef){
                for(const t of unitTypes){
                  const base = Object.assign({}, t);
                  const overrides = (colDef && colDef.overrides && colDef.overrides[t.id]) ? colDef.overrides[t.id] : {};
                  for(const k of Object.keys(overrides||{})){
                    base[k] = overrides[k];
                  }
                  typeMap[t.id] = base;
                }
              } else {
                for(const t of unitTypes) typeMap[t.id] = Object.assign({}, t);
              }

              for(const u of cfg.left){
                const clone = { ...u, id: nextUnitId++, placedIndex: u.placedIndex, owner: 'comp1' };
                clone.hp = (typeMap[clone.typeId] && typeMap[clone.typeId].health) ?? clone.hp;
                units.push(clone);
              }
              for(const u of cfg.right){
                const clone = { ...u, id: nextUnitId++, placedIndex: u.placedIndex, owner: 'comp2' };
                clone.hp = (typeMap[clone.typeId] && typeMap[clone.typeId].health) ?? clone.hp;
                units.push(clone);
              }
              renumberPlaced();
              refreshUnitsUI();
              draw();

              const result = await runBattleUntilEnd(units.map(u=>({ ...u })));
              // record CSV entries same as existing code (simplified)
              const finalUnits = result.finalUnits || [];
              const c1EndCount = finalUnits.filter(u=>u.owner==='comp1').length;
              const c2EndCount = finalUnits.filter(u=>u.owner==='comp2').length;
              const c1EndHealth = finalUnits.filter(u=>u.owner==='comp1').reduce((s,u)=>s + (u.hp||0), 0);
              const c2EndHealth = finalUnits.filter(u=>u.owner==='comp2').reduce((s,u)=>s + (u.hp||0), 0);

              // record battle results per-commander per-unit-type using new schema and system batch_ind
              recordBattleResults({
                batch_name: col.name,
                batch_ind: attemptNum,
                battle_ind: idx+1,
                configs: cfg,
                finalUnits: result.finalUnits || [],
                turns: result.turns || 0
              });

              await sleep(200);
            }

            // restore
            units = originalUnits.map(u=>({ ...u }));
            nextUnitId = originalNextUnitId;
            renumberPlaced();
            refreshUnitsUI();
            draw();
          }
        }catch(err){
          console.error('Play Batches error', err);
        }
      }
    }
    // finished playing all batches
  });

  // finished building modal
 }

 if(batchDefsBtn) batchDefsBtn.addEventListener('click', ()=> openBatchDefsModal());

 // Helper used by Play Batch: read batch definitions from localStorage (if present) and return array of columns
 function loadBatchDefs(){
   try{
     const raw = localStorage.getItem('batchDefs');
     if(!raw) return null;
     const parsed = JSON.parse(raw);
     if(!Array.isArray(parsed)) return null;
     return parsed;
   }catch(e){
     return null;
   }
 }

const WORLD_SIZE = 1000;

// small html-escaping helper used by multiple prompt builders
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// symbol palette used for type selection
const SYMBOLS = ["●","○","◆","◇","■","□","▲","△","▼","▽","▶","▷","◀","◁","★","☆","✦","✶","✷","✸","✹","✺","✻","✼","✽","✾","✿","❀","❁","❂","✚","✖","✝","✞","✟","✠","✡","☼","☾","☀","♠","♣","♥","♦","♪","♫","✈","✉","☎","⚑","⚐","☑","☒","✔","➤","➜","➔","➝","➞","→","←","↑","↓","↔","↕","↖","↗","↘","↙","✪","✩","✫","✬","✭","✮","✯","✰","✱","✲","✳","✴","✵","✶","✷","✸","✹","✺","✻","✼","✽","✾","✿","❁","❂","❃","❄"];

let unitTypes = [];
let units = []; // {id, typeId, owner: 'comp1'|'comp2', x, y, hp, selected?}
let nextTypeId = 1;
let nextUnitId = 1;
// separate placement counters for each player so order numbers are tracked per player
let placedCounterComp1 = 1;
let placedCounterComp2 = 1;
let running = false;

// Persistence: save/load state to localStorage
const STORAGE_KEY = 'ranged-sim-v1';
function saveState(){
  try{
    const state = {
      unitTypes,
      units,
      nextTypeId,
      nextUnitId,
      placedCounterComp1,
      placedCounterComp2,
      csvEntries,
      csvIdCounter,
      batchAttempts
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.warn('Save failed', e);
  }
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(s.unitTypes) unitTypes = s.unitTypes;
    if(s.units) units = s.units;
    if(Number.isFinite(s.nextTypeId)) nextTypeId = s.nextTypeId;
    if(Number.isFinite(s.nextUnitId)) nextUnitId = s.nextUnitId;
    if(Number.isFinite(s.placedCounterComp1)) placedCounterComp1 = s.placedCounterComp1;
    if(Number.isFinite(s.placedCounterComp2)) placedCounterComp2 = s.placedCounterComp2;
    if(Array.isArray(s.csvEntries)) {
      csvEntries.length = 0;
      s.csvEntries.forEach(e=>csvEntries.push(e));
    }
    if(Number.isFinite(s.csvIdCounter)) csvIdCounter = s.csvIdCounter;
    if(s.batchAttempts) {
      for(const k in batchAttempts) delete batchAttempts[k];
      Object.assign(batchAttempts, s.batchAttempts);
    }
  }catch(e){
    console.warn('Load failed', e);
  }
}

// hook to auto-save after UI-updates
function autosave(){
  // render UI first then save
  refreshTypesUI();
  refreshUnitsUI();
  renderCsvArea();
  saveState();
}

// load immediately where possible
loadState();

 // Selection & group-drag state
 let selectionRect = null; // {x0,y0,x1,y1} in world coords while drawing
 let selecting = false;
 let groupDragging = false;
 let groupDragStart = null; // {mouseWorldX, mouseWorldY, offsets: [{id,dx,dy}]}
 let selectedUnits = new Set();

 // pointer movement tracking to suppress a placement click after a drag/move
 let isPointerDown = false;
 let pointerDownX = 0;
 let pointerDownY = 0;
 let movedSinceDown = false;
 let suppressNextClick = false;

// Rendering scale to fit container (maintain canvas pixel size 1000x1000 for simulation)
function fitCanvas() {
  const wrap = document.getElementById('gridWrap');
  const maxW = wrap.clientWidth - 2;
  const maxH = wrap.clientHeight - 2;
  const scale = Math.min(maxW / WORLD_SIZE, maxH / WORLD_SIZE);
  canvas.style.width = `${WORLD_SIZE * scale}px`;
  canvas.style.height = `${WORLD_SIZE * scale}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

/* Keep console-like logging for developer messages, but the Log sidebar is now CSV in a textarea.
   We'll provide CSV recording functions for batch battles below. */
function log(msg){
  console.log(msg);
}

// Modal
createTypeBtn.addEventListener('click', ()=> modal.classList.remove('hidden'));
cancelModal.addEventListener('click', ()=> modal.classList.add('hidden'));
typeForm.addEventListener('submit', e=>{
  e.preventDefault();
  const data = new FormData(typeForm);
  const t = {
    id: nextTypeId++,
    name: (data.get('name') || 'Type') + '',
    health: Number(data.get('health')),
    range: Number(data.get('range')),
    power: Number(data.get('power')),
    attacks: Number(data.get('attacks')),
    accuracy: Math.max(0, Math.min(100, Number(data.get('accuracy') || 100))),
    dodge: Math.max(0, Math.min(100, Number(data.get('dodge') || 0))),
    armor: Number(data.get('armor')),
    speed: Number(data.get('speed')),
    tactic: data.get('tactic'),
    symbol: data.get('symbol') || '●'
  };
  unitTypes.push(t);
  modal.classList.add('hidden');
  typeForm.reset();
  refreshTypesUI();
});

 // Update UI for types
 function refreshTypesUI(){
   typesList.innerHTML = '';
   typeSelect.innerHTML = '<option value="">Select type to place</option>';
   for(const t of unitTypes){
     // container row
     const row = document.createElement('div');
     row.className = 'typeCard';
     row.style.display = 'flex';
     row.style.flexDirection = 'row';
     row.style.justifyContent = 'space-between';
     row.style.alignItems = 'center';
     row.style.gap = '8px';

     // form column now occupies full card width; add a header row inside it (replaces left title column)
     const formCol = document.createElement('div');
     formCol.style.display = 'grid';
     formCol.style.gridTemplateColumns = 'auto 1fr';
     formCol.style.alignItems = 'center';
     formCol.style.gap = '6px';
     formCol.style.minWidth = '220px';

     // header spanning full width with name and id (moved from left column)
     const header = document.createElement('div');
     header.style.gridColumn = '1 / -1';
     header.style.display = 'flex';
     header.style.justifyContent = 'space-between';
     header.style.alignItems = 'center';
     header.style.gap = '8px';
     header.innerHTML = `<strong style="font-size:14px">${t.name}</strong><div style="font-size:12px;color:#666">#${t.id}</div>`;
     formCol.appendChild(header);

     // Name
     const nameLabel = document.createElement('div');
     nameLabel.style.fontSize = '12px';
     nameLabel.style.color = '#444';
     nameLabel.textContent = 'Name';
     const nameInput = document.createElement('input');
     nameInput.type = 'text';
     nameInput.value = t.name;
     nameInput.title = 'Name (autosave)';
     nameInput.style.width = '100%';
     nameInput.addEventListener('input', (e)=>{
       t.name = e.target.value || 'Type';
       // update select option text and idCol title
       refreshTypesUI(); // simpler: rebuild UI to reflect name changes
       refreshUnitsUI();
       draw();
     });

     // Health
     const hpLabel = document.createElement('div');
     hpLabel.style.fontSize = '12px';
     hpLabel.style.color = '#444';
     hpLabel.textContent = 'HP';
     const hpInput = document.createElement('input');
     hpInput.type = 'number';
     hpInput.value = t.health;
     hpInput.min = 1;
     hpInput.style.width = '100%';
     hpInput.addEventListener('input', (e)=>{
       t.health = Math.max(1, Number(e.target.value) || 1);
       // update all existing units of this type to the new health value
       for(const u of units){
         if(u.typeId === t.id){
           u.hp = t.health;
         }
       }
       refreshUnitsUI();
       draw();
     });

     // Range
     const rangeLabel = document.createElement('div');
     rangeLabel.style.fontSize = '12px';
     rangeLabel.style.color = '#444';
     rangeLabel.textContent = 'Range';
     const rangeInput = document.createElement('input');
     rangeInput.type = 'number';
     rangeInput.value = t.range;
     rangeInput.min = 0;
     rangeInput.style.width = '100%';
     rangeInput.addEventListener('input', (e)=>{
       t.range = Math.max(0, Number(e.target.value) || 0);
       // simulation reads type data directly, but refresh UI for clarity
       refreshUnitsUI();
       draw();
     });

     // Power
     const powerLabel = document.createElement('div');
     powerLabel.style.fontSize = '12px';
     powerLabel.style.color = '#444';
     powerLabel.textContent = 'Power';
     const powerInput = document.createElement('input');
     powerInput.type = 'number';
     powerInput.value = t.power;
     powerInput.min = 0;
     powerInput.style.width = '100%';
     powerInput.addEventListener('input', (e)=>{
       t.power = Math.max(0, Number(e.target.value) || 0);
       refreshUnitsUI();
       draw();
     });

     // Attacks
     const attLabel = document.createElement('div');
     attLabel.style.fontSize = '12px';
     attLabel.style.color = '#444';
     attLabel.textContent = 'Attacks';
     const attInput = document.createElement('input');
     attInput.type = 'number';
     attInput.value = t.attacks;
     attInput.min = 1;
     attInput.style.width = '100%';
     attInput.addEventListener('input', (e)=>{
       t.attacks = Math.max(1, Number(e.target.value) || 1);
       refreshUnitsUI();
       draw();
     });

     // Accuracy
     const accLabel = document.createElement('div');
     accLabel.style.fontSize = '12px';
     accLabel.style.color = '#444';
     accLabel.textContent = 'Accuracy';
     const accInput = document.createElement('input');
     accInput.type = 'number';
     accInput.value = (t.accuracy !== undefined) ? t.accuracy : 100;
     accInput.min = 0;
     accInput.max = 100;
     accInput.style.width = '100%';
     accInput.addEventListener('input', (e)=>{
       t.accuracy = Math.max(0, Math.min(100, Number(e.target.value) || 0));
       refreshUnitsUI();
       draw();
     });

     // Dodge
     const dodgeLabel = document.createElement('div');
     dodgeLabel.style.fontSize = '12px';
     dodgeLabel.style.color = '#444';
     dodgeLabel.textContent = 'Dodge';
     const dodgeInput = document.createElement('input');
     dodgeInput.type = 'number';
     dodgeInput.value = (t.dodge !== undefined) ? t.dodge : 0;
     dodgeInput.min = 0;
     dodgeInput.max = 100;
     dodgeInput.style.width = '100%';
     dodgeInput.addEventListener('input', (e)=>{
       t.dodge = Math.max(0, Math.min(100, Number(e.target.value) || 0));
       refreshUnitsUI();
       draw();
     });

     // Armor
     const arLabel = document.createElement('div');
     arLabel.style.fontSize = '12px';
     arLabel.style.color = '#444';
     arLabel.textContent = 'Armor';
     const arInput = document.createElement('input');
     arInput.type = 'number';
     arInput.value = t.armor;
     arInput.min = 0;
     arInput.style.width = '100%';
     arInput.addEventListener('input', (e)=>{
       t.armor = Math.max(0, Number(e.target.value) || 0);
       refreshUnitsUI();
       draw();
     });

     // Speed
     const spLabel = document.createElement('div');
     spLabel.style.fontSize = '12px';
     spLabel.style.color = '#444';
     spLabel.textContent = 'Speed';
     const spInput = document.createElement('input');
     spInput.type = 'number';
     spInput.value = t.speed;
     spInput.min = 0;
     spInput.style.width = '100%';
     spInput.addEventListener('input', (e)=>{
       t.speed = Math.max(0, Number(e.target.value) || 0);
       refreshUnitsUI();
       draw();
     });

     // Symbol
     const symLabel = document.createElement('div');
     symLabel.style.fontSize = '12px';
     symLabel.style.color = '#444';
     symLabel.textContent = 'Symbol';
     const symSelect = document.createElement('select');
     for(const s of SYMBOLS){
       const o = document.createElement('option');
       o.value = s;
       o.textContent = s;
       symSelect.appendChild(o);
     }
     symSelect.value = t.symbol || '●';
     symSelect.style.width = '100%';
     symSelect.addEventListener('change', (e)=>{ t.symbol = e.target.value || '●'; refreshUnitsUI(); draw(); });

     // Tactic
     const tacLabel = document.createElement('div');
     tacLabel.style.fontSize = '12px';
     tacLabel.style.color = '#444';
     tacLabel.textContent = 'Tactic';
     const tacSelect = document.createElement('select');
     const opt1 = document.createElement('option'); opt1.value='closest'; opt1.textContent='Target Closest';
     const opt2 = document.createElement('option'); opt2.value='damaged'; opt2.textContent='Target Damaged';
     tacSelect.appendChild(opt1); tacSelect.appendChild(opt2);
     tacSelect.value = t.tactic || 'closest';
     tacSelect.style.width = '100%';
     tacSelect.addEventListener('change', (e)=>{ t.tactic = e.target.value; refreshUnitsUI(); draw(); });

     // Remove and Place buttons (spans full width)
     const emptyLabel = document.createElement('div');
     emptyLabel.textContent = '';
     const btnsWrap = document.createElement('div');
     btnsWrap.style.display = 'flex';
     btnsWrap.style.gap = '6px';
     const placeBtn = document.createElement('button');
     placeBtn.textContent = 'Place';
     placeBtn.style.padding = '6px 8px';
     placeBtn.addEventListener('click', ()=>{
       typeSelect.value = t.id;
     });
     const removeBtn = document.createElement('button');
     removeBtn.textContent = 'Remove';
     removeBtn.style.padding = '6px 8px';
     removeBtn.addEventListener('click', ()=>{
       // remove any units of this type first
       units = units.filter(u => u.typeId !== t.id);
       // renumber remaining units after removal
       renumberPlaced();
       unitTypes = unitTypes.filter(tt => tt.id !== t.id);
       log(`Removed unit type ${t.name}`);
       refreshTypesUI();
       refreshUnitsUI();
       draw();
     });

     // Duplicate button: clone this type, give new id and append an index to the name
     const dupBtn = document.createElement('button');
     dupBtn.textContent = 'Dup';
     dupBtn.title = 'Duplicate this unit type';
     dupBtn.style.padding = '6px 8px';
     dupBtn.addEventListener('click', ()=>{
       // determine base name without trailing numeric suffix to count existing duplicates
       const base = t.name.replace(/\s+\d+$/, '').trim() || t.name;
       // find existing types that start with base (case-insensitive)
       const existing = unitTypes.filter(tt => tt.name.toLowerCase().startsWith(base.toLowerCase()));
       // determine next index: find largest trailing number among matches and add 1
       let maxIdx = 1;
       for(const ex of existing){
         const m = ex.name.match(/\s+(\d+)$/);
         if(m) {
           const val = Number(m[1]);
           if(val >= maxIdx) maxIdx = val + 1;
         } else {
           // if a plain base name exists, ensure index at least 2
           maxIdx = Math.max(maxIdx, 2);
         }
       }
       const newName = `${base} ${maxIdx}`;
       const clone = { ...t, id: nextTypeId++, name: newName };
       unitTypes.push(clone);
       refreshTypesUI();
       refreshUnitsUI();
       saveState();
       log(`Duplicated type "${t.name}" -> "${newName}"`);
     });

     btnsWrap.appendChild(placeBtn);
     btnsWrap.appendChild(removeBtn);
     btnsWrap.appendChild(dupBtn);

     // Assemble form grid
     formCol.appendChild(nameLabel); formCol.appendChild(nameInput);
     formCol.appendChild(hpLabel); formCol.appendChild(hpInput);
     formCol.appendChild(rangeLabel); formCol.appendChild(rangeInput);
     formCol.appendChild(powerLabel); formCol.appendChild(powerInput);
     formCol.appendChild(attLabel); formCol.appendChild(attInput);
     formCol.appendChild(accLabel); formCol.appendChild(accInput);
     formCol.appendChild(dodgeLabel); formCol.appendChild(dodgeInput);
     formCol.appendChild(arLabel); formCol.appendChild(arInput);
     formCol.appendChild(spLabel); formCol.appendChild(spInput);
     formCol.appendChild(symLabel); formCol.appendChild(symSelect);
     formCol.appendChild(tacLabel); formCol.appendChild(tacSelect);
     formCol.appendChild(emptyLabel); formCol.appendChild(btnsWrap);

     row.appendChild(formCol);
     typesList.appendChild(row);

     // rebuild typeSelect options after building cards to ensure correct order/text
     const opt = document.createElement('option');
     opt.value = t.id;
     opt.textContent = t.name;
     typeSelect.appendChild(opt);
   }
 }

/* Canvas click to place unit + drag-and-drop support
   - click to place when not dragging and a type selected
   - mousedown on a unit starts dragging; move updates position live and refreshes inputs
   - mouseup inside canvas drops; mouseup outside deletes that unit
   - click-drag on empty canvas creates selection rect; release selects units inside
   - dragging any selected unit moves the group (transpose by mouse delta) and snapping/removal performed on drop
*/
let draggingId = null;
let dragOffset = {x:0,y:0};

canvas.addEventListener('click', (ev)=>{
  // If a drag/move just occurred suppress this click so we don't create a new unit.
  if(suppressNextClick){
    suppressNextClick = false;
    return;
  }
  if(running || draggingId || selecting) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const rawX = (ev.clientX - rect.left) * scaleX;
  const rawY = (ev.clientY - rect.top) * scaleY;
  const typeId = Number(typeSelect.value);
  if(!typeId) return;
  const owner = placePlayer.value;
  const sx = snapToGrid(clamp(rawX,0,WORLD_SIZE));
  const sy = snapToGrid(clamp(rawY,0,WORLD_SIZE));
  if(isOccupiedAt(sx, sy)) {
    log('Cannot place: cell occupied.');
    return;
  }
  addUnit(typeId, owner, sx, sy);
  refreshUnitsUI();
  draw();
});

// hit test helper
function findUnitAtClientPos(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  for(const u of [...units].reverse()){ // topmost last placed first
    const d = Math.hypot(u.x - x, u.y - y);
    if(d <= 12) return {unit: u, x, y};
  }
  return null;
}

canvas.addEventListener('mousedown', (ev)=>{
  if(running) return;
  // begin pointer-down tracking for potential drag vs click suppression
  isPointerDown = true;
  movedSinceDown = false;
  pointerDownX = ev.clientX;
  pointerDownY = ev.clientY;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (ev.clientX - rect.left) * scaleX;
  const my = (ev.clientY - rect.top) * scaleY;

  const hit = findUnitAtClientPos(ev.clientX, ev.clientY);
  if(hit){
    // if clicked unit is not selected, select only it
    if(!selectedUnits.has(hit.unit.id)){
      selectedUnits.clear();
      selectedUnits.add(hit.unit.id);
    }
    // start group drag if clicked unit is part of selection
    if(selectedUnits.has(hit.unit.id)){
      groupDragging = true;
      groupDragStart = {
        mouseWorldX: mx,
        mouseWorldY: my,
        offsets: Array.from(selectedUnits).map(id=>{
          const uu = units.find(z=>z.id===id);
          return {id, dx: uu.x - mx, dy: uu.y - my};
        })
      };
      canvas.classList.add('dragging');
    } else {
      // fallback single-unit dragging
      draggingId = hit.unit.id;
      dragOffset.x = hit.unit.x - hit.x;
      dragOffset.y = hit.unit.y - hit.y;
      canvas.classList.add('dragging');
    }
    ev.preventDefault();
    draw();
    return;
  }

  // clicked empty space -> begin selection rectangle
  selecting = true;
  selectionRect = {x0: mx, y0: my, x1: mx, y1: my};
});

window.addEventListener('mousemove', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = ev.clientX;
  const cy = ev.clientY;
  const worldX = (cx - rect.left) * scaleX;
  const worldY = (cy - rect.top) * scaleY;

  // if pointer is down and we've moved more than a small threshold, mark movedSinceDown
  if(isPointerDown && !movedSinceDown){
    const dx = ev.clientX - pointerDownX;
    const dy = ev.clientY - pointerDownY;
    if(Math.hypot(dx,dy) > 4) movedSinceDown = true;
  }

  if(selecting && selectionRect){
    selectionRect.x1 = clamp(worldX, 0, WORLD_SIZE);
    selectionRect.y1 = clamp(worldY, 0, WORLD_SIZE);
    draw();
    return;
  }

  if(groupDragging && groupDragStart){
    const dx = worldX - groupDragStart.mouseWorldX;
    const dy = worldY - groupDragStart.mouseWorldY;
    // move all selected units by delta
    for(const off of groupDragStart.offsets){
      const u = units.find(z=>z.id===off.id);
      if(!u) continue;
      u.x = clamp(off.dx + worldX, -99999, 99999);
      u.y = clamp(off.dy + worldY, -99999, 99999);
    }
    refreshUnitsUI();
    draw();
    return;
  }

  if(!groupDragging && draggingId){
    const inside = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
    const worldX2 = worldX;
    const worldY2 = worldY;
    const u = units.find(z=>z.id===draggingId);
    if(!u) return;
    u.x = clamp(worldX2 + dragOffset.x, -99999, 99999);
    u.y = clamp(worldY2 + dragOffset.y, -99999, 99999);
    refreshUnitsUI(); // update displayed inputs live
    draw();
    return;
  }
});

window.addEventListener('mouseup', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = ev.clientX;
  const cy = ev.clientY;
  const inside = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  const worldX = (cx - rect.left) * scaleX;
  const worldY = (cy - rect.top) * scaleY;

  // if we moved while pointer was down, suppress the next click to avoid accidental placement
  if(isPointerDown && movedSinceDown){
    suppressNextClick = true;
  }
  // reset pointer tracking
  isPointerDown = false;
  movedSinceDown = false;

  if(selecting && selectionRect){
    // finalize selection: units whose centers are inside rect become selected
    const xMin = Math.min(selectionRect.x0, selectionRect.x1);
    const xMax = Math.max(selectionRect.x0, selectionRect.x1);
    const yMin = Math.min(selectionRect.y0, selectionRect.y1);
    const yMax = Math.max(selectionRect.y0, selectionRect.y1);
    selectedUnits.clear();
    for(const u of units){
      if(u.x >= xMin && u.x <= xMax && u.y >= yMin && u.y <= yMax){
        selectedUnits.add(u.id);
      }
    }
    selecting = false;
    selectionRect = null;
    draw();
    return;
  }

  if(groupDragging && groupDragStart){
    // on drop: snap each selected unit to nearest unoccupied subgrid (search) or remove if out of bounds
    const toRemove = new Set();
    for(const off of groupDragStart.offsets){
      const u = units.find(z=>z.id===off.id);
      if(!u) continue;
      // check bounds
      if(u.x < 0 || u.y < 0 || u.x > WORLD_SIZE || u.y > WORLD_SIZE){
        toRemove.add(u.id);
        continue;
      }
      // find nearest free snapped cell excluding the moving unit
      const snapped = findNearestUnoccupied(u.x, u.y, u.id);
      if(snapped){
        u.x = snapped.x; u.y = snapped.y;
      } else {
        u.x = snapToGrid(clamp(u.x, 0, WORLD_SIZE));
        u.y = snapToGrid(clamp(u.y, 0, WORLD_SIZE));
      }
    }
    if(toRemove.size){
      units = units.filter(u=>!toRemove.has(u.id));
      // renumber after removals
      renumberPlaced();
      for(const rid of toRemove) selectedUnits.delete(rid);
      log(`Removed ${toRemove.size} unit(s) dragged out of bounds`);
    }
    groupDragging = false;
    groupDragStart = null;
    canvas.classList.remove('dragging');
    refreshUnitsUI();
    draw();
    return;
  }

  if(draggingId){
    const u = units.find(z=>z.id===draggingId);
    if(u){
      if(!inside){
        // delete if dragged off canvas
        units = units.filter(z=>z.id!==draggingId);
        // renumber remaining units after deletion
        renumberPlaced();
        selectedUnits.delete(draggingId);
        log(`Removed unit #${draggingId} (dragged off map)`);
      } else {
        // clamp to world bounds then snap to nearest unoccupied subgrid cell
        u.x = clamp(u.x, 0, WORLD_SIZE);
        u.y = clamp(u.y, 0, WORLD_SIZE);

        // find nearest available snapped cell (search outward)
        const snapped = findNearestUnoccupied(u.x, u.y, draggingId);
        if(snapped){
          u.x = snapped.x;
          u.y = snapped.y;
        } else {
          // fallback to simply snapped position (may overlap if none found)
          u.x = snapToGrid(u.x);
          u.y = snapToGrid(u.y);
        }
      }
    }
    draggingId = null;
    canvas.classList.remove('dragging');
    refreshUnitsUI();
    draw();
  }
});

function addUnit(typeId, owner, x, y){
  const t = unitTypes.find(tt=>tt.id===typeId);
  if(!t) return;
  // snap coords to grid
  const sx = snapToGrid(clamp(x, 0, WORLD_SIZE));
  const sy = snapToGrid(clamp(y, 0, WORLD_SIZE));
  if(isOccupiedAt(sx, sy)){
    log('Cannot place unit: target cell occupied.');
    return;
  }
  const u = {
    id: nextUnitId++,
    typeId: t.id,
    owner,
    x: sx, y: sy,
    hp: t.health,
    // placedIndex will be computed by renumberPlaced() to reflect age ordering per owner
  };
  units.push(u);
  // Recompute per-owner placement numbers based on unit age (id ascending)
  renumberPlaced();
  log(`Placed ${t.name} for ${owner} (#${u.id})`);
  saveState();
}

function refreshUnitsUI(){
  // display units in an import-friendly block per owner:
  // OwnerHeader
  // UnitTypeName
  // x,y x,y x,y
  unitsList.innerHTML = '';

  const makeSectionHeader = (ownerLabel, ownerKey) => {
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginTop = '8px';

    const title = document.createElement('div');
    title.style.fontSize = '13px';
    title.style.fontWeight = '600';
    title.textContent = ownerLabel;

    const btn = document.createElement('button');
    btn.className = 'copyUnitsBtn';
    btn.textContent = 'Copy';
    btn.title = `Copy ${ownerLabel} units to clipboard`;
    btn.style.padding = '6px 8px';
    btn.style.fontSize = '12px';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #ddd';
    btn.style.background = '#fff';
    btn.style.cursor = 'pointer';
    // data-owner used to find corresponding units block (use explicit ownerKey so it matches comp1/comp2 wrap IDs)
    btn.dataset.owner = ownerKey;

    // click handler copies the corresponding units text block
    btn.addEventListener('click', async (e) => {
      const ownerKeyLocal = btn.dataset.owner; // "comp1" or "comp2"
      // find the wrap element we create below (ids: comp1Wrap, comp2Wrap)
      const wrap = document.getElementById(ownerKeyLocal + 'Wrap');
      if(!wrap) {
        // fallback: try searching within unitsList for the next .unitRow entries after the header
        let text = '';
        try{
          // collect all .unitRow elements that follow this header in DOM
          let node = btn.parentElement;
          while(node && node !== document.body){
            if(node.classList && node.classList.contains('unitRow')) break;
            node = node.nextElementSibling;
          }
        }catch(e){}
        return;
      }
      // Build text including type name headings and coordinate lines
      let out = '';
      for(const child of wrap.children){
        // type titles have fontWeight 600 and coords have class unitRow
        if(child.classList && child.classList.contains('unitRow')){
          out += child.textContent + '\n';
        } else {
          // treat as title line if not unitRow and has textContent
          const txt = (child.textContent || '').trim();
          // skip empty or redundant lines introduced by layout spacing
          if(txt && !/^\(no units\)$/.test(txt)){
            // detect if this child looks like a title (e.g., includes type name)
            if(child.style && (child.style.fontWeight === '600' || child.style.fontWeight === 600 || child.style.fontWeight === 'bold')){
              out += txt + '\n';
            } else {
              // fallback: include if there is a monospace coords child inside
              const coords = child.querySelector && child.querySelector('.unitRow');
              if(coords) out += coords.textContent + '\n';
            }
          }
        }
      }
      // if the wrap contained heading + coords pairs, the loop above may interleave; ensure trimming
      out = out.trim();
      if(!out){
        // nothing to copy
        try{
          btn.classList.add('copyFlash');
          setTimeout(()=> btn.classList.remove('copyFlash'), 350);
        }catch(e){}
        return;
      }
      try{
        await navigator.clipboard.writeText(out);
        // flash feedback
        btn.classList.add('copyFlash');
        setTimeout(()=> btn.classList.remove('copyFlash'), 350);
      }catch(err){
        console.error('Copy failed', err);
        // flash to indicate attempt
        btn.classList.add('copyFlash');
        setTimeout(()=> btn.classList.remove('copyFlash'), 350);
      }
    });

    header.appendChild(title);
    header.appendChild(btn);
    return header;
  };

  const comp1Header = makeSectionHeader('Blue 1', 'comp1');
  const comp2Header = makeSectionHeader('Red 2', 'comp2');
  unitsList.appendChild(comp1Header);

  // group units by owner then by type preserving placedIndex order
  const byOwner = { comp1: [], comp2: [] };
  for(const u of [...units].sort((a,b)=> (a.placedIndex||0) - (b.placedIndex||0))){
    byOwner[u.owner === 'comp1' ? 'comp1' : 'comp2'].push(u);
  }

  // helper to append a type block: title line then coords line
  const appendTypeBlock = (parent, typeName, coordsArr) => {
    // unit type heading
    const title = document.createElement('div');
    title.style.fontSize = '13px';
    title.style.fontWeight = '600';
    title.style.marginTop = '6px';
    title.textContent = typeName;
    parent.appendChild(title);

    // coords row (space-separated "x,y")
    const coordsLine = document.createElement('div');
    coordsLine.className = 'unitRow';
    coordsLine.style.whiteSpace = 'pre-wrap';
    coordsLine.style.fontFamily = 'monospace';
    coordsLine.textContent = coordsArr.map(([x,y])=>`${Math.round(x)},${Math.round(y)}`).join(' ');
    parent.appendChild(coordsLine);
  };

  // build comp1 blocks
  const comp1Wrap = document.createElement('div');
  comp1Wrap.id = 'comp1Wrap';
  comp1Wrap.style.display = 'flex';
  comp1Wrap.style.flexDirection = 'column';
  comp1Wrap.style.gap = '4px';
  comp1Wrap.style.marginTop = '6px';

  const comp1Units = byOwner.comp1;
  if(comp1Units.length === 0){
    const none = document.createElement('div');
    none.className = 'unitRow';
    none.style.color = '#666';
    none.textContent = '(no units)';
    comp1Wrap.appendChild(none);
  } else {
    // group by typeId preserving order of first appearance
    const map = new Map();
    for(const u of comp1Units){
      const t = unitTypes.find(tt=>tt.id===u.typeId);
      const name = t ? t.name : `Type${u.typeId}`;
      if(!map.has(u.typeId)) map.set(u.typeId, {name, coords: []});
      map.get(u.typeId).coords.push([u.x, u.y]);
    }
    for(const [typeId, obj] of map){
      appendTypeBlock(comp1Wrap, obj.name, obj.coords);
    }
  }
  unitsList.appendChild(comp1Wrap);

  // spacer between owners
  const spacer = document.createElement('div');
  spacer.style.height = '8px';
  unitsList.appendChild(spacer);

  // comp2
  unitsList.appendChild(comp2Header);
  const comp2Wrap = document.createElement('div');
  comp2Wrap.id = 'comp2Wrap';
  comp2Wrap.style.display = 'flex';
  comp2Wrap.style.flexDirection = 'column';
  comp2Wrap.style.gap = '4px';
  comp2Wrap.style.marginTop = '6px';

  const comp2Units = byOwner.comp2;
  if(comp2Units.length === 0){
    const none = document.createElement('div');
    none.className = 'unitRow';
    none.style.color = '#666';
    none.textContent = '(no units)';
    comp2Wrap.appendChild(none);
  } else {
    const map2 = new Map();
    for(const u of comp2Units){
      const t = unitTypes.find(tt=>tt.id===u.typeId);
      const name = t ? t.name : `Type${u.typeId}`;
      if(!map2.has(u.typeId)) map2.set(u.typeId, {name, coords: []});
      map2.get(u.typeId).coords.push([u.x, u.y]);
    }
    for(const [typeId, obj] of map2){
      appendTypeBlock(comp2Wrap, obj.name, obj.coords);
    }
  }
  unitsList.appendChild(comp2Wrap);

  // Also refresh import dropdowns so they reflect current unitTypes
  const comp1Sel = document.getElementById('comp1TypeSelectImport');
  const comp2Sel = document.getElementById('comp2TypeSelectImport');
  const buildOpts = (sel) => {
    if(!sel) return;
    sel.innerHTML = '<option value="">(Select type)</option>';
    for(const t of unitTypes){
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.name;
      sel.appendChild(o);
    }
  };
  buildOpts(comp1Sel);
  buildOpts(comp2Sel);
}

/* Selected-unit controls: move selected units by 20 world units, or flip axes (subtract from 1000).
   Buttons are: moveLeftBtn, moveRightBtn, moveUpBtn, moveDownBtn, flipXSelectedBtn, flipYSelectedBtn */
const moveLeftBtn = document.getElementById('moveLeftBtn');
const moveRightBtn = document.getElementById('moveRightBtn');
const moveUpBtn = document.getElementById('moveUpBtn');
const moveDownBtn = document.getElementById('moveDownBtn');
const flipXSelectedBtn = document.getElementById('flipXSelectedBtn');
const flipYSelectedBtn = document.getElementById('flipYSelectedBtn');
const centerYBtn = document.getElementById('centerYBtn');
const centerXBtn = document.getElementById('centerXBtn');

const MOVE_STEP = 20;

function moveSelected(dx, dy){
  if(selectedUnits.size === 0) return;
  const toRemove = new Set();
  for(const id of Array.from(selectedUnits)){
    const u = units.find(z=>z.id===id);
    if(!u) continue;
    u.x = clamp(u.x + dx, 0, WORLD_SIZE);
    u.y = clamp(u.y + dy, 0, WORLD_SIZE);
    // snap to nearest unoccupied snapped cell when possible
    const snapped = findNearestUnoccupied(u.x, u.y, u.id);
    if(snapped){
      u.x = snapped.x; u.y = snapped.y;
    } else {
      u.x = snapToGrid(u.x); u.y = snapToGrid(u.y);
    }
    // if unit somehow outside world remove
    if(u.x < 0 || u.y < 0 || u.x > WORLD_SIZE || u.y > WORLD_SIZE){
      toRemove.add(u.id);
    }
  }
  if(toRemove.size){
    units = units.filter(u=>!toRemove.has(u.id));
    for(const rid of toRemove) selectedUnits.delete(rid);
  }
  renumberPlaced();
  refreshUnitsUI();
  draw();
}

function flipSelectedX(){
  if(selectedUnits.size === 0) return;
  for(const id of Array.from(selectedUnits)){
    const u = units.find(z=>z.id===id);
    if(!u) continue;
    u.x = Math.max(0, Math.min(WORLD_SIZE, 1000 - u.x));
    const snapped = findNearestUnoccupied(u.x, u.y, u.id);
    if(snapped){ u.x = snapped.x; u.y = snapped.y; } else { u.x = snapToGrid(u.x); }
  }
  renumberPlaced();
  refreshUnitsUI();
  draw();
}

function flipSelectedY(){
  if(selectedUnits.size === 0) return;
  for(const id of Array.from(selectedUnits)){
    const u = units.find(z=>z.id===id);
    if(!u) continue;
    u.y = Math.max(0, Math.min(WORLD_SIZE, 1000 - u.y));
    const snapped = findNearestUnoccupied(u.x, u.y, u.id);
    if(snapped){ u.x = snapped.x; u.y = snapped.y; } else { u.y = snapToGrid(u.y); }
  }
  renumberPlaced();
  refreshUnitsUI();
  draw();
}

// center selected group on world Y (set group's centroid Y to midpoint) 
function centerSelectedY(){
  if(selectedUnits.size === 0) return;
  const ids = Array.from(selectedUnits);
  let sumY = 0, count = 0;
  for(const id of ids){
    const u = units.find(z=>z.id===id);
    if(!u) continue;
    sumY += u.y; count++;
  }
  if(count === 0) return;
  const centroidY = sumY / count;
  const targetY = WORLD_SIZE / 2;
  const dy = targetY - centroidY;
  // move each by dy and snap
  const toRemove = new Set();
  for(const id of ids){
    const u = units.find(z=>z.id===id);
    if(!u) continue;
    u.y = clamp(u.y + dy, 0, WORLD_SIZE);
    const snapped = findNearestUnoccupied(u.x, u.y, u.id);
    if(snapped){ u.x = snapped.x; u.y = snapped.y; } else { u.y = snapToGrid(u.y); }
    if(u.x < 0 || u.y < 0 || u.x > WORLD_SIZE || u.y > WORLD_SIZE) toRemove.add(u.id);
  }
  if(toRemove.size){
    units = units.filter(u=>!toRemove.has(u.id));
    for(const rid of toRemove) selectedUnits.delete(rid);
  }
  renumberPlaced();
  refreshUnitsUI();
  draw();
}

// center selected group on world X (set group's centroid X to midpoint)
function centerSelectedX(){
  if(selectedUnits.size === 0) return;
  const ids = Array.from(selectedUnits);
  let sumX = 0, count = 0;
  for(const id of ids){
    const u = units.find(z=>z.id===id);
    if(!u) continue;
    sumX += u.x; count++;
  }
  if(count === 0) return;
  const centroidX = sumX / count;
  const targetX = WORLD_SIZE / 2;
  const dx = targetX - centroidX;
  // move each by dx and snap
  const toRemove = new Set();
  for(const id of ids){
    const u = units.find(z=>z.id===id);
    if(!u) continue;
    u.x = clamp(u.x + dx, 0, WORLD_SIZE);
    const snapped = findNearestUnoccupied(u.x, u.y, u.id);
    if(snapped){ u.x = snapped.x; u.y = snapped.y; } else { u.x = snapToGrid(u.x); }
    if(u.x < 0 || u.y < 0 || u.x > WORLD_SIZE || u.y > WORLD_SIZE) toRemove.add(u.id);
  }
  if(toRemove.size){
    units = units.filter(u=>!toRemove.has(u.id));
    for(const rid of toRemove) selectedUnits.delete(rid);
  }
  renumberPlaced();
  refreshUnitsUI();
  draw();
}

if(moveLeftBtn) moveLeftBtn.addEventListener('click', ()=> moveSelected(-MOVE_STEP, 0));
if(moveRightBtn) moveRightBtn.addEventListener('click', ()=> moveSelected(MOVE_STEP, 0));
if(moveUpBtn) moveUpBtn.addEventListener('click', ()=> moveSelected(0, -MOVE_STEP));
if(moveDownBtn) moveDownBtn.addEventListener('click', ()=> moveSelected(0, MOVE_STEP));
if(flipXSelectedBtn) flipXSelectedBtn.addEventListener('click', flipSelectedX);
if(flipYSelectedBtn) flipYSelectedBtn.addEventListener('click', flipSelectedY);
if(centerYBtn) centerYBtn.addEventListener('click', centerSelectedY);
if(centerXBtn) centerXBtn.addEventListener('click', centerSelectedX);

// parse coordinate inputs with flexible formats and optional type name header
function parseCoordsInput(text){
  if(!text) return {typeName: null, coords: []};
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  let typeName = null;
  let coordLines = lines;
  // if first non-empty line is a known type name or a non-coordinate line, treat as type header
  const first = lines[0];
  if(first && !/[\d\(\)-, ]+$/.test(first)){
    typeName = first.trim();
    coordLines = lines.slice(1);
  } else {
    // also support a single-line where header is a type name alone followed by coords on next lines; handled above
    // If the first line contains letters and digits mixed (like "Archer"), we accept as name.
    if(first && /[A-Za-z]/.test(first) && !/^[\d,().\-\s]+$/.test(first)){
      typeName = first.trim();
      coordLines = lines.slice(1);
    }
  }

  const coords = [];
  const join = coordLines.join(' ');
  // normalize separators: parentheses, dashes between numbers, commas, whitespace
  // match patterns like: 1,2 2,3 (1-2) (2-5) 4,5
  const tokenRegex = /(?:\(\s*([-\d.]+)\s*[\-,]\s*([-\d.]+)\s*\))|([-\d.]+)\s*[,]\s*([-\d.]+)/g;
  let m;
  while((m = tokenRegex.exec(join)) !== null){
    if(m[1] !== undefined && m[2] !== undefined){
      coords.push([Number(m[1]), Number(m[2])]);
    } else if(m[3] !== undefined && m[4] !== undefined){
      coords.push([Number(m[3]), Number(m[4])]);
    }
  }
  // also try to parse space-separated pairs like "1 2 3 4" interpreted as (1,2) (3,4)
  if(coords.length === 0){
    const nums = join.replace(/[()]/g,'').split(/[\s,]+/).map(s=>s.trim()).filter(Boolean);
    if(nums.length >= 2){
      for(let i=0;i+1<nums.length;i+=2){
        const a = Number(nums[i]), b = Number(nums[i+1]);
        if(!Number.isNaN(a) && !Number.isNaN(b)) coords.push([a,b]);
      }
    }
  }

  return {typeName, coords};
}

// helper to resolve type by dropdown id or by name; returns typeId or null
function resolveTypeIdFromInput(selectedId, overrideName){
  if(overrideName){
    const byName = unitTypes.find(tt => tt.name.toLowerCase() === overrideName.toLowerCase());
    if(byName) return byName.id;
    // try to find by partial match
    const partial = unitTypes.find(tt => tt.name.toLowerCase().includes(overrideName.toLowerCase()));
    if(partial) return partial.id;
    return null;
  }
  if(selectedId){
    return Number(selectedId) || null;
  }
  return null;
}

// create units from parsed coords for a given owner; returns count added
function createUnitsFromCoords(owner, parsed, selectedTypeId, mode /*'add'|'import'*/){
  const overrideName = parsed.typeName;
  const coords = parsed.coords || [];
  // determine type id
  let typeId = resolveTypeIdFromInput(selectedTypeId, overrideName);
  if(!typeId){
    // if still not resolved but there's at least one unitType, use the first as fallback
    if(unitTypes.length > 0) typeId = unitTypes[0].id;
    else return 0;
  }
  if(mode === 'import'){
    // remove existing units for this owner
    units = units.filter(u => u.owner !== owner);
  }
  let added = 0;
  for(const [xRaw,yRaw] of coords){
    const x = snapToGrid(clamp(Number(xRaw), 0, WORLD_SIZE));
    const y = snapToGrid(clamp(Number(yRaw), 0, WORLD_SIZE));
    if(isOccupiedAt(x,y)) continue;
    addUnit(typeId, owner, x,y);
    added++;
  }
  // renumber placement indices after changes
  renumberPlaced();
  refreshUnitsUI();
  draw();
  return added;
}

 // wire import/add/flip buttons
 const comp1AddBtn = document.getElementById('comp1AddBtn');
 const comp1ImportBtn = document.getElementById('comp1ImportBtn');
 const comp1FlipXBtn = document.getElementById('comp1FlipXBtn');
 const comp1FlipYBtn = document.getElementById('comp1FlipYBtn');
 const comp2AddBtn = document.getElementById('comp2AddBtn');
 const comp2ImportBtn = document.getElementById('comp2ImportBtn');
 const comp2FlipXBtn = document.getElementById('comp2FlipXBtn');
 const comp2FlipYBtn = document.getElementById('comp2FlipYBtn');

 // helper to flip parsed coords and return text with optional header preserved
 function flipCoordsText(text, flipX = false, flipY = false){
   const parsed = parseCoordsInput(text);
   const coords = parsed.coords || [];
   const typeName = parsed.typeName;
   const flipped = coords.map(([x,y])=>{
     const nx = flipX ? (Math.max(0, Math.min(WORLD_SIZE, 1000 - Number(x))) ) : Number(x);
     const ny = flipY ? (Math.max(0, Math.min(WORLD_SIZE, 1000 - Number(y))) ) : Number(y);
     // snap values to integers for readability
     return [Math.round(nx), Math.round(ny)];
   });
   // reconstruct: put optional header back on first line if present, coords as space-separated "x,y"
   const coordStr = flipped.map(([a,b])=>`${a},${b}`).join(' ');
   if(typeName){
     return `${typeName}\n${coordStr}`;
   }
   return coordStr;
 }

 if(comp1AddBtn){
   comp1AddBtn.addEventListener('click', ()=>{
     const txt = document.getElementById('comp1Coords')?.value || '';
     const sel = document.getElementById('comp1TypeSelectImport')?.value || '';
     const parsed = parseCoordsInput(txt);
     const count = createUnitsFromCoords('comp1', parsed, sel, 'add');
     log(`Comp1 add: ${count} unit(s)`);
   });
 }
 if(comp1ImportBtn){
   comp1ImportBtn.addEventListener('click', ()=>{
     const txt = document.getElementById('comp1Coords')?.value || '';
     const sel = document.getElementById('comp1TypeSelectImport')?.value || '';
     const parsed = parseCoordsInput(txt);
     const count = createUnitsFromCoords('comp1', parsed, sel, 'import');
     log(`Comp1 import: ${count} unit(s)`);
   });
 }
 if(comp1FlipXBtn){
   comp1FlipXBtn.addEventListener('click', ()=>{
     const ta = document.getElementById('comp1Coords');
     if(!ta) return;
     ta.value = flipCoordsText(ta.value || '', false, true);
   });
 }
 if(comp1FlipYBtn){
   comp1FlipYBtn.addEventListener('click', ()=>{
     const ta = document.getElementById('comp1Coords');
     if(!ta) return;
     ta.value = flipCoordsText(ta.value || '', true, false);
   });
 }

 if(comp2AddBtn){
   comp2AddBtn.addEventListener('click', ()=>{
     const txt = document.getElementById('comp2Coords')?.value || '';
     const sel = document.getElementById('comp2TypeSelectImport')?.value || '';
     const parsed = parseCoordsInput(txt);
     const count = createUnitsFromCoords('comp2', parsed, sel, 'add');
     log(`Comp2 add: ${count} unit(s)`);
   });
 }
 if(comp2ImportBtn){
   comp2ImportBtn.addEventListener('click', ()=>{
     const txt = document.getElementById('comp2Coords')?.value || '';
     const sel = document.getElementById('comp2TypeSelectImport')?.value || '';
     const parsed = parseCoordsInput(txt);
     const count = createUnitsFromCoords('comp2', parsed, sel, 'import');
     log(`Comp2 import: ${count} unit(s)`);
   });
 }
 if(comp2FlipXBtn){
   comp2FlipXBtn.addEventListener('click', ()=>{
     const ta = document.getElementById('comp2Coords');
     if(!ta) return;
     ta.value = flipCoordsText(ta.value || '', false, true);
   });
 }
 if(comp2FlipYBtn){
   comp2FlipYBtn.addEventListener('click', ()=>{
     const ta = document.getElementById('comp2Coords');
     if(!ta) return;
     ta.value = flipCoordsText(ta.value || '', true, false);
   });
 }

/* Clear - clears current units and update the saved pre-play snapshot so Reset restores to this cleared state. */
clearBtn.addEventListener('click', ()=>{
  if(running) return;
  units = [];
  nextUnitId = 1;
  // reset placement counters when clearing map
  placedCounterComp1 = 1;
  placedCounterComp2 = 1;
  selectedUnits.clear();
  refreshUnitsUI();
  draw();
  // update the Reset snapshot so it reflects the cleared map state
  updateResetSnapshot();
  log('Cleared units');
});

// Reset button: restore pre-play snapshot if available, otherwise clear
resetBtn.addEventListener('click', ()=>{
  if(running) return;
  if(prePlaySnapshot){
    // restore saved state
    units = prePlaySnapshot.units.map(u=>({ ...u }));
    nextUnitId = prePlaySnapshot.nextUnitId;
    nextTypeId = prePlaySnapshot.nextTypeId;
    placedCounterComp1 = prePlaySnapshot.placedCounterComp1;
    placedCounterComp2 = prePlaySnapshot.placedCounterComp2;
    prePlaySnapshot = null; // consume snapshot after restore
    refreshUnitsUI();
    draw();
    log('Restored map to pre-play snapshot');
  } else {
    // no snapshot: behave like clear
    units = [];
    nextUnitId = 1;
    placedCounterComp1 = 1;
    placedCounterComp2 = 1;
    selectedUnits.clear();
    refreshUnitsUI();
    draw();
    log('Cleared units (no pre-play snapshot)');
  }
});

let prePlaySnapshot = null;

 // Play simulation
 playBtn.addEventListener('click', ()=>{
   if(running) {
     running = false;
     playBtn.textContent = 'Play';
     return;
   }
   if(units.filter(u=>u.owner==='comp1').length===0 || units.filter(u=>u.owner==='comp2').length===0){
     alert('Both players need at least one unit.');
     return;
   }

   // If a pre-play snapshot exists, restore it before starting (consume snapshot)
   if(prePlaySnapshot){
     units = prePlaySnapshot.units.map(u=>({ ...u }));
     nextUnitId = prePlaySnapshot.nextUnitId;
     nextTypeId = prePlaySnapshot.nextTypeId;
     placedCounterComp1 = prePlaySnapshot.placedCounterComp1;
     placedCounterComp2 = prePlaySnapshot.placedCounterComp2;
     prePlaySnapshot = null;
     refreshUnitsUI();
     draw();
     log('Auto-restored pre-play snapshot before Play');
   }

   // Save a fresh pre-play snapshot only if none exists (so Reset will restore to this point)
   if(!prePlaySnapshot){
     prePlaySnapshot = {
       units: units.map(u=>({ ...u })),
       nextUnitId,
       nextTypeId,
       placedCounterComp1,
       placedCounterComp2
     };
   }

   running = true;
   playBtn.textContent = 'Stop';
   simulate();
 });

function simulate(){
  if(!running) return;
  const alive1 = units.filter(u=>u.owner==='comp1');
  const alive2 = units.filter(u=>u.owner==='comp2');
  if(alive1.length===0 || alive2.length===0){
    running = false;
    playBtn.textContent = 'Play';
    log(alive1.length===0 ? 'Blue 1 eliminated. Red 2 wins.' : 'Red 2 eliminated. Blue 1 wins.');
    return;
  }

  // Each unit takes a turn in arbitrary order (copy array)
  const turnOrder = [...units];
  // Shuffle for fairness a little
  shuffleArray(turnOrder);

  // collect ids that die during this round and defer removal until end of round
  const deadThisRound = new Set();

  for(const u of turnOrder){
    // unit might have died earlier this round
    const active = units.find(z=>z.id===u.id);
    if(!active) continue;

    const t = unitTypes.find(tt=>tt.id===active.typeId);
    // treat units marked deadThisRound as already dead for targeting
    const enemies = units.filter(v=>v.owner !== active.owner && !deadThisRound.has(v.id));
    if(enemies.length===0) continue;

    // choose target based on tactic
    let target = null;
    if(t.tactic === 'closest'){
      target = enemies.reduce((best,e)=>{
        const d = dist(active,e);
        return (!best || d < best.d ? {e,d} : best);
      }, null)?.e;
    } else {
      // damaged = lowest hp fraction
      target = enemies.reduce((best,e)=>{
        const et = unitTypes.find(tt=>tt.id===e.typeId);
        const frac = e.hp / et.health;
        return (!best || frac < best.f ? {e,f:frac} : best);
      }, null)?.e;
    }
    if(!target) continue;

    const distance = dist(active,target);
    if(distance > t.range){
      // move towards target up to speed
      const mx = Math.min(t.speed, distance);
      const dx = (target.x - active.x)/distance || 0;
      const dy = (target.y - active.y)/distance || 0;
      active.x = clamp(active.x + dx * mx, 0, WORLD_SIZE);
      active.y = clamp(active.y + dy * mx, 0, WORLD_SIZE);
      // no attack this turn if moved
    } else {
      // in range: attack up to 'attacks' times
      for(let a=0;a<t.attacks;a++){
        // if target died earlier in this loop, choose new target as per tactic
        const currTarget = units.find(z=>z.id===target.id && !deadThisRound.has(z.id));
        if(!currTarget) break;
        const defType = unitTypes.find(tt=>tt.id===currTarget.typeId) || {armor:0, dodge:0};
        // determine hit by accuracy then dodge
        const accRoll = Math.random() * 100;
        const hitByAcc = accRoll <= (t.accuracy !== undefined ? t.accuracy : 100);
        const dodgeRoll = Math.random() * 100;
        const dodged = dodgeRoll < (defType.dodge !== undefined ? defType.dodge : 0);
        if(hitByAcc && !dodged){
          const damage = Math.max(0, t.power - (defType.armor || 0));
          currTarget.hp -= damage;
          log(`${active.owner}#${active.id} (${t.name}) hits ${currTarget.owner}#${currTarget.id} for ${damage}`);
          if(currTarget.hp <= 0){
            deadThisRound.add(currTarget.id);
            log(`${currTarget.owner}#${currTarget.id} killed`);
            break;
          }
        } else {
          // missed or dodged
          if(!hitByAcc){
            log(`${active.owner}#${active.id} (${t.name}) missed ${currTarget.owner}#${currTarget.id} (accuracy roll ${accRoll.toFixed(1)} > ${t.accuracy || 100})`);
          } else {
            log(`${currTarget.owner}#${currTarget.id} dodged attack (dodge roll ${dodgeRoll.toFixed(1)} < ${defType.dodge || 0})`);
          }
        }
      }
    }
  }

  // Remove all units that died this round at once
  if(deadThisRound.size > 0){
    units = units.filter(u => !deadThisRound.has(u.id));
    renumberPlaced();
  }

  refreshUnitsUI();
  draw();
  // schedule next turn using configured delayMs (0 = run as fast as possible with minimal timeout)
  setTimeout(()=> simulate(), Math.max(0, Number(delayMs) || 0));
}

 // small sleep helper used for batch-running
 function sleep(ms){ return new Promise(res => setTimeout(res, Math.max(0, ms || 0))); }

 // CSV recording state for batch battles
 const csvEntries = []; // array of objects, will be rendered as CSV lines
 let csvIdCounter = 1;
 const batchAttempts = {}; // map batchName -> attempt count

function renderCsvArea(){
  if(!logEl) return;
  // New CSV header using the requested field names
  const header = [
    'id','batch_name','batch_ind','battle_ind','commander','unit_name',
    'starting_health','starting_count','ending_health','ending_count','won','turns'
  ].join(',');
  const rows = csvEntries.map(r => [
    r.id,
    escapeCsv(r.batch_name),
    r.batch_ind,
    r.battle_ind,
    r.commander,
    escapeCsv(r.unit_name || ''),
    r.starting_health,
    r.starting_count,
    r.ending_health,
    r.ending_count,
    r.won,
    r.turns
  ].join(','));
  logEl.value = [header, ...rows].join('\n');
}

 function escapeCsv(v){
   if(v == null) return '';
   const s = String(v);
   if(s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`;
   return s;
 }

function addCsvEntry(obj){
  // maintain auto-incrementing id and use new field names; accept either old or new keys
  const row = Object.assign({}, obj);
  // allow callers to pass old-style keys - prefer explicit new keys when present
  const normalized = {
    id: csvIdCounter++,
    batch_name: row.BatchName ?? row.batch_name ?? '',
    batch_ind: row.BatchAttempt ?? row.batch_ind ?? 0,
    battle_ind: row.BatchBattle ?? row.battle_ind ?? 0,
    commander: row.commander ?? row.Commander ?? 0,
    unit_name: row.UnitName ?? row.unit_name ?? '',
    starting_health: row.C1StartHealth ?? row.starting_health ?? row.startingHealth ?? 0,
    starting_count: row.C1StartCount ?? row.starting_count ?? row.startingCount ?? 0,
    ending_health: row.C1EndHealth ?? row.ending_health ?? row.endingHealth ?? 0,
    ending_count: row.C1EndCount ?? row.ending_count ?? row.endingCount ?? 0,
    damage: row.damage ?? 0,
    won: row.Won ?? row.won ?? row.win ?? 0,
    turns: row.Turns ?? row.turns ?? 0
  };
  csvEntries.push(normalized);
  renderCsvArea();
}

 // download and reset handlers
 const downloadCsvBtn = document.getElementById('downloadCsvBtn');
 const resetCsvBtn = document.getElementById('resetCsvBtn');
 if(downloadCsvBtn){
   downloadCsvBtn.addEventListener('click', ()=>{
     const blob = new Blob([logEl.value], {type:'text/csv'});
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     // filename uses last-used batch name saved in localStorage, fallback to 'batches'
     a.download = (localStorage.getItem('lastBatchName') || 'batches') + '.csv';
     document.body.appendChild(a);
     a.click();
     a.remove();
     URL.revokeObjectURL(url);
   });
 }
 if(resetCsvBtn){
   resetCsvBtn.addEventListener('click', ()=>{
     csvEntries.length = 0;
     csvIdCounter = 1;
     for(const k in batchAttempts) delete batchAttempts[k];
     renderCsvArea();
   });
 }

 // Run a single battle to completion using a copy of the provided units array.
 // Returns an object { winner, turns, finalUnits } where finalUnits is array of surviving units.
 async function runBattleUntilEnd(battleUnits){
   let working = battleUnits.map(u=>({ ...u }));
   let turns = 0;
   const aliveOf = (owner) => working.filter(u=>u.owner===owner);
   while(aliveOf('comp1').length > 0 && aliveOf('comp2').length > 0){
     turns++;
     const order = [...working];
     shuffleArray(order);
     for(const u of order){
       const active = working.find(z=>z.id===u.id);
       if(!active) continue;
       const t = unitTypes.find(tt=>tt.id===active.typeId);
       const enemies = working.filter(v=>v.owner !== active.owner);
       if(enemies.length===0) continue;
       let target = null;
       if(t.tactic === 'closest'){
         target = enemies.reduce((best,e)=>{
           const d = Math.hypot(active.x - e.x, active.y - e.y);
           return (!best || d < best.d ? {e,d} : best);
         }, null)?.e;
       } else {
         target = enemies.reduce((best,e)=>{
           const et = unitTypes.find(tt=>tt.id===e.typeId) || {health:1};
           const frac = e.hp / et.health;
           return (!best || frac < best.f ? {e,f:frac} : best);
         }, null)?.e;
       }
       if(!target) continue;
       const distance = Math.hypot(active.x - target.x, active.y - target.y);
       if(distance > t.range){
         const mx = Math.min(t.speed, distance);
         const dx = (target.x - active.x)/distance || 0;
         const dy = (target.y - active.y)/distance || 0;
         active.x = Math.max(0, Math.min(WORLD_SIZE, active.x + dx * mx));
         active.y = Math.max(0, Math.min(WORLD_SIZE, active.y + dy * mx));
       } else {
         for(let a=0;a<t.attacks;a++){
           const currTarget = working.find(z=>z.id===target.id);
           if(!currTarget) break;
           const defType = unitTypes.find(tt=>tt.id===currTarget.typeId) || {armor:0, dodge:0};
           const accRoll = Math.random() * 100;
           const hitByAcc = accRoll <= (t.accuracy !== undefined ? t.accuracy : 100);
           const dodgeRoll = Math.random() * 100;
           const dodged = dodgeRoll < (defType.dodge !== undefined ? defType.dodge : 0);
           if(hitByAcc && !dodged){
             const damage = Math.max(0, t.power - (defType.armor || 0));
             currTarget.hp -= damage;
             if(currTarget.hp <= 0){
               working = working.filter(z=>z.id!==currTarget.id);
               break;
             }
           } else {
             // no effect this attack (miss or dodge) - continue to next potential attack
           }
         }
       }
     }
     // update visualization
     units = working.map(u=>({ ...u }));
     refreshUnitsUI();
     draw();
     await sleep(delayMs);
   }
   const winner = working.filter(u=>u.owner==='comp1').length > 0 ? 'comp1' : (working.filter(u=>u.owner==='comp2').length > 0 ? 'comp2' : 'draw');
   return { winner, turns, finalUnits: working.map(u=>({ ...u })) };
 }
 
 // Helper to record battle results into csvEntries using new schema:
 // expects an object { batch_name, batch_ind, battle_ind, configs, finalUnits, turns }
 function recordBattleResults({batch_name, batch_ind, battle_ind, configs, finalUnits, turns}){
   // configs: { left: [units], right: [units] } representing start composition for this battle
   // finalUnits: array of remaining units after the battle (may be empty)
   // build set of involved type ids
   const involvedTypeIds = new Set();
   (configs.left||[]).forEach(u=>involvedTypeIds.add(u.typeId));
   (configs.right||[]).forEach(u=>involvedTypeIds.add(u.typeId));
   const typesInvolved = Array.from(involvedTypeIds).map(id => unitTypes.find(tt=>tt.id===id)).filter(Boolean);
   // compute per-commander per-type stats
   for(const commander of [1,2]){
     const owner = commander === 1 ? 'comp1' : 'comp2';
     for(const tt of typesInvolved){
       const startCount = (configs[owner === 'comp1' ? 'left' : 'right'] || []).filter(u=>u.typeId === tt.id).length;
       // Skip logging any unit-type that had zero starting units
       if(!startCount || startCount === 0) continue;
       const startHealth = (configs[owner === 'comp1' ? 'left' : 'right'] || []).filter(u=>u.typeId === tt.id).reduce((s,u)=> s + (unitTypes.find(x=>x.id===u.typeId)?.health || u.hp || 0), 0);
       const endCount = (finalUnits || []).filter(u=>u.owner===owner && u.typeId === tt.id).length;
       const endHealth = (finalUnits || []).filter(u=>u.owner===owner && u.typeId === tt.id).reduce((s,u)=> s + (u.hp||0), 0);
       // damage: (starting health of this commander's units) - (ending health of this commander's units)
       // NOTE: this is damage taken by this unit type; callers can interpret as needed
       const damage = Math.max(0, Math.round(startHealth - endHealth));
       // won: 1 if this commander ended up victorious (has any survivors and opponent has none)
       const opponent = owner === 'comp1' ? 'comp2' : 'comp1';
       const oppAlive = (finalUnits || []).some(u=>u.owner===opponent);
       const ourAlive = (finalUnits || []).some(u=>u.owner===owner);
       const won = ourAlive && !oppAlive ? 1 : 0;
       addCsvEntry({
         batch_name,
         batch_ind,
         battle_ind,
         commander,
         unit_name: tt.name,
         starting_health: Math.round(startHealth),
         starting_count: startCount,
         ending_health: Math.round(endHealth),
         ending_count: endCount,
         damage,
         won,
         turns: turns || 0
       });
     }
   }
}

 // Play Batch: generate the nested-loop set of battles and run them sequentially
const playBatchBtn = document.getElementById('playBatchBtn');
if(playBatchBtn){
  // batchQueue holds how many full repeats are queued (each click while a batch is running adds one full repeat)
  let batchQueue = 0;
  let batchRunning = false;

  // extract the existing batch-run logic into a callable async function so we can call it from the prompt flow
  async function performBatchRun(batchName, repeat = 1){
    // basic validation (only performed when not already running)
    const comp1Units = units.filter(u=>u.owner==='comp1').slice().sort((a,b)=> (a.placedIndex||0) - (b.placedIndex||0));
    const comp2Units = units.filter(u=>u.owner==='comp2').slice().sort((a,b)=> (a.placedIndex||0) - (b.placedIndex||0));
    const n1 = comp1Units.length, n2 = comp2Units.length;
    if(n1===0 || n2===0){
      alert('Both players need at least one unit for batch play.');
      return;
    }

    // queue the requested number of attempts atomically; if not currently running, start processing the queue
    batchQueue += Math.max(0, Number(repeat) || 0);
    log(`Queued batch run(s): ${repeat} (total queued: ${batchQueue})`);

    batchRunning = true;
    playBtn.disabled = true;

    // Save snapshot of the map state immediately before running the batch; Reset should restore to this
    const batchPreSnapshot = {
      units: units.map(u=>({ ...u })),
      nextUnitId,
      nextTypeId,
      placedCounterComp1,
      placedCounterComp2
    };
    prePlaySnapshot = batchPreSnapshot;

    // Build the batchConfigs now based on the current selection (these configs will be repeated for each queued attempt)
    const originalUnits = units.map(u=>({ ...u }));
    const originalNextUnitId = nextUnitId;

    const batchConfigs = [];
    for(let bCount=1;bCount<=n2;bCount++){
      for(let aCount=1;aCount<=n1;aCount++){
        const left = comp1Units.slice(0, aCount).map(u=>({ ...u }));
        const right = comp2Units.slice(0, bCount).map(u=>({ ...u }));
        batchConfigs.push({left, right});
      }
    }

    // create or update a visible counter in the top-left of the gridWrap
    const wrap = document.getElementById('gridWrap');
    let counterEl = document.getElementById('batchCounter');
    if(!counterEl){
      counterEl = document.createElement('div');
      counterEl.id = 'batchCounter';
      Object.assign(counterEl.style, {
        position: 'absolute',
        left: '8px',
        top: '8px',
        background: 'rgba(255,255,255,0.95)',
        padding: '6px 8px',
        borderRadius: '6px',
        border: '1px solid #e6e6e6',
        fontSize: '13px',
        fontWeight: '600',
        zIndex: 50,
        pointerEvents: 'none'
      });
      // ensure the wrap is positioned so absolute works
      wrap.style.position = wrap.style.position || 'relative';
      wrap.appendChild(counterEl);
    }

    // processedAttempts counts how many full attempts have completed so far
    let processedAttempts = 0;

    while(batchQueue > 0){
      // current dynamic totals: totalRepeats = processedAttempts + batchQueue (queued remaining) + 1 (current)
      const totalRepeats = processedAttempts + batchQueue;
      batchQueue--;
      batchAttempts[batchName] = (batchAttempts[batchName] || 0) + 1;
      const attemptNumRecorded = batchAttempts[batchName];

      running = true;
      log(`Starting batch "${batchName}" attempt ${attemptNumRecorded} of ${batchConfigs.length} battles...`);
      let idx = 0;
      for(const cfg of batchConfigs){
        idx++;
        // update counter: "repeatCurrent/totalRepeats - battleCurrent/totalBattles"
        counterEl.textContent = `${processedAttempts + 1}/${processedAttempts + batchQueue + 1} - ${idx}/${batchConfigs.length}`;

        // Update floating Data badge with detailed per-battle info:
        try{
          const badge = document.getElementById('dataBadge');
          if(badge){
            const batchDefsLocal = Array.isArray(batchDefs) ? batchDefs : [];
            const totalCols = Math.max(1, batchDefsLocal.length);
            const colDisplay = (colIdx !== undefined && colIdx !== null) ? (colIdx + 1) : 1;
            const totalRepeats = Math.max(1, processedAttempts + batchQueue + 1);
            const repeatDisplay = attemptNumRecorded || (processedAttempts + 1);
            // unit counts string as "Comp1:Comp2"
            const unitsText = `${c1StartCount}:${c2StartCount}`;
            badge.textContent = `Col ${colDisplay}/${totalCols} • ${batchName} • Repeat ${repeatDisplay}/${totalRepeats} • Battle ${idx}/${batchConfigs.length} • Units ${unitsText}`;
          }
        }catch(e){
          // ignore any badge errors
        }

        // prepare staged battle units fresh
        units = [];
        // Apply batch-specific type overrides if batch definitions exist
        const batchDefs = loadBatchDefs(); // may be null or array

        // Build an expanded index sequence based on each column's repeat so we can map battle index -> column index.
        // Example: 3 columns with repeats [2,2,2] -> expandedIndices = [0,0,1,1,2,2]
        let expandedIndices = [];
        if(Array.isArray(batchDefs) && batchDefs.length > 0){
          for(let j=0;j<batchDefs.length;j++){
            const rep = Math.max(1, Number(batchDefs[j].repeat) || 1);
            for(let r=0;r<rep;r++) expandedIndices.push(j);
          }
        } else {
          // default single-column behavior
          expandedIndices = [0];
        }

        // determine which column index applies to this battle (idx is 1-based battle index within this attempt)
        const seqLen = Math.max(1, expandedIndices.length);
        const colIdx = expandedIndices[( (idx - 1) % seqLen )];

        // If the BatchDefs modal is open, reflect the active column visually by toggling a class on the header input
        try{
          const nameInputs = document.querySelectorAll('#batchDefsTableWrap .batchNameInput');
          if(nameInputs && nameInputs.length){
            nameInputs.forEach(inp=>{
              const c = Number(inp.dataset.col);
              if(!Number.isFinite(c)) return;
              if(c === colIdx) inp.classList.add('batch-active');
              else inp.classList.remove('batch-active');
            });
          }
        }catch(e){
          // ignore DOM errors if modal not present
        }

        // build a per-battle local type map (typeId -> typeProps) either from global unitTypes or from batch override for this column
        let typeMap = {};
        if(Array.isArray(batchDefs) && batchDefs.length > 0){
          const colDef = batchDefs[colIdx % batchDefs.length]; // choose the column based on expanded mapping
          for(const t of unitTypes){
            const base = Object.assign({}, t);
            const overrides = (colDef && colDef.overrides && colDef.overrides[t.id]) ? colDef.overrides[t.id] : {};
            // merge overrides onto base
            for(const k of Object.keys(overrides||{})){
              base[k] = overrides[k];
            }
            typeMap[t.id] = base;
          }
        } else {
          for(const t of unitTypes){
            typeMap[t.id] = Object.assign({}, t);
          }
        }

        for(const u of cfg.left){
          const clone = { ...u, id: nextUnitId++, placedIndex: u.placedIndex, owner: 'comp1' };
          // set hp to the typeMap health if present
          clone.hp = (typeMap[clone.typeId] && typeMap[clone.typeId].health) ?? clone.hp;
          units.push(clone);
        }
        for(const u of cfg.right){
          const clone = { ...u, id: nextUnitId++, placedIndex: u.placedIndex, owner: 'comp2' };
          clone.hp = (typeMap[clone.typeId] && typeMap[clone.typeId].health) ?? clone.hp;
          units.push(clone);
        }
        renumberPlaced();
        refreshUnitsUI();
        draw();

        // compute start counts and health totals
        const c1StartCount = cfg.left.length;
        const c2StartCount = cfg.right.length;
        const c1StartHealth = cfg.left.reduce((s,u)=> s + (unitTypes.find(tt=>tt.id===u.typeId)?.health || u.hp || 0), 0);
        const c2StartHealth = cfg.right.reduce((s,u)=> s + (unitTypes.find(tt=>tt.id===u.typeId)?.health || u.hp || 0), 0);

        log(`Batch ${idx}/${batchConfigs.length}: Blue 1=${c1StartCount} vs Red 2=${c2StartCount} — running...`);

        const result = await runBattleUntilEnd(units.map(u=>({ ...u }))); // returns {winner, turns, finalUnits}

        // compute end counts/health from result.finalUnits
        const finalUnits = result.finalUnits || [];
        const c1EndCount = finalUnits.filter(u=>u.owner==='comp1').length;
        const c2EndCount = finalUnits.filter(u=>u.owner==='comp2').length;
        const c1EndHealth = finalUnits.filter(u=>u.owner==='comp1').reduce((s,u)=>s + (u.hp||0), 0);
        const c2EndHealth = finalUnits.filter(u=>u.owner==='comp2').reduce((s,u)=>s + (u.hp||0), 0);

        // record battle results per-commander per-unit-type using the new schema
        recordBattleResults({
          batch_name: batchName,
          batch_ind: attemptNumRecorded,
          battle_ind: idx,
          configs: cfg,
          finalUnits: finalUnits,
          turns: result.turns || 0
        });

        log(`Batch ${idx} complete — winner: ${result.winner} (turns: ${result.turns})`);
        await sleep(200);
      }

      // restore original map and next ids after each full attempt
      units = originalUnits.map(u=>({ ...u }));
      nextUnitId = originalNextUnitId;
      renumberPlaced();
      refreshUnitsUI();
      draw();
      processedAttempts++;
      running = false;
      log(`Batch attempt complete. ${batchQueue} additional attempt(s) queued.`);
    }

    // finished processing queue
    batchRunning = false;
    playBtn.disabled = false;
    // remove counter element when done
    const ce = document.getElementById('batchCounter');
    if(ce && ce.parentNode) ce.parentNode.removeChild(ce);
    // restore the floating Data badge text to default
    try{
      const badge = document.getElementById('dataBadge');
      if(badge) badge.textContent = 'Data';
    }catch(e){}
    // clear the saved pre-play snapshot now that the batch runs are complete (map was restored to originalUnits earlier)
    prePlaySnapshot = null;
    log('All queued batch runs complete.');
  }

  playBatchBtn.addEventListener('click', async ()=>{
    // Always prompt for a batch name (prefill with last-used name if present).
    // If user cancels, do nothing.
    // If user confirms, store the value as lastBatchName and call performBatchRun(name).
    let promptEl = document.getElementById('batchNamePrompt');
    if(promptEl) promptEl.remove();
    promptEl = document.createElement('div');
    promptEl.id = 'batchNamePrompt';
    promptEl.style.position = 'fixed';
    promptEl.style.inset = '0';
    promptEl.style.display = 'flex';
    promptEl.style.alignItems = 'center';
    promptEl.style.justifyContent = 'center';
    promptEl.style.background = 'rgba(0,0,0,0.35)';
    promptEl.style.zIndex = 10000;
    const last = localStorage.getItem('lastBatchName') || '';
    // prefill last-used repeat if present
    const lastRepeat = localStorage.getItem('lastBatchRepeat') || '1';
    promptEl.innerHTML = `
      <div style="background:#fff;padding:12px;border-radius:8px;min-width:300px;box-shadow:0 6px 18px rgba(0,0,0,0.18);display:flex;flex-direction:column;gap:8px;">
        <div style="font-weight:600">Enter batch name</div>
        <input id="batchNamePromptInput" placeholder="Batch name" value="${escapeHtml(last)}" style="padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px" />
        <label style="font-size:13px;display:flex;gap:8px;align-items:center">
          Repeat
          <input id="batchRepeatInput" type="number" min="1" value="${escapeHtml(lastRepeat)}" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:6px" />
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="batchNamePromptCancel">Cancel</button>
          <button id="batchNamePromptOk">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(promptEl);
    const inp = document.getElementById('batchNamePromptInput');
    const repInp = document.getElementById('batchRepeatInput');
    const ok = document.getElementById('batchNamePromptOk');
    const cancel = document.getElementById('batchNamePromptCancel');
    inp.focus();

    ok.addEventListener('click', ()=>{
      const v = (inp.value || '').trim();
      if(!v) return; // require non-empty
      let rep = 1;
      if(repInp){
        rep = Math.max(1, parseInt(repInp.value, 10) || 1);
      }
      // persist chosen name and repeat for later use in filenames and prefill
      localStorage.setItem('lastBatchName', v);
      localStorage.setItem('lastBatchRepeat', String(rep));
      promptEl.remove();
      // queue the requested number of attempts (performBatchRun will manage internal queuing)
      // queue the requested number of attempts in one call to avoid concurrent starts
      performBatchRun(v, rep);
    });
    cancel.addEventListener('click', ()=>{
      promptEl.remove();
    });
    inp.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        ok.click();
      }
    });
  });
}

// Drawing
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw major 100px grid
  ctx.strokeStyle = '#e9e9e9';
  ctx.lineWidth = 1;
  for(let i=0;i<=WORLD_SIZE;i+=100){
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,WORLD_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(WORLD_SIZE,i); ctx.stroke();
  }

  // draw sub 20px grid (lighter)
  ctx.strokeStyle = '#f4f4f4';
  ctx.lineWidth = 1;
  for(let i=0;i<=WORLD_SIZE;i+=20){
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,WORLD_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(WORLD_SIZE,i); ctx.stroke();
  }

  // draw units
  for(const u of units){
    const t = unitTypes.find(tt=>tt.id===u.typeId);
    // draw symbol text centered instead of a circle
    const r = 8;
    const symbol = (t && t.symbol) ? t.symbol : '●';
    ctx.save();
    // increase symbol font size by 60%
    ctx.font = `${r * 2 * 1.6}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = u.owner==='comp1' ? '#2b7a78' : '#d9534f';
    ctx.fillText(symbol, u.x, u.y);
    ctx.restore();

    // selection indicator (simple ring)
    if(selectedUnits.has(u.id)){
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(u.x, u.y, 14, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // hp bar (positioned above symbol)
    const hpFrac = clamp(u.hp / t.health, 0, 1);
    ctx.fillStyle = '#ccc';
    ctx.fillRect(u.x - r*1.5, u.y - r - 10, r*3, 4);
    ctx.fillStyle = hpFrac > 0.5 ? '#4caf50' : (hpFrac > 0.2 ? '#ffb300' : '#d9534f');
    ctx.fillRect(u.x - r*1.5, u.y - r - 10, r*3*hpFrac, 4);

    // placement order number (show only when not running)
    if(!running && u.placedIndex !== undefined){
      ctx.fillStyle = '#000';
      // increased font size by ~80% (12 -> 22)
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(u.placedIndex), Math.round(u.x), Math.round(u.y - r - 10));
    }
  }

  // draw selection rect if active
  if(selecting && selectionRect){
    const xMin = Math.min(selectionRect.x0, selectionRect.x1);
    const xMax = Math.max(selectionRect.x0, selectionRect.x1);
    const yMin = Math.min(selectionRect.y0, selectionRect.y1);
    const yMax = Math.max(selectionRect.y0, selectionRect.y1);
    ctx.save();
    ctx.strokeStyle = 'rgba(50,50,50,0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6,4]);
    ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);
    ctx.restore();
  }
}

// Download a 500x500 image of the map including grid, units, HP bars and placement numbers
function downloadMapImage(filename = null){
  try{
    const size = 500;
    const scale = size / WORLD_SIZE; // 0.5 for 1000 world
    const tmp = document.createElement('canvas');
    tmp.width = size;
    tmp.height = size;
    const c = tmp.getContext('2d');

    // white background
    c.fillStyle = '#ffffff';
    c.fillRect(0,0,size,size);

    // draw major 100px grid
    c.strokeStyle = '#e9e9e9';
    c.lineWidth = Math.max(1, 1 * scale);
    for(let i=0;i<=WORLD_SIZE;i+=100){
      const x = Math.round(i * scale) + 0.5;
      c.beginPath(); c.moveTo(x,0); c.lineTo(x,size); c.stroke();
      const y = Math.round(i * scale) + 0.5;
      c.beginPath(); c.moveTo(0,y); c.lineTo(size,y); c.stroke();
    }

    // draw sub 20px grid (lighter)
    c.strokeStyle = '#f4f4f4';
    c.lineWidth = Math.max(0.5, 1 * scale);
    for(let i=0;i<=WORLD_SIZE;i+=20){
      const x = Math.round(i * scale) + 0.5;
      c.beginPath(); c.moveTo(x,0); c.lineTo(x,size); c.stroke();
      const y = Math.round(i * scale) + 0.5;
      c.beginPath(); c.moveTo(0,y); c.lineTo(size,y); c.stroke();
    }

    // draw units (use same ordering as draw())
    for(const u of units){
      const t = unitTypes.find(tt=>tt.id===u.typeId) || {health:1, symbol:'●'};
      const sx = u.x * scale, sy = u.y * scale;
      const r = Math.max(4, Math.round(8 * scale)); // symbol base size scaled down

      // symbol
      c.save();
      c.font = `${Math.max(10, Math.round(r * 2 * 1.6))}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = u.owner==='comp1' ? '#2b7a78' : '#d9534f';
      c.fillText(t.symbol || '●', sx, sy);
      c.restore();

      // selection ring if selected
      if(selectedUnits.has(u.id)){
        c.save();
        c.strokeStyle = '#000';
        c.lineWidth = Math.max(1, Math.round(2 * scale));
        c.beginPath();
        c.arc(sx, sy, Math.max(6, Math.round(14 * scale)), 0, Math.PI*2);
        c.stroke();
        c.restore();
      }

      // hp bar above symbol
      const hpFrac = clamp(u.hp / (t.health || 1), 0, 1);
      const barW = Math.max(12, Math.round((r * 3) * scale));
      const barH = Math.max(2, Math.round(4 * scale));
      const bx = sx - barW/2;
      const by = sy - r - Math.max(6, Math.round(10 * scale));
      c.fillStyle = '#ccc';
      c.fillRect(bx, by, barW, barH);
      c.fillStyle = hpFrac > 0.5 ? '#4caf50' : (hpFrac > 0.2 ? '#ffb300' : '#d9534f');
      c.fillRect(bx, by, Math.round(barW * hpFrac), barH);

      // placement number (only when not running)
      if(!running && u.placedIndex !== undefined){
        c.fillStyle = '#000';
        c.font = `${Math.max(10, Math.round(22 * scale))}px sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.fillText(String(u.placedIndex), Math.round(sx), Math.round(by - 2));
      }
    }

    tmp.toBlob((blob)=>{
      if(!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || ((localStorage.getItem('lastBatchName') || 'map') + '.png');
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }catch(err){
    console.error('Download image failed', err);
  }
}

// wire Download Image button
const downloadImageBtn = document.getElementById('downloadImageBtn');
if(downloadImageBtn){
  downloadImageBtn.addEventListener('click', ()=>{
    downloadMapImage();
  });
}

// Utility
function dist(a,b){
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx,dy);
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function shuffleArray(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
}

 // grid snapping and occupancy helpers (20px subgrid)
 const SUBGRID = 20;
 function snapToGrid(v){
   return Math.round(v / SUBGRID) * SUBGRID;
 }
 
  // Helper to update the "prePlaySnapshot" used by the Reset button so it always reflects the latest map state.
 // Call this whenever the map changes (placements, moves, deletes, conversions, imports, clear).
 function updateResetSnapshot(){
   prePlaySnapshot = {
     units: units.map(u => ({ ...u })),
     nextUnitId,
     nextTypeId,
     placedCounterComp1,
     placedCounterComp2
   };
   // persist as well so full state is saved
   saveState();
 }

 // Recompute placedIndex for remaining units based on creation order (id ascending),
 // numbering separately for each owner (comp1, comp2).
 function renumberPlaced(){
   // sort by creation id to preserve creation order
   const byId = [...units].sort((a,b)=> a.id - b.id);
   let c1 = 1, c2 = 1;
   for(const u of byId){
     if(u.owner === 'comp1'){
       u.placedIndex = c1++;
     } else if(u.owner === 'comp2'){
       u.placedIndex = c2++;
     } else {
       u.placedIndex = u.placedIndex ?? undefined;
     }
   }
   // ensure Reset snapshot is updated whenever placement ordering (or units list) changes
   updateResetSnapshot();
 }
// check if some snapped coordinate is occupied; exclude an optional unitId
function isOccupiedAt(x, y, excludeId){
  for(const u of units){
    if(excludeId && u.id === excludeId) continue;
    if(Math.round(u.x) === Math.round(x) && Math.round(u.y) === Math.round(y)) return true;
  }
  return false;
}

// find nearest unoccupied snapped cell around given world coords (searches outward in rings)
function findNearestUnoccupied(x, y, excludeId){
  const cx = snapToGrid(x);
  const cy = snapToGrid(y);
  if(!isOccupiedAt(cx, cy, excludeId)) return {x: cx, y: cy};

  // search in expanding Manhattan rings measured in SUBGRID steps
  const maxSteps = Math.ceil(WORLD_SIZE / SUBGRID);
  for(let step=1; step<=maxSteps; step++){
    // iterate points on square ring around center
    for(let dx=-step; dx<=step; dx++){
      for(let dy=-step; dy<=step; dy++){
        // only points exactly on the ring
        if(Math.max(Math.abs(dx), Math.abs(dy)) !== step) continue;
        const nx = cx + dx * SUBGRID;
        const ny = cy + dy * SUBGRID;
        if(nx < 0 || ny < 0 || nx > WORLD_SIZE || ny > WORLD_SIZE) continue;
        if(!isOccupiedAt(nx, ny, excludeId)) return {x: nx, y: ny};
      }
    }
  }
  return null;
}

 // Initial demo types for convenience
 (function seed(){
  // Only seed demo data when there's no persisted data
  if(unitTypes.length === 0 && units.length === 0){
    const basic = {id: nextTypeId++, name:'Archer', health:80, range:180, power:18, attacks:1, accuracy:100, dodge:0, armor:2, speed:60, tactic:'closest', symbol:'▲'};
    const tank = {id: nextTypeId++, name:'Guard', health:200, range:50, power:25, attacks:1, accuracy:100, dodge:0, armor:6, speed:30, tactic:'closest', symbol:'◆'};
    const skirm = {id: nextTypeId++, name:'Skirmisher', health:60, range:100, power:12, attacks:2, accuracy:100, dodge:0, armor:0, speed:120, tactic:'damaged', symbol:'★'};
    unitTypes.push(basic, tank, skirm);

    // place some demo units
    addUnit(basic.id, 'comp1', 150, 300);
    addUnit(tank.id, 'comp1', 100, 500);
    addUnit(skirm.id, 'comp1', 200, 700);

    addUnit(basic.id, 'comp2', 850, 300);
    addUnit(tank.id, 'comp2', 900, 500);
    addUnit(skirm.id, 'comp2', 800, 700);
  }

  // ensure UI reflects either persisted or seeded state
  refreshTypesUI();
  refreshUnitsUI();
  draw();
  // persist initial state (seed or loaded)
  saveState();
})();