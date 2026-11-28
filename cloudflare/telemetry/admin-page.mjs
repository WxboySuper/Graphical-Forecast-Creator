/**
 * Owner-only usage dashboard. The Worker serves this single self-contained document behind
 * Cloudflare Access and it reads the /admin JSON routes on the same origin. Values from the
 * API are inserted with textContent or SVG attributes only, never as HTML.
 */

const STYLE = `
:root{color-scheme:light dark;--bg:#f5f6f8;--surface:#fff;--surface-2:#f0f2f5;--border:#e1e5ea;--text:#1a1f26;--muted:#667085;--accent:#1769e0;--accent-2:#1b7f3b;--warn:#b26a00;--bad:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#0e1115;--surface:#161a20;--surface-2:#1e232b;--border:#2a3039;--text:#e8ebf0;--muted:#98a2b3;--accent:#5b9dff;--accent-2:#5fd38a;--warn:#f0b35a;--bad:#ff7b72}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
button,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
header.top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:14px 20px;background:var(--surface);border-bottom:1px solid var(--border)}
header.top h1{margin:0;font-size:17px;font-weight:650;letter-spacing:-.01em}
header.top .sub{color:var(--muted);font-size:12px}
.controls{display:flex;gap:8px;align-items:center;margin-left:auto;flex-wrap:wrap}
.controls select,.btn{padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);cursor:pointer;text-decoration:none;display:inline-block}
.btn:hover{background:var(--surface)}
main{max-width:1120px;margin:0 auto;padding:20px;display:grid;gap:16px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.tile{padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}
.tile b{display:block;font-size:26px;line-height:1.15;font-variant-numeric:tabular-nums}
.tile span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
section.card{border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:16px 18px}
section.card h2{margin:0 0 2px;font-size:15px}
section.card .lede{margin:0 0 12px;color:var(--muted);font-size:12px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin-bottom:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
svg.chart{width:100%;height:150px;display:block}
.c-visit{fill:var(--accent)}.c-active{fill:var(--accent-2)}.axis{fill:var(--muted);font-size:11px}
.key-visit{background:var(--accent)}.key-active{background:var(--accent-2)}.controls.tight{margin:0 0 10px}
.bars{display:grid;gap:5px}
.bar{display:grid;grid-template-columns:minmax(120px,1.3fr) 3fr minmax(48px,auto);gap:10px;align-items:center;font-size:13px}
.bar .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar .track{height:9px;border-radius:5px;background:var(--surface-2);overflow:hidden}
.bar .fill{display:block;height:100%;background:var(--accent);border-radius:5px}
.bar .num{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
details.ev{border-top:1px solid var(--border);padding:7px 0}
details.ev:first-child{border-top:0}
details.ev summary{cursor:pointer;list-style:none}
details.ev summary::-webkit-details-marker{display:none}
details.ev .sub{margin:8px 0 2px 14px}
.note{color:var(--muted);font-size:13px;padding:6px 0}.err{color:var(--bad);padding:10px 20px}
table.ver{width:100%;border-collapse:collapse;font-size:13px}
table.ver th,table.ver td{padding:5px 8px;text-align:right;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums}
table.ver th:first-child,table.ver td:first-child{text-align:left}
table.ver th{color:var(--muted);font-weight:600}
footer{max-width:1120px;margin:0 auto;padding:0 20px 28px;color:var(--muted);font-size:12px}
@media (max-width:760px){.cols{grid-template-columns:1fr}.bar{grid-template-columns:1fr 2fr auto}}
`;

// Client script: plain string concatenation only, so it can sit inside this template literal untouched.
const SCRIPT = `
(function(){
'use strict';
let state={days:30,version:''};
let $=function(id){return document.getElementById(id);};
let SVGNS='http://www.w3.org/2000/svg';
function el(tag,props,kids){let n=document.createElement(tag);Object.keys(props||{}).forEach(function(k){if(k==='text')n.textContent=props[k];else if(k==='class')n.className=props[k];else if(k.slice(0,2)==='on')n.addEventListener(k.slice(2),props[k]);else n.setAttribute(k,props[k]);});(kids||[]).forEach(function(c){if(c)n.appendChild(c);});return n;}
function sv(tag,attrs){let n=document.createElementNS(SVGNS,tag);Object.keys(attrs||{}).forEach(function(k){if(k==='text')n.textContent=attrs[k];else n.setAttribute(k,attrs[k]);});return n;}
function fmt(n){return Number(n||0).toLocaleString();}
function words(s){return String(s).replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase();});}
function eventLabel(name){return ({forecast_created:'New cycle started',first_shape_drawn:'First shape drawn',mesoscale_workspace_opened:'Mesoscale workspace opened'})[name]||words(name);}
let KNOWN_FAILURES={401:'Your Access session ended or you are not allowed here. Reload the page to sign in again.',403:'Your Access session ended or you are not allowed here. Reload the page to sign in again.'};
function failure(status,body){if(KNOWN_FAILURES[status])return new Error(KNOWN_FAILURES[status]);
  if(status===503)return new Error('Not configured yet: '+(body.error||'the service needs its Cloudflare settings.'));
  return new Error(body.error||('Request failed ('+status+')'));}
function api(path){let url=path+(path.indexOf('?')<0?'?':'&')+'days='+state.days;
  return fetch(url,{credentials:'same-origin',headers:{accept:'application/json'}}).then(function(r){return r.json().then(function(b){return {r:r,b:b};},function(){return {r:r,b:null};});}).then(function(x){
    if(x.b===null)throw new Error(x.r.ok?'Unexpected response. Reload the page to sign in again.':failure(x.r.status,{}).message);
    if(!x.r.ok)throw failure(x.r.status,x.b);return x.b;});}
function sum(rows,key){return rows.reduce(function(t,r){return t+Number(r[key||'count']||0);},0);}
function group(rows,keyFn){let m={};rows.forEach(function(r){let k=keyFn(r);m[k]=(m[k]||0)+Number(r.count||0);});return Object.keys(m).map(function(k){return {name:k,count:m[k]};}).sort(function(a,b){return b.count-a.count;});}
function fillBar(ratio){let f=el('span',{class:'fill'});f.style.width=Math.max(2,Math.round(ratio*100))+'%';return f;}
function barList(items,opts){opts=opts||{};let box=el('div',{class:'bars'});let max=items.length?items[0].count:1;
  items.slice(0,opts.limit||12).forEach(function(i){box.appendChild(el('div',{class:'bar'},[el('span',{class:'name',title:i.name,text:opts.label?opts.label(i.name):i.name}),el('span',{class:'track'},[fillBar(i.count/max)]),el('span',{class:'num',text:fmt(i.count)})]));});return box;}
function note(host,text){host.textContent='';host.appendChild(el('p',{class:'note',text:text}));}
function today(){return new Date().toISOString().slice(0,10);}
function dayList(){let out=[];let base=Date.now();for(let i=state.days-1;i>=0;i--){out.push(new Date(base-i*86400000).toISOString().slice(0,10));}return out;}
function chart(host,overview){host.textContent='';let days=dayList();let v={},a={};(overview.dailyVisitors||[]).forEach(function(r){v[r.day]=r.count;});(overview.dau||[]).forEach(function(r){a[r.day]=r.count;});
  let max=1;days.forEach(function(d){max=Math.max(max,v[d]||0,a[d]||0);});
  let W=1000,H=150,pad=18,slot=(W)/days.length,bw=Math.max(1,Math.min(14,slot*0.38));
  let s=sv('svg',{class:'chart',viewBox:'0 0 '+W+' '+(H+pad),preserveAspectRatio:'none',role:'img','aria-label':'Daily visitors and active accounts'});
  days.forEach(function(d,i){let x=i*slot+slot/2;[[v[d]||0,'c-visit',-bw-0.5],[a[d]||0,'c-active',0.5]].forEach(function(p){let h=p[0]/max*(H-4);let r=sv('rect',{x:x+p[2],y:H-h,width:bw,height:Math.max(h,p[0]?1:0),class:p[1],rx:'1.5'});r.appendChild(sv('title',{text:d+': '+fmt(p[0])}));s.appendChild(r);});
    if(i%Math.ceil(days.length/6)===0){s.appendChild(sv('text',{x:x,y:H+pad-4,class:'axis','text-anchor':'middle',text:d.slice(5)}));}});
  host.appendChild(s);}
function renderOverview(o){let t=$('tiles');t.textContent='';let td=today();
  let v=(o.dailyVisitors||[]).filter(function(r){return r.day===td;})[0];let a=(o.dau||[]).filter(function(r){return r.day===td;})[0];
  [['Visitors today',fmt(v?v.count:0),'Unique browsers counted so far today (UTC)'],['Active accounts today',fmt(a?a.count:0),'Signed-in accounts seen today (UTC)'],['Rough monthly visitors',fmt(o.roughMau),o.overlapCaveat||''],['Total accounts',o.totalAccounts==null?'\\u2014':fmt(o.totalAccounts),o.totalAccounts==null?'Not connected yet: this needs the Firebase account count':'']].forEach(function(x){t.appendChild(el('div',{class:'tile',title:x[2]},[el('b',{text:x[1]}),el('span',{text:x[0]})]));});
  chart($('chart'),o);}
function cmpVersion(a,b){let pa=String(a).split('-'),pb=String(b).split('-');let c=pb[0].localeCompare(pa[0],undefined,{numeric:true});if(c)return c;if(!pa[1]&&pb[1])return -1;if(pa[1]&&!pb[1])return 1;return String(pb[1]||'').localeCompare(String(pa[1]||''),undefined,{numeric:true});}
function versionsOf(rows){let m={};rows.forEach(function(r){m[r.version]=true;});return Object.keys(m).sort(cmpVersion);}
function renderEvents(rows){let host=$('events');host.textContent='';
  if(!rows.length){note(host,'No feature events yet. They appear after people choose Allow in the Help improve GFC prompt.');renderVersions([]);return;}
  let sel=$('version');let current=state.version;sel.textContent='';sel.appendChild(el('option',{value:'',text:'All versions'}));versionsOf(rows).forEach(function(x){sel.appendChild(el('option',{value:x,text:x}));});sel.value=current;if(sel.value!==current){state.version='';sel.value='';}
  let shown=state.version?rows.filter(function(r){return r.version===state.version;}):rows;
  let byEvent=group(shown,function(r){return r.event;});
  let top=barList(byEvent,{limit:20,label:eventLabel});host.appendChild(top);
  host.appendChild(el('div',{class:'sub-title note',text:'Open an event to see its details'}));
  byEvent.slice(0,20).forEach(function(e){let details=group(shown.filter(function(r){return r.event===e.name&&r.detail;}),function(r){return r.detail;});if(!details.length)return;
    let d=el('details',{class:'ev'},[el('summary',{text:eventLabel(e.name)+' \\u00b7 '+fmt(e.count)}),el('div',{class:'sub'},[barList(details,{limit:12})])]);host.appendChild(d);});
  renderVersions(rows);}
function renderVersions(rows){let host=$('versions');host.textContent='';if(!rows.length){note(host,'Counts per app version will show here, so you can compare before and after a release.');return;}
  let versions=versionsOf(rows).slice(0,6);let events=group(rows,function(r){return r.event;}).slice(0,10);
  let table=el('table',{class:'ver'});let head=el('tr',{},[el('th',{text:'Event'})]);versions.forEach(function(x){head.appendChild(el('th',{text:x}));});table.appendChild(head);
  events.forEach(function(e){let tr=el('tr',{},[el('td',{text:eventLabel(e.name)})]);versions.forEach(function(x){tr.appendChild(el('td',{text:fmt(sum(rows.filter(function(r){return r.event===e.name&&r.version===x;})))}));});table.appendChild(tr);});host.appendChild(table);}
function renderPages(rows){let host=$('pages');host.textContent='';if(!rows.length){note(host,'No page views from opted-in visitors yet.');return;}host.appendChild(barList(group(rows,function(r){return r.page||'(unknown)';}),{limit:15}));}
function countryName(code){try{if(code&&code!=='XX')return new Intl.DisplayNames(['en'],{type:'region'}).of(code)+' ('+code+')';}catch(e){}return code==='XX'?'Unknown':code;}
function renderLocations(rows){let host=$('locations');host.textContent='';if(!rows.length){note(host,'No location data yet.');return;}host.appendChild(barList(group(rows,function(r){return r.country||'XX';}),{limit:15,label:countryName}));}
function setError(m){let e=$('err');e.textContent=m||'';e.hidden=!m;}
function load(){setError('');let jobs=[
  ['/admin/overview',function(b){renderOverview(b);},'tiles'],
  ['/admin/events',function(b){renderEvents(b.data||[]);},'events'],
  ['/admin/pages',function(b){renderPages(b.data||[]);},'pages'],
  ['/admin/locations',function(b){renderLocations(b.data||[]);},'locations']];
  jobs.forEach(function(j){api(j[0]).then(j[1]).catch(function(e){if(j[2]==='tiles'){setError(e.message);}else{note($(j[2]),e.message);}});});}
function init(){$('days').addEventListener('change',function(e){let d=Number(e.target.value);state.days=[7,30,90].indexOf(d)>=0?d:30;load();});
  $('version').addEventListener('change',function(e){state.version=e.target.value;load();});
  $('refresh').addEventListener('click',load);load();}
init();
})();
`;

/** Returns the dashboard document; `nonce` must match the CSP header sent with it. */
export function renderUsagePage(nonce) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) throw new Error('Invalid CSP nonce');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>GFC Usage</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<header class="top">
  <div><h1>GFC Usage</h1><div class="sub">Private. Counts only; nothing here identifies a person.</div></div>
  <div class="controls">
    <select id="days" aria-label="Period"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select>
    <button class="btn" id="refresh" type="button">Refresh</button>
    <a class="btn" href="https://feedback.gfcweather.com/admin" rel="noreferrer">Feedback inbox</a>
  </div>
</header>
<div class="err" id="err" role="alert" hidden></div>
<main>
  <div class="tiles" id="tiles" aria-label="Summary"></div>
  <section class="card">
    <h2>Visitors and active accounts</h2>
    <p class="lede">Each browser or account is counted once per UTC day.</p>
    <div class="legend"><span><i class="key-visit"></i>Visitors</span><span><i class="key-active"></i>Active accounts</span></div>
    <div id="chart"></div>
  </section>
  <section class="card">
    <h2>Feature usage</h2>
    <p class="lede">Only from people who chose Allow, so these are a sample, not total usage.</p>
    <div class="controls tight"><select id="version" aria-label="App version"><option value="">All versions</option></select></div>
    <div id="events"><p class="note">Loading&hellip;</p></div>
  </section>
  <div class="cols">
    <section class="card"><h2>Pages</h2><p class="lede">Page views from opted-in visitors.</p><div id="pages"><p class="note">Loading&hellip;</p></div></section>
    <section class="card"><h2>Location</h2><p class="lede">Country of opted-in events, never finer.</p><div id="locations"><p class="note">Loading&hellip;</p></div></section>
  </div>
  <section class="card">
    <h2>By version</h2>
    <p class="lede">Events per app version, to compare before and after a release.</p>
    <div id="versions"><p class="note">Loading&hellip;</p></div>
  </section>
</main>
<footer>Visitor and account counts are exact for each day. Rough monthly visitors adds up daily counts, so the same person can count on several days. Feature events expire after about 90 days.</footer>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}
