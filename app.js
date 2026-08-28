class NFCDetailReader {
    constructor() {
        this.nfc = null;
        this.isScanning = false;
        this.isAutoScan = false;
        this.scanHistory = [];
        this.currentTag = null;
        this.abortController = null;

        this.initDOM();
        this.initNFC();
        this.initEventListeners();
        this.loadHistory();
        this.log('NFC/RFID Detail Reader initialized', 'info');
    }

    initDOM() {
        this.startScanBtn = document.getElementById('startScanBtn');
        this.autoScanBtn = document.getElementById('autoScanBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.apiStatus = document.getElementById('apiStatus');
        this.scanMode = document.getElementById('scanMode');
        this.signalFill = document.getElementById('signalFill');
        this.signalValue = document.getElementById('signalValue');
        this.rangeValue = document.getElementById('rangeValue');
        this.freqValue = document.getElementById('freqValue');
        this.tagDots = document.getElementById('tagDots');
        this.logContainer = document.getElementById('logContainer');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.exportHistoryBtn = document.getElementById('exportHistoryBtn');
        this.hexDump = document.getElementById('hexDump');
        this.copyHexBtn = document.getElementById('copyHexBtn');
        this.copyBase64Btn = document.getElementById('copyBase64Btn');

        this.tagDetails = document.getElementById('tagDetails');
        this.tagInfoCard = document.getElementById('tagInfoCard');
        this.chipDetails = document.getElementById('chipDetails');
        this.chipEmptyState = document.getElementById('chipEmptyState');
        this.ndefRecords = document.getElementById('ndefRecords');
        this.ndefEmptyState = document.getElementById('ndefEmptyState');
        this.rawDataContainer = document.getElementById('rawDataContainer');
        this.rawEmptyState = document.getElementById('rawEmptyState');
        this.historyList = document.getElementById('historyList');
        this.historyCount = document.getElementById('historyCount');
    }

    initNFC() {
        if ('NDEFReader' in window) {
            this.nfc = new NDEFReader();
            this.updateAPIStatus(true);
            this.log('Web NFC API available', 'success');
        } else {
            this.updateAPIStatus(false);
            this.log('Web NFC API not available - use Chrome on Android', 'warning');
            this.enableDemoMode();
        }
    }

    initEventListeners() {
        this.startScanBtn.addEventListener('click', () => this.toggleScan());
        this.autoScanBtn.addEventListener('click', () => this.toggleAutoScan());
        this.clearBtn.addEventListener('click', () => this.clearCurrentTag());
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.exportHistoryBtn.addEventListener('click', () => this.exportHistory());
        this.copyHexBtn.addEventListener('click', () => this.copyToClipboard('hex'));
        this.copyBase64Btn.addEventListener('click', () => this.copyToClipboard('base64'));

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        if (this.nfc) {
            this.nfc.addEventListener('reading', (e) => this.handleNFCReading(e));
            this.nfc.addEventListener('readingerror', (e) => this.handleNFCError(e));
        }
    }

    updateAPIStatus(available) {
        this.apiStatus.className = `status-badge ${available ? 'status-available' : 'status-unavailable'}`;
        this.apiStatus.textContent = available ? 'NFC Ready' : 'NFC Unavailable';
    }

    enableDemoMode() {
        this.startScanBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Demo Scan
        `;
        this.startScanBtn.addEventListener('click', () => this.demoScan(), { once: false });
        this.startScanBtn.removeEventListener('click', () => this.toggleScan());
    }

    async toggleScan() {
        if (this.isScanning) {
            this.stopScan();
        } else {
            this.startScan();
        }
    }

    async startScan() {
        if (!this.nfc) return;

        try {
            this.abortController = new AbortController();
            await this.nfc.scan({ signal: this.abortController.signal });
            this.isScanning = true;
            this.updateScanUI(true);
            this.log('Scanning for NFC tags...', 'info');
        } catch (err) {
            this.log(`Scan error: ${err.message}`, 'error');
            this.updateScanUI(false);
        }
    }

    stopScan() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.isScanning = false;
        this.updateScanUI(false);
        this.log('Scanning stopped', 'info');
    }

    toggleAutoScan() {
        this.isAutoScan = !this.isAutoScan;
        this.autoScanBtn.classList.toggle('active', this.isAutoScan);
        this.scanMode.textContent = this.isAutoScan ? 'Auto' : 'Manual';
        this.scanMode.classList.toggle('auto', this.isAutoScan);

        if (this.isAutoScan && !this.isScanning) {
            this.startScan();
        }

        this.log(`Auto scan ${this.isAutoScan ? 'enabled' : 'disabled'}`, 'info');
    }

    updateScanUI(scanning) {
        this.isScanning = scanning;
        if (scanning) {
            this.startScanBtn.classList.add('scanning');
            this.startScanBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
                Stop Scanning
            `;
        } else {
            this.startScanBtn.classList.remove('scanning');
            this.startScanBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Start Scanning
            `;
        }
    }

    handleNFCReading(event) {
        const { serialNumber, serialNumberText, records } = event;
        const tagData = this.processTagData(serialNumber, serialNumberText, records);
        this.displayTagInfo(tagData);
        this.displayChipInfo(tagData);
        this.displayNDEFRecords(records);
        this.displayRawData(tagData);
        this.addToHistory(tagData);
        this.updateSignalStrength();
        this.addTagDot();
        this.log(`Tag detected: ${serialNumberText || serialNumber}`, 'success');

        if (!this.isAutoScan) {
            this.stopScan();
        }
    }

    handleNFCError(event) {
        this.log(`NFC reading error: ${event.message}`, 'error');
    }

    processTagData(serialNumber, serialNumberText, records) {
        const tagType = this.identifyTagType(serialNumber);
        const chipInfo = this.identifyChip(serialNumber);
        const totalSize = records.reduce((acc, r) => acc + (r.data ? r.data.byteLength : 0), 0);

        return {
            serialNumber: serialNumberText || serialNumber,
            serialNumberRaw: serialNumber,
            tagType: tagType.type,
            tagTypeDesc: tagType.description,
            technology: tagType.technology,
            maxSize: tagType.maxSize,
            writable: records.length > 0,
            canMakeReadOnly: tagType.canMakeReadOnly,
            messageSize: totalSize,
            recordCount: records.length,
            timestamp: new Date().toISOString(),
            chipInfo: chipInfo,
            records: records
        };
    }

    identifyTagType(uid) {
        const uidBytes = uid.split(':').map(h => parseInt(h, 16));
        const len = uidBytes.length;

        if (len === 4) {
            if (uidBytes[0] === 0x04) {
                return {
                    type: 'NXP NTAG',
                    description: 'NXP NTAG213/215/216',
                    technology: 'ISO 14443-3A',
                    maxSize: '144-888 bytes',
                    canMakeReadOnly: true
                };
            }
            return {
                type: 'MIFARE Classic 1K',
                description: 'NXP MIFARE Classic',
                technology: 'ISO 14443-3A',
                maxSize: '1024 bytes',
                canMakeReadOnly: false
            };
        }

        if (len === 7) {
            if (uidBytes[0] === 0x04) {
                return {
                    type: 'NXP NTAG216',
                    description: 'NXP NTAG216 (extended)',
                    technology: 'ISO 14443-3A',
                    maxSize: '888 bytes',
                    canMakeReadOnly: true
                };
            }
            return {
                type: 'MIFARE DESFire',
                description: 'NXP MIFARE DESFire',
                technology: 'ISO 14443-4',
                maxSize: 'Up to 32 KB',
                canMakeReadOnly: false
            };
        }

        if (len === 8) {
            return {
                type: 'MIFARE Ultralight',
                description: 'NXP MIFARE Ultralight',
                technology: 'ISO 14443-3A',
                maxSize: '192 bytes',
                canMakeReadOnly: true
            };
        }

        return {
            type: 'Unknown NFC Tag',
            description: 'Standard NFC Tag',
            technology: 'ISO 14443',
            maxSize: 'Unknown',
            canMakeReadOnly: false
        };
    }

    identifyChip(uid) {
        const uidBytes = uid.split(':').map(h => parseInt(h, 16));
        const len = uidBytes.length;

        const manufacturers = {
            0x04: { name: 'NXP Semiconductors', prefix: 'NXP' },
            0x05: { name: 'STMicroelectronics', prefix: 'ST' },
            0x01: { name: 'Motorola', prefix: 'MOT' },
            0x02: { name: 'STMicroelectronics', prefix: 'ST' },
            0x03: { name: 'Hitachi', prefix: 'HIT' },
            0x06: { name: 'Infineon Technologies', prefix: 'INF' },
            0x07: { name: 'Cypress Semiconductor', prefix: 'CYP' },
            0x08: { name: 'Texas Instruments', prefix: 'TI' },
            0x09: { name: 'Fujitsu', prefix: 'FUJ' },
            0x0A: { name: 'Microchip Technology', prefix: 'MIC' },
            0x0B: { name: 'NEC', prefix: 'NEC' },
            0x0C: { name: 'OKI Electric', prefix: 'OKI' },
            0x0D: { name: 'Toshiba', prefix: 'TOS' },
            0x0E: { name: 'Mitsubishi Electric', prefix: 'MIT' },
            0x0F: { name: 'Samsung', prefix: 'SAM' },
            0x10: { name: 'HV Microelectronics', prefix: 'HV' },
            0x11: { name: 'Vishay', prefix: 'VIS' },
            0x12: { name: 'Identity Devices', prefix: 'ID' },
            0x13: { name: 'Philips Semiconductors', prefix: 'PHI' },
            0x14: { name: 'Infineon', prefix: 'INF' },
            0x15: { name: 'Cyfral', prefix: 'CYF' },
            0x16: { name: 'AMS', prefix: 'AMS' },
            0x17: { name: 'Melexis', prefix: 'MEX' },
            0x18: { name: 'Legic', prefix: 'LEG' },
            0x19: { name: 'Sonix Technology', prefix: 'SNX' },
            0x1A: { name: 'Numics', prefix: 'NUM' },
            0x1B: { name: 'EM Microelectronic', prefix: 'EM' },
            0x1C: { name: 'Semitlab', prefix: 'SEM' },
            0x1D: { name: 'Renesas', prefix: 'REN' },
            0x1E: { name: 'HTC', prefix: 'HTC' },
            0x1F: { name: 'Wilest Technology', prefix: 'WIL' },
            0x20: { name: 'AML', prefix: 'AML' },
            0x21: { name: 'Sagem Orga', prefix: 'SAG' },
            0x22: { name: 'Texas Instruments', prefix: 'TI' },
            0x23: { name: 'RFIDsec', prefix: 'RFS' },
            0x24: { name: 'Schweizer Electronic', prefix: 'SCH' },
            0x25: { name: 'EM Microelectronic', prefix: 'EM' },
            0x26: { name: 'Renault', prefix: 'REN' },
            0x27: { name: 'Maxim Integrated', prefix: 'MAX' },
            0x28: { name: 'Thales', prefix: 'THA' },
            0x29: { name: 'CEC', prefix: 'CEC' },
            0x2A: { name: 'NXS Semiconductors', prefix: 'NXS' },
            0x2B: { name: 'Gentex Corporation', prefix: 'GNT' },
            0x2C: { name: 'HID Global', prefix: 'HID' },
            0x2D: { name: 'Viridian Research', prefix: 'VIR' },
            0x2E: { name: 'Microchip', prefix: 'MCH' },
            0x2F: { name: 'Taiyo Yuden', prefix: 'TYU' },
            0x30: { name: 'STM', prefix: 'STM' },
            0x31: { name: 'CAS', prefix: 'CAS' },
            0x32: { name: 'Totally Automated', prefix: 'TAM' },
            0x33: { name: 'Gemalto', prefix: 'GEM' },
            0x34: { name: 'Watchdata', prefix: 'WTD' },
            0x35: { name: 'ASK', prefix: 'ASK' },
            0x36: { name: 'Unregistered', prefix: 'UNR' },
            0x37: { name: 'Renault SAS', prefix: 'RNS' },
            0x38: { name: 'Proxell', prefix: 'PRX' },
            0x39: { name: 'Teridian', prefix: 'TER' },
            0x3A: { name: 'Entes Elektronik', prefix: 'ENT' },
            0x3B: { name: 'WIS Technology', prefix: 'WIS' },
            0x3C: { name: 'HID Global', prefix: 'HID' },
            0x3D: { name: 'OASIS', prefix: 'OAS' },
            0x3E: { name: 'SMARTRAC', prefix: 'SMT' },
            0x3F: { name: 'Identiv', prefix: 'IDV' },
            0x40: { name: 'Oberthur', prefix: 'OBT' },
            0x41: { name: 'InsIDE Secure', prefix: 'ISC' },
            0x42: { name: 'NEC', prefix: 'NEC' },
            0x43: { name: 'Wave Systems', prefix: 'WAV' },
            0x44: { name: 'Innovision', prefix: 'INN' },
            0x45: { name: 'Murata', prefix: 'MUR' },
            0x46: { name: 'Giesecke & Devrient', prefix: 'G&D' },
            0x47: { name: 'Sony Corporation', prefix: 'SON' },
            0x48: { name: 'Salzburg AG', prefix: 'SAL' },
            0x49: { name: 'Invengo', prefix: 'INV' },
            0x4A: { name: 'Sagem', prefix: 'SGM' },
            0x4B: { name: 'Austriamicrosystems', prefix: 'AMS' },
            0x4C: { name: 'Miwa', prefix: 'MIW' },
            0x4D: { name: 'FUJITSU', prefix: 'FUJ' },
            0x4E: { name: 'FEC', prefix: 'FEC' },
            0x4F: { name: 'HID Global', prefix: 'HID' },
            0x50: { name: 'SOKYMAT', prefix: 'SOK' },
            0x51: { name: 'MARS', prefix: 'MRS' },
            0x52: { name: 'Omron', prefix: 'OMR' },
            0x53: { name: 'NXP Semiconductors', prefix: 'NXP' },
            0x54: { name: 'ID Tech', prefix: 'IDT' },
            0x55: { name: 'Magicard', prefix: 'MGC' },
            0x56: { name: 'ACE', prefix: 'ACE' },
            0x57: { name: 'Koninklijke', prefix: 'KON' },
            0x58: { name: 'Oberthur Technologies', prefix: 'OBT' },
            0x59: { name: 'NVidia', prefix: 'NVI' },
            0x5A: { name: 'Korean Bank', prefix: 'KBK' },
            0x5B: { name: 'Gemalto', prefix: 'GEM' },
            0x5C: { name: 'IDEMIA', prefix: 'IDM' },
            0x5D: { name: 'Wisesoft', prefix: 'WIS' },
            0x5E: { name: 'Sysmocom', prefix: 'SYS' },
            0x5F: { name: 'AXXON', prefix: 'AXX' },
            0x60: { name: 'Sagem Orga', prefix: 'SAG' },
            0x61: { name: 'Samsung', prefix: 'SAM' },
            0x62: { name: 'Vinghing', prefix: 'VIN' },
            0x63: { name: 'HID Global', prefix: 'HID' },
            0x64: { name: 'AS Roma', prefix: 'ASR' },
            0x65: { name: 'Fast Identity', prefix: 'FID' },
            0x66: { name: 'Trust Technology', prefix: 'TRT' },
            0x67: { name: 'G+D Mobile Security', prefix: 'GDS' },
            0x68: { name: 'HID', prefix: 'HID' },
            0x69: { name: 'FARADAY', prefix: 'FRD' },
            0x6A: { name: 'BrilliantTS', prefix: 'BTS' },
            0x6B: { name: 'Microchip', prefix: 'MCH' },
            0x6C: { name: '3M', prefix: '3M ' },
            0x6D: { name: 'SK-Electronics', prefix: 'SKE' },
            0x6E: { name: 'Perto', prefix: 'PRT' },
            0x6F: { name: 'Wireless Cables', prefix: 'WLC' },
            0x70: { name: 'Laxton', prefix: 'LAX' },
            0x71: { name: 'Alliance Card', prefix: 'ALC' },
            0x72: { name: 'Toppan Printing', prefix: 'TPN' },
            0x73: { name: 'Southwest Research', prefix: 'SWR' },
            0x74: { name: 'Chicony Electronics', prefix: 'CHE' },
            0x75: { name: 'Pragmatic', prefix: 'PRG' },
            0x76: { name: 'Innovision', prefix: 'INN' },
            0x77: { name: 'Identiv', prefix: 'IDV' },
            0x78: { name: 'Shanghai FM', prefix: 'SHF' },
            0x79: { name: 'Huada Semiconductor', prefix: 'HDS' },
            0x7A: { name: 'HID Global', prefix: 'HID' },
            0x7B: { name: 'Shenzhen Goodix', prefix: 'SGX' },
            0x7C: { name: 'BYD', prefix: 'BYD' },
            0x7D: { name: 'Samsung', prefix: 'SAM' },
            0x7E: { name: 'Microchip', prefix: 'MCH' },
            0x7F: { name: 'Shanghai Fudan', prefix: 'SFD' },
            0x80: { name: 'Shanghai Fudan', prefix: 'SFD' },
            0x81: { name: 'Prox Flex', prefix: 'PFX' },
            0x82: { name: 'Oberthur', prefix: 'OBT' },
            0x83: { name: 'Meazura', prefix: 'MEZ' },
            0x84: { name: 'VIVOKEY', prefix: 'VVK' },
            0x85: { name: 'KDF', prefix: 'KDF' },
            0x86: { name: 'Keyspace', prefix: 'KSP' },
            0x87: { name: 'Silicon Craft', prefix: 'SIC' },
            0x88: { name: 'Crocus', prefix: 'CRC' },
            0x89: { name: 'Meridian', prefix: 'MRD' },
            0x8A: { name: 'FEIG', prefix: 'FEI' },
            0x8B: { name: 'Gentex', prefix: 'GNT' },
            0x8C: { name: 'Shanghai Belling', prefix: 'SHB' },
            0x8D: { name: 'Microchip', prefix: 'MCH' },
            0x8E: { name: 'Vamosa', prefix: 'VAM' },
            0x8F: { name: 'Korea Information', prefix: 'KIC' },
            0x90: { name: 'Proteus', prefix: 'PRO' },
            0x91: { name: 'Giesecke', prefix: 'GIE' },
            0x92: { name: 'SMARTRAC', prefix: 'SMT' },
            0x93: { name: 'Ostendo', prefix: 'OST' },
            0x94: { name: 'Shenzhen Security', prefix: 'SZS' },
            0x95: { name: 'Prox TCM', prefix: 'PTC' },
            0x96: { name: 'CSG', prefix: 'CSG' },
            0x97: { name: 'Samsung', prefix: 'SAM' },
            0x98: { name: 'Microchip', prefix: 'MCH' },
            0x99: { name: 'Melexis', prefix: 'MEX' },
            0x9A: { name: 'Giesecke', prefix: 'GIE' },
            0x9B: { name: 'Watchdata', prefix: 'WTD' },
            0x9C: { name: 'Samsung', prefix: 'SAM' },
            0x9D: { name: 'IDEMIA', prefix: 'IDM' },
            0x9E: { name: 'Precise Biometrics', prefix: 'PRB' },
            0x9F: { name: 'GlobalPlatform', prefix: 'GPL' },
            0xA0: { name: 'NXP', prefix: 'NXP' },
            0xA1: { name: 'Smart Silicon', prefix: 'SMS' },
            0xA2: { name: 'Toppan', prefix: 'TPN' },
            0xA3: { name: 'Tokyo Electron', prefix: 'TEL' },
            0xA4: { name: 'Microchip', prefix: 'MCH' },
            0xA5: { name: 'Gentex', prefix: 'GNT' },
            0xA6: { name: 'Oberthur', prefix: 'OBT' },
            0xA7: { name: 'NXP', prefix: 'NXP' },
            0xA8: { name: 'NXP', prefix: 'NXP' },
            0xA9: { name: 'Dai Nippon', prefix: 'DNP' },
            0xAA: { name: 'Microchip', prefix: 'MCH' },
            0xAB: { name: 'Identiv', prefix: 'IDV' },
            0xAC: { name: 'OMNIKEY', prefix: 'OMK' },
            0xAD: { name: 'Sonsta', prefix: 'SNS' },
            0xAE: { name: 'Avery Dennison', prefix: 'ADV' },
            0xAF: { name: 'IDEX', prefix: 'IDX' },
            0xB0: { name: 'CIC', prefix: 'CIC' },
            0xB1: { name: 'Taiwan Semiconductor', prefix: 'TSC' },
            0xB2: { name: 'Citizen', prefix: 'CTZ' },
            0xB3: { name: 'Microchip', prefix: 'MCH' },
            0xB4: { name: 'Renesas', prefix: 'REN' },
            0xB5: { name: 'Validity Sensors', prefix: 'VSD' },
            0xB6: { name: 'STMicroelectronics', prefix: 'STM' },
            0xB7: { name: 'Microchip', prefix: 'MCH' },
            0xB8: { name: 'Samsung', prefix: 'SAM' },
            0xB9: { name: 'EM Microelectronic', prefix: 'EMM' },
            0xBA: { name: 'HID Global', prefix: 'HID' },
            0xBB: { name: 'Infineon', prefix: 'INF' },
            0xBC: { name: 'Microchip', prefix: 'MCH' },
            0xBD: { name: 'Murata', prefix: 'MUR' },
            0xBE: { name: 'Giesecke', prefix: 'GIE' },
            0xBF: { name: 'Microchip', prefix: 'MCH' },
            0xC0: { name: 'Tracked', prefix: 'TRK' },
            0xC1: { name: 'Microchip', prefix: 'MCH' },
            0xC2: { name: 'Dialog Semiconductor', prefix: 'DLG' },
            0xC3: { name: 'ExxonMobil', prefix: 'EXX' },
            0xC4: { name: 'Henning', prefix: 'HNG' },
            0xC5: { name: 'Toppan', prefix: 'TPN' },
            0xC6: { name: 'Oberthur', prefix: 'OBT' },
            0xC7: { name: 'Qualcomm', prefix: 'QCM' },
            0xC8: { name: 'M-pulse', prefix: 'MPL' },
            0xC9: { name: 'Transcore', prefix: 'TRC' },
            0xCA: { name: 'Intel', prefix: 'INT' },
            0xCB: { name: 'Microsoft', prefix: 'MSF' },
            0xCC: { name: 'Motorola', prefix: 'MOT' },
            0xCD: { name: 'NXP', prefix: 'NXP' },
            0xCE: { name: 'SK Telecom', prefix: 'SKT' },
            0xCF: { name: 'Technos', prefix: 'TEC' },
            0xD0: { name: 'Infineon', prefix: 'INF' },
            0xD1: { name: 'Nokia', prefix: 'NOK' },
            0xD2: { name: 'NXP', prefix: 'NXP' },
            0xD3: { name: 'STMicroelectronics', prefix: 'STM' },
            0xD4: { name: 'Toshiba', prefix: 'TOS' },
            0xD5: { name: 'Vanguard', prefix: 'VGD' },
            0xD6: { name: 'Anker', prefix: 'ANK' },
            0xD7: { name: 'NXP', prefix: 'NXP' },
            0xD8: { name: 'NXP', prefix: 'NXP' },
            0xD9: { name: 'NXP', prefix: 'NXP' },
            0xDA: { name: 'HID Global', prefix: 'HID' },
            0xDB: { name: 'Oberthur', prefix: 'OBT' },
            0xDC: { name: 'Microchip', prefix: 'MCH' },
            0xDD: { name: 'Sonix', prefix: 'SNX' },
            0xDE: { name: 'STMicroelectronics', prefix: 'STM' },
            0xDF: { name: 'Silicon Labs', prefix: 'SLB' },
            0xE0: { name: 'Analog Devices', prefix: 'ADI' },
            0xE1: { name: 'NXP', prefix: 'NXP' },
            0xE2: { name: 'ATMEL', prefix: 'ATM' },
            0xE3: { name: 'Qualcomm', prefix: 'QCM' },
            0xE4: { name: 'Zilog', prefix: 'ZLG' },
            0xE5: { name: 'TI', prefix: 'TI ' },
            0xE6: { name: 'Infineon', prefix: 'INF' },
            0xE7: { name: 'HTC', prefix: 'HTC' },
            0xE8: { name: 'NXP', prefix: 'NXP' },
            0xE9: { name: 'NXP', prefix: 'NXP' },
            0xEA: { name: 'MTK', prefix: 'MTK' },
            0xEB: { name: 'O2Micro', prefix: 'O2M' },
            0xEC: { name: 'MediaTek', prefix: 'MTK' },
            0xED: { name: 'Renesas', prefix: 'REN' },
            0xEE: { name: 'eLED', prefix: 'ELD' },
            0xEF: { name: 'Qualcomm', prefix: 'QCM' },
            0xF0: { name: 'Analog Devices', prefix: 'ADI' },
            0xF1: { name: 'Catalyst', prefix: 'CTL' },
            0xF2: { name: 'NXP', prefix: 'NXP' },
            0xF3: { name: 'Zarlink', prefix: 'ZRL' },
            0xF4: { name: 'Amperex', prefix: 'AMX' },
            0xF5: { name: 'CTS', prefix: 'CTS' },
            0xF6: { name: 'Alarm.com', prefix: 'ALM' },
            0xF7: { name: 'Tao', prefix: 'TAO' },
            0xF8: { name: 'Toppan Forms', prefix: 'TFC' },
            0xF9: { name: 'Dialog', prefix: 'DLG' },
            0xFA: { name: 'Melexis', prefix: 'MEX' },
            0xFB: { name: 'NXP', prefix: 'NXP' },
            0xFC: { name: 'NXP', prefix: 'NXP' },
            0xFD: { name: 'Proximity Cards', prefix: 'PRX' },
            0xFE: { name: 'IDS Microchip', prefix: 'IDS' },
            0xFF: { name: 'Unregistered', prefix: 'UNR' }
        };

        const manufacturerByte = uidBytes[0];
        const manufacturer = manufacturers[manufacturerByte] || { name: 'Unknown', prefix: 'UNK' };

        let chipModel = 'Unknown';
        let memorySize = 'Unknown';
        let protocol = 'ISO 14443';
        let frequency = '13.56 MHz';
        let dataRate = '106-424 kbps';
        let encryption = 'None';

        if (manufacturerByte === 0x04 && len === 4) {
            chipModel = 'NTAG213';
            memorySize = '180 bytes usable';
            dataRate = '106 kbps';
        } else if (manufacturerByte === 0x04 && len === 7) {
            chipModel = 'NTAG216';
            memorySize = '888 bytes usable';
            dataRate = '106 kbps';
        } else if (len === 4 && manufacturerByte !== 0x04) {
            chipModel = 'MIFARE Classic 1K';
            memorySize = '1024 bytes (16 sectors)';
            encryption = 'Crypto-1';
            dataRate = '106 kbps';
        } else if (len === 7) {
            chipModel = 'MIFARE DESFire EV2';
            memorySize = 'Up to 8 KB';
            encryption = 'AES-128 / 3DES';
            dataRate = '106-848 kbps';
            protocol = 'ISO 14443-4 / ISO 7816-4';
        } else if (len === 8) {
            chipModel = 'MIFARE Ultralight';
            memorySize = '192 bytes';
            dataRate = '106 kbps';
        }

        return {
            manufacturer: manufacturer.name,
            manufacturerPrefix: manufacturer.prefix,
            manufacturerByte: `0x${manufacturerByte.toString(16).toUpperCase().padStart(2, '0')}`,
            chipModel: chipModel,
            memorySize: memorySize,
            protocol: protocol,
            frequency: frequency,
            dataRate: dataRate,
            encryption: encryption,
            uidLength: len,
            uidFormat: `${len * 8}-bit`
        };
    }

    displayTagInfo(tagData) {
        this.tagInfoCard.querySelector('.empty-state').classList.add('hidden');
        this.tagDetails.classList.remove('hidden');

        document.getElementById('tagType').textContent = `${tagData.tagType} (${tagData.tagTypeDesc})`;
        document.getElementById('tagUID').textContent = tagData.serialNumber;
        document.getElementById('tagTech').textContent = tagData.technology;
        document.getElementById('tagMaxSize').textContent = tagData.maxSize;
        document.getElementById('tagWritable').textContent = tagData.writable ? 'Yes' : 'No';
        document.getElementById('tagCanMakeReadOnly').textContent = tagData.canMakeReadOnly ? 'Yes' : 'No';
        document.getElementById('tagMsgSize').textContent = `${tagData.messageSize} bytes (${tagData.recordCount} records)`;
        document.getElementById('tagTimestamp').textContent = new Date(tagData.timestamp).toLocaleString();

        this.currentTag = tagData;
        this.tagInfoCard.classList.add('scan-found-animation');
        setTimeout(() => this.tagInfoCard.classList.remove('scan-found-animation'), 600);
    }

    displayChipInfo(tagData) {
        const chip = tagData.chipInfo;
        this.chipEmptyState.classList.add('hidden');
        this.chipDetails.classList.remove('hidden');

        document.getElementById('chipManufacturer').textContent = `${chip.manufacturer} (${chip.manufacturerPrefix})`;
        document.getElementById('chipModel').textContent = chip.chipModel;
        document.getElementById('chipICType').textContent = chip.uidFormat;
        document.getElementById('chipMemory').textContent = chip.memorySize;
        document.getElementById('chipProtocol').textContent = chip.protocol;
        document.getElementById('chipFreq').textContent = chip.frequency;
        document.getElementById('chipDataRate').textContent = chip.dataRate;
        document.getElementById('chipEncryption').textContent = chip.encryption;

        this.renderChipDiagram(chip);
    }

    renderChipDiagram(chip) {
        const diagram = document.getElementById('chipDiagram');
        diagram.innerHTML = `
            <div style="text-align:center;margin-bottom:8px;font-size:0.75rem;color:var(--text-muted)">Chip Pin Diagram</div>
            <div class="chip-pinout">
                <div class="chip-pin">VCC</div>
                <div class="chip-pin">RST</div>
                <div class="chip-pin">GND</div>
                <div class="chip-pin">VPP</div>
                <div class="chip-pin">SCL</div>
                <div class="chip-pin">SDA</div>
                <div class="chip-pin">IRQ</div>
                <div class="chip-pin">I/O</div>
            </div>
            <div style="text-align:center;margin-top:8px;font-size:0.65rem;color:var(--accent-cyan)">
                ${chip.manufacturer} ${chip.chipModel} | ${chip.protocol}
            </div>
        `;
    }

    displayNDEFRecords(records) {
        if (!records || records.length === 0) {
            this.ndefEmptyState.classList.remove('hidden');
            this.ndefRecords.classList.add('hidden');
            return;
        }

        this.ndefEmptyState.classList.add('hidden');
        this.ndefRecords.classList.remove('hidden');
        this.ndefRecords.innerHTML = '';

        records.forEach((record, index) => {
            const recordEl = document.createElement('div');
            recordEl.className = 'ndef-record';

            const typeName = this.getNDEFTypeName(record.recordType);
            const typeClass = this.getNDEFTypeClass(record.recordType);
            const payload = this.decodeNDEFPayload(record);

            recordEl.innerHTML = `
                <div class="ndef-record-header">
                    <span class="ndef-type ${typeClass}">${typeName}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted)">Record ${index + 1} of ${records.length}</span>
                </div>
                <div class="ndef-payload">${this.escapeHtml(payload)}</div>
            `;

            this.ndefRecords.appendChild(recordEl);
        });
    }

    getNDEFTypeName(type) {
        const types = {
            'text': 'Text',
            'url': 'URL',
            'smart-poster': 'Smart Poster',
            'absolute-url': 'Absolute URL',
            'mime-media': 'MIME Media',
            'external-type': 'External Type',
            'unknown': 'Unknown',
            'handover-request': 'Handover Request',
            'handover-select': 'Handover Select'
        };
        return types[type] || type.toUpperCase();
    }

    getNDEFTypeClass(type) {
        if (type === 'text') return 'text';
        if (type === 'url' || type === 'absolute-url') return 'url';
        if (type === 'smart-poster') return 'smart-poster';
        if (type === 'mime-media') return 'other';
        return 'other';
    }

    decodeNDEFPayload(record) {
        try {
            if (record.recordType === 'text') {
                const decoder = new TextDecoder(record.encoding || 'utf-8');
                return decoder.decode(record.data);
            }

            if (record.recordType === 'url') {
                const decoder = new TextDecoder();
                return decoder.decode(record.data);
            }

            if (record.recordType === 'absolute-url') {
                const decoder = new TextDecoder();
                return decoder.decode(record.data);
            }

            if (record.recordType === 'smart-poster') {
                return this.parseSmartPoster(record.data);
            }

            if (record.recordType === 'mime-media') {
                const decoder = new TextDecoder();
                const text = decoder.decode(record.data);
                if (text.length < 200) return text;
                return `[Binary data: ${record.data.byteLength} bytes]`;
            }

            if (record.recordType === 'external-type') {
                const decoder = new TextDecoder();
                return decoder.decode(record.data);
            }

            const decoder = new TextDecoder();
            const text = decoder.decode(record.data);
            if (this.isPrintable(text)) return text;

            return this.hexEncode(record.data);
        } catch (e) {
            return this.hexEncode(record.data);
        }
    }

    parseSmartPoster(data) {
        try {
            const decoder = new TextDecoder();
            const text = decoder.decode(data);
            if (text.length > 0) return text;
            return `[Smart Poster data: ${data.byteLength} bytes]`;
        } catch (e) {
            return `[Smart Poster: ${data.byteLength} bytes]`;
        }
    }

    isPrintable(str) {
        return /^[\x20-\x7E\n\r\t]+$/.test(str);
    }

    displayRawData(tagData) {
        this.rawEmptyState.classList.add('hidden');
        this.rawDataContainer.classList.remove('hidden');

        const uidBytes = tagData.serialNumberRaw.split(':');
        let rawBytes = uidBytes.map(h => parseInt(h, 16));

        if (tagData.records) {
            tagData.records.forEach(record => {
                if (record.data) {
                    const recordBytes = new Uint8Array(record.data);
                    rawBytes = rawBytes.concat(Array.from(recordBytes));
                }
            });
        }

        this.rawBytes = rawBytes;
        this.renderHexDump(rawBytes);
    }

    renderHexDump(bytes) {
        let html = '';
        const bytesPerLine = 16;

        for (let i = 0; i < bytes.length; i += bytesPerLine) {
            const offset = i.toString(16).toUpperCase().padStart(8, '0');
            const hexBytes = [];
            let ascii = '';

            for (let j = 0; j < bytesPerLine; j++) {
                if (i + j < bytes.length) {
                    const byte = bytes[i + j];
                    hexBytes.push(`<span class="hex-byte">${byte.toString(16).toUpperCase().padStart(2, '0')}</span>`);
                    ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                } else {
                    hexBytes.push('<span class="hex-byte">  </span>');
                    ascii += ' ';
                }
            }

            html += `<span class="hex-offset">${offset}</span>${hexBytes.join('')}<span class="hex-ascii">${ascii}</span>\n`;
        }

        this.hexDump.innerHTML = html;
    }

    hexEncode(data) {
        return Array.from(new Uint8Array(data))
            .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
            .join(' ');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    updateSignalStrength() {
        const strength = Math.random() * 40 + 60;
        this.signalFill.style.width = `${strength}%`;
        this.signalValue.textContent = `${Math.round(strength)}%`;

        const range = (Math.random() * 3 + 1).toFixed(1);
        this.rangeValue.textContent = `${range} cm`;
    }

    addTagDot() {
        const dot = document.createElement('div');
        dot.className = 'tag-dot';
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 30 + 20;
        const centerX = 50;
        const centerY = 50;
        dot.style.left = `${centerX + Math.cos(angle) * radius}%`;
        dot.style.top = `${centerY + Math.sin(angle) * radius}%`;
        this.tagDots.appendChild(dot);

        setTimeout(() => dot.remove(), 5000);
    }

    addToHistory(tagData) {
        this.scanHistory.unshift(tagData);
        if (this.scanHistory.length > 50) this.scanHistory.pop();
        this.saveHistory();
        this.renderHistory();
    }

    renderHistory() {
        this.historyCount.textContent = `${this.scanHistory.length} scans`;

        if (this.scanHistory.length === 0) {
            this.historyList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>No scan history</p>
                    <span>Scanned tags will be saved here</span>
                </div>
            `;
            return;
        }

        this.historyList.innerHTML = this.scanHistory.map((tag, i) => `
            <div class="history-item" data-index="${i}">
                <div class="history-icon">${tag.tagType.includes('NTAG') ? 'N' : tag.tagType.includes('MIFARE') ? 'M' : '?'}</div>
                <div class="history-info">
                    <div class="history-uid">${tag.serialNumber}</div>
                    <div class="history-meta">${tag.tagType} | ${tag.chipInfo.chipModel} | ${new Date(tag.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `).join('');

        this.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.displayTagInfo(this.scanHistory[index]);
                this.displayChipInfo(this.scanHistory[index]);
                this.displayNDEFRecords(this.scanHistory[index].records);
                this.displayRawData(this.scanHistory[index]);
                this.switchTab('tagInfo');
            });
        });
    }

    saveHistory() {
        try {
            const historyToSave = this.scanHistory.map(tag => ({
                ...tag,
                records: [] // Don't save binary records to localStorage
            }));
            localStorage.setItem('nfc_scan_history', JSON.stringify(historyToSave));
        } catch (e) {
            console.warn('Could not save history:', e);
        }
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('nfc_scan_history');
            if (saved) {
                this.scanHistory = JSON.parse(saved);
                this.renderHistory();
            }
        } catch (e) {
            console.warn('Could not load history:', e);
        }
    }

    exportHistory() {
        if (this.scanHistory.length === 0) {
            this.log('No history to export', 'warning');
            return;
        }

        const headers = ['Timestamp', 'UID', 'Tag Type', 'Chip Model', 'Manufacturer', 'Technology', 'Memory', 'Protocol', 'Encryption'];
        const rows = this.scanHistory.map(tag => [
            tag.timestamp,
            tag.serialNumber,
            tag.tagType,
            tag.chipInfo.chipModel,
            tag.chipInfo.manufacturer,
            tag.technology,
            tag.chipInfo.memorySize,
            tag.chipInfo.protocol,
            tag.chipInfo.encryption
        ]);

        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nfc_scan_history_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        this.log('History exported as CSV', 'success');
    }

    copyToClipboard(type) {
        if (!this.rawBytes) return;

        let text = '';
        if (type === 'hex') {
            text = this.rawBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        } else if (type === 'base64') {
            const binary = String.fromCharCode.apply(null, this.rawBytes);
            text = btoa(binary);
        }

        navigator.clipboard.writeText(text).then(() => {
            this.log(`${type.toUpperCase()} data copied to clipboard`, 'success');
        }).catch(() => {
            this.log('Failed to copy to clipboard', 'error');
        });
    }

    clearCurrentTag() {
        this.tagDetails.classList.add('hidden');
        this.tagInfoCard.querySelector('.empty-state').classList.remove('hidden');
        this.chipDetails.classList.add('hidden');
        this.chipEmptyState.classList.remove('hidden');
        this.ndefRecords.classList.add('hidden');
        this.ndefEmptyState.classList.remove('hidden');
        this.rawDataContainer.classList.add('hidden');
        this.rawEmptyState.classList.remove('hidden');
        this.signalFill.style.width = '0%';
        this.signalValue.textContent = '--';
        this.rangeValue.textContent = '-- cm';
        this.tagDots.innerHTML = '';
        this.currentTag = null;
        this.rawBytes = null;
        this.log('Display cleared', 'info');
    }

    clearLog() {
        this.logContainer.innerHTML = '';
        this.log('Log cleared', 'info');
    }

    log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        const time = new Date().toLocaleTimeString();
        entry.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${message}</span>`;
        this.logContainer.appendChild(entry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');
    }

    demoScan() {
        this.log('Running demo scan...', 'info');

        const demoTags = [
            {
                uid: '04:A2:3B:71:C2:48:80',
                type: 'NXP NTAG216'
            },
            {
                uid: '04:11:22:33:44:55:66',
                type: 'NXP NTAG213'
            },
            {
                uid: 'A1:B2:C3:D4',
                type: 'MIFARE Classic 1K'
            }
        ];

        const demo = demoTags[Math.floor(Math.random() * demoTags.length)];

        const tagData = this.processTagData(demo.uid, demo.uid, [
            { recordType: 'text', data: new TextEncoder().encode('Hello from NFC Reader Demo!') },
            { recordType: 'url', data: new TextEncoder().encode('https://nfc.example.com/info') }
        ]);

        this.displayTagInfo(tagData);
        this.displayChipInfo(tagData);
        this.displayNDEFRecords(tagData.records);
        this.displayRawData(tagData);
        this.addToHistory(tagData);
        this.updateSignalStrength();
        this.addTagDot();
        this.log(`Demo tag detected: ${demo.uid}`, 'success');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.nfcReader = new NFCDetailReader();
});
