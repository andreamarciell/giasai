(() => {
/* ---------- Costanti ---------- */
const SECTION_ID = "accessiSection";
const INPUT_ID   = "ipFileInput";
const BTN_ID     = "analyzeIpBtn";
const WRAP_ID    = "ipTableWrapper";

/* ---------- Spinner CSS (una volta) ---------- */
function ensureSpinnerStyle(){
    if(document.getElementById('accessiSpinnerStyle')) return;
    const style = document.createElement('style');
    style.id = 'accessiSpinnerStyle';
    style.textContent = `@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    .loader{border:4px solid #333;border-top:4px solid #58a6ff;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:25px auto;}`;
    document.head.appendChild(style);
}

/* ---------- Helper IP ---------- */
const ipRegex = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/;
function isValidIp(ip){ return ipRegex.test(ip); }
function isPrivateIp(ip){ return /^(10\.|127\.|192\.168\.|0\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip); }

/* ---------- Geo lookup ---------- */
const GEO1 = ip=>`https://ipapi.co/${ip}/json/`;
const GEO2 = ip=>`https://ipwho.is/${ip}`;
async function geoLookup(ip){
    if(!isValidIp(ip))  return { ip, paese:'non valido', isp:'-' };
    if(isPrivateIp(ip)) return { ip, paese:'privato',     isp:'-' };
    try{
        const r = await fetch(GEO1(ip));
        const j = await r.json();
        if(!r.ok || j.error) throw new Error(j.reason||r.status);
        return { ip, paese:j.country_name||'?', isp:j.org||j.company?.name||'?' };
    }catch(_){
        try{
            const r2 = await fetch(GEO2(ip));
            const j2 = await r2.json();
            if(!j2 || j2.success===false) throw new Error(j2.message||r2.status);
            return { ip, paese:j2.country||'?', isp:j2.connection?.isp||j2.connection?.org||j2.isp||j2.org||'?' };
        }catch(err){
            return { ip, paese:`errore (${err.message})`, isp:'-' };
        }
    }
}

/* ---------- UI injection ---------- */
function ensureUI(){
    const nav = document.querySelector('.nav-menu');
    if(nav && !nav.querySelector(`[data-target="${SECTION_ID}"]`)){
        nav.insertAdjacentHTML('beforeend', `<button class="menu-item" data-target="${SECTION_ID}">Accessi</button>`);
    }
    const container = document.querySelector('.container');
    if(container && !document.getElementById(SECTION_ID)){
        container.insertAdjacentHTML('beforeend', `
            <section id="${SECTION_ID}" class="content-section" style="display:none;">
                <h2>Accessi – Analisi IP</h2>
                <input type="file" id="${INPUT_ID}" accept=".xls,.xlsx" />
                <button id="${BTN_ID}" disabled style="margin-left:8px;">Analizza</button>
                <div id="${WRAP_ID}" style="margin-top:15px;"></div>
            </section>`);
    }
}

/* ---------- Menu delegato ---------- */
function hookMenu(){
    const nav = document.querySelector('.nav-menu');
    if(!nav || nav.dataset.accessiHooked) return;
    nav.dataset.accessiHooked='1';
    nav.addEventListener('click', e=>{
        const btn = e.target.closest('.menu-item');
        if(!btn) return;
        const tgt = btn.dataset.target;
        nav.querySelectorAll('.menu-item').forEach(b=>b.classList.toggle('active', b===btn));
        document.querySelectorAll('.content-section').forEach(sec=>sec.style.display = sec.id===tgt?'block':'none');
    }, true);
}

/* ---------- File analysis ---------- */
async function analyzeFile(file){
    ensureSpinnerStyle();
    const wrap = document.getElementById(WRAP_ID);
    wrap.innerHTML = '<div class="loader"></div>';

    try{
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf,{type:'array'});
        const rows= XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});

        // Trova header contenente alias IP in qualsiasi riga
        const aliases = ['ip','ipaddress','ip address','ip_addr','indirizzoip','indirizzo ip'];
        const headerRowIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => aliases.includes(String(c).toLowerCase().replace(/\s+/g,''))));
        let ips = [];
        if(headerRowIdx!==-1){
            const ipColIdx = rows[headerRowIdx].findIndex(c => aliases.includes(String(c).toLowerCase().replace(/\s+/g,'')));
            ips = rows.slice(headerRowIdx+1).filter(r=>Array.isArray(r)&&r[ipColIdx]).map(r=>String(r[ipColIdx]).trim());
        }
        // Fallback: scan every cell
        if(!ips.length){
            rows.forEach(r=>{ if(!Array.isArray(r)) return; r.forEach(cell=>{ const m=String(cell||'').match(ipRegex); if(m) ips.push(m[0]);}); });
        }
        ips = [...new Set(ips.filter(Boolean))];
        if(!ips.length){ wrap.textContent='Nessun IP rilevato.'; return; }

        const out=[];
        for(const ip of ips){
            out.push(await geoLookup(ip));
            await new Promise(r=>setTimeout(r,200)); // 5 req/s
        }
        renderTable(out);
    }catch(err){
        console.error(err);
        wrap.textContent = 'Errore durante l\'analisi.';
    }
}

function renderTable(list){
    const rowsHtml = list.map(r=>`<tr><td>${r.ip}</td><td>${r.paese}</td><td>${r.isp}</td></tr>`).join('');
    document.getElementById(WRAP_ID).innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr><th>IP</th><th>Paese / Stato</th><th>ISP / Org</th></tr></thead>
        <tbody>${rowsHtml}</tbody></table>`;
}

/* ---------- Listeners ---------- */
function attachListeners(){
    const input  = document.getElementById(INPUT_ID);
    const button = document.getElementById(BTN_ID);
    if(!input || !button) return;
    if(!input.dataset.hooked){
        input.dataset.hooked='1';
        input.addEventListener('change', ()=>{ button.disabled = !(input.files && input.files.length); });
    }
    if(!button.dataset.hooked){
        button.dataset.hooked='1';
        button.addEventListener('click', ()=>{ const f=input.files[0]; if(f) analyzeFile(f); });
    }
}

/* ---------- Init ---------- */
function init(){
    ensureUI();
    hookMenu();
    attachListeners();
}
if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
}else{ init(); }

})();
