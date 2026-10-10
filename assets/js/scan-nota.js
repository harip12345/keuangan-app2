        // ==================== SCAN NOTA ====================
        (function() {
            var inputEl = document.getElementById('inputScanNota');
            if (!inputEl) return;

            function compressImage(file) {
                return new Promise(function(resolve) {
                    if (file.type === 'application/pdf') {
                        var r = new FileReader();
                        r.onload = function() { resolve({ base64: r.result.split(',')[1], mimeType: 'application/pdf' }); };
                        r.readAsDataURL(file); return;
                    }
                    var img = new Image();
                    var url = URL.createObjectURL(file);
                    img.onload = function() {
                        URL.revokeObjectURL(url);
                        var MAX = 1200, w = img.width, h = img.height;
                        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h*MAX/w); w = MAX; } else { w = Math.round(w*MAX/h); h = MAX; } }
                        var canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                        resolve({ base64: canvas.toDataURL('image/jpeg', 0.82).split(',')[1], mimeType: 'image/jpeg' });
                    };
                    img.onerror = function() {
                        var r = new FileReader();
                        r.onload = function() { resolve({ base64: r.result.split(',')[1], mimeType: file.type || 'image/jpeg' }); };
                        r.readAsDataURL(file);
                    };
                    img.src = url;
                });
            }

            inputEl.addEventListener('change', async function(e) {
                var file = e.target.files[0]; if (!file) return;
                var statusEl = document.getElementById('scanNotaStatus');
                var btnScan  = document.getElementById('btnScanNota');
                statusEl.style.display = 'block';
                statusEl.style.background = 'var(--primary-light)';
                statusEl.style.color = 'var(--primary)';
                statusEl.innerHTML = '⏳ Mengompres & mengirim ke AI...';
                btnScan.disabled = true;
                try {
                    var compressed = await compressImage(file);
                    var response = await fetch('/api/scan-nota', {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + await auth.currentUser.getIdToken() },
                        body: JSON.stringify({ imageBase64: compressed.base64, mimeType: compressed.mimeType })
                    });
                    if (!response.ok) { var ed = await response.json().catch(function(){return{};}); throw new Error(ed.error || 'HTTP ' + response.status); }
                    var data = await response.json();
                    if (data.error) throw new Error(data.error);
                    var hasil = data.hasil;
                    if (!hasil) throw new Error('Respons tidak valid dari server.');
                    var filled = [];

                    // Type (income/expense)
                    var typeSel = document.getElementById('type');
                    if (hasil.type && typeSel) {
                        typeSel.value = hasil.type;
                        if (typeof handleTypeChange === 'function') handleTypeChange();
                        filled.push(hasil.type === 'income' ? 'Pemasukan' : 'Pengeluaran');
                    }
                    // Tanggal
                    var dateEl = document.getElementById('trxDate');
                    if (hasil.tanggal && dateEl) { dateEl.value = hasil.tanggal; filled.push('tanggal'); }
                    // Nominal
                    var amtEl = document.getElementById('amount');
                    if (hasil.nominal && amtEl) {
                        amtEl.value = String(Math.round(Number(hasil.nominal))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                        filled.push('nominal');
                    }
                    // Keterangan
                    var noteEl = document.getElementById('note');
                    if (hasil.keterangan && noteEl) { noteEl.value = hasil.keterangan; filled.push('keterangan'); }
                    // Kategori
                    var catEl = document.getElementById('category');
                    if (hasil.kategori && catEl) {
                        var opts = Array.from(catEl.options).map(function(o){return o.value;});
                        if (opts.includes(hasil.kategori)) {
                            catEl.value = hasil.kategori;
                        }
                        // Custom category jika "Lainnya"
                        if (hasil.kategori === 'Lainnya') {
                            var ccGroup = document.getElementById('customCategoryGroup');
                            var ccInput = document.getElementById('customCategory');
                            if (ccGroup) ccGroup.classList.remove('hidden');
                            if (ccInput && hasil.kategori_custom) ccInput.value = hasil.kategori_custom;
                        } else {
                            if (typeof checkCustomCategory === 'function') checkCustomCategory();
                        }
                        filled.push('kategori');
                    }
                    // Wallet
                    var walletEl = document.getElementById('walletSelect');
                    if (hasil.wallet && walletEl) {
                        var wOpts = Array.from(walletEl.options).map(function(o){return o.value;});
                        if (wOpts.includes(hasil.wallet)) { walletEl.value = hasil.wallet; filled.push('rekening: ' + hasil.wallet); }
                        else if (wOpts.includes('Tunai')) { walletEl.value = 'Tunai'; filled.push('rekening: Tunai'); }
                    }

                    var modelInfo = data.model_used ? ' <span style="opacity:.6;font-size:.75rem">(' + data.model_used + ')</span>' : '';
                    statusEl.style.background = '#D1FAE5'; statusEl.style.color = '#065F46';
                    // Auto-simpan transaksi hasil scan
                    var _trxForm = document.getElementById('transactionForm');
                    var _canAutoSave = _trxForm && hasil.nominal && hasil.type && (typeof editingTrxId === 'undefined' || !editingTrxId);
                    if (_canAutoSave) {
                        statusEl.innerHTML = '✅ Nota terbaca & <strong>langsung disimpan</strong> (' + filled.join(', ') + ').' + modelInfo;
                        if (typeof _trxForm.requestSubmit === 'function') _trxForm.requestSubmit();
                        else _trxForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                    } else {
                        statusEl.innerHTML = '✅ Berhasil! <strong>' + filled.join(', ') + '</strong> terisi otomatis.' + modelInfo;
                    }
                } catch(err) {
                    console.error('Scan nota:', err);
                    statusEl.style.background = 'var(--warning-bg)'; statusEl.style.color = 'var(--warning-text)';
                    statusEl.innerHTML = '❌ <strong>Error:</strong> ' + (err.message || 'Gagal membaca nota.');
                } finally {
                    btnScan.disabled = false;
                    inputEl.value = '';
                }
            });
        })();
        // ==================== /SCAN NOTA ====================
