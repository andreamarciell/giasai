// --- helper per tabella dettagli ---
function parseDetail(detail){
    // Corregge encoding e analizza il testo
    let fixed = detail.replace(/â‚¬/g,"€").replace(/Â/g,"").trim();
    const sepIdx = fixed.indexOf(':');
    const cat = sepIdx>=0 ? fixed.slice(0,sepIdx).trim() : '';
    const restStr = sepIdx>=0 ? fixed.slice(sepIdx+1).trim() : fixed;

    // Pattern comuni
    const depMatch = fixed.match(/deposito\s+€([\d.,]+)/i);
    const preMatch = fixed.match(/prelievo\s+€([\d.,]+)/i);
    const bonusMatch = fixed.match(/bonus\s+€([\d.,]+)/i);
    const countMatch = fixed.match(/(\d+)\s+depositi/i);
    const maxMatch = fixed.match(/≤€([\d.,]+)/);
    const timeMatchMin = fixed.match(/in\s+([\d.,]+)\s+min/i);
    const timeMatchH = fixed.match(/in\s+([\d.,]+)\s*h/i);

    return {
        cat,
        deposito: depMatch ? depMatch[1] : (countMatch ? countMatch[1] : ''),
        prelievo: preMatch ? preMatch[1] : (bonusMatch ? bonusMatch[1] : (maxMatch ? maxMatch[1] : '')),
        tempo: timeMatchMin ? timeMatchMin[1] : (timeMatchH ? timeMatchH[1]+'h' : ''),
        detail: restStr

    };
}
function normalizeCausale(causale) {
    if (!causale) return '';
    const lc = causale.toLowerCase().trim();

    // Session Slot: distingue le versioni Live
    if (lc.startsWith('session slot') || lc.startsWith('sessione slot')) {
        return lc.includes('(live') ? 'Session Slot (Live)' : 'Session Slot';
    }
    return causale;
}



document.addEventListener('DOMContentLoaded', function() {
    // MENU LOGIC
    const menuButtons = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.content-section');
    menuButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            menuButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.target;
            sections.forEach(sec => {
                sec.classList.toggle('active', sec.id === target);
            });
        });
    });
    
    chrome.storage.local.get("amlResults", function(data) {
        const results = data.amlResults;
        if (!results) {
            document.body.innerHTML = "<h2>Nessun risultato disponibile. Esegui prima l'analisi dal popup.</h2>";
            return;
        }

        // aggiorna riskBadge con colore e testo
        const riskBadge = document.getElementById('riskBadge');
        riskBadge.textContent = results.riskLevel;
        if (results.riskLevel === "Low") {
            riskBadge.classList.add('risk-low');
        } else if (results.riskLevel === "Medium") {
            riskBadge.classList.add('risk-medium');
        } else if (results.riskLevel === "High") {
            riskBadge.classList.add('risk-high');
        }

        // aggiorna riskScore
        document.getElementById('riskScore').textContent = results.riskScore;

// ---- Alerts AML/FRAUD ----
const alertsArr = results.alerts || [];

// build counts
const counts = {};
alertsArr.forEach(a=>{
    const type = a.split(':')[0];
    counts[type] = (counts[type]||0)+1;
});

// ----- CARD ALERT SUMMARY -----
if(!document.getElementById('alertsCard')){
    const container = document.getElementById('grafici');
    const alertCard = document.createElement('div');
    alertCard.className = 'card';
    alertCard.id = 'alertsCard';

    const counts = {};
    alertsArr.forEach(a=>{
        const type=a.split(':')[0];
        counts[type]=(counts[type]||0)+1;
    });
    const catOrder = ["Velocity deposit","Bonus concentration","Casino live"];
// costruisci tabella sommario ordinato
const summaryHtml = `
    <table class="alert-table" style="width:100%;border-collapse:collapse">
        <thead><tr><th style="text-align:left;padding:4px;">Categoria</th><th style="text-align:right;padding:4px;">Occorrenze</th></tr></thead>
        <tbody>
            ${catOrder.map(k=>`<tr><td style="padding:4px;border-top:1px solid #555;">${k}</td><td style="padding:4px;text-align:right;border-top:1px solid #555;">${counts[k]||0}</td></tr>`).join('')}
        </tbody>
    </table>
`;
    // ordina alert per categoria
const sortedAlerts = alertsArr.slice().sort((a,b)=> {
    const getKey = s => s.split(':')[0];
    return catOrder.indexOf(getKey(a)) - catOrder.indexOf(getKey(b));
});
const detailsRows = sortedAlerts.map(e=>{
    const d = parseDetail(e);
    return `<tr>
        <td>${d.cat}</td>
        <td style="text-align:right;">${d.deposito}</td>
        <td style="text-align:right;">${d.prelievo}</td>
        <td style="text-align:right;">${d.tempo}</td>
        <td>${d.detail}</td>
    </tr>`;
}).join('');
const detailsHtml = `
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead>
            <tr>
                <th style="text-align:left;">Categoria</th>
                <th>Valore 1</th>
                <th>Valore 2</th>
                <th>Tempo</th>
                <th>Dettaglio</th>
            </tr>
        </thead>
        <tbody>${detailsRows}</tbody>
    </table>`;

    alertCard.innerHTML = `
    <h3>Anomalie AML / Fraud</h3>
    <p>Totale alert: <b>${alertsArr.length}</b></p>
    <ul>${summaryHtml}</ul>
    <canvas id="alertsChart" style="max-height:180px;margin-bottom:10px;"></canvas>
    <details>
        <summary style="cursor:pointer;">Mostra dettagli (${alertsArr.length})</summary>
        <div style="max-height:280px;overflow-y:auto;margin-top:6px;">${detailsHtml}</div>
    </details>
`;
    container.appendChild(alertCard);

    const ctx = document.getElementById('alertsChart').getContext('2d');
    new Chart(ctx,{
        type:'bar',
        data:{labels:catOrder, datasets:[{data:catOrder.map(k=>counts[k]||0)}]},
        options:{responsive:true, plugins:{legend:{display:false}}}
    });
}

// popola motivazioni
        const motivationsList = document.getElementById('motivationsList');
        motivationsList.innerHTML = "";
        results.motivations.forEach(motivation => {
            const li = document.createElement('li');
            li.innerText = motivation;
            motivationsList.appendChild(li);
        });

        // popola frazionate
        const frazionateSection = document.getElementById('frazionateSection');
        frazionateSection.innerHTML = "";
        if (results.frazionate.length === 0) {
            frazionateSection.innerHTML = "<p>Nessuna frazionata rilevata.</p>";
        } else {
            results.frazionate.forEach(f => {
                const div = document.createElement('div');
                div.style.marginBottom = "15px";
                div.style.padding = "10px";
                div.style.border = "1px solid #ddd";
                div.style.borderRadius = "5px";
                div.innerHTML = `
                    <p><b>Periodo:</b> ${f.start} → ${f.end}</p>
                    <p><b>Totale:</b> €${f.total.toFixed(2)}</p>
                    <p><b>Movimenti:</b></p>
                `;
                const ul = document.createElement('ul');
                f.transactions.forEach(t => {
                    const li = document.createElement('li');
                    const dateObj = new Date(t.date);
                    const formattedDate = dateObj.toISOString().slice(0, 19).replace('T', ' ');
                    li.className = "frazionata-mov";
                    li.innerText = `${formattedDate} | ${t.causale} | €${t.amount}`;
                    ul.appendChild(li);
                });
                div.appendChild(ul);
                frazionateSection.appendChild(div);
            });
        }

        // popola pattern AML
        const patternsSection = document.getElementById('patternsSection');
        patternsSection.innerHTML = "";
        if (results.patterns.length === 0) {
            patternsSection.innerHTML = "<p>Nessun pattern AML sospetto rilevato.</p>";
        } else {
            results.patterns.forEach(pat => {
                const p = document.createElement('p');
                p.style.marginBottom = "10px";
                p.innerText = pat;
                patternsSection.appendChild(p);
            });
        }

        // timeline movimenti (frazionate)
        const timelineCtx = document.getElementById('timelineChart').getContext('2d');
        const timelineLabels = results.frazionate.map(f => `${f.start} → ${f.end}`);
        const timelineData = results.frazionate.map(f => f.total);

        new Chart(timelineCtx, {
            type: 'line',
            data: {
                labels: timelineLabels,
                datasets: [{
                    label: 'Totale Frazionate',
                    data: timelineData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        
        // === DISTRIBUZIONE CAUSALI (Pie con click -> popup dettaglio) ===
        chrome.storage.local.get("amlTransactions", function(txData) {
          const allTx = txData.amlTransactions || [];

          // conteggio + mappa etichetta -> array movimenti
          const causaleCount = {};
          const causaleTxMap = {};

          allTx.forEach(tx => {
            const key = normalizeCausale(tx.causale);
            if (!causaleCount[key]) {
              causaleCount[key] = 0;
              causaleTxMap[key] = [];
            }
            causaleCount[key]++;

            // normalizza struttura transazione per la tabella popup
            const dt   = tx.dataStr || tx.data || tx.date || tx.Data || null;
            const caus = tx.causale || tx.Causale || '';
            const amt  = tx.importo ?? tx.amount ?? tx.Importo ?? tx.ImportoEuro ?? 0;

            causaleTxMap[key].push({
              rawDate: tx.data || tx.date || tx.Data || null, // raw Date obj
              displayDate: dt,
              date: (tx.data instanceof Date ? tx.data : (tx.date instanceof Date ? tx.date : (tx.Data instanceof Date ? tx.Data : null))),
              causale: caus,
              importo_raw: tx.importo_raw ?? tx.importoRaw ?? tx.amountRaw ?? tx.amount_str ?? tx.amountStr ?? amt,
              amount: Number(amt) || 0
            });
          });

          // ordina ogni array per data crescente
          Object.values(causaleTxMap).forEach(arr => {
            arr.sort((a,b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
          });

          const labels = Object.keys(causaleCount);
          const data   = Object.values(causaleCount);

          const causaliCtx = document.getElementById('causaliChart').getContext('2d');

          // palette originale
          const palette = ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40'];

          const causaliChart = new Chart(causaliCtx, {
            type: 'pie',
            data: {
              labels,
              datasets: [{
                data,
                backgroundColor: labels.map((_,i)=>palette[i%palette.length])
              }]
            },
            options: {
              responsive: true,
              plugins: {
                legend: {
                  position: 'top',
                  labels: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--fg') || '#fff'
                  }
                },
                tooltip: {
                  callbacks: {
                    label: function(ctx){
                      const lbl = ctx.label || '';
                      const val = ctx.raw;
                      const tot = data.reduce((s,n)=>s+n,0);
                      const pct = tot ? ((val/tot)*100).toFixed(1) : '0.0';
                      return `${lbl}: ${val} (${pct}%)`;
                    }
                  }
                }
              }
            }
          });
          window.causaliChart = causaliChart;
          window.causaliTxMap = causaleTxMap;

          // click handler sul canvas
          const canvas = causaliChart.canvas;
          canvas.addEventListener('click', function(evt){
            const points = causaliChart.getElementsAtEventForMode(evt, 'nearest', {intersect:true}, true);
            if (!points.length) return;
            const idx = points[0].index;
            const label = causaliChart.data.labels[idx];
            const txs = causaleTxMap[label] || [];
            openCausaliModal(label, txs);
          }, false);
        });

    

        // === ANALISI SESSIONI ORARIE ===
        if (results.sessions && Array.isArray(results.sessions)) {
            const nightSessions = results.sessions.filter(s => {
                const hour = new Date(s.timestamp).getHours();
                return (hour >= 22 || hour < 6);
            });
            const nightPercentage = ((nightSessions.length / results.sessions.length) * 100).toFixed(1);

            // aggiorna DOM con la percentuale
            const nightStat = document.getElementById("nightSessionStat");
            if (nightStat) nightStat.textContent = nightPercentage + "% delle sessioni sono tra le 22:00 e le 06:00";

            // HEATMAP ORARIA
            const hourMap = new Array(24).fill(0);
            results.sessions.forEach(s => {
                const hour = new Date(s.timestamp).getHours();
                hourMap[hour]++;
            });

            // crea grafico heatmap
            const ctx = document.getElementById('hourHeatmap').getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: [...Array(24).keys()].map(h => h + ":00"),
                    datasets: [{
                        label: 'Sessioni per ora',
                        data: hourMap,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

    });
});

/* ===============================================================
 * Popup dettaglio Causali Pie - helpers
 * =============================================================== */
(function(){
  const modal      = document.getElementById('causaliModal');
  const closeBtn   = document.getElementById('causaliModalClose');
  const titleEl    = document.getElementById('causaliModalTitle');
  const tableBody  = document.querySelector('#causaliModalTable tbody');
  const backdrop   = modal ? modal.querySelector('.causali-modal-backdrop') : null;

  if (closeBtn) closeBtn.addEventListener('click', closeCausaliModal);
  if (backdrop) backdrop.addEventListener('click', closeCausaliModal);
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape') closeCausaliModal();
  });

  window.openCausaliModal  = openCausaliModal;
  window.closeCausaliModal = closeCausaliModal;

  function openCausaliModal(label, txs){
    txs = Array.isArray(txs) ? txs : [];
    if(!modal) return;
    titleEl.textContent = `Movimenti: ${label} (${txs.length})`;
    renderCausaliModalRows(tableBody, txs);
    modal.removeAttribute('hidden');
  }
  function closeCausaliModal(){
    if(!modal) return;
    modal.setAttribute('hidden','');
  }
  
function renderCausaliModalRows(tbody, txs){
  if(!tbody) return;
  const rows = txs.map(tx=>{
    const d   = (tx.displayDate!=null && tx.displayDate!=='') ? tx.displayDate : fmtDateIT(tx.date ?? tx.rawDate);
    const cau = escapeHtml(tx.causale ?? '');
    const rawStrVal = (tx.importo_raw ?? tx.importoRaw ?? tx.rawAmount ?? tx.amountRaw ?? tx.amount_str ?? tx.amountStr);
    const rawStr = (rawStrVal==null) ? '' : String(rawStrVal).trim();
    if(rawStr){
      return `<tr><td>${d}</td><td>${cau}</td><td style="text-align:right">${rawStr}</td></tr>`;
    }
    const rawAmt = Number(tx.amount);
    const amt = isFinite(rawAmt) ? rawAmt.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';
    return `<tr><td>${d}</td><td>${cau}</td><td style="text-align:right">${amt}</td></tr>`;
  }).join('');
  tbody.innerHTML = rows || `<tr><td colspan="3" style="text-align:center;opacity:.7">Nessun movimento</td></tr>`;
}
function fmtDateIT(d){
    const dt = parseTxDate(d);
    if(!dt) return (d==null?'':String(d));
    // Mosti: mostra solo data (senza ora)
    try {
      return dt.toLocaleDateString('it-IT');
    } catch(_){
      return dt.toISOString().slice(0,10);
    }
  }
  
  // tenta di interpretare vari formati data: ISO, timestamp, dd/mm/yyyy, dd-mm-yyyy, 'yyyy-mm-dd hh:mm', ecc.
  function parseTxDate(v){
    if(!v && v!==0) return null;
    if(v instanceof Date && !isNaN(v)) return v;

    // numerico timestamp
    if(typeof v === 'number' || (/^\d+$/.test(String(v).trim()) && String(v).length>=10 && String(v).length<=13)){
      const num = Number(v);
      const ms = String(v).length>10 ? num : num*1000;
      const d = new Date(ms);
      return isNaN(d) ? null : d;
    }

    const s = String(v).trim();

    // ISO
    const iso = Date.parse(s);
    if(!isNaN(iso)) return new Date(iso);

    // dd/mm/yyyy or dd-mm-yyyy with optional time
    const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){
      let [_,d,mo,y,h,mi,se] = m;
      y = y.length===2 ? ('20'+y) : y;
      const dt = new Date(Number(y), Number(mo)-1, Number(d), Number(h||0), Number(mi||0), Number(se||0));
      return isNaN(dt) ? null : dt;
    }

    return null;
  }
function escapeHtml(str){
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
})();



/* === MOVIMENTI IMPORTANTI === */
chrome.storage.local.get("amlTransactions", function(txData) {
    const allTx = txData.amlTransactions || [];
    if (!allTx.length) return;

    const toDate = tx => new Date(tx.data || tx.date || tx.Data || tx.dataStr || 0);
    allTx.sort((a,b)=> toDate(a) - toDate(b)); // asc

    const amountAbs = tx => Math.abs(tx.importo ?? tx.amount ?? tx.Importo ?? tx.ImportoEuro ?? 0);
    const amountSigned = tx => Number(tx.importo ?? tx.amount ?? tx.Importo ?? tx.ImportoEuro ?? 0);
    const isWithdrawal = tx => /prelievo/i.test(tx.causale || tx.Causale || '');
    const isSession    = tx => /(session|scommessa)/i.test(tx.causale || tx.Causale || '');

    const top = arr => arr.sort((a,b)=> amountAbs(b) - amountAbs(a)).slice(0,5);
    const importantList = [...top(allTx.filter(isWithdrawal)), ...top(allTx.filter(isSession))];

    const seen = new Set();
    const important = importantList.filter(tx => {
        const key = (tx.dataStr || '') + (tx.causale || '') + amountAbs(tx);
        return !seen.has(key) && seen.add(key);
    });

    const rows = [];
    important.forEach(tx => {
        const idx = allTx.indexOf(tx);
        const start = Math.max(0, idx - 5);
        const end   = Math.min(allTx.length, idx + 6); // idx incluso
        for (let i=start; i<end; i++) {
            const t = allTx[i];
            const dat = t.dataStr || t.date || t.data || t.Data || '';
            const caus = t.causale || t.Causale || '';
            let rawAmt = amountSigned(t);
            const rawStr = (t.importo_raw ?? t.importoRaw ?? t.rawAmount ?? t.amountRaw ?? '').toString().trim();
            const amt = rawStr ? rawStr : rawAmt.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2});
            const hl = (t === tx) ? ' style="background:rgba(35,134,54,0.30)"' : '';
            const tsExt = t["TSN"] || t["TS extension"] || t["TS Extension"] || t["ts extension"] || t["TS_extension"] || t["TSExtension"] || '';
            const safeVal = String(tsExt).replace(/"/g,'&quot;');
            const tsCell = tsExt ? `<a href="#" class="tsn-link" data-tsext="${safeVal}">${tsExt}</a>` : '';
            rows.push(`<tr${hl}><td>${dat}</td><td>${caus}</td><td>${tsCell}</td><td style="text-align:right;">${rawStr ? rawStr : amt}</td></tr>`);
        }
        rows.push('<tr><td colspan="4" style="background:#30363d;height:2px;"></td></tr>');
    });

    const container = document.getElementById('movimentiImportantiSection');
    if (container) {
        container.innerHTML = `
            <table class="tx-table">
                <thead><tr><th>Data</th><th>Causale</th><th>TSN</th><th>Importo</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        `;
        container.querySelectorAll('.tsn-link').forEach(link=>{
            link.addEventListener('click', function(e){
                e.preventDefault();
                const val = this.getAttribute('data-tsext');
                if(!val) return;
                const modal = document.getElementById('causaliModal');
                const titleEl = document.getElementById('causaliModalTitle');
                const tableBody = document.querySelector('#causaliModalTable tbody');
                if(modal && titleEl && tableBody){
                    titleEl.textContent = 'Dettaglio Game Session ' + val;
                    tableBody.innerHTML = '<tr><td colspan="3" style="padding:0"><iframe src="https://starvegas-gest.admiralbet.it/DettaglioGiocataSlot.asp?GameSessionID='+encodeURIComponent(val)+'" style="width:100%;height:70vh;border:0;"></iframe></td></tr>';
                    modal.removeAttribute('hidden');
                }else{
                    window.open('https://starvegas-gest.admiralbet.it/DettaglioGiocataSlot.asp?GameSessionID='+encodeURIComponent(val),'_blank');
                }
            });
        });
    }
});