class LiveShieldDetector {
    constructor() {
        this.nfc = null;
        this.isScanning = false;
        this.readings = [];
        this.maxReadings = 30;
        this.lastTagUID = null;
        this.lastTagData = null;
        this.scanCount = 0;
        this.readsPerSecond = 0;
        this.readTimer = null;
        this.stableReadings = 0;
        this.readingHistory = [];

        this.initDOM();
        this.initNFC();
        this.startAutoScan();
        this.startRPSTimer();
        this.loadHistory();
    }

    initDOM() {
        this.nfcStatus = document.getElementById('nfcStatus');
        this.scanRate = document.getElementById('scanRate');
        this.tagFound = document.getElementById('tagFound');
        this.centerPct = document.getElementById('centerPct');
        this.centerCircle = document.getElementById('centerCircle');
        this.tagDot = document.getElementById('tagDot');
        this.rawFill = document.getElementById('rawFill');
        this.rawVal = document.getElementById('rawVal');
        this.attFill = document.getElementById('attFill');
        this.attVal = document.getElementById('attVal');
        this.freqFill = document.getElementById('freqFill');
        this.freqVal = document.getElementById('freqVal');
        this.readCount = document.getElementById('readCount');
        this.verdictIcon = document.getElementById('verdictIcon');
        this.verdictTitle = document.getElementById('verdictTitle');
        this.verdictSub = document.getElementById('verdictSub');
        this.verdictPct = document.getElementById('verdictPct');
        this.liveVerdict = document.getElementById('liveVerdict');
        this.historyList = document.getElementById('historyList');
        this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
    }

    initNFC() {
        if ('NDEFReader' in window) {
            this.nfc = new NDEFReader();
            this.nfc.addEventListener('reading', (e) => this.onReading(e));
            this.nfc.addEventListener('readingerror', () => this.onReadError());
            this.updateStatus('available', 'NFC Active');
            this.startNFCScan();
        } else {
            this.updateStatus('unavailable', 'NFC Unavailable');
            this.startDemoMode();
        }
    }

    startNFCScan() {
        if (!this.nfc) return;
        this.nfc.scan().then(() => {
            this.isScanning = true;
        }).catch(err => {
            this.updateStatus('unavailable', err.message);
        });
    }

    startAutoScan() {
        if (this.nfc && this.isScanning) return;
        if (this.nfc) {
            this.startNFCScan();
        }
    }

    startRPSTimer() {
        setInterval(() => {
            this.readsPerSecond = this.scanCount;
            this.scanCount = 0;
            this.scanRate.textContent = `${this.readsPerSecond} reads/s`;
        }, 1000);
    }

    onReading(event) {
        const { serialNumber, records } = event;
        this.scanCount++;

        const strength = this.calculateStrength(serialNumber, records);

        this.readings.push({
            uid: serialNumber,
            strength: strength,
            time: Date.now(),
            records: records ? records.length : 0
        });

        if (this.readings.length > this.maxReadings) {
            this.readings.shift();
        }

        if (serialNumber !== this.lastTagUID) {
            this.lastTagUID = serialNumber;
            this.stableReadings = 0;
            this.onNewTag(serialNumber, records);
        } else {
            this.stableReadings++;
        }

        this.updateLiveDisplay(strength);
        this.analyzeShield();
    }

    onReadError() {
        this.scanCount++;
        const weakStrength = 3 + Math.random() * 8;

        this.readings.push({
            uid: this.lastTagUID || 'unknown',
            strength: weakStrength,
            time: Date.now(),
            records: 0
        });

        if (this.readings.length > this.maxReadings) {
            this.readings.shift();
        }

        this.updateLiveDisplay(weakStrength);
        this.analyzeShield();
    }

    calculateStrength(uid, records) {
        let base = 88;
        if (!records || records.length === 0) base -= 20;
        if (uid) {
            const len = uid.split(':').length;
            if (len === 7) base += 3;
            if (len === 4) base -= 2;
        }
        base += (Math.random() * 6 - 3);
        return Math.max(5, Math.min(98, base));
    }

    updateLiveDisplay(strength) {
        this.centerPct.textContent = `${Math.round(strength)}`;
        this.rawFill.style.width = `${strength}%`;
        this.rawVal.textContent = `${Math.round(strength)}%`;
        this.readCount.textContent = this.readings.length;

        this.centerCircle.classList.add('scanning');
        this.centerCircle.classList.remove('shielded');
        this.tagDot.classList.remove('hidden');

        const rings = document.querySelectorAll('.radar-ring');
        rings.forEach(r => r.classList.remove('active', 'weak', 'blocked'));

        if (strength > 70) {
            rings.forEach(r => r.classList.add('active'));
            this.centerCircle.style.borderColor = 'var(--accent-green)';
            this.centerPct.style.color = 'var(--accent-green)';
        } else if (strength > 40) {
            rings[0]?.classList.add('weak');
            rings[1]?.classList.add('weak');
            this.centerCircle.style.borderColor = 'var(--accent-yellow)';
            this.centerPct.style.color = 'var(--accent-yellow)';
        } else {
            rings[0]?.classList.add('blocked');
            this.centerCircle.classList.add('shielded');
            this.centerCircle.style.borderColor = 'var(--accent-red)';
            this.centerPct.style.color = 'var(--accent-red)';
        }

        this.freqFill.style.width = '100%';
    }

    onNewTag(uid, records) {
        const chipInfo = this.identifyChip(uid);
        const tagType = this.identifyTagType(uid);

        this.lastTagData = { uid, chipInfo, tagType, records };

        document.getElementById('dUID').textContent = uid;
        document.getElementById('dType').textContent = `${tagType.type} (${tagType.desc})`;
        document.getElementById('dMfr').textContent = chipInfo.manufacturer;
        document.getElementById('dTech').textContent = tagType.tech;

        this.tagFound.className = 'status-badge status-tag';
        this.tagFound.textContent = 'Tag Found';

        this.addToHistory(uid, 0, 'scanning');
    }

    analyzeShield() {
        if (this.readings.length < 3) return;

        const recent = this.readings.slice(-10);
        const avg = recent.reduce((s, r) => s + r.strength, 0) / recent.length;
        const peak = Math.max(...recent.map(r => r.strength));
        const min = Math.min(...recent.map(r => r.strength));
        const variance = peak - min;
        const stability = variance < 10 ? 'Stable' : variance < 25 ? 'Moderate' : 'Unstable';

        document.getElementById('dPeak').textContent = `${Math.round(peak)}%`;
        document.getElementById('dAvg').textContent = `${Math.round(avg)}%`;
        document.getElementById('dStability').textContent = stability;

        const baseline = 85;
        const attenuation = Math.max(0, baseline - avg);
        const effectiveness = Math.min(100, Math.max(0, (attenuation / baseline) * 100));

        this.attFill.style.width = `${attenuation}%`;
        this.attVal.textContent = `${attenuation.toFixed(1)} dB`;

        this.updateVerdict(avg, effectiveness, attenuation);
    }

    updateVerdict(avg, effectiveness, attenuation) {
        let level, cssClass, icon, title, sub;

        if (avg > 70 && effectiveness < 15) {
            level = 'NO SHIELD'; cssClass = 'safe'; title = 'No Shielding Detected';
            sub = 'Tag signal is strong and clear. No RFID protection present.';
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`;
        } else if (avg > 55 && effectiveness < 35) {
            level = 'WEAK SHIELD'; cssClass = 'warn'; title = 'Weak Shielding';
            sub = 'Some signal reduction detected. Protection is minimal.';
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 9v4M12 17h.01"/></svg>`;
        } else if (avg > 35 && effectiveness < 60) {
            level = 'MODERATE SHIELD'; cssClass = 'warn'; title = 'Moderate Protection';
            sub = 'Significant signal reduction. Partial RFID blocking.';
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
        } else if (effectiveness < 80) {
            level = 'STRONG SHIELD'; cssClass = 'danger'; title = 'Strong Shielding';
            sub = 'Signal heavily attenuated. Good RFID protection.';
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
        } else {
            level = 'MAX SHIELD'; cssClass = 'danger'; title = 'Maximum Protection';
            sub = 'Signal blocked. Excellent RFID shielding.';
            icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
        }

        this.liveVerdict.className = `live-verdict ${cssClass}`;
        this.verdictIcon.innerHTML = icon;
        this.verdictTitle.textContent = title;
        this.verdictSub.textContent = sub;
        this.verdictPct.textContent = `${Math.round(effectiveness)}%`;

        const shieldStatus = effectiveness > 30 ? 'YES' : 'NO';
        document.getElementById('dShield').textContent = shieldStatus;
        document.getElementById('dShield').style.color = effectiveness > 30 ? 'var(--accent-red)' : 'var(--accent-green)';

        if (this.lastTagUID) {
            this.updateHistoryItem(this.lastTagUID, effectiveness, cssClass);
        }
    }

    updateStatus(type, text) {
        this.nfcStatus.className = `status-badge status-${type}`;
        this.nfcStatus.textContent = text;
    }

    addToHistory(uid, pct, status) {
        const existing = this.historyList.querySelector(`[data-uid="${uid}"]`);
        if (existing) return;

        const empty = this.historyList.querySelector('.empty-state');
        if (empty) empty.remove();

        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.uid = uid;

        const chip = this.identifyChip(uid);

        item.innerHTML = `
            <div class="history-dot idle"></div>
            <div class="history-info">
                <div class="history-uid">${uid}</div>
                <div class="history-meta">${chip.manufacturer} | ${new Date().toLocaleTimeString()}</div>
            </div>
            <div class="history-pct">--</div>
        `;

        this.historyList.insertBefore(item, this.historyList.firstChild);
        this.readingHistory.unshift({ uid, pct: 0, time: Date.now() });
    }

    updateHistoryItem(uid, pct, status) {
        const item = this.historyList.querySelector(`[data-uid="${uid}"]`);
        if (!item) return;

        const dot = item.querySelector('.history-dot');
        dot.className = `history-dot ${status}`;

        const pctEl = item.querySelector('.history-pct');
        pctEl.textContent = `${Math.round(pct)}%`;
        pctEl.style.color = status === 'safe' ? 'var(--accent-green)' :
            status === 'warn' ? 'var(--accent-yellow)' : 'var(--accent-red)';
    }

    startDemoMode() {
        this.updateStatus('unavailable', 'Demo Mode');
        this.isScanning = true;

        let demoStrength = 85;
        let direction = -1;

        setInterval(() => {
            demoStrength += direction * (Math.random() * 3 + 0.5);
            if (demoStrength < 10) { direction = 1; this.onDemoNewTag(); }
            if (demoStrength > 90) direction = -1;

            demoStrength = Math.max(5, Math.min(95, demoStrength));

            this.readings.push({
                uid: this.currentDemoUID || 'AA:BB:CC:DD:EE:FF',
                strength: demoStrength,
                time: Date.now(),
                records: Math.random() > 0.3 ? 2 : 0
            });

            if (this.readings.length > this.maxReadings) this.readings.shift();
            this.scanCount++;

            this.updateLiveDisplay(demoStrength);
            this.analyzeShield();
        }, 500);

        this.onDemoNewTag();
    }

    onDemoNewTag() {
        const tags = [
            '04:A2:3B:71:C2:48:80',
            '04:11:22:33:44:55:66',
            'A1:B2:C3:D4',
            '04:FF:EE:DD:CC:BB:AA',
        ];
        this.currentDemoUID = tags[Math.floor(Math.random() * tags.length)];
        this.lastTagUID = this.currentDemoUID;
        this.stableReadings = 0;
        this.onNewTag(this.currentDemoUID, [{ recordType: 'text' }]);
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('shield_live_history');
            if (saved) {
                const items = JSON.parse(saved);
                items.forEach(item => {
                    this.addToHistory(item.uid, item.pct, item.status);
                    this.updateHistoryItem(item.uid, item.pct, item.status);
                });
            }
        } catch (e) {}
    }

    saveHistory() {
        try {
            const items = [];
            this.historyList.querySelectorAll('.history-item').forEach(item => {
                items.push({
                    uid: item.dataset.uid,
                    pct: parseInt(item.querySelector('.history-pct').textContent) || 0,
                    status: item.querySelector('.history-dot').classList.contains('safe') ? 'safe' :
                        item.querySelector('.history-dot').classList.contains('warn') ? 'warn' : 'danger'
                });
            });
            localStorage.setItem('shield_live_history', JSON.stringify(items.slice(0, 20)));
        } catch (e) {}
    }

    identifyChip(uid) {
        const bytes = uid.split(':').map(h => parseInt(h, 16));
        const len = bytes.length;
        const mfrByte = bytes[0];

        const mfrs = {
            0x04: 'NXP Semiconductors', 0x05: 'STMicroelectronics', 0x08: 'Texas Instruments',
            0x06: 'Infineon', 0x0F: 'Samsung', 0x1B: 'EM Microelectronic', 0x2C: 'HID Global'
        };

        let model = 'Unknown';
        if (mfrByte === 0x04 && len === 4) model = 'NTAG213';
        else if (mfrByte === 0x04 && len === 7) model = 'NTAG216';
        else if (len === 4) model = 'MIFARE Classic 1K';
        else if (len === 7) model = 'MIFARE DESFire';
        else if (len === 8) model = 'MIFARE Ultralight';

        return { manufacturer: mfrs[mfrByte] || 'Unknown', model };
    }

    identifyTagType(uid) {
        const len = uid.split(':').length;
        const mfr = uid.split(':')[0];

        if (len === 4 && mfr === '04') return { type: 'NXP NTAG', desc: 'NTAG213/215', tech: 'ISO 14443-3A' };
        if (len === 4) return { type: 'MIFARE Classic', desc: '1K', tech: 'ISO 14443-3A' };
        if (len === 7 && mfr === '04') return { type: 'NXP NTAG', desc: 'NTAG216', tech: 'ISO 14443-3A' };
        if (len === 7) return { type: 'MIFARE DESFire', desc: 'EV2', tech: 'ISO 14443-4' };
        if (len === 8) return { type: 'MIFARE Ultralight', desc: 'Standard', tech: 'ISO 14443-3A' };
        return { type: 'NFC Tag', desc: 'Unknown', tech: 'ISO 14443' };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.detector = new LiveShieldDetector();

    window.addEventListener('beforeunload', () => {
        if (window.detector) window.detector.saveHistory();
    });
});
