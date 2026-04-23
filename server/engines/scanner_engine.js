const fs=require('fs'),https=require('https');

https.get('https://api.binance.com/api/v3/ticker/24hr',r=>{
let d='';r.on('data',c=>d+=c);r.on('end',()=>{

const data=JSON.parse(d);
const repositoryFile='/var/www/proculus/decision-repository.json';
let existing=[];
try{
  const raw=fs.readFileSync(repositoryFile,'utf8');
  const parsed=JSON.parse(raw);
  existing=Array.isArray(parsed)?parsed:[];
}catch{
  existing=[];
}
const seen=new Set(existing.map(x=>String(x&&x.asset||'').trim().toUpperCase()).filter(Boolean));

const additions=data
.filter(x=>x.symbol.endsWith('USDT'))
.filter(x=>Math.abs(x.priceChangePercent)>3 || x.quoteVolume>5000000)
.sort((a,b)=>Math.abs(b.priceChangePercent)-Math.abs(a.priceChangePercent)) // 🔥 EN ÖNEMLİ SATIR
.slice(0,50)
.filter(x=>{
  const asset=x.symbol.replace('USDT','').trim().toUpperCase();
  if(!asset||seen.has(asset)) return false;
  seen.add(asset);
  return true;
})
.map(x=>({
  asset:x.symbol.replace('USDT',''),
  ta:{trend:+x.priceChangePercent>0?'Bullish':'Bearish',momentum:'Neutral'},
  onchain:{onchainBias:'Neutral'},
  social:[],
  news:[],
  unlock:null,
  orderflow:{orderflowBias:'Neutral',strength:'Weak'}
}));

const repo=[...existing,...additions];

fs.writeFileSync(repositoryFile,JSON.stringify(repo,null,2));

console.log('scanner updated:',repo.length);

});});
