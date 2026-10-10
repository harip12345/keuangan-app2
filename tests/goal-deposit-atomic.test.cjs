const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync('app.html', 'utf8');
const start = source.indexOf('async function confirmGoalDeposit()');
const end = source.indexOf('// Edit goal — prefill form', start);
assert.ok(start > 0 && end > start, 'fungsi setoran target ditemukan');
const depositFunction = source.slice(start, end);

function setup({ failCommit = false, wallet = 'Tunai' } = {}) {
    const records = {
        goal: { name: 'Dana Darurat', saved: 100, target: 1000 },
        deposits: [],
    };
    const input = {
        goalDepositAmount: { value: '25' },
        goalDepositWallet: { value: wallet },
        goalDepositDate: { value: '2026-10-10' },
        btnConfirmDeposit: { disabled: false, innerText: 'Konfirmasi Setoran' },
    };
    const messages = [];
    const refs = {
        goal: { kind: 'goal' },
        deposit: { kind: 'deposit' },
    };
    const db = {
        collection() {
            return { doc() {
                return { collection(name) {
                    return { doc() { return name === 'goals' ? refs.goal : refs.deposit; } };
                } };
            } };
        },
        async runTransaction(callback) {
            const staged = [];
            await callback({
                async get(ref) {
                    assert.equal(ref, refs.goal);
                    return { exists: true, data: () => ({ ...records.goal }) };
                },
                update(ref, data) { staged.push(() => Object.assign(records.goal, data)); },
                set(ref, data) { staged.push(() => records.deposits.push(data)); },
            });
            if (failCommit) throw new Error('Simulasi gagal commit');
            staged.forEach(write => write());
        },
    };
    const context = {
        goals: [{ id: 'g1', name: 'Dana Darurat', saved: 10, target: 1000 }],
        currentDepositGoalId: 'g1', currentProfileId: 'p1', DB_COLLECTION: 'keuangan_v2',
        document: { getElementById: id => input[id] },
        db, firebase: { firestore: { FieldValue: { serverTimestamp: () => 'timestamp' } } },
        getTodayYMD: () => '2026-10-10', formatCustomDate: value => value,
        closeGoalDepositModal() {}, showToast: message => messages.push(message),
    };
    runInNewContext(depositFunction, context);
    return { records, input, messages, save: () => runInNewContext('confirmGoalDeposit()', context) };
}

test('setoran memakai nilai target terbaru dan menyimpan riwayat satu transaksi', async () => {
    const app = setup({ wallet: 'Tunai' });
    await app.save();
    assert.equal(app.records.goal.saved, 125, app.messages.join(' | '));
    assert.equal(app.records.deposits.length, 1);
    assert.equal(app.records.deposits[0].amount, 25);
    assert.equal(app.records.deposits[0].sourceWallet, 'Tunai');
    assert.equal(app.input.btnConfirmDeposit.disabled, false);
});

test('gagal commit tidak mengubah target maupun membuat setoran', async () => {
    const app = setup({ failCommit: true });
    await app.save();
    assert.equal(app.records.goal.saved, 100);
    assert.equal(app.records.deposits.length, 0);
    assert.match(app.messages.at(-1), /Gagal menyimpan/);
});

test('setoran tanpa dompet tetap tercatat tanpa memotong saldo', async () => {
    const app = setup({ wallet: 'None' });
    await app.save();
    assert.equal(app.records.goal.saved, 125, app.messages.join(' | '));
    assert.equal(app.records.deposits[0].sourceWallet, 'None');
});

const editStart = source.indexOf('async function saveDepositEdit()');
const deleteStart = source.indexOf('function deleteDeposit(', editStart);
const editEnd = source.indexOf('// =====================================================', deleteStart);
assert.ok(editStart > 0 && deleteStart > editStart && editEnd > deleteStart);

function setupExistingDeposit(action, failCommit = false) {
    const records = {
        goal: { name: 'Dana Darurat', saved: 100 },
        deposit: { amount: 40, depositAmount: 40, sourceWallet: 'Tunai' },
    };
    const refs = { goal: { kind: 'goal' }, deposit: { kind: 'deposit' } };
    const input = {
        depositEditAmount: { value: '60' },
        depositEditWallet: { value: 'Bank' },
        depositEditDate: { value: '2026-10-10' },
        btnSaveDepositEdit: { disabled: false, innerText: 'Simpan Perubahan' },
    };
    const messages = [];
    let confirmation;
    const context = {
        editingDepositId: 'd1', editingDepositGoalId: 'g1',
        currentProfileId: 'p1', DB_COLLECTION: 'keuangan_v2',
        savings: [{ id: 'd1', goalId: 'g1', amount: 40, depositAmount: 40, date: 'lama' }],
        goals: [{ id: 'g1', name: 'Dana Darurat', saved: 100 }],
        document: { getElementById: id => input[id] },
        getTodayYMD: () => '2026-10-10', formatCustomDate: value => value,
        formatRupiah: value => String(value), closeDepositEditModal() {},
        showToast: value => messages.push(value),
        requireConfirm: (message, callback) => { confirmation = callback(); },
        db: {
            collection() { return { doc() { return { collection(name) { return {
                doc() { return name === 'goals' ? refs.goal : refs.deposit; },
            }; } }; } }; },
            async runTransaction(callback) {
                const staged = [];
                await callback({
                    async get(ref) {
                        return { exists: true, data: () => ({ ...records[ref.kind] }) };
                    },
                    update(ref, data) { staged.push(() => Object.assign(records[ref.kind], data)); },
                    delete(ref) { staged.push(() => { records[ref.kind] = null; }); },
                });
                if (failCommit) throw new Error('Simulasi gagal commit');
                staged.forEach(write => write());
            },
        },
    };
    runInNewContext(source.slice(editStart, editEnd), context);
    return {
        records, messages, input,
        async run() {
            if (action === 'edit') await runInNewContext('saveDepositEdit()', context);
            else {
                runInNewContext("deleteDeposit('d1', 'g1')", context);
                await confirmation;
            }
        },
    };
}

test('edit setoran memperbarui riwayat dan progres bersama', async () => {
    const app = setupExistingDeposit('edit');
    await app.run();
    assert.equal(app.records.goal.saved, 120);
    assert.equal(app.records.deposit.amount, 60);
    assert.equal(app.records.deposit.sourceWallet, 'Bank');
});

test('gagal menghapus setoran tidak mengurangi progres target', async () => {
    const app = setupExistingDeposit('delete', true);
    await app.run();
    assert.equal(app.records.goal.saved, 100);
    assert.equal(app.records.deposit.amount, 40);
    assert.match(app.messages.at(-1), /Gagal/);
});
