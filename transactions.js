
/* ---------------------------------------------------------------------------
 * transactions.js - Toppery AML  (Depositi / Prelievi / Carte) - 15 lug 2025
 * ---------------------------------------------------------------------------
 * Changelog 15/07/2025
 * • Checkbox "Includi Transazioni Carte" per escludere / includere il file
 *   Excel delle carte. Se deselezionato l’analisi può essere eseguita caricando
 *   solo i file di Depositi e Prelievi.
 * • Depositi & Prelievi: invece dei "Ultimi 30 gg" ora vengono mostrati gli
 *   importi relativi ai 3 mesi completi precedenti all’ultimo movimento
 *   disponibile (p. es. ultimo movimento 15 lug 2025 => mesi giugno, maggio,
 *   aprile 2025).
 * • Transazioni Carte: aggiunto menù a tendina che consente di filtrare
 *   dinamicamente il report per singolo mese oppure visualizzare il totale.
 *   Il menù viene popolato con tutti i mesi presenti nel file caricato.
 * ------------------------------------------------------------------------- */

"use strict";

/* ---- fallback-ID helper ------------------------------------------------ */
function $(primary, fallback) {
  return document.getElementById(primary) || (fallback ? document.getElementById(fallback) : null);
}

/* --------------------------- DOM references ----------------------------- */
const cardInput      = $('cardFileInput',  'transactionsFileInput');
const depositInput   = $('depositFileInput');
const withdrawInput  = $('withdrawFileInput');
const analyzeBtn     = $('analyzeBtn',     'analyzeTransactionsBtn');

const depositResult  = document.getElementById('depositResult');
const withdrawResult = document.getElementById('withdrawResult');
const cardResult     = document.getElementById('transactionsResult');

/* ---------------- dinamically inject checkbox -------------------------- */
let includeCard = document.getElementById('includeCardCheckbox');
if(cardInput && !includeCard){
  includeCard = document.createElement('input');
  includeCard.type = 'checkbox';
  includeCard.id   = 'includeCardCheckbox';
  includeCard.checked = true;

  const lbl = document.createElement('label');
  lbl.style.marginLeft = '.5rem';
  lbl.appendChild(includeCard);
  lbl.appendChild(document.createTextNode(' Includi Transazioni Carte'));

  cardInput.parentElement.appendChild(lbl);
}

/* --- basic guards ------------------------------------------------------- */
if (!depositInput || !withdrawInput || !analyzeBtn) {
  console.error('[Toppery AML] DOM element IDs non trovati.');
  throw new Error('Required DOM elements missing.');
}

/* ---------------- inject .transactions-table CSS ----------------------- */
(function ensureStyle() {
  if (document.getElementById('transactions-table-style')) return;
  const css = `
    .transactions-table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.35rem}
    .transactions-table caption{caption-side:top;font-weight:600;padding-bottom:.25rem;text-align:left}
    .transactions-table thead{background:#21262d}
    .transactions-table th,.transactions-table td{padding:.45rem .6rem;border-bottom:1px solid #30363d;text-align:left}
    .transactions-table tbody tr:nth-child(even){background:#1b1f24}
    .transactions-table tfoot th{background:#1b1f24}`;
  const st = document.createElement('style');
  st.id = 'transactions-table-style';
  st.textContent = css;
  document.head.appendChild(st);
})();

/* ------------- Enable / Disable analyse button ------------------------- */
function toggleAnalyzeBtn() {
  const depsLoaded = depositInput.files.length && withdrawInput.files.length;
  const cardsOk    = !includeCard.checked || cardInput.files.length;
  analyzeBtn.disabled = !(depsLoaded && cardsOk);
}
[cardInput, depositInput, withdrawInput, includeCard].forEach(el => el && el.addEventListener('change', toggleAnalyzeBtn));
toggleAnalyzeBtn();

/* ----------------------- Helper utilities ------------------------------ */
const sanitize = s => String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const parseNum = v => {
  if(typeof v === 'number') return isFinite(v)?v:0;
  if(v == null) return 0;
  let s = String(v).trim();
  if(!s) return 0;
  // remove spaces & NBSP
  s = s.replace(/\s+/g,'');
  // se contiene sia . che , decidiamo quale è decimale guardando l'ultima occorrenza
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if(lastComma > -1 && lastDot > -1){
    if(lastComma > lastDot){
      // formato it: 1.234,56 -> rimuovi punti, sostituisci virgola con .
      s = s.replace(/\./g,'').replace(/,/g,'.');
    }else{
      // formato en: 1,234.56 -> rimuovi virgole
      s = s.replace(/,/g,'');
    }
  }else if(lastComma > -1){
    // formato 1234,56
    s = s.replace(/\./g,'').replace(/,/g,'.');
  }else{
    // formato 1.234 o 1234.56 -> togli separatori non numerici tranne - .
    s = s.replace(/[^0-9.-]/g,'');
  }
  const n = parseFloat(s);
  return isNaN(n)?0:n;
};

// --- Helper per visualizzare importi esattamente come da Excel ---
function formatImporto(raw, num){
  if(raw===undefined||raw===null||String(raw).trim()===''){
    return (typeof num==='number'&&isFinite(num))?num.toFixed(2):'';
  }
  return String(raw).trim();
}
const excelToDate = d => {
  if (d instanceof Date) return d;

  /* -----------------------------------------------------------------
   * SERIALI EXCEL (1900 date system)
   * -----------------------------------------------------------------
   * Excel conta i giorni a partire dal 30‑12‑1899 incluso
   * (bug anno bisestile 1900).  Sommiamo i giorni in LOCALE per
   * evitare slittamenti di fuso o giorno.
   * ----------------------------------------------------------------- */
  if (typeof d === 'number') {
    const base = new Date(1899, 11, 30, 0, 0, 0); // 30‑12‑1899 00:00 locale
    base.setDate(base.getDate() + d);
    return base;
  }

  /* -----------------------------------------------------------------
   * STRINGHE tipo 31/05/2025 22:15 o 31-05-2025
   * ----------------------------------------------------------------- */
  if (typeof d === 'string') {
    const s = d.trim();

    // Formato europeo con separatore / o - e orario opzionale
    const m = s.match(/^([0-3]?\d)[\/\-]([0-1]?\d)[\/\-](\d{2,4})(?:\D+([0-2]?\d):([0-5]?\d)(?::([0-5]?\d))?)?/);
    if (m) {
      let day = +m[1];
      let mon = +m[2] - 1;
      let yr  = +m[3];
      if (yr < 100) yr += 2000;
      const hh = m[4] != null ? +m[4] : 0;
      const mm = m[5] != null ? +m[5] : 0;
      const ss = m[6] != null ? +m[6] : 0;
      return new Date(yr, mon, day, hh, mm, ss); // locale
    }

    /* ---------------------------------------------------------------
     * ISO 2025-05-31T22:00:00Z  ➜ convertiamo da UTC a locale
     * --------------------------------------------------------------- */
    if (s.endsWith('Z')) {
      const dUTC = new Date(s);
      return new Date(
        dUTC.getUTCFullYear(),
        dUTC.getUTCMonth(),
        dUTC.getUTCDate(),
        dUTC.getUTCHours(),
        dUTC.getUTCMinutes(),
        dUTC.getUTCSeconds()
      );
    }

    const tryDate = new Date(s);
    if (!isNaN(tryDate)) return tryDate;
  }

  // valore non riconosciuto → data invalida
  return new Date('');
};
const findHeaderRow = (rows,h) =>
  rows.findIndex(r=>Array.isArray(r)&&r.some(c=>typeof c==='string'&&sanitize(c).includes(sanitize(h))));
const findCol = (hdr,als)=>{const s=hdr.map(sanitize);for(const a of als){const i=s.findIndex(v=>v.includes(sanitize(a)));if(i!==-1)return i;}return -1;};
const monthKey = dt => dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
const monthLabel = k => {
  const [y,m] = k.split('-');
  const names = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  return `${names[parseInt(m,10)-1]} ${y}`;
};
const readExcel = file => new Promise((res,rej)=>{
  const fr=new FileReader();
  fr.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
      res(rows);
    }catch(err){rej(err);}
  };
  fr.onerror=rej;
  fr.readAsArrayBuffer(file);
});


/* ----------------- Helper: calcolo frazionate Prelievi (rolling 7gg) ---- */
/** Cerca frazionate > €4.999 nei movimenti di prelievo.
 * @param {Array[]} rows - righe excel (già slice hIdx+1 in parseMovements)
 * @param {number} cDate - indice colonna Data
 * @param {number} cDesc - indice colonna Descrizione
 * @param {number} cAmt  - indice colonna Importo
 * @returns {Array<{start:string,end:string,total:number,transactions:Array}>}
 */
function calcWithdrawFrazionate(rows, cDate, cDesc, cAmt){
  // Helper: format local date (YYYY-MM-DD) ignoring timezone to avoid off-by-one in display
  const fmtDateLocal = (d)=>{
    const dt = new Date(d);
    dt.setHours(0,0,0,0);
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  };

  /* Cerca frazionate > €4.999 **SOLO** tra i movimenti "Voucher PVR".
     Allineata a popup.js (rolling window 7 giorni).
     Se nessuna frazionata => array vuoto (UI non mostra). */
  const THRESHOLD = 5000;
  const isVoucherPVR = (desc)=>{
    if(!desc) return false;
    const d = String(desc).toLowerCase();
    return d.includes('voucher') && d.includes('pvr');
  };
  const txs = [];
  rows.forEach(r=>{
    if(!Array.isArray(r)) return;
    const desc = String(r[cDesc]??'').trim();
    if(!isVoucherPVR(desc)) return;
    const amt = parseNum(r[cAmt]); if(!amt) return;
    const dt = excelToDate(r[cDate]); if(!dt||isNaN(dt)) return;
    txs.push({data:dt, importo:Math.abs(amt), importo_raw:r[cAmt], causale:desc});
  });
  txs.sort((a,b)=>a.data-b.data);
  const startOfDay = d=>{const t=new Date(d);t.setHours(0,0,0,0);return t;};
  const res=[];
  let i=0;
  while(i<txs.length){
    const windowStart = startOfDay(txs[i].data);
    let j=i, run=0;
    while(j<txs.length){
      const t = txs[j];
      const diffDays = (startOfDay(t.data)-windowStart)/(1000*60*60*24);
      if(diffDays>6) break;
      run += t.importo;
      if(run>THRESHOLD){
        res.push({
          start: fmtDateLocal(windowStart),
          end: fmtDateLocal(startOfDay(t.data)),
          total: run,
          transactions: txs.slice(i,j+1).map(t=>({
            date: t.data.toISOString(),
            amount: t.importo, raw:t.importo_raw,
            causale: t.causale
          }))
        });
        i = j+1;
        break;
      }
      j++;
    }
    if(run<=THRESHOLD) i++;
  }
  return res;
}
/* ---------------------- Depositi / Prelievi ---------------------------- */
async function parseMovements(file, mode){  /* mode: 'deposit' | 'withdraw' */
  const RE = mode==='deposit'?/^(deposito|ricarica)/i:/^prelievo/i;
  const rows = await readExcel(file);
  const hIdx = findHeaderRow(rows,'importo');
  const hdr  = hIdx!==-1?rows[hIdx]:[];
  const data = hIdx!==-1?rows.slice(hIdx+1):rows;

  const cDate = hIdx!==-1?findCol(hdr,['data','date']):0;
  const cDesc = hIdx!==-1?findCol(hdr,['descr','description']):1;
  const cAmt  = hIdx!==-1?findCol(hdr,['importo','amount']):2;

  const all = Object.create(null);          /* Totali per metodo */
  const perMonth = Object.create(null);     /* {method: {YYYY-MM:val}} */
  let totAll=0, latest=new Date(0);

  data.forEach(r=>{
    if(!Array.isArray(r)) return;
    const desc = String(r[cDesc]??'').trim();
    if(!RE.test(desc)) return;

    const method = mode==='deposit' && desc.toLowerCase().startsWith('ricarica')
      ? 'Cash'
      : desc.replace(RE,'').trim() || 'Sconosciuto';

    const amt = parseNum(r[cAmt]); if(!amt) return;
    all[method] = (all[method]||0)+amt; totAll+=amt;

    const dt = excelToDate(r[cDate]); if(!dt||isNaN(dt)) return;
    if(dt>latest) latest = dt;

    const k = monthKey(dt);
    perMonth[method] ??={};
    perMonth[method][k] = (perMonth[method][k]||0)+amt;
  });

  /* calcolo lista mesi presenti (chiave YYYY-MM) in ordine decrescente */
const monthsSet = new Set();
Object.values(perMonth).forEach(obj=>{
  Object.keys(obj).forEach(k=>monthsSet.add(k));
});
const months = Array.from(monthsSet).sort().reverse().filter(k=>{const [y,m]=k.split('-').map(n=>parseInt(n,10));const d=new Date();return (y<d.getFullYear())||(y===d.getFullYear()&&m<=d.getMonth()+1);});

const frazionate = mode==='withdraw'?calcWithdrawFrazionate(data, cDate, cDesc, cAmt):[];
return {totAll, months, all, perMonth, frazionate};
}

/* ------------------ render Depositi / Prelievi table ------------------- */

function renderMovements(el, title, d){
  /* Aggiornato: filtro mese dinamico (Depositi / Prelievi).
     Mostra solo i mesi realmente presenti nei dati (già calcolati in parseMovements).
     Valore vuoto => Totale (comportamento originario).
  */
  el.innerHTML = '';
  el.classList.add('hidden');
  if(!d || !d.totAll) return;

  const makeTable = (filterMonth='')=>{
    const isTotal = !filterMonth;
    const caption = isTotal ? `${title} – Totale` : `${title} – ${monthLabel(filterMonth)}`;
    let rowsObj, tot;
    if(isTotal){
      rowsObj = d.all;
      tot = d.totAll;
    }else{
      rowsObj = {};
      tot = 0;
      Object.keys(d.perMonth).forEach(method=>{
        const v = d.perMonth[method][filterMonth] || 0;
        if(v){
          rowsObj[method] = v;
          tot += v;
        }
      });
      if(tot===0){
        return `<p style='color:#999'>${title}: nessun movimento per ${monthLabel(filterMonth)}.</p>`;
      }
    }

    const tbl = document.createElement('table');
    tbl.className = 'transactions-table';
    tbl.innerHTML = `
      <caption>${caption}</caption>
      <thead><tr><th>Metodo</th><th>Importo €</th></tr></thead>
      <tbody></tbody>
      <tfoot><tr><th style='text-align:right'>Totale €</th><th style='text-align:right'>${tot.toFixed(2)}</th></tr></tfoot>`;

    const tbody = tbl.querySelector('tbody');
    Object.keys(rowsObj).forEach(method=>{
      tbody.insertAdjacentHTML('beforeend',
        `<tr><td>${method}</td><td style='text-align:right'>${rowsObj[method].toFixed(2)}</td></tr>`);
    });
    return tbl;
  };

  // render iniziale = totale
  const firstTbl = makeTable('');
  if(typeof firstTbl === 'string'){ el.innerHTML = firstTbl; }
  else{ el.appendChild(firstTbl); }
  el.classList.remove('hidden');

  // menù a tendina mesi
  if(Array.isArray(d.months) && d.months.length){
    const select = document.createElement('select');
    select.innerHTML = '<option value="">Totale</option>' + d.months.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join('');
    select.style.marginRight = '.5rem';

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.margin = '0 0 .5rem 0';
    wrapper.appendChild(select);
    el.insertBefore(wrapper, el.firstChild);

    select.addEventListener('change',()=>{
      const cur = makeTable(select.value);
      Array.from(el.querySelectorAll('table:not(.frazionate-table), p')).forEach(n=>n.remove());
      if(typeof cur === 'string'){ wrapper.insertAdjacentHTML('afterend',cur); }
      else{ wrapper.insertAdjacentElement('afterend',cur); }
    });
  }
  // --- Frazionate (solo per Prelievi) -----------------------------------
  if(title==='Prelievi' && Array.isArray(d.frazionate) && d.frazionate.length){
    const det = document.createElement('details');
    det.style.marginTop = '1rem';
    const sum = document.createElement('summary');
    sum.textContent = `Frazionate Prelievi (${d.frazionate.length})`;
    det.appendChild(sum);

    const wrap = document.createElement('div');
    wrap.innerHTML = buildFrazionateTable(d.frazionate);
    det.appendChild(wrap);
    el.appendChild(det);
  }

}







/* ---- build html tabella frazionate prelievi --------------------------- */
function buildFrazionateTable(list){
  /* Formatta periodo dd/mm/yyyy come nel file Excel. */
  if(!list.length) return '<p>Nessuna frazionata rilevata.</p>';
  const fmt = v => {
    if(v==null) return '';
    const d = v instanceof Date ? v : new Date(v);
    if(isNaN(d)) return String(v);
    return d.toLocaleDateString('it-IT');
  };
  let html = '<table class="transactions-table frazionate-table">';
  html += '<thead><tr><th>Periodo</th><th>Totale €</th><th># Mov</th></tr></thead><tbody>';
  list.forEach((f,i)=>{
    const pid = `frazp_${i}`;
    const ds = fmt(f.start);
    const de = fmt(f.end);
    html += `<tr data-fraz="${pid}"><td>${ds} - ${de}</td><td style="text-align:right">${f.total.toFixed(2)}</td><td style="text-align:right">${f.transactions.length}</td></tr>`;
    html += `<tr class="fraz-det" id="${pid}" style="display:none"><td colspan="3">`;
    html += '<table class="inner-fraz"><thead><tr><th>Data</th><th>Causale</th><th>Importo €</th></tr></thead><tbody>';
    f.transactions.forEach(t=>{
      const d = fmt(t.date);
      html += `<tr><td>${d}</td><td>${t.causale}</td><td style="text-align:right">${formatImporto(t.raw,t.amount)}</td></tr>`;
    });
    html += '</tbody></table></td></tr>';
  });
  html += '</tbody></table>';
  return html;
}
/* ---------------------- Transazioni Carte ------------------------------ */
async function parseCards(file){
  return readExcel(file);
}

/* ---- Costruisce tabella carte con facoltativo filtro per mese ---------- */
/**
 * @param {Array[]} rows  - righe excel
 * @param {number}  depTot – totale depositi, per % depositi
 * @param {string}  filterMonth - '' per totale oppure chiave YYYY-MM
 * @returns {{html:string, months:string[]}}
 */
function buildCardTable(rows, depTot, filterMonth=''){
  const hIdx = findHeaderRow(rows,'amount');
  if(hIdx===-1) return {html:'<p style="color:red">Intestazioni carte assenti.</p>', months:[]};
  const hdr = rows[hIdx];
  const data = rows.slice(hIdx+1).filter(r=>Array.isArray(r)&&r.some(c=>c));

  const ix = {
    date : findCol(hdr,['date','data']),
    pan  : findCol(hdr,['pan']),
    bin  : findCol(hdr,['bin']),
    name : findCol(hdr,['holder','nameoncard']),
    type : findCol(hdr,['cardtype']),
    prod : findCol(hdr,['product']),
    ctry : findCol(hdr,['country']),
    bank : findCol(hdr,['bank']),
    amt  : findCol(hdr,['amount']),
    res  : findCol(hdr,['result']),
    ttype: findCol(hdr,['transactiontype','transtype']),
    reason:findCol(hdr,['reason'])
  };
  if(ix.pan===-1 || ix.amt===-1 || ix.ttype===-1){
    return {html:'<p style="color:red">Colonne fondamentali mancanti.</p>', months:[]};
  }

  const cards = {};
  const sum = {app:0, dec:0};
  const monthsSet = new Set();

  data.forEach(r=>{
    const txType = String(r[ix.ttype]||'').toLowerCase();
    if(!txType.includes('sale')) return;

    // collect date & filter if requested -----------------------------------
    let dt=null;
    if(ix.date!==-1){
      dt = excelToDate(r[ix.date]);
      if(dt && !isNaN(dt)){
        const mk = monthKey(dt);
        monthsSet.add(mk);
        if(filterMonth && mk!==filterMonth) return;   // skip not requested month
      }else if(filterMonth){                          // invalid date row & filtering active → skip
        return;
      }
    }else if(filterMonth){                            // no date column but filter asked
      return;
    }

    const pan = r[ix.pan] || 'UNKNOWN';
    cards[pan] ??={
      bin : ix.bin!==-1 ? (r[ix.bin] || String(pan).slice(0,6)) : '',
      pan,
      name: ix.name!==-1 ? (r[ix.name] || '') : '',
      type: ix.type!==-1 ? (r[ix.type] || '') : '',
      prod: ix.prod!==-1 ? (r[ix.prod] || '') : '',
      ctry: ix.ctry!==-1 ? (r[ix.ctry] || '') : '',
      bank: ix.bank!==-1 ? (r[ix.bank] || '') : '',
      app : 0, dec:0, nDec:0, reasons:new Set()
    };

    const amt = parseNum(r[ix.amt]);
    const resVal = ix.res!==-1 ? String(r[ix.res] || '') : 'approved';
    if(/^approved$/i.test(resVal)){
      cards[pan].app += amt; sum.app += amt;
    }else{
      cards[pan].dec += amt; sum.dec += amt;
      cards[pan].nDec += 1;
      if(ix.reason!==-1 && r[ix.reason]) cards[pan].reasons.add(r[ix.reason]);
    }
  });

  const months = Array.from(monthsSet).sort().reverse().filter(k=>{const [y,m]=k.split('-').map(n=>parseInt(n,10));const d=new Date();return (y<d.getFullYear())||(y===d.getFullYear()&&m<=d.getMonth()+1);});
  const caption = filterMonth ? `Carte – ${monthLabel(filterMonth)}` : 'Carte – Totale';

  const tbl = document.createElement('table');
  tbl.className = 'transactions-table';
  tbl.innerHTML = `
    <caption>${caption}</caption>
    <colgroup>
      <col style="width:6%"><col style="width:9%"><col style="width:17%">
      <col style="width:8%"><col style="width:9%"><col style="width:7%">
      <col style="width:10%"><col style="width:8%"><col style="width:8%">
      <col style="width:7%"><col style="width:7%"><col>
    </colgroup>
    <thead><tr>
      <th>BIN</th><th>PAN</th><th>Holder</th><th>Type</th><th>Product</th>
      <th>Country</th><th>Bank</th><th>Approved €</th><th>Declined €</th>
      <th>#Declined</th><th>% Depositi</th><th>Reason Codes</th>
    </tr></thead><tbody></tbody>
    <tfoot><tr>
      <th colspan="7" style="text-align:right">TOTAL:</th>
      <th style="text-align:right">${sum.app.toFixed(2)}</th>
      <th style="text-align:right">${sum.dec.toFixed(2)}</th>
      <th></th><th></th><th></th>
    </tr></tfoot>`;

  const tb = tbl.querySelector('tbody');
  Object.values(cards).forEach(c=>{
    const perc = depTot ? ((c.app/depTot)*100).toFixed(2)+'%' : '—';
    tb.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${c.bin}</td><td>${c.pan}</td><td>${c.name}</td><td>${c.type}</td><td>${c.prod}</td>
        <td>${c.ctry}</td><td>${c.bank}</td>
        <td style="text-align:right">${c.app.toFixed(2)}</td>
        <td style="text-align:right">${c.dec.toFixed(2)}</td>
        <td style="text-align:right">${c.nDec}</td>
        <td style="text-align:right">${perc}</td>
        <td>${[...c.reasons].join(', ')}</td>
      </tr>`);
  });

  return {html: tbl.outerHTML, months};
}

/* ------------ Render cartes table & dropdown --------------------------- */
function renderCards(rows, depTot){
  cardResult.innerHTML='';
  cardResult.classList.add('hidden');

  const first = buildCardTable(rows, depTot, '');
  const select = document.createElement('select');
  select.innerHTML = '<option value="">Totale</option>' + first.months.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join('');
  select.style.marginRight = '.5rem';

  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '.5rem';
  const lbl = document.createElement('label');
  lbl.textContent = 'Filtro mese: ';
  lbl.appendChild(select);
  wrapper.appendChild(lbl);
  cardResult.appendChild(wrapper);

  const tableContainer = document.createElement('div');
  tableContainer.innerHTML = first.html;
  cardResult.appendChild(tableContainer);
  cardResult.classList.remove('hidden');

  select.addEventListener('change', ()=>{
    const res = buildCardTable(rows, depTot, select.value);
    tableContainer.innerHTML = res.html;
  });
}

/* -------------------------- Main handler ------------------------------- */
analyzeBtn.addEventListener('click', async ()=>{
  analyzeBtn.disabled = true;
  try{
    const depositData = await parseMovements(depositInput.files[0],'deposit');
    renderMovements(depositResult,'Depositi',depositData);

    const withdrawData = await parseMovements(withdrawInput.files[0],'withdraw');
    renderMovements(withdrawResult,'Prelievi',withdrawData);

    if(includeCard.checked){
      const cardRows = await parseCards(cardInput.files[0]);
      renderCards(cardRows, depositData.totAll);
    }else{
      cardResult.innerHTML='';
      cardResult.classList.add('hidden');
    }
  }catch(err){
    console.error(err);
    alert('Errore durante l\'analisi: ' + err.message);
  }
  analyzeBtn.disabled = false;
});
