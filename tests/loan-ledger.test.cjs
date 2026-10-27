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

function setupPayment({ amount = '200', failCommit = false, kind = 'receivable', date = '2026-10-11', previous = null } = {}) {
    const record = { type:'loan', loanPhase:'principal', loanKind:kind, amount:500, paid:previous?.amount || 0, date:'2026-10-10', party:'Budi' };
    const payments = [];
    const messages = [];
    const fields = {
        loanPaymentForm:{ addEventListener(_name, callback) { fields.submit = callback; }, reset(){} },
        loanPaymentAmount:{ value:amount },
        loanPaymentWallet:{ value:'Tunai' },
        loanPaymentDate:{ value:date },
        loanPaymentNote:{ value:'Cicilan pertama' },
        loanPaymentSubmit:{ disabled:false },
        loanPaymentCard:{ hidden:false },
        loanListFilter:{ value:'active' },
    };
    const principalRef = { id:'loan1' };
    const paymentRef = { id:'payment1' };
    const collection = { doc(id) { return id === 'loan1' ? principalRef : paymentRef; } };
    const db = {
        collection() { return { doc() { return { collection() { return collection; } }; } }; },
        async runTransaction(callback) {
            const writes = [];
            await callback({
                async get(ref) { return { exists:true, data:() => ref === principalRef ? ({...record}) : ({...previous,loanId:'loan1'}) }; },
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
        parseCustomDateToYMD:value => value,formatCustomDate:value => value,
        showToast:message => messages.push(message),
    };
    runInNewContext(helpers + `let editingLoanPaymentId = ${previous ? '"payment1"' : 'null'}; let savingLoan = false; let payingLoanId = "loan1"; function closeLoanPayment(){ payingLoanId = null; fields.loanPaymentCard.hidden = true; } ` + paymentListener, {...context,fields});
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

test('utang dibayar tanggal 30 hanya mengurangi saldo mulai tanggal 30', async () => {
    const app = setupPayment({kind:'payable',date:'2026-10-30'});
    await app.submit();
    const payment = app.payments[0];
    assert.equal(payment.date,'2026-10-30');
    assert.equal(payment.walletDelta,-200);
    const context = {parseCustomDateToYMD:value => value};
    runInNewContext(helpers,context);
    context.payment = payment;
    assert.equal(runInNewContext("effectiveLoanDelta(payment,'2026-10-24')",context),0);
    assert.equal(runInNewContext("effectiveLoanDelta(payment,'2026-10-29')",context),0);
    assert.equal(runInNewContext("effectiveLoanDelta(payment,'2026-10-30')",context),-200);
});

test('edit cicilan mengganti nominal dan tanggal tanpa menggandakan total terbayar', async () => {
    const app = setupPayment({kind:'payable',amount:'300',date:'2026-10-30',previous:{amount:200}});
    await app.submit();
    assert.equal(app.record.paid,300);
    assert.equal(app.payments.length,1);
    assert.equal(app.payments[0].walletDelta,-300);
    assert.equal(app.payments[0].date,'2026-10-30');
});

test('edit cicilan melebihi pokok tetap ditolak', async () => {
    const app = setupPayment({amount:'600',previous:{amount:200}});
    await app.submit();
    assert.equal(app.record.paid,200);
    assert.equal(app.payments.length,0);
});

test('tanggal pembayaran sebelum pinjaman ditolak', async () => {
    const app = setupPayment({date:'2026-10-09'});
    await app.submit();
    assert.equal(app.record.paid,0);
    assert.equal(app.payments.length,0);
    assert.match(app.messages.at(-1),/Tanggal pembayaran/);
});

test('hapus cicilan mengembalikan sisa pinjaman secara atomik', async () => {
    const start = source.indexOf('function deleteLoanPayment(');
    const end = source.indexOf('function renderLoans(',start);
    const loan = {paid:300}, payment = {id:'p1',loanId:'l1',loanPhase:'payment',amount:100};
    const removed = [];
    let confirmed;
    const context = {
        transactions:[payment],currentProfileId:'profile',DB_COLLECTION:'keuangan_v2',editingLoanPaymentId:null,
        requireConfirm(_text,callback){confirmed=callback;},showToast(){},
        db:{collection(){return {doc(){return {collection(){return {doc(id){return {id};}};}};}};},
            async runTransaction(callback){await callback({
                async get(ref){return {exists:true,data:()=>ref.id==='p1'?payment:loan};},
                update(_ref,data){Object.assign(loan,data);},delete(ref){removed.push(ref.id);}
            });}}
    };
    runInNewContext(source.slice(start,end)+"deleteLoanPayment('p1');",context);
    await confirmed();
    assert.equal(loan.paid,200);
    assert.deepEqual(removed,['p1']);
});

test('hapus pokok juga menghapus semua pembayaran terkait dalam transaksi yang sama', async () => {
    const start = source.indexOf('function deleteLoan(id)');
    const end = source.indexOf('function editLoanPayment(',start);
    const records = {l1:{id:'l1',type:'loan',loanPhase:'principal',party:'Budi',paid:300},p1:{id:'p1',loanId:'l1',loanPhase:'payment',amount:100},p2:{id:'p2',loanId:'l1',loanPhase:'payment',amount:200}};
    const removed = [];let confirmed;
    const context = {
        transactions:Object.values(records),currentProfileId:'profile',DB_COLLECTION:'keuangan_v2',editingLoanId:null,
        requireConfirm(_text,callback){confirmed=callback;},closeLoanPayment(){},showToast(){},
        db:{collection(){return {doc(){return {collection(){return {doc(id){return {id};}};}};}};},async runTransaction(callback){await callback({
            async get(ref){return {exists:!!records[ref.id],data:()=>records[ref.id]};},delete(ref){removed.push(ref.id);}
        });}}
    };
    runInNewContext(helpers+source.slice(start,end)+"deleteLoan('l1');",context);
    await confirmed();
    assert.deepEqual(removed,['p1','p2','l1']);
});

test('daftar pembayaran kedaluwarsa mencegah penghapusan pokok', async () => {
    const context = {transactions:[]};
    runInNewContext(helpers,context);
    const tx = {get:async()=>({exists:true,data:()=>({loanPhase:'principal',paid:100})})};
    await assert.rejects(context.readLoanLedger(tx,{doc:id=>({id})},'l1'),/belum tersinkron/);
});
