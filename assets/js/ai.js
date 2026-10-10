        // ==================== AI CHAT MODAL ====================
        var aiChatHistory = [];
        var aiModalOpen   = false;
        var aiMsgData     = [];
        var aiDeletePopupTarget = null;
        var aiDirty       = false;

        function toggleAiModalLoaded() {
            var modal    = document.getElementById('aiModal');
            var drawer   = document.getElementById('aiModalDrawer');
            var backdrop = document.getElementById('aiModalBackdrop');
            if (!modal) return;
            if (!aiModalOpen) {
                aiModalOpen = true;
                modal.style.display = 'block';
                modal.style.pointerEvents = 'all';
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        backdrop.style.opacity = '1';
                        backdrop.style.pointerEvents = 'all';
                        drawer.style.transform = 'translateY(0)';
                    });
                });
                if (aiMsgData.length === 0) loadAiHistory();
                setTimeout(function() {
                    var msgs = document.getElementById('aiChatMessages');
                    if (msgs) msgs.scrollTop = msgs.scrollHeight;
                    adjustDrawerForKeyboard();
                }, 350);
            } else {
                // Saat ditutup: kalau ada chat baru yang belum disimpan, tanya dulu (hapus = default)
                if (aiDirty && aiChatHistory.length > 0) {
                    showAiClosePrompt();
                    return;
                }
                performAiClose();
            }
        }

        function performAiClose() {
            var modal    = document.getElementById('aiModal');
            var drawer   = document.getElementById('aiModalDrawer');
            var backdrop = document.getElementById('aiModalBackdrop');
            if (!modal) return;
            aiModalOpen = false;
            backdrop.style.opacity = '0';
            backdrop.style.pointerEvents = 'none';
            drawer.style.transform = 'translateY(100%)';
            setTimeout(function() {
                modal.style.display = 'none';
                modal.style.pointerEvents = 'none';
            }, 320);
            closeDeletePopup();
            aiDirty = false;
        }

        function showAiClosePrompt() {
            var p = document.getElementById('aiClosePrompt');
            if (p) p.classList.add('show');
        }

        function cancelAiClose() {
            var p = document.getElementById('aiClosePrompt');
            if (p) p.classList.remove('show');
        }

        function finishAiClose(action) {
            if (action === 'save') {
                saveAiHistory();
            } else {
                clearAiHistory();
            }
            cancelAiClose();
            performAiClose();
        }

        function saveAiHistory() {
            if (!currentProfileId || !db) return;
            var msgs = [];
            for (var i = 0; i < aiChatHistory.length; i++) {
                var m = aiChatHistory[i];
                msgs.push({ role: m.role === 'assistant' ? 'bot' : 'user', text: m.content });
            }
            if (msgs.length === 0) return;
            Promise.all(msgs.map(function(m) {
                return db.collection(DB_COLLECTION).doc(currentProfileId)
                  .collection('ai_chat').add(Object.assign({}, m, { ts: firebase.firestore.FieldValue.serverTimestamp() }));
            })).then(function() {
                aiMsgData = msgs.map(function(m) { return { id: null, role: m.role, text: m.text }; });
                showToast("Riwayat AI disimpan 📥");
            }).catch(function(e) { console.warn('saveAiHistory:', e); showToast("Gagal menyimpan riwayat"); });
        }

        function clearAiHistory() {
            aiChatHistory = [];
            aiMsgData = [];
            var container = document.getElementById('aiChatMessages');
            if (container) {
                while (container.children.length > 1) container.removeChild(container.lastChild);
            }
            if (currentProfileId && db) {
                db.collection(DB_COLLECTION).doc(currentProfileId)
                  .collection('ai_chat').get().then(function(snap) {
                    var batch = db.batch();
                    snap.forEach(function(doc) { batch.delete(doc.ref); });
                    return batch.commit();
                  }).then(function() { showToast("Riwayat AI dihapus 🗑"); })
                  .catch(function(e) { console.warn('clearAiHistory:', e); showToast("Gagal hapus riwayat"); });
            } else {
                showToast("Riwayat AI dihapus 🗑");
            }
        }

        function adjustDrawerForKeyboard() {
            if (!window.visualViewport) return;
            var vv = window.visualViewport;
            function onVVChange() {
                var drawer = document.getElementById('aiModalDrawer');
                if (!drawer || !aiModalOpen) return;
                var keyboardH = window.innerHeight - vv.height;
                if (keyboardH > 100) {
                    drawer.style.height = (vv.height - 10) + 'px';
                } else {
                    drawer.style.height = '82%';
                }
                var msgs = document.getElementById('aiChatMessages');
                if (msgs) setTimeout(function(){ msgs.scrollTop = msgs.scrollHeight; }, 80);
            }
            vv.addEventListener('resize', onVVChange);
        }

        function getAiUserAvatar() {
            var profile = profiles.find(function(p){ return p.id === currentProfileId; });
            var photo   = (profile && profile.photo) ? profile.photo : '';
            var name    = (profile && profile.name)  ? profile.name  : 'U';
            var initial = name.charAt(0).toUpperCase();
            if (photo) {
                return '<img loading="lazy" src="' + photo + '" class="ai-user-avatar" onerror="this.style.display=\'none\'">';
            }
            var colors = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444'];
            var ci = name.charCodeAt(0) % colors.length;
            return '<div class="ai-user-avatar-fallback" style="background:' + colors[ci] + '">' + initial + '</div>';
        }

        function loadAiHistory() {
            if (!currentProfileId || !db) return;
            db.collection(DB_COLLECTION).doc(currentProfileId)
              .collection('ai_chat').orderBy('ts').limit(80)
              .get().then(function(snap) {
                aiMsgData = [];
                aiChatHistory = [];
                var container = document.getElementById('aiChatMessages');
                if (!container) return;
                while (container.children.length > 1) container.removeChild(container.lastChild);
                snap.forEach(function(doc) {
                    var d = doc.data();
                    d.id = doc.id;
                    aiMsgData.push(d);
                    aiChatHistory.push({ role: d.role === 'bot' ? 'assistant' : 'user', content: d.text });
                    appendBubble(d.role, d.text, false, doc.id);
                });
                var msgs = document.getElementById('aiChatMessages');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }).catch(function(e){ console.warn('loadAiHistory:', e); });
        }

        function saveAiMsg(role, text) {
            if (!currentProfileId || !db) return Promise.resolve(null);
            return db.collection(DB_COLLECTION).doc(currentProfileId)
              .collection('ai_chat').add({
                role: role, text: text,
                ts: firebase.firestore.FieldValue.serverTimestamp()
              });
        }

        function deleteAiMsg(docId) {
            if (!currentProfileId || !db || !docId) return;
            db.collection(DB_COLLECTION).doc(currentProfileId)
              .collection('ai_chat').doc(docId).delete()
              .then(function() {
                var el = document.querySelector('[data-msgid="' + docId + '"]');
                if (el) {
                    el.style.transition = 'opacity .2s';
                    el.style.opacity = '0';
                    setTimeout(function(){ if(el.parentNode) el.remove(); }, 220);
                }
                aiMsgData = aiMsgData.filter(function(m){ return m.id !== docId; });
                aiChatHistory = aiMsgData.map(function(m){
                    return { role: m.role === 'bot' ? 'assistant' : 'user', content: m.text };
                });
              }).catch(function(e){ console.warn('deleteAiMsg:', e); });
        }

        function showDeletePopup(e, docId) {
            if (!docId) return;
            closeDeletePopup();
            aiDeletePopupTarget = docId;
            var popup = document.getElementById('aiDeletePopup');
            if (!popup) return;
            popup.style.display = 'flex';
            var drawer = document.getElementById('aiModalDrawer');
            var rect   = drawer ? drawer.getBoundingClientRect() : {left:0, top:0};
            var clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 120);
            var clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 200);
            var x = clientX - rect.left;
            var y = clientY - rect.top;
            popup.style.left = Math.min(x, rect.width - 160) + 'px';
            popup.style.top  = Math.max(y - 80, 10) + 'px';
        }

        function closeDeletePopup() {
            var popup = document.getElementById('aiDeletePopup');
            if (popup) popup.style.display = 'none';
            aiDeletePopupTarget = null;
        }

        function confirmDeleteAiMsg() {
            if (aiDeletePopupTarget) deleteAiMsg(aiDeletePopupTarget);
            closeDeletePopup();
        }

        function appendBubble(role, text, isTyping, docId) {
            var container = document.getElementById('aiChatMessages');
            if (!container) return null;
            var div = document.createElement('div');
            div.className = 'ai-bubble ai-bubble-' + (role === 'user' ? 'user' : 'bot');
            if (docId) div.setAttribute('data-msgid', docId);

            if (role === 'bot') {
                if (isTyping) {
                    div.innerHTML = '<div class="ai-avatar">🤖</div><div class="ai-bubble-content"><div class="ai-typing"><span></span><span></span><span></span></div></div>';
                } else {
                    var html = text
                        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                        .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
                        .replace(/\n/g,'<br>');
                    div.innerHTML = '<div class="ai-avatar">🤖</div>' +
                        '<div class="ai-bubble-content" data-text="' + text.replace(/"/g,'&quot;') + '">' + html + '</div>' +
                        (docId ? '<div class="ai-select-tick" style="display:none"></div>' : '');
                    if (docId) {
                        div.querySelector('.ai-bubble-content').addEventListener('click', function(e){
                            e.stopPropagation();
                            if (aiSelectMode) { aiToggleSelect(div); }
                            else { showDeletePopup(e, docId); }
                        });
                        var tick = div.querySelector('.ai-select-tick');
                        if (tick) tick.addEventListener('click', function(e){ e.stopPropagation(); aiToggleSelect(div); });
                    }
                }
            } else {
                var avatarHtml = getAiUserAvatar();
                var safeText = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                div.innerHTML = (docId ? '<div class="ai-select-tick" style="display:none"></div>' : '') +
                    '<div class="ai-bubble-content" data-text="' + text.replace(/"/g,'&quot;') + '">' + safeText + '</div>' + avatarHtml;
                if (docId) {
                    div.querySelector('.ai-bubble-content').addEventListener('click', function(e){
                        e.stopPropagation();
                        if (aiSelectMode) { aiToggleSelect(div); }
                        else { showDeletePopup(e, docId); }
                    });
                    var tick = div.querySelector('.ai-select-tick');
                    if (tick) tick.addEventListener('click', function(e){ e.stopPropagation(); aiToggleSelect(div); });
                }
            }
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
            return div;
        }

        // ── Kumpulkan data lengkap untuk konteks AI ─────────────────────────────
        function buatRingkasanKeuangan() {
            var now  = new Date();
            var rp   = function(n){ return 'Rp'+Math.abs(Math.round(n)).toLocaleString('id-ID'); };
            var pct  = function(a,b){ return b?(a/b*100).toFixed(1)+'%':'0%'; };
            var prof = profiles.find(function(p){ return p.id === currentProfileId; });

            // Parse semua transaksi — KECUALIKAN transfer/mutasi antar rekening
            var allTrx = transactions.map(function(t){
                return { t:t, d:parseTrxDate(t.date) };
            }).filter(function(x){
                if (x.d === null) return false;
                // Exclude transaksi transfer/mutasi antar rekening
                var t = x.t;
                if (t.type === 'transfer') return false;
                if (t.category === 'Transfer Mutasi') return false;
                if (t.category === 'transfer') return false;
                return true;
            });

            // Group transaksi per bulan (key: "YYYY-MM")
            var trxPerBulan = {};
            allTrx.forEach(function(x){
                var key = x.d.getFullYear()+'-'+String(x.d.getMonth()+1).padStart(2,'0');
                if (!trxPerBulan[key]) trxPerBulan[key] = [];
                trxPerBulan[key].push(x);
            });
            var sortedBulan = Object.keys(trxPerBulan).sort();

            // Bulan ini
            var bi = now.getMonth(), ti = now.getFullYear();
            var bulanIniKey = ti+'-'+String(bi+1).padStart(2,'0');
            var trxBi = trxPerBulan[bulanIniKey] || [];

            // Ringkasan bulan ini
            var incBi=0, expBi=0;
            trxBi.forEach(function(x){
                if (x.t.type==='income') incBi+=x.t.amount;
                else if (x.t.type==='expense') expBi+=x.t.amount;
            });
            var surplus = incBi - expBi;
            var savingRate = incBi>0?(surplus/incBi*100).toFixed(1):0;

            // Saldo per rekening
            var rekLines = Object.entries(walletBalances)
                .filter(function(e){ return e[1]!==0; })
                .sort(function(a,b){ return b[1]-a[1]; })
                .map(function(e){
                    return e[0]+': '+rp(e[1])+(e[1]<0?' ⚠️MINUS':'');
                });
            var rekMinus = Object.entries(walletBalances)
                .filter(function(e){ return e[1]<0; })
                .map(function(e){ return e[0]+': '+rp(e[1]); });

            // Aset & tabungan
            var asetSav = savings.filter(function(s){ return s.type!=='goal_deposit'; });
            var totalTab = asetSav.filter(function(s){ return s.type==='savings'||!s.type; }).reduce(function(a,s){return a+s.amount;},0);
            var totalInv = asetSav.filter(function(s){ return s.type==='investment'; }).reduce(function(a,s){return a+s.amount;},0);
            var totalFis = asetSav.filter(function(s){ return s.type==='tangible'; }).reduce(function(a,s){return a+s.amount;},0);
            var totalKas = Object.values(walletBalances).reduce(function(a,b){return a+(b>0?b:0);},0);
            var netWorth = totalKas+totalTab+totalInv+totalFis;
            var safeMonths = expBi>0?(totalKas/expBi).toFixed(1):'∞';

            // Goals
            var goalLines = goals.map(function(g){
                var saved=g.saved||0, target=g.target||1;
                return g.name+': '+rp(saved)+'/'+rp(target)+' ('+(saved/target*100).toFixed(0)+'%) sisa '+rp(target-saved);
            });

            // ── BREAKDOWN SEMUA BULAN (detail per tanggal, kategori, nominal) ──
            var semuaBulanLines = [];
            sortedBulan.forEach(function(key){
                var trxList = trxPerBulan[key];
                var p = key.split('-');
                var d = new Date(parseInt(p[0]), parseInt(p[1])-1, 1);
                var nmBulan = d.toLocaleString('id-ID',{month:'long',year:'numeric'});

                var inc2=0, exp2=0, katInc2={}, katExp2={};
                trxList.forEach(function(x){
                    if (x.t.type==='income'){ inc2+=x.t.amount; katInc2[x.t.category]=(katInc2[x.t.category]||0)+x.t.amount; }
                    else if (x.t.type==='expense'){ exp2+=x.t.amount; katExp2[x.t.category]=(katExp2[x.t.category]||0)+x.t.amount; }
                });

                // Header bulan
                semuaBulanLines.push('');
                semuaBulanLines.push('=== '+nmBulan.toUpperCase()+' ===');
                semuaBulanLines.push('Pemasukan: '+rp(inc2)+'  Pengeluaran: '+rp(exp2)+'  Selisih: '+(inc2>=exp2?'+':'')+rp(inc2-exp2)+'  ('+trxList.length+' trx)');

                // Breakdown kategori pemasukan bulan ini
                var katIncList = Object.entries(katInc2).sort(function(a,b){return b[1]-a[1];});
                if (katIncList.length) {
                    semuaBulanLines.push('  [PEMASUKAN per kategori]');
                    katIncList.forEach(function(e){
                        semuaBulanLines.push('  + '+e[0]+': '+rp(e[1])+' ('+pct(e[1],inc2)+')');
                    });
                }

                // Breakdown kategori pengeluaran bulan ini
                var katExpList = Object.entries(katExp2).sort(function(a,b){return b[1]-a[1];});
                if (katExpList.length) {
                    semuaBulanLines.push('  [PENGELUARAN per kategori]');
                    katExpList.forEach(function(e){
                        semuaBulanLines.push('  - '+e[0]+': '+rp(e[1])+' ('+pct(e[1],exp2)+')');
                    });
                }

                // Detail per tanggal (semua transaksi)
                var perTgl2 = {};
                trxList.forEach(function(x){
                    var tglKey = String(x.d.getDate()).padStart(2,'0')+'/'+String(x.d.getMonth()+1).padStart(2,'0');
                    if (!perTgl2[tglKey]) perTgl2[tglKey] = [];
                    perTgl2[tglKey].push(
                        (x.t.type==='income'?'  [+]':'  [-]')+
                        ' '+rp(x.t.amount)+
                        ' | '+(x.t.category||'-')+
                        (x.t.wallet?' | '+x.t.wallet:'')+
                        (x.t.note?' | "'+x.t.note+'"':'')
                    );
                });
                semuaBulanLines.push('  [DETAIL PER TANGGAL]');
                Object.keys(perTgl2).sort().forEach(function(tgl){
                    semuaBulanLines.push('  '+tgl+':');
                    perTgl2[tgl].forEach(function(l){ semuaBulanLines.push('    '+l); });
                });
            });

            var lines = [
                '====== DATA KEUANGAN LENGKAP ======',
                'Profil : '+(prof?prof.name:'User'),
                'Waktu  : '+now.toLocaleString('id-ID',{dateStyle:'full',timeStyle:'short'}),
                '',
                '--- RINGKASAN BULAN INI ('+now.toLocaleString('id-ID',{month:'long',year:'numeric'})+') ---',
                'Pemasukan : '+rp(incBi),
                'Pengeluaran: '+rp(expBi),
                'Surplus   : '+(surplus>=0?'+':'')+rp(surplus),
                'Saving rate: '+savingRate+'% '+(savingRate>=20?'✓ Sehat':savingRate>=10?'⚠ Cukup':'✗ Rendah'),
                '',
                '--- SALDO PER REKENING ---',
                rekLines.length?rekLines.join('\n  '):'(tidak ada)',
                rekMinus.length?'⚠️ REKENING MINUS: '+rekMinus.join(', '):'✓ Tidak ada rekening minus',
                '',
                '--- KEKAYAAN / NET WORTH ---',
                'Total Kas       : '+rp(totalKas),
                'Total Tabungan  : '+rp(totalTab),
                'Total Investasi : '+rp(totalInv),
                'Total Aset Fisik: '+rp(totalFis),
                'NET WORTH       : '+rp(netWorth),
                'Dana darurat    : '+safeMonths+' bulan pengeluaran',
                '',
                '--- TARGET / GOALS ---',
                goalLines.length?goalLines.join('\n  '):'(tidak ada goals)',
                '',
                '--- BREAKDOWN LENGKAP SEMUA BULAN ---',
                '(Mencakup '+sortedBulan.length+' bulan dengan data, total '+allTrx.length+' transaksi)',
            ].concat(semuaBulanLines);

            lines.push('');
            lines.push('====== AKHIR DATA ======');
            return lines.join('\n');
        }

                async function sendAiChat() {
            var input   = document.getElementById('aiChatInput');
            var sendBtn = document.getElementById('aiSendBtn');
            if (!input) return;
            var userText = input.value.trim();
            if (!userText) return;
            input.value = ''; input.style.height = 'auto';
            sendBtn.disabled = true;
            closeDeletePopup();
            var qp = document.getElementById('quickPrompts');
            if (qp) qp.style.display = 'none';

            // Render pesan user (tidak disimpan otomatis — hanya bila dipilih "Simpan" saat menutup chat)
            aiDirty = true;
            appendBubble('user', userText, false, null);
            aiChatHistory.push({ role:'user', content: userText });
            if (aiChatHistory.length > 14) aiChatHistory = aiChatHistory.slice(-14);

            var typingBubble = appendBubble('bot', '', true, null);

            try {
                var resp = await fetch('/api/ai-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + await auth.currentUser.getIdToken() },
                    body: JSON.stringify({ history: aiChatHistory.slice(-8), konteks: buatRingkasanKeuangan() })
                });
                if (!resp.ok) {
                    var ed = await resp.json().catch(function(){return{};});
                    throw new Error(ed.error || 'HTTP ' + resp.status);
                }
                var data = await resp.json();
                var replyText = data.reply || 'Maaf, tidak ada respons.';

                // Render balasan AI (tidak disimpan otomatis)
                if (typingBubble && typingBubble.parentNode) typingBubble.remove();
                appendBubble('bot', replyText, false, null);
                aiChatHistory.push({ role:'assistant', content: replyText });

            } catch(err) {
                if (typingBubble && typingBubble.parentNode) {
                    typingBubble.innerHTML = '<div class="ai-avatar">🤖</div><div class="ai-bubble-content" style="color:var(--expense)">❌ ' + (err.message||'Coba lagi') + '</div>';
                }
            } finally {
                sendBtn.disabled = false;
            }
        }

        function sendQuickPrompt(text) {
            var input = document.getElementById('aiChatInput');
            if (!input) return;
            input.value = text;
            sendAiChat();
        }

        // ── Salin teks bubble ─────────────────────────────────────────────────
        function aiCopyMsg() {
            var popup = document.getElementById('aiDeletePopup');
            var docId = aiDeletePopupTarget;
            closeDeletePopup();
            if (!docId) return;
            var el = document.querySelector('[data-msgid="' + docId + '"] .ai-bubble-content');
            var txt = el ? (el.getAttribute('data-text') || el.innerText) : '';
            if (!txt) return;
            navigator.clipboard.writeText(txt).then(function() {
                var flash = document.createElement('div');
                flash.className = 'ai-copied-flash';
                flash.textContent = '✓ Teks disalin';
                var drawer = document.getElementById('aiModalDrawer');
                if (drawer) drawer.appendChild(flash);
                setTimeout(function(){ if(flash.parentNode) flash.remove(); }, 1000);
            }).catch(function() {
                // Fallback untuk browser yang tidak support clipboard API
                var ta = document.createElement('textarea');
                ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                document.execCommand('copy'); document.body.removeChild(ta);
            });
        }

        // ── Mode seleksi massal ────────────────────────────────────────────────
        var aiSelectMode = false;
        var aiSelectedIds = new Set();

        function aiMarkForDelete() {
            var docId = aiDeletePopupTarget;
            closeDeletePopup();
            // Masuk ke mode seleksi dan langsung tandai bubble ini
            aiEnterSelectMode();
            if (docId) {
                var el = document.querySelector('[data-msgid="' + docId + '"]');
                if (el) aiToggleSelect(el);
            }
        }

        function aiEnterSelectMode() {
            aiSelectMode = true;
            aiSelectedIds.clear();
            // Tampilkan semua tick
            document.querySelectorAll('#aiChatMessages .ai-select-tick').forEach(function(t){
                t.style.display = 'flex';
                t.innerHTML = '';
            });
            // Tampilkan toolbar
            var bar = document.getElementById('aiSelectBar');
            if (bar) bar.classList.add('active');
            // Kurangi padding bawah chat agar tidak tertutup toolbar
            var msgs = document.getElementById('aiChatMessages');
            if (msgs) msgs.style.paddingBottom = '60px';
            aiUpdateSelectCount();
        }

        function aiCancelSelect() {
            aiSelectMode = false;
            aiSelectedIds.clear();
            // Sembunyikan semua tick & hapus state selected
            document.querySelectorAll('#aiChatMessages .ai-bubble').forEach(function(b){
                b.classList.remove('ai-bubble-selected');
            });
            document.querySelectorAll('#aiChatMessages .ai-select-tick').forEach(function(t){
                t.style.display = 'none';
                t.innerHTML = '';
            });
            var bar = document.getElementById('aiSelectBar');
            if (bar) bar.classList.remove('active');
            var msgs = document.getElementById('aiChatMessages');
            if (msgs) msgs.style.paddingBottom = '';
        }

        function aiToggleSelect(bubbleEl) {
            var docId = bubbleEl.getAttribute('data-msgid');
            if (!docId) return;
            var tick = bubbleEl.querySelector('.ai-select-tick');
            if (aiSelectedIds.has(docId)) {
                aiSelectedIds.delete(docId);
                bubbleEl.classList.remove('ai-bubble-selected');
                if (tick) tick.innerHTML = '';
            } else {
                aiSelectedIds.add(docId);
                bubbleEl.classList.add('ai-bubble-selected');
                if (tick) tick.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            }
            aiUpdateSelectCount();
        }

        function aiUpdateSelectCount() {
            var countEl = document.getElementById('aiSelectCount');
            var n = aiSelectedIds.size;
            if (countEl) countEl.textContent = n + ' pesan dipilih';
            // Nonaktifkan tombol hapus jika tidak ada yang dipilih
            var delBtn = document.querySelector('.ai-select-delete');
            if (delBtn) delBtn.style.opacity = n > 0 ? '1' : '0.4';
        }

        async function aiDeleteSelected() {
            if (aiSelectedIds.size === 0) return;
            var ids = Array.from(aiSelectedIds);
            aiCancelSelect();
            // Hapus satu per satu
            for (var i = 0; i < ids.length; i++) {
                await new Promise(function(resolve) {
                    deleteAiMsg(ids[i]);
                    setTimeout(resolve, 80); // Jeda kecil antar hapus
                });
            }
        }

        // Tutup popup jika klik di luar
        document.addEventListener('click', function(e) {
            var popup = document.getElementById('aiDeletePopup');
            if (popup && popup.style.display === 'flex' && !popup.contains(e.target)) {
                closeDeletePopup();
            }
        });
        // ==================== /AI CHAT MODAL ====================
