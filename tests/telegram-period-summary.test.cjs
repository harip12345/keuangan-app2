const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const api=import('../api/lib/_telegramSummary.js');
const today='2026-11-18';

test('periode Indonesia, numerik, ISO, dan batas inklusif',async()=>{
 const {parseSummaryRequest:p}=await api;
 for(const input of ['saldo dari 26 oktober sampai hari ini','cek saldo 26/10/2026 sampai 18/11/2026','berapa saldo saya dari 2026-10-26 hingga 2026-11-18?','saldo periode dari tanggal 26 oktober sampai dengan hari ini'])
  assert.deepEqual(p(input,today),{metric:'balance',start:'2026-10-26',end:today},input);
 assert.deepEqual(p('/pemasukan 1 november sampai 18 november',today),{metric:'income',start:'2026-11-01',end:today});
 assert.deepEqual(p('pengeluaran 26 sampai 30 oktober',today),{metric:'expense',start:'2026-10-26',end:'2026-10-30'});
});
test('periode relatif dan tanggal tunggal',async()=>{
 const {parseSummaryRequest:p}=await api;
 assert.equal(p('pengeluaran bulan ini',today).start,'2026-11-01');
 assert.deepEqual(p('pemasukan bulan lalu',today),{metric:'income',start:'2026-10-01',end:'2026-10-31'});
 assert.deepEqual(p('saldo sejak tanggal 26',today),{metric:'balance',start:'2026-10-26',end:today});
 assert.equal(p('saldo minggu ini',today).start,'2026-11-16');
 assert.deepEqual(p('pengeluaran kemarin',today),{metric:'expense',start:'2026-11-17',end:'2026-11-17'});
 assert.equal(p('saldo',today).start,null);
 assert.equal(p('pemasukan tanggal 15 november',today).end,'2026-11-15');
});
test('rentang pergantian tahun dan tahun kabisat',async()=>{
 const {parseSummaryRequest:p}=await api;
 assert.equal(p('saldo sejak 26 desember','2027-01-18').start,'2026-12-26');
 assert.equal(p('saldo 26 desember sampai hari ini','2027-01-18').start,'2026-12-26');
 assert.equal(p('saldo 26 desember 2026 sampai 18 januari','2027-01-18').end,'2027-01-18');
 assert.equal(p('saldo 29 februari 2024',today).start,'2024-02-29');
});
test('tanggal tidak valid atau terbalik ditolak tanpa diam-diam mengganti periode',async()=>{
 const {parseSummaryRequest:p}=await api;
 for(const input of ['saldo 31 november sampai hari ini','saldo 29 februari 2026','saldo 20 november 2026 sampai 10 november 2026','saldo 30 oktober sampai 20 oktober 2026'])
  assert.throws(()=>p(input,today),/Tanggal|tanggal|Periode/);
});
test('pencatatan transaksi biasa tidak dianggap permintaan laporan',async()=>{
 const {parseSummaryRequest:p}=await api;
 for(const input of ['makan 50000 tanggal 26 oktober','gaji 5jt','pengeluaran 50000 makan','pemasukan 5jt','ai analisis saldo bulan ini']) assert.equal(p(input,today),null,input);
});
test('routing pertanyaan periode dan tanggal invalid mendahului AI dan pencatatan',async()=>{
 const {routeIntent}=await import('../api/telegram-webhook.js');
 for(const input of ['berapa saldo dari 26 oktober sampai hari ini?','pemasukan 26 oktober sampai hari ini','pengeluaran bulan ini','saldo 31 november sampai hari ini']) assert.equal(routeIntent(input),'summary',input);
 assert.equal(routeIntent('gaji 5jt'),'transaksi');
 assert.equal(routeIntent('/pengeluaran bulan ini'),'command');
});
test('ringkasan memisahkan penghasilan, pengeluaran, arus pinjaman dan tanggal pembayaran',async()=>{
 const {parseSummaryRequest:p,summarizePeriod:s,periodSummaryText:format}=await api;
 const loan=(loanKind,loanPhase,amount,date)=>({type:'loan',loanKind,loanPhase,amount,date});
 const records=[
  {type:'income',amount:999,date:'25 Okt 2026'},
  {type:'income',amount:5000,date:'26 Okt 2026'},
  {type:'expense',amount:2000,date:'18 Nov 2026'},
  loan('payable','principal',1000,'24 Okt 2026'),
  loan('payable','payment',300,'30 Okt 2026'),
  loan('receivable','principal',500,'27 Okt 2026'),
  loan('receivable','payment',100,'2026-11-18'),
  loan('payable','principal',200,'1 Nov 2026'),
  loan('payable','payment',700,'19 Nov 2026'),
  {type:'transfer',amount:900,date:'28 Okt 2026'},
  {type:'expense',amount:888,date:'invalid'},
 ];
 const request=p('saldo dari 26 oktober sampai hari ini',today),sum=s(records,request,today);
 assert.equal(sum.income,5000);assert.equal(sum.expense,2000);assert.equal(sum.net,3000);
 assert.equal(sum.borrowed,200);assert.equal(sum.lent,500);assert.equal(sum.debtPaid,300);assert.equal(sum.receivablePaid,100);
 assert.equal(sum.loanNet,-500);assert.equal(sum.cashNet,2500);assert.equal(sum.count,6);assert.equal(sum.invalidDates,1);
 const text=format(sum,request,today);assert.match(text,/Sisa setelah arus utang-piutang/);assert.match(text,/Saldo sebelum periode tidak dimasukkan/);
 assert.equal(s(records,p('saldo tanggal 29 oktober',today),today).debtPaid,0);
 assert.equal(s(records,p('saldo tanggal 30 oktober',today),today).debtPaid,300);
});
test('periode kosong dan mendatang dijelaskan, zona waktu WIB konsisten',async()=>{
 const {parseSummaryRequest:p,summarizePeriod:s,periodSummaryText:format,jakartaToday}=await api;
 const request=p('saldo 20 november sampai 25 november',today);
 const summary=s([{type:'income',amount:100,date:'20 Nov 2026'}],request,today);
 assert.equal(summary.count,0);assert.match(format(summary,request,today),/Tanggal mendatang belum dihitung/);
 assert.match(format(summary,request,today),/Belum ada transaksi/);
 assert.equal(jakartaToday(new Date('2026-11-17T18:00:00Z')),today);
});
test('transfer tidak menambah penghasilan atau pengeluaran dan nama rekening aman untuk Telegram',async()=>{
 const {parseSummaryRequest:p,summarizePeriod:s,periodSummaryText:format}=await api;
 const request=p('/cek saldo bulan ini',today);
 const summary=s([
  {type:'income',amount:1000,wallet:'A <bank>',date:'1 Nov 2026'},
  {type:'transfer',amount:200,wallet:'A <bank>',walletTo:'Tunai',date:'2 Nov 2026'},
 ],request,today);
 assert.equal(summary.income,1000);assert.equal(summary.expense,0);assert.equal(summary.cashNet,1000);
 assert.equal(summary.perWallet['A <bank>'],800);assert.equal(summary.perWallet.Tunai,200);
 assert.match(format(summary,request,today),/A &lt;bank&gt;/);
});
test('handler hanya membaca profil yang terhubung dan kesalahan tanggal tidak membaca database',async()=>{
 const lib=await api;
 const source=readFileSync('api/telegram-webhook.js','utf8');
 const fn=source.slice(source.indexOf('async function handlePeriodSummary('),source.indexOf('const MONTH_NUM'));
 const paths=[],messages=[];
 const db={collection(name){paths.push(name);return this;},doc(id){paths.push(id);return this;},async get(){return {docs:[]};}};
 const context={...lib,jakartaToday:()=>today,BOT_COLLECTION:'keuangan_v2',getDb:()=>db,sendMessage:async(_chat,text)=>messages.push(text),escapeHtml:String};
 runInNewContext(fn,context);
 await context.handlePeriodSummary(1,'saldo dari 26 oktober sampai hari ini',{profileId:'bound-profile'});
 assert.deepEqual(paths,['keuangan_v2','bound-profile','transactions']);assert.equal(messages.length,1);
 paths.length=0;
 await context.handlePeriodSummary(1,'saldo 31 november',{profileId:'bound-profile'});
 assert.equal(paths.length,0);assert.match(messages.at(-1),/Tanggal tidak valid/);
});
