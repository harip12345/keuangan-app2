const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync('app.html','utf8');
const start = source.indexOf('window.renderTrendChart = function()');
const end = source.indexOf('// ================== FUNGSI ANALISIS DETAIL',start);
assert.ok(start > 0 && end > start);
const trendFunction = source.slice(start,end);

function setup(year,transactions) {
    let config;
    const trendInner = {style:{}};
    const selector = {value:year};
    const canvas = {getContext:() => ({})};
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
    const context = {
        window:{},Chart:class {constructor(_ctx,value){config=value;}destroy(){}},transactions,
        document:{body:{classList:{contains:() => false}},getElementById(id){return {trendYearSelector:selector,trendChartInner:trendInner,trendChart:canvas}[id] || null;}},
        parseCustomDateToYMD(value){const [day,month,year]=value.split(' ');return `${year}-${String(months.indexOf(month)+1).padStart(2,'0')}-${day}`;},
        formatRupiah:value => `Rp ${value}`,formatK:value => String(value),
    };
    runInNewContext('let trendChartInstance = null;' + trendFunction,context);
    context.window.renderTrendChart();
    return {config,trendInner};
}

test('tanggal 25 dan 26 tetap masuk bulan kalender yang sama',() => {
    const result = setup('2026',[
        {type:'income',date:'25 Okt 2026',amount:100},
        {type:'expense',date:'26 Okt 2026',amount:30},
        {type:'income',date:'01 Nov 2026',amount:40},
        {type:'loan',date:'10 Okt 2026',amount:500},
    ]);
    assert.equal(result.config.data.labels.length,12);
    assert.equal(result.config.data.datasets[0].data[9],100);
    assert.equal(result.config.data.datasets[1].data[9],30);
    assert.equal(result.config.data.datasets[0].data[10],40);
    assert.equal(result.trendInner.style.minWidth,'744px');
});

test('semua tahun memperlebar grafik agar bulan dapat digeser',() => {
    const records = Array.from({length:18},(_,i) => {
        const date = new Date(2025,i,1);
        const month = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][date.getMonth()];
        return {type:'income',date:`01 ${month} ${date.getFullYear()}`,amount:100};
    });
    const result = setup('ALL',records);
    assert.equal(result.config.data.labels.length,18);
    assert.equal(result.trendInner.style.minWidth,'1116px');
});
