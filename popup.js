
let transactions = [];
let sessionTimestamps = [];

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('fileInput').addEventListener('change', handleFile, false);
    document.getElementById('analyzeButton').addEventListener('click', runAnalysis, false);
    document.getElementById('analysisLink').addEventListener('click', function() {
        chrome.tabs.create({ url: chrome.runtime.getURL('analysis.html') });
    });
});

function handleFile(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Individua la riga di intestazione cercando le colonne "Causale/Reason" e "Importo/Amount"
        let headerIdx = 0;
        for (let i = 0; i < jsonData.length; i++) {
            const r = jsonData[i];
            if (!r || r.length < 9) continue;
            const c7 = String(r[7] || '').toLowerCase();
            const c8 = String(r[8] || '').toLowerCase();
            if ((c7.includes('caus') || c7.includes('reason')) && (c8.includes('importo') || c8.includes('amount'))) {
                headerIdx = i;
                break;
            }
        }

        const headerRow = (jsonData[headerIdx] || []).map(h => (typeof h === 'string' ? h.trim() : h));

        // Trova indice colonna TSN / TS extension (case-insensitive, ignora spazi)
        const tsIndex = headerRow.findIndex(h => {
            if (!h) return false;
            const norm = String(h).toLowerCase().replace(/\s+/g, '');
            return norm.includes('tsn') || norm.includes('tsextension');
        });
        console.log('[Toppery AML] Header row:', headerRow, 'TS index:', tsIndex);

        const rows = jsonData.slice(headerIdx + 1).filter(row => row.length >= 9 && row[0] && row[7] && row[8]);
        transactions = rows.map(row => {
            const dataStr = row[0];
            const causale = row[7];
            const importo = parseFloat(String(row[8]).replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.'));
            const dataObj = parseDate(dataStr);
            const tsVal = tsIndex !== -1 ? row[tsIndex] : '';
            const tx = { data: dataObj, dataStr: dataStr, causale: causale, importo: importo, importo_raw: row[8] };
            if (tsIndex !== -1 && tsVal != null && tsVal !== '') {
                tx["TSN"] = tsVal;
                tx["TS extension"] = tsVal;
            }
            return tx;
        }).filter(tx => tx.data instanceof Date && !isNaN(tx.data));
        // Salva timestamp per analisi sessioni orarie
        sessionTimestamps = transactions.map(tx => ({ timestamp: tx.data.toISOString() }));

        console.log("Transactions parsed:", transactions);

        if (transactions.length > 0) {
            document.getElementById('analyzeButton').style.display = 'block';
        }
    };
    reader.readAsArrayBuffer(file);
}

function runAnalysis() {
    const frazionate = cercaFrazionate(transactions);
    const patterns = cercaPatternAML(transactions);
    const scoringResult = calcolaScoring(frazionate, patterns);
    const alerts = rilevaAlertAML(transactions);

    console.log("Frazionate trovate:", frazionate);
    console.log("Pattern AML trovati:", patterns);
    console.log("Scoring:", scoringResult);

    const results = {
        riskScore: scoringResult.score,
        riskLevel: scoringResult.level,
        motivations: scoringResult.motivations,
        frazionate: frazionate,
        patterns: patterns,
        alerts: alerts,
        sessions: sessionTimestamps
    };

    chrome.storage.local.set({ amlResults: results, amlTransactions: transactions }, function() {
        document.getElementById('analysisLink').style.display = 'block';
    });
}

function parseDate(dateStr) {
    const parts = dateStr.split(/[\s/:]/);
    if (parts.length >= 6) {
        return new Date(parts[2], parts[1] - 1, parts[0], parts[3], parts[4], parts[5]);
    }
    return new Date(dateStr);
}




function cercaFrazionate(transactions) {
    // La finestra si segnala solo se la somma SUPERA €4 999
    const THRESHOLD = 4999; // numero intero senza separatori per compatibilità browser
    const frazionate = [];

    // Normalizza la data a inizio giornata (ignora ore/minuti)
    const startOfDay = d => {
        const t = new Date(d);
        t.setHours(0, 0, 0, 0);
        return t;
    };

    const fmtDateLocal = d => {
        const dt = startOfDay(d);
        const y = dt.getFullYear();
        const m = String(dt.getMonth()+1).padStart(2,'0');
        const da = String(dt.getDate()).padStart(2,'0');
        return `${y}-${m}-${da}`;
    };
    // Consideriamo solo i depositi (“Ricarica conto gioco per accredito diretto”)
    const depositi = transactions
        .filter(tx => tx.causale === "Ricarica conto gioco per accredito diretto")
        .sort((a, b) => a.data - b.data);

    /* ------------------------------------------------------------------
     * Rolling window di 7 giorni:
     * 1. La finestra parte dalla transazione i‑esima e termina dopo 6 giorni.
     * 2. Sommiamo i depositi finché la somma SUPERA la soglia.
     * 3. Quando la soglia è superata, includiamo TUTTI i depositi che cadono
     *    nello STESSO giorno solare dell’ultima operazione che ha fatto
     *    sforare la soglia.
     * 4. La ricerca successiva riparte dal primo deposito del giorno
     *    successivo (non dalla transazione successiva se è nello stesso
     *    giorno).
     * ------------------------------------------------------------------ */
    let i = 0;
    while (i < depositi.length) {
        const windowStart = startOfDay(depositi[i].data);
        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowEnd.getDate() + 6); // inclusivo

        let running = 0;
        const collected = [];
        let j = i;

        while (j < depositi.length && depositi[j].data <= windowEnd) {
            running += Math.abs(depositi[j].importo);
            collected.push(depositi[j]);

            if (running > THRESHOLD) {
                // Giorno in cui si è superata la soglia
                const sogliaDay = startOfDay(depositi[j].data);

                // Includi ogni altro deposito che cade nello stesso giorno
                j++;
                while (
                    j < depositi.length &&
                    startOfDay(depositi[j].data).getTime() === sogliaDay.getTime()
                ) {
                    running += Math.abs(depositi[j].importo);
                    collected.push(depositi[j]);
                    j++;
                }

                // Registra la frazionata
                frazionate.push({
                    start: fmtDateLocal(windowStart),
                    end: fmtDateLocal(sogliaDay),
                    total: running,
                    transactions: collected.map(t => ({
                        date: t.data.toISOString(),
                        amount: t.importo,
                        causale: t.causale
                    }))
                });

                // Riprendi dal primo deposito del giorno successivo
                i = j;
                break;
            }
            j++;
        }

        if (running <= THRESHOLD) {
            // Soglia non superata: avanza di una transazione
            i++;
        }
    }

    return frazionate;
}



            

function cercaPatternAML(transactions) {
    const patterns = [];

    const depositi = transactions.filter(tx => tx.causale === "Ricarica conto gioco per accredito diretto");
    const prelievi = transactions.filter(tx => tx.causale.toLowerCase().includes("prelievo"));
    for (let dep of depositi) {
        const matchingPrelievi = prelievi.filter(pr => {
            const diffTime = pr.data - dep.data;
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= 2;
        });
        if (matchingPrelievi.length > 0) {
            patterns.push("Ciclo deposito-prelievo rapido rilevato");
            break;
        }
    }

    const bonusTx = transactions.filter(tx => tx.causale.toLowerCase().includes("bonus"));
    for (let bonus of bonusTx) {
        const prelieviDopoBonus = prelievi.filter(pr => pr.data > bonus.data);
        if (prelieviDopoBonus.length > 0) {
            patterns.push("Abuso bonus sospetto rilevato");
            break;
        }
    }

    return patterns;
}

function calcolaScoring(frazionate, patterns) {
    let score = 0;
    const motivations = [];

    if (frazionate.length > 0) {
        score += 40;
        motivations.push("Frazionate rilevate");
    }

    patterns.forEach(pattern => {
        if (pattern.includes("Ciclo deposito-prelievo")) {
            score += 20;
            motivations.push("Ciclo deposito-prelievo rapido rilevato");
        }
        if (pattern.includes("Abuso bonus")) {
            score += 20;
            motivations.push("Abuso bonus sospetto rilevato");
        }
    });

    let level = "Low";
    if (score > 65) {
        level = "High";
    } else if (score > 30) {
        level = "Medium";
    }

    return { score, level, motivations };
}

/**
 * Rileva alert AML/Fraud su movimenti:
 * - Velocity deposit (>=3 depositi in 10min)
 * - Structured deposits (>=5 depositi <=200€ in 24h)
 * - Round-trip cash‑out (deposito\u2192prelievo <=60min con gameplay <10% deposito)
 * - Bonus abuse (bonus\u2192prelievo <=60min con gameplay < bonus)
 */
function rilevaAlertAML(txs){
    const alerts = [];
    const norm = s => (s||'').toLowerCase();

    // classificazione base
    const classify = c => {
        const cl = norm(c);
        if (cl.includes('ricarica') || cl.includes('deposit')) return 'deposit';
        if (cl.includes('prelievo') || cl.includes('withdraw')) return 'withdraw';
        if (cl.includes('bonus')) return 'bonus';
        if (cl.includes('session')) return 'session';
        return 'other';
    };

    const moves = txs.map(tx => ({ ...tx, type: classify(tx.causale) }))
                     .sort((a,b) => a.data - b.data);

    /* ---- 1. Velocity deposit: ≥3 depositi da >=€500 in ≤10 min ---- */
    const V_N = 3, V_MIN = 10, V_AMT = 500;
    let win = [];
    for(const m of moves){
        if(m.type !== 'deposit' || Math.abs(m.importo) < V_AMT) continue;
        win.push(m);
        while(win.length && (m.data - win[0].data)/60000 > V_MIN){ win.shift(); }

        if(win.length >= V_N){
            alerts.push(`Velocity deposit: ${win.length} depositi >=€${V_AMT} in ${V_MIN} min (ultimo ${m.data.toLocaleString()})`);
            win = [];
        }
    }

    /* ---- 2. Bonus concentration: mostra ogni bonus individualmente se viene rilevata concentrazione ≥2 bonus in 24h ---- */
    const B_N = 2, B_H = 24;
    win = [];
    let flagged = new Set();
    for(const m of moves){
        if(m.type !== 'bonus') continue;
        win.push(m);
        while(win.length && (m.data - win[0].data)/3600000 > B_H){ win.shift(); }

        if(win.length >= B_N){
            // registra ogni bonus nella finestra, se non già registrato
            win.forEach(b=>{
                if(flagged.has(b)) return;
                alerts.push(`Bonus concentration: bonus €${Math.abs(b.importo).toFixed(2)} (${b.data.toLocaleString()})`);
                flagged.add(b);
            });
        }
    }

    /* ---- 3. Casino live sessions ---- */
    const liveSessions = moves.filter(m => m.type==='session' && norm(m.causale).includes('live'));
    if(liveSessions.length){
        alerts.push(`Casino live: ${liveSessions.length} sessioni live rilevate`);
    }

    return alerts;
}
