import { formatRupiah, ymdToCustom } from './waParser.js';

const MONTHS = {jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,jun:6,juni:6,jul:7,juli:7,agt:8,agu:8,agustus:8,sep:9,september:9,okt:10,oktober:10,nov:11,nop:11,november:11,des:12,desember:12};
const DAY = 86400000;
const html = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const iso = date => date.toISOString().slice(0,10);
const shift = (ymd, days) => iso(new Date(Date.parse(ymd+'T00:00:00Z') + days*DAY));
export function jakartaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
function validDate(y,m,d) {
  const value = new Date(Date.UTC(y,m-1,d));
  if(value.getUTCFullYear()!==y || value.getUTCMonth()+1!==m || value.getUTCDate()!==d) throw new Error('Tanggal tidak valid. Contoh: 26 Oktober 2026 sampai 18 November 2026.');
  return iso(value);
}
function endpoint(text, reference) {
  text = text.trim().replace(/^(?:tanggal|tgl)\.?\s*/,'').trim();
  if(['hari ini','sekarang','saat ini','hari ini berapa'].includes(text)) return {ymd:reference,fixed:true};
  if(['kemarin','kemaren'].includes(text)) return {ymd:shift(reference,-1),fixed:true};
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(match) return {ymd:validDate(+match[1],+match[2],+match[3]),year:true,month:true};
  match = text.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2}|\d{4}))?$/);
  if(match) return {d:+match[1],m:+match[2],y:match[3]?(+match[3]<100?2000+ +match[3]:+match[3]):null,month:true,year:!!match[3]};
  match = text.match(/^(\d{1,2})(?:\s+([a-z]+))?(?:\s+(\d{4}))?$/);
  if(match && (!match[2] || MONTHS[match[2]])) return {d:+match[1],m:match[2]?MONTHS[match[2]]:null,y:match[3]?+match[3]:null,month:!!match[2],year:!!match[3]};
  throw new Error('Periode belum jelas. Tulis misalnya: saldo dari 26 Oktober 2026 sampai hari ini.');
}
function resolve(point, anchor) {
  if(point.ymd) return point.ymd;
  const [y,m] = anchor.split('-').map(Number);
  return validDate(point.y || y,point.m || m,point.d);
}

export function parseSummaryRequest(text, today = jakartaToday()) {
  const input = text.toLowerCase().trim().replace(/^\//,'').replace(/[?？!]+$/,'').trim();
  if(/^\/?ai\b/.test(input)) return null;
  const match = input.match(/^(?:(?:tolong|berapa|cek|lihat|tampilkan|hitung|total|ringkasan|jumlah|sisa)\s+)*(?:\/)?(saldo|sisa uang|sisa saldo|uang saya|duit saya|pemasukan|penghasilan|pendapatan|pengeluaran)(?:\s+(?:aku|saya|ku|total|adalah|untuk))*\s*(.*)$/);
  if(!match) return null;
  let rest = match[2].trim().replace(/\s+(?:berapa|berapa sisa(?:nya)?|berapa sisanya|berapa sisa nya)$/,'').trim();
  if(rest && !/^(?:dari|sejak|mulai|antara|periode|pada|tanggal|tgl|hari|kemarin|kemaren|bulan|minggu|semua|seluruh|\d{1,2}(?=\s|\/|-|$)|\d{4}-)/.test(rest)) return null;
  const metric = /pemasukan|penghasilan|pendapatan/.test(match[1])?'income':match[1]==='pengeluaran'?'expense':'balance';
  if(!rest || /^(?:semua|seluruh)(?: waktu| periode| transaksi)?$/.test(rest)) return {metric,start:null,end:today};
  const [year,month] = today.split('-').map(Number);
  if(rest==='bulan ini') return {metric,start:validDate(year,month,1),end:today};
  if(rest==='bulan lalu') {const date=new Date(Date.UTC(year,month-1,0));return {metric,start:validDate(date.getUTCFullYear(),date.getUTCMonth()+1,1),end:iso(date)};}
  if(rest==='minggu ini') {const day=new Date(today+'T00:00:00Z').getUTCDay();return {metric,start:shift(today,-((day+6)%7)),end:today};}
  const since = /\b(?:dari|sejak|mulai)\b/.test(rest);
  rest=rest.replace(/^(?:(?:dari|sejak|mulai|antara|periode|pada)\s+)+/,'');
  const range=rest.split(/\s+(?:sampai(?: dengan)?|hingga|s\/?d|s\.d\.|dan)\s+|\s*\u2013\s*|\s+-\s+/);
  if(range.length>2) throw new Error('Gunakan satu rentang tanggal awal sampai tanggal akhir.');
  const left=endpoint(range[0],today);
  let start,end;
  if(range.length===2) {
    const right=endpoint(range[1],today);
    // An omitted month inherits the other endpoint's month, never the server month.
    const anchor=right.ymd || (right.m?validDate(right.y||year,right.m,1):today);
    start=resolve(left,anchor);
    end=resolve(right,start);
    if(start>end && !left.year && (right.fixed || right.year) && left.m>+end.slice(5,7)) start=resolve({...left,y:+end.slice(0,4)-1},end);
    else if(start>end && left.month && right.month && left.m>right.m && !right.year) end=resolve({...right,y:+start.slice(0,4)+1},start);
  } else {
    start=resolve(left,today);
    if(since && start>today && !left.year) {
      start=left.month?resolve({...left,y:year-1},today):resolve(left,iso(new Date(Date.UTC(year,month-1,0))));
    }
    end=since?today:start;
  }
  if(start>end) throw new Error('Tanggal awal melewati tanggal akhir. Tulis kembali kedua tanggal beserta bulan dan tahunnya.');
  return {metric,start,end};
}

export function transactionDate(value) {
  if(typeof value!=='string') return null;
  try {
    if(/^\d{4}-\d{2}-\d{2}$/.test(value)) return resolve(endpoint(value,''),'');
    return resolve(endpoint(value.toLowerCase(),''),'');
  } catch { return null; }
}

export function summarizePeriod(records, request, today = jakartaToday()) {
  const result={income:0,expense:0,borrowed:0,lent:0,debtPaid:0,receivablePaid:0,count:0,invalidDates:0,perWallet:Object.create(null)};
  const addWallet=(name,amount)=>{const wallet=name||'Tunai';result.perWallet[wallet]=(result.perWallet[wallet]||0)+amount;};
  for(const record of records) {
    const date=transactionDate(record.date);
    if(!date) {result.invalidDates++;continue;}
    if(date>today || date>request.end || (request.start && date<request.start)) continue;
    const amount=Number(record.amount);
    if(!Number.isFinite(amount) || amount<=0) continue;
    if(record.type==='transfer') {addWallet(record.wallet,-amount);addWallet(record.walletTo,amount);continue;}
    if(record.type==='income') {result.income+=amount;addWallet(record.wallet,amount);}
    else if(record.type==='expense') {result.expense+=amount;addWallet(record.wallet,-amount);}
    else if(record.type==='loan' && ['payable','receivable'].includes(record.loanKind) && ['principal','payment'].includes(record.loanPhase)) {
      const key=record.loanKind==='payable'?(record.loanPhase==='principal'?'borrowed':'debtPaid'):(record.loanPhase==='principal'?'lent':'receivablePaid');
      result[key]+=amount;
      addWallet(record.wallet,['borrowed','receivablePaid'].includes(key)?amount:-amount);
    } else continue;
    result.count++;
  }
  result.net=result.income-result.expense;
  result.loanNet=result.borrowed+result.receivablePaid-result.lent-result.debtPaid;
  result.cashNet=result.net+result.loanNet;
  return result;
}

export function periodSummaryText(sum, request, today = jakartaToday()) {
  const title={balance:'Sisa uang periode',income:'Pemasukan periode',expense:'Pengeluaran periode'}[request.metric];
  const lines=[`<b>${title}</b>`,request.start?`${ymdToCustom(request.start)} – ${ymdToCustom(request.end)}`:`Semua catatan sampai ${ymdToCustom(request.end)}`,'',
    `Pemasukan: <b>${formatRupiah(sum.income)}</b>`,`Pengeluaran: <b>${formatRupiah(sum.expense)}</b>`,`Sisa pemasukan − pengeluaran: <b>${formatRupiah(sum.net)}</b>`,'',
    '<b>Arus utang-piutang (terpisah)</b>',`Menerima pinjaman: +${formatRupiah(sum.borrowed)}`,`Dipinjamkan: −${formatRupiah(sum.lent)}`,`Menerima pembayaran piutang: +${formatRupiah(sum.receivablePaid)}`,`Membayar utang: −${formatRupiah(sum.debtPaid)}`,`Arus bersih utang-piutang: <b>${formatRupiah(sum.loanNet)}</b>`,'',
    `Sisa setelah arus utang-piutang: <b>${formatRupiah(sum.cashNet)}</b>`,`${sum.count} transaksi dihitung.`,
    request.start?'Saldo sebelum periode tidak dimasukkan.':'Dihitung dari seluruh catatan pemasukan, pengeluaran, dan utang-piutang.',
    'Transfer antar rekening dan perpindahan ke aset tidak termasuk perhitungan ini.'];
  if(!sum.count) lines.push('Belum ada transaksi pada periode tersebut.');
  const wallets=Object.entries(sum.perWallet).sort((a,b)=>b[1]-a[1]);
  if(wallets.length) {
    lines.push('','<b>Arus bersih per rekening</b>');
    for(const [wallet,amount] of wallets.slice(0,10)) lines.push(`${html(wallet.slice(0,80))}: ${formatRupiah(amount)}`);
    if(wallets.length>10) lines.push('Rekening lainnya dapat dilihat di aplikasi.');
  }
  if(request.end>today) lines.push(`Tanggal mendatang belum dihitung; data sampai ${ymdToCustom(today)}.`);
  if(sum.invalidDates) lines.push(`${sum.invalidDates} catatan tanpa tanggal valid tidak dihitung.`);
  return lines.join('\n');
}
