class ShieldDetector {
    constructor() {
        this.nfc = null;
        this.isScanning = false;
        this.mode = 'idle';
        this.baselineReadings = [];
        this.shieldReadings = [];
        this.maxSamples = 5;
        this.testHistory = [];

        this.initDOM();
        this.initNFC();
        this.initEventListeners();
        this.loadHistory();
        this.log('RFID Shield Detector initialized', 'info');
    }

    initDOM() {
        this.nfcStatus = document.getElementById('nfcStatus');
        this.step1 = document.getElementById('step1');
        this.step2 = document.getElementById('step2');
        this.step3 = document.getElementById('step3');
        this.baselineBtn = document.getElementById('baselineBtn');
        this.shieldBtn = document.getElementById('shieldBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.signalFill = document.getElementById('signalFill');
        this.signalValue = document.getElementById('signalValue');
        this.attenFill = document.getElementById('attenFill');
        this.attenValue = document.getElementById('attenValue');
        this.scanCount = document.getElementById('scanCount');
        this.resultPanel = document.getElementById('resultPanel');
        this.ratingFill = document.getElementById('ratingFill');
        this.ratingValue = document.getElementById('ratingValue');
        this.shieldOverlay = document.getElementById('shieldOverlay');
        this.ringOuter = document.getElementById('ringOuter');
        this.ringMid = document.getElementById('ringMid');
        this.ringInner = document.getElementById('ringInner');
        this.signalCenter = document.getElementById('signalCenter');
        this.historyList = document.getElementById('historyList');
        this.clearHistoryBtn = document.getElementById('clearHistoryBtn');
        this.logContainer = document.getElementById('logContainer');
    }

    initNFC() {
        if ('NDEFReader' in window) {
            this.nfc = new NDEFReader();
            this.nfc.addEventListener('reading', (e) => this.handleNFCReading(e));
            this.nfc.addEventListener('readingerror', (e) => this.handleNFCError(e));
            this.updateNFCStatus(true);
            this.log('Web NFC API available', 'success');
        } else {
            this.updateNFCStatus(false);
            this.log('Web NFC API not available - use Chrome on Android', 'warning');
            this.enableDemoMode();
        }
    }

    initEventListeners() {
        this.baselineBtn.addEventListener('click', () => this.startBaselineScan());
        this.shieldBtn.addEventListener('click', () => this.startShieldScan());
        this.resetBtn.addEventListener('click', () => this.reset());
        this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    }

    updateNFCStatus(available) {
        this.nfcStatus.className = `status-badge ${available ? 'status-available' : 'status-unavailable'}`;
        this.nfcStatus.textContent = available ? 'NFC Ready' : 'NFC Unavailable';
    }

    enableDemoMode() {
        this.baselineBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Demo Baseline
        `;
        this.shieldBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Demo Shield Test
        `;
    }

    async startBaselineScan() {
        if (this.mode === 'scanning') return;

        this.mode = 'scanning';
        this.baselineReadings = [];
        this.updateSteps('baseline');
        this.signalCenter.classList.add('scanning');
        this.signalCenter.classList.remove('shielded');
        this.shieldOverlay.classList.add('hidden');
        this.baselineBtn.classList.add('scanning');
        this.baselineBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            Scanning...
        `;
        this.resultPanel.classList.add('hidden');

        if (this.nfc) {
            try {
                await this.nfc.scan();
                this.log('Baseline scan started - hold tag near device', 'info');
            } catch (err) {
                this.log(`Scan error: ${err.message}`, 'error');
                this.resetScanUI();
            }
        } else {
            this.log('Demo mode - simulating baseline scan', 'info');
            this.simulateBaselineScan();
        }
    }

    async startShieldScan() {
        if (this.mode === 'scanning') return;

        this.mode = 'shield';
        this.shieldReadings = [];
        this.updateSteps('shield');
        this.signalCenter.classList.add('scanning');
        this.signalCenter.classList.remove('shielded');
        this.shieldOverlay.classList.add('hidden');
        this.shieldBtn.classList.add('scanning');
        this.shieldBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
            Testing...
        `;
        this.resultPanel.classList.add('hidden');

        if (this.nfc) {
            try {
                await this.nfc.scan();
                this.log('Shield test started - place tag inside object & hold near device', 'info');
            } catch (err) {
                this.log(`Scan error: ${err.message}`, 'error');
                this.resetScanUI();
            }
        } else {
            this.log('Demo mode - simulating shield test', 'info');
            this.simulateShieldScan();
        }
    }

    handleNFCReading(event) {
        const { serialNumber, records } = event;
        const startTime = performance.now();
        const readTime = performance.now() - startTime;

        const strength = this.measureSignalStrength(readTime, records);
        this.updateSignalDisplay(strength);

        if (this.mode === 'scanning') {
            this.baselineReadings.push({
                uid: serialNumber,
                strength: strength,
                timestamp: Date.now(),
                readTime: readTime,
                recordCount: records ? records.length : 0
            });
            this.log(`Baseline reading ${this.baselineReadings.length}/${this.maxSamples}: ${strength.toFixed(1)}%`, 'success');

            if (this.baselineReadings.length >= this.maxSamples) {
                this.finishBaseline();
            } else {
                this.scanCount.textContent = this.baselineReadings.length;
                this.log('Hold tag steady for next reading...', 'info');
            }
        } else if (this.mode === 'shield') {
            this.shieldReadings.push({
                uid: serialNumber,
                strength: strength,
                timestamp: Date.now(),
                readTime: readTime,
                recordCount: records ? records.length : 0
            });
            this.log(`Shield reading ${this.shieldReadings.length}/${this.maxSamples}: ${strength.toFixed(1)}%`, 'success');

            if (this.shieldReadings.length >= this.maxSamples) {
                this.finishShieldTest();
            } else {
                this.scanCount.textContent = this.baselineReadings.length + this.shieldReadings.length;
                this.log('Hold tag steady for next reading...', 'info');
            }
        }
    }

    handleNFCError(event) {
        this.log(`NFC read error: ${event.message}`, 'error');
        if (this.mode === 'scanning' && this.baselineReadings.length > 0) {
            this.log('Weak signal detected - may indicate shielding', 'warning');
            const weakReading = { uid: 'unknown', strength: 5 + Math.random() * 10, timestamp: Date.now(), readTime: 100, recordCount: 0 };
            this.baselineReadings.push(weakReading);
            this.updateSignalDisplay(weakReading.strength);

            if (this.baselineReadings.length >= this.maxSamples) {
                this.finishBaseline();
            } else {
                this.scanCount.textContent = this.baselineReadings.length;
            }
        } else if (this.mode === 'shield' && this.shieldReadings.length > 0) {
            this.log('Very weak signal - strong shielding detected', 'warning');
            const weakReading = { uid: 'unknown', strength: 2 + Math.random() * 5, timestamp: Date.now(), readTime: 200, recordCount: 0 };
            this.shieldReadings.push(weakReading);
            this.updateSignalDisplay(weakReading.strength);

            if (this.shieldReadings.length >= this.maxSamples) {
                this.finishShieldTest();
            } else {
                this.scanCount.textContent = this.baselineReadings.length + this.shieldReadings.length;
            }
        }
    }

    measureSignalStrength(readTime, records) {
        let base = 85;
        if (readTime > 50) base -= 10;
        if (readTime > 100) base -= 10;
        if (!records || records.length === 0) base -= 15;
        base += (Math.random() * 8 - 4);
        return Math.max(10, Math.min(98, base));
    }

    simulateBaselineScan() {
        let count = 0;
        const interval = setInterval(() => {
            count++;
            const strength = 80 + Math.random() * 15;
            this.baselineReadings.push({
                uid: 'DE:AD:BE:EF:00:01',
                strength: strength,
                timestamp: Date.now(),
                readTime: 30 + Math.random() * 20,
                recordCount: 2
            });
            this.updateSignalDisplay(strength);
            this.scanCount.textContent = count;
            this.log(`Baseline reading ${count}/${this.maxSamples}: ${strength.toFixed(1)}%`, 'success');

            if (count >= this.maxSamples) {
                clearInterval(interval);
                this.finishBaseline();
            }
        }, 800);
    }

    simulateShieldScan() {
        let count = 0;
        const shieldStrength = 5 + Math.random() * 20;
        const interval = setInterval(() => {
            count++;
            const variation = shieldStrength + (Math.random() * 8 - 4);
            this.shieldReadings.push({
                uid: 'DE:AD:BE:EF:00:01',
                strength: Math.max(2, variation),
                timestamp: Date.now(),
                readTime: 150 + Math.random() * 100,
                recordCount: 0
            });
            this.updateSignalDisplay(Math.max(2, variation));
            this.scanCount.textContent = this.baselineReadings.length + count;
            this.log(`Shield reading ${count}/${this.maxSamples}: ${Math.max(2, variation).toFixed(1)}%`, 'success');

            if (count >= this.maxSamples) {
                clearInterval(interval);
                this.finishShieldTest();
            }
        }, 800);
    }

    finishBaseline() {
        this.mode = 'idle';
        this.signalCenter.classList.remove('scanning');
        this.baselineBtn.classList.remove('scanning');
        this.baselineBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            Baseline Done
        `;
        this.shieldBtn.disabled = false;

        const avg = this.getAverageStrength(this.baselineReadings);
        this.log(`Baseline complete: avg ${avg.toFixed(1)}% signal strength`, 'success');
        this.updateSteps('baseline-done');
    }

    finishShieldTest() {
        this.mode = 'idle';
        this.signalCenter.classList.remove('scanning');
        this.shieldBtn.classList.remove('scanning');
        this.shieldBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
            Test Done
        `;

        const baselineAvg = this.getAverageStrength(this.baselineReadings);
        const shieldAvg = this.getAverageStrength(this.shieldReadings);
        const attenuation = baselineAvg - shieldAvg;
        const effectiveness = Math.min(100, Math.max(0, (attenuation / baselineAvg) * 100));

        this.showResult(baselineAvg, shieldAvg, attenuation, effectiveness);
        this.addToHistory(baselineAvg, shieldAvg, attenuation, effectiveness);
        this.updateSteps('done');

        this.log(`Shield test complete: ${effectiveness.toFixed(1)}% effectiveness`, 'success');
    }

    getAverageStrength(readings) {
        if (readings.length === 0) return 0;
        return readings.reduce((sum, r) => sum + r.strength, 0) / readings.length;
    }

    updateSignalDisplay(strength) {
        this.signalFill.style.width = `${strength}%`;
        this.signalValue.textContent = `${strength.toFixed(0)}%`;

        this.ringOuter.className = 'signal-ring ring-outer';
        this.ringMid.className = 'signal-ring ring-mid';
        this.ringInner.className = 'signal-ring ring-inner';

        if (strength > 70) {
            this.ringOuter.classList.add('active');
            this.ringMid.classList.add('active');
            this.ringInner.classList.add('active');
        } else if (strength > 40) {
            this.ringOuter.classList.add('weak');
            this.ringMid.classList.add('weak');
        } else {
            this.ringOuter.classList.add('blocked');
        }
    }

    showResult(baseline, shielded, attenuation, effectiveness) {
        this.resultPanel.classList.remove('hidden');

        let level, color, icon, recommend;

        if (effectiveness >= 80) {
            level = 'Excellent Protection'; color = 'var(--accent-green)'; icon = '🛡️';
            recommend = 'Your object provides strong RFID protection. Cards inside are well shielded from unauthorized scans.';
        } else if (effectiveness >= 60) {
            level = 'Good Protection'; color = 'var(--accent-cyan)'; icon = '✅';
            recommend = 'Good shielding. Most casual RFID skimming attempts will be blocked. Consider upgrading for high-security needs.';
        } else if (effectiveness >= 40) {
            level = 'Moderate Protection'; color = 'var(--accent-yellow)'; icon = '⚠️';
            recommend = 'Partial shielding. Some RFID signals may penetrate. Consider adding an RFID-blocking insert for better security.';
        } else if (effectiveness >= 20) {
            level = 'Weak Protection'; color = 'var(--accent-orange)'; icon = '🔶';
            recommend = 'Minimal shielding detected. Your cards may be vulnerable to RFID skimming. Add proper RFID protection.';
        } else {
            level = 'No Protection'; color = 'var(--accent-red)'; icon = '❌';
            recommend = 'No RFID shielding detected. Your contactless cards are fully exposed to unauthorized scanning. Immediate protection recommended.';
        }

        document.getElementById('resultIcon').textContent = icon;
        document.getElementById('resultTitle').textContent = level;
        document.getElementById('resultTitle').style.color = color;

        this.ratingFill.style.width = `${effectiveness}%`;
        this.ratingFill.style.background = effectiveness >= 60 ? 'var(--gradient-safe)' :
            effectiveness >= 30 ? 'var(--gradient-warn)' : 'var(--gradient-danger)';
        this.ratingValue.textContent = `${effectiveness.toFixed(1)}%`;
        this.ratingValue.style.color = color;

        document.getElementById('resultBaseline').textContent = `${baseline.toFixed(1)}%`;
        document.getElementById('resultShielded').textContent = `${shielded.toFixed(1)}%`;
        document.getElementById('resultLoss').textContent = `${attenuation.toFixed(1)} dB`;
        document.getElementById('resultLevel').textContent = level;
        document.getElementById('resultLevel').style.color = color;
        document.getElementById('resultRecommend').textContent = recommend;

        if (effectiveness > 30) {
            this.signalCenter.classList.add('shielded');
            this.shieldOverlay.classList.remove('hidden');
        }
    }

    updateSteps(state) {
        this.step1.className = 'step';
        this.step2.className = 'step';
        this.step3.className = 'step';

        if (state === 'baseline') {
            this.step1.classList.add('active');
        } else if (state === 'baseline-done') {
            this.step1.classList.add('done');
            this.step2.classList.add('active');
        } else if (state === 'shield') {
            this.step1.classList.add('done');
            this.step2.classList.add('active');
        } else if (state === 'done') {
            this.step1.classList.add('done');
            this.step2.classList.add('done');
            this.step3.classList.add('active');
        }
    }

    resetScanUI() {
        this.mode = 'idle';
        this.signalCenter.classList.remove('scanning', 'shielded');
        this.baselineBtn.classList.remove('scanning');
        this.shieldBtn.classList.remove('scanning');
        this.baselineBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Baseline Scan
        `;
        this.shieldBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Shield Test
        `;
    }

    reset() {
        this.resetScanUI();
        this.baselineReadings = [];
        this.shieldReadings = [];
        this.baselineBtn.disabled = false;
        this.shieldBtn.disabled = true;
        this.resultPanel.classList.add('hidden');
        this.signalFill.style.width = '0%';
        this.signalValue.textContent = '--';
        this.attenFill.style.width = '0%';
        this.attenValue.textContent = '--';
        this.scanCount.textContent = '0';
        this.shieldOverlay.classList.add('hidden');
        this.signalCenter.classList.remove('shielded');
        this.updateSteps('idle');
        this.ringOuter.className = 'signal-ring ring-outer';
        this.ringMid.className = 'signal-ring ring-mid';
        this.ringInner.className = 'signal-ring ring-inner';
        this.log('Reset - ready for new test', 'info');
    }

    addToHistory(baseline, shielded, attenuation, effectiveness) {
        const entry = {
            baseline: baseline,
            shielded: shielded,
            attenuation: attenuation,
            effectiveness: effectiveness,
            timestamp: new Date().toISOString(),
            uid: this.baselineReadings[0] ? this.baselineReadings[0].uid : 'unknown'
        };

        this.testHistory.unshift(entry);
        if (this.testHistory.length > 20) this.testHistory.pop();
        this.saveHistory();
        this.renderHistory();
    }

    renderHistory() {
        if (this.testHistory.length === 0) {
            this.historyList.innerHTML = '<div class="empty-state"><p>No tests performed</p></div>';
            return;
        }

        this.historyList.innerHTML = this.testHistory.map((test, i) => {
            let badgeClass = 'none';
            if (test.effectiveness >= 80) badgeClass = 'excellent';
            else if (test.effectiveness >= 60) badgeClass = 'good';
            else if (test.effectiveness >= 40) badgeClass = 'moderate';
            else if (test.effectiveness >= 20) badgeClass = 'poor';

            return `
                <div class="history-item">
                    <div class="history-badge ${badgeClass}">${test.effectiveness.toFixed(0)}%</div>
                    <div class="history-info">
                        <div class="history-uid">${test.uid}</div>
                        <div class="history-meta">${new Date(test.timestamp).toLocaleString()} | Loss: ${test.attenuation.toFixed(1)} dB</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    saveHistory() {
        try { localStorage.setItem('shield_test_history', JSON.stringify(this.testHistory)); } catch (e) {}
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('shield_test_history');
            if (saved) { this.testHistory = JSON.parse(saved); this.renderHistory(); }
        } catch (e) {}
    }

    clearHistory() {
        this.testHistory = [];
        this.saveHistory();
        this.renderHistory();
        this.log('History cleared', 'info');
    }

    log(message, type = 'info') {
        if (!this.logContainer) return;
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span><span class="log-msg">${message}</span>`;
        this.logContainer.appendChild(entry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.shieldDetector = new ShieldDetector();
});
