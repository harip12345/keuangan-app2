const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync('app.html', 'utf8');
const helpersStart = source.indexOf('function loanCashDelta(');
const helpersEnd = source.indexOf('function loanNode(', helpersStart);
assert.ok(helpersStart > 0 && helpersEnd > helpersStart);
const helpers = source.slice(helpersStart, helpersEnd);

test('uang yang dipinjamkan dan diterima kembali mengubah saldo dengan arah yang benar', () => {
    const context = {};
    runInNewContext(helpers, context);
    assert.equal(runInNewContext("loanCashDelta('receivable','principal',500)", context), -500);
    assert.equal(runInNewContext("loanCashDelta('receivable','payment',200)", context), 200);
    assert.equal(runInNewContext("loanCashDelta('payable','principal',500)", context), 500);
    assert.equal(runInNewContext("loanCashDelta('payable','payment',200)", context), -200);
    assert.equal(runInNewContext('loanOutstanding({amount:500,paid:200})', context), 300);
});

const paymentStart = source.indexOf("document.getElementById('loanPaymentForm')?.addEventListener('submit'");
const paymentEnd = source.indexOf('        resetLoanForm();', paymentStart);
assert.ok(paymentStart > 0 && paymentEnd > paymentStart);
const paymentListener = source.slice(paymentStart, paymentEnd);
const principalStart = source.indexOf("document.getElementById('loanForm')?.addEventListener('submit'");
assert.ok(principalStart > 0 && paymentStart > principalStart);
const principalListener = source.slice(principalStart,paymentStart);

test('mencatat piutang menyimpan arus kas keluar dan nama peminjam', async () => {
    const saved = [];
    const messages = [];
    const fields = {
        loanForm:{addEventListener(_name,callback){fields.submit=callback;}},
        loanKind:{value:'receivable'},loanParty:{value:'Budi Santoso'},
        loanAmount:{value:'500.000'},loanWallet:{value:'Tunai'},
        loanDate:{value:'2026-10-10'},loanDueDate:{value:'2026-11-10'},loanNote:{value:'Tanpa bunga'},
        loanSubmit:{disabled:false},
    };
    const context = {
        document:{getElementById:id => fields[id]},wallets:['Tunai'],currentProfileId:'p1',DB_COLLECTION:'keuangan_v2',
        db:{collection(){return {doc(){return {collection(){return {add:async data => saved.push(data)};}};}};}},
        firebase:{firestore:{FieldValue:{serverTimestamp:() => 'server-time'}}},
        formatCustomDate:value => value,loanCashDelta:(kind,phase,value) => kind === 'receivable' ? -value : value,
        resetLoanForm(){},showToast:message => messages.push(message),
    };
    runInNewContext('let savingLoan = false; let editingLoanId = null;' + principalListener,context);
    await fields.submit({preventDefault(){}});
    assert.equal(saved.length,1);
    assert.equal(saved[0].type,'loan');
    assert.equal(saved[0].loanPhase,'principal');
    assert.equal(saved[0].party,'Budi Santoso');
    assert.equal(saved[0].walletDelta,-500000);
    assert.equal(fields.loanSubmit.disabled,false);
});

function setupPayment({ amount = '200', failCommit = false } = {}) {
    const record = { type:'loan', loanPhase:'principal', loanKind:'receivable', amount:500, paid:0, date:'10 Okt 2026', party:'Budi' };
    const payments = [];
    const messages = [];
    const fields = {
        loanPaymentForm:{ addEventListener(_name, callback) { fields.submit = callback; }, reset(){} },
        loanPaymentAmount:{ value:amount },
        loanPaymentWallet:{ value:'Tunai' },
        loanPaymentDate:{ value:'2026-10-11' },
        loanPaymentNote:{ value:'Cicilan pertama' },
        loanPaymentSubmit:{ disabled:false },
        loanPaymentCard:{ hidden:false },
        loanListFilter:{ value:'active' },
    };
    const principalRef = { id:'loan1' };
    const paymentRef = { id:'payment1' };
    const collection = { doc(id) { return id ? principalRef : paymentRef; } };
    const db = {
        collection() { return { doc() { return { collection() { return collection; } }; } }; },
        async runTransaction(callback) {
            const writes = [];
            await callback({
                async get(ref) { assert.equal(ref,principalRef); return { exists:true, data:() => ({...record}) }; },
                update(ref,data) { assert.equal(ref,principalRef); writes.push(() => Object.assign(record,data)); },
                set(ref,data) { assert.equal(ref,paymentRef); writes.push(() => payments.push(data)); },
            });
            if(failCommit) throw new Error('Simulasi gagal commit');
            writes.forEach(write => write());
        },
    };
    const context = {
        document:{ getElementById:id => fields[id] },
        db,currentProfileId:'p1',DB_COLLECTION:'keuangan_v2',wallets:['Tunai'],
        firebase:{ firestore:{ FieldValue:{ serverTimestamp:() => 'server-time' } } },
        parseCustomDateToYMD:() => '2026-10-10',formatCustomDate:value => value,
        showToast:message => messages.push(message),
    };
    runInNewContext(helpers + 'let savingLoan = false; let payingLoanId = "loan1"; function closeLoanPayment(){ payingLoanId = null; fields.loanPaymentCard.hidden = true; } ' + paymentListener, {...context,fields});
    return {record,payments,messages,fields,submit:() => fields.submit({preventDefault(){}})};
}

test('pembayaran sebagian memperbarui sisa dan membuat satu arus kas secara atomik', async () => {
    const app = setupPayment();
    await app.submit();
    assert.equal(app.record.paid,200);
    assert.equal(app.payments.length,1);
    assert.equal(app.payments[0].walletDelta,200);
    assert.equal(app.fields.loanListFilter.value,'all');
    assert.equal(app.fields.loanPaymentSubmit.disabled,false);
});

test('pembayaran melebihi sisa ditolak tanpa mengubah data', async () => {
    const app = setupPayment({amount:'600'});
    await app.submit();
    assert.equal(app.record.paid,0);
    assert.equal(app.payments.length,0);
    assert.match(app.messages.at(-1),/melebihi sisa/);
});

test('gagal commit tidak menambah pembayaran maupun mengubah saldo', async () => {
    const app = setupPayment({failCommit:true});
    await app.submit();
    assert.equal(app.record.paid,0);
    assert.equal(app.payments.length,0);
    assert.match(app.messages.at(-1),/Simulasi gagal commit/);
});
