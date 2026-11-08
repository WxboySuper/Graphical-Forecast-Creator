/**
 * Owner-only feedback viewer page. The Worker serves this single self-contained
 * document behind Cloudflare Access. It loads data from the /admin/api routes on
 * the same origin and inserts feedback text with textContent only, never as HTML.
 */

const STYLE = `
:root{color-scheme:light dark;--bg:#f5f6f8;--surface:#fff;--surface-2:#f0f2f5;--border:#e1e5ea;--text:#1a1f26;--muted:#667085;--accent:#1769e0;--accent-ink:#fff;--bug:#c62828;--idea:#6a3fc4;--praise:#1b7f3b;--question:#b26a00;--other:#5b6573;--ring:rgba(23,105,224,.35)}
@media (prefers-color-scheme:dark){:root{--bg:#0e1115;--surface:#161a20;--surface-2:#1e232b;--border:#2a3039;--text:#e8ebf0;--muted:#98a2b3;--accent:#5b9dff;--accent-ink:#0b1220;--bug:#ff7b72;--idea:#b79bff;--praise:#5fd38a;--question:#f0b35a;--other:#9aa5b4;--ring:rgba(91,157,255,.4)}}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column}
button,select,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
header.top{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:14px 20px;background:var(--surface);border-bottom:1px solid var(--border)}
header.top h1{margin:0;font-size:17px;font-weight:650;letter-spacing:-.01em}
header.top .sub{color:var(--muted);font-size:12px}
.tiles{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.tile{min-width:76px;padding:6px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
.tile b{display:block;font-size:18px;line-height:1.2;font-variant-numeric:tabular-nums}
.tile span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--surface)}
.bar select,.bar input{padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)}
.bar input{flex:1;min-width:160px}
.btn{padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);cursor:pointer}
.btn:hover{background:var(--surface)}.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.danger{color:var(--bug);border-color:var(--bug)}.btn:disabled{opacity:.5;cursor:default}
main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,420px) 1fr}
#list{overflow:auto;border-right:1px solid var(--border);background:var(--surface)}
.row{display:block;width:100%;text-align:left;padding:11px 16px;border:0;border-bottom:1px solid var(--border);background:transparent;cursor:pointer}
.row:hover{background:var(--surface-2)}.row[aria-selected=true]{background:var(--surface-2);box-shadow:inset 3px 0 0 var(--accent)}
.row .meta{display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:12px;color:var(--muted)}
.row .time{margin-left:auto;white-space:nowrap}
.row .preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.badge{display:inline-block;padding:0 7px;border-radius:999px;border:1px solid currentColor;font-size:11px;font-weight:600;line-height:18px;text-transform:capitalize}
.badge.bug{color:var(--bug)}.badge.idea{color:var(--idea)}.badge.praise{color:var(--praise)}.badge.question{color:var(--question)}.badge.other{color:var(--other)}
.badge.beta{color:var(--question)}.badge.production{color:var(--accent)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:none}.dot.new{background:var(--accent)}.dot.triaged{background:var(--question)}.dot.resolved{background:var(--praise)}.dot.wontfix{background:var(--other)}
#detail{overflow:auto;padding:20px 28px}
#detail .empty{color:var(--muted);margin-top:40px;text-align:center}
.msg{margin:14px 0 18px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--surface);white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px}
.grid{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 18px;font-size:13px}
.grid dt{color:var(--muted)}.grid dd{margin:0;overflow-wrap:anywhere}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.seg button{padding:6px 12px;border:0;background:var(--surface-2);cursor:pointer;border-right:1px solid var(--border)}
.seg button:last-child{border-right:0}.seg button[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}
.note{padding:10px 20px;color:var(--muted)}.err{color:var(--bug);padding:10px 20px}
#more{display:block;margin:12px auto}
.hint{margin-left:auto;color:var(--muted);font-size:12px}
@media (max-width:760px){main{grid-template-columns:1fr}#list{max-height:45vh;border-right:0;border-bottom:1px solid var(--border)}#detail{padding:16px}.hint{display:none}}
`;

// Client script: plain string concatenation only, so it can sit inside this template literal untouched.
const SCRIPT = `
(function(){
'use strict';
let STATUSES=[['new','New'],['triaged','Triaged'],['resolved','Resolved'],['wontfix',"Won't fix"]];
let state={items:[],selected:null,cursor:null,summary:null,filters:{status:'',target:'',category:'',q:''},loading:false,seq:0};
let $=function(id){return document.getElementById(id);};
function el(tag,props,kids){let n=document.createElement(tag);Object.keys(props||{}).forEach(function(k){if(k==='text')n.textContent=props[k];else if(k==='class')n.className=props[k];else if(k.slice(0,2)==='on')n.addEventListener(k.slice(2),props[k]);else n.setAttribute(k,props[k]);});(kids||[]).forEach(function(c){if(c)n.appendChild(c);});return n;}
function when(ms){let d=new Date(ms),s=Math.round((Date.now()-ms)/1000);if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';if(s<604800)return Math.floor(s/86400)+'d ago';return d.toLocaleDateString();}
function full(ms){return new Date(ms).toLocaleString();}
function request(opts){opts=opts||{};opts.credentials='same-origin';opts.headers=Object.assign({'accept':'application/json'},opts.headers||{});
  if((opts.method||'GET')!=='GET'){opts.headers['x-gfc-viewer']='1';}return opts;}
function failure(r,b){if([401,403].indexOf(r.status)>=0){return new Error('Your Access session ended or you are not allowed here. Reload the page to sign in again.');}
  return new Error(b.error||('Request failed ('+r.status+')'));}
function api(path,opts){return fetch(path,request(opts)).then(function(r){return r.json().catch(function(){return {};}).then(function(b){if(!r.ok)throw failure(r,b);return b;});});}
function setError(m){let e=$('err');e.textContent=m||'';e.hidden=!m;}
function query(){let f=state.filters,p=[];['status','target','category'].forEach(function(k){if(f[k])p.push(k+'='+encodeURIComponent(f[k]));});if(state.cursor)p.push('cursor='+encodeURIComponent(state.cursor));p.push('limit=50');return '?'+p.join('&');}
function visible(){let q=state.filters.q.trim().toLowerCase();if(!q)return state.items;return state.items.filter(function(i){return (i.message+' '+i.page+' '+(i.email||'')+' '+i.category).toLowerCase().indexOf(q)>=0;});}
function loadSummary(){return api('/admin/api/summary').then(function(s){state.summary=s;renderTiles();}).catch(function(e){setError(e.message);});}
function loadList(reset){if(reset){state.seq+=1;state.cursor=null;state.items=[];}else if(state.loading)return Promise.resolve();
  let seq=state.seq;state.loading=true;setError('');renderMore();
  return api('/admin/api/feedback'+query()).then(function(b){if(seq!==state.seq)return;state.items=state.items.concat(b.items||[]);state.cursor=b.nextCursor||null;
    if(!state.selected&&state.items.length)state.selected=state.items[0].id;}).catch(function(e){if(seq===state.seq)setError(e.message);}).then(function(){if(seq!==state.seq)return;state.loading=false;render();});}
function renderTiles(){let s=state.summary;if(![s?.byStatus,s?.byTarget].every(Boolean))return;let t=$('tiles');t.textContent='';
  [['Total',s.total],['New',s.byStatus.new],['Beta',s.byTarget.beta],['Production',s.byTarget.production]].forEach(function(x){t.appendChild(el('div',{class:'tile'},[el('b',{text:String(x[1])}),el('span',{text:x[0]})]));});}
function renderList(){let list=$('list');list.textContent='';let rows=visible();
  if(!rows.length){list.appendChild(el('p',{class:'note',text:state.loading?'Loading…':'No feedback matches these filters.'}));}
  rows.forEach(function(i){let b=el('button',{class:'row',type:'button','data-id':i.id,role:'option','aria-selected':String(i.id===state.selected),onclick:function(){select(i.id);}},[
    el('div',{class:'meta'},[el('span',{class:'dot '+i.status,title:i.status}),el('span',{class:'badge '+i.category,text:i.category}),el('span',{class:'badge '+i.build_target,text:i.build_target==='beta'?'beta':'prod'}),el('span',{class:'time',title:full(i.created_at),text:when(i.created_at)})]),
    el('div',{class:'preview',text:i.message})]);list.appendChild(b);});
  if(state.cursor){list.appendChild(el('button',{id:'more',class:'btn',type:'button',onclick:function(){loadList(false);}},[document.createTextNode(state.loading?'Loading…':'Load more')]));}}
function renderMore(){let m=$('more');if(m){m.textContent=state.loading?'Loading…':'Load more';m.disabled=state.loading;}}
function field(dl,k,v){if(!String(v??'').length)return;dl.appendChild(el('dt',{text:k}));dl.appendChild(el('dd',{text:String(v)}));}
function markdown(i){return ['### Feedback '+i.id,'','- **Type:** '+i.category,'- **Build:** '+i.build_target+' v'+i.app_version,'- **Page:** '+i.page,'- **Status:** '+i.status,'- **Received:** '+full(i.created_at),'','> '+i.message.split('\\n').join('\\n> ')].join('\\n');}
function renderDetail(){let d=$('detail');d.textContent='';let i=state.items.filter(function(x){return x.id===state.selected;})[0];
  if(!i){d.appendChild(el('p',{class:'empty',text:'Select feedback to read it.'}));return;}
  d.appendChild(el('div',{class:'meta-head'},[el('span',{class:'badge '+i.category,text:i.category}),document.createTextNode(' '),el('span',{class:'badge '+i.build_target,text:i.build_target})]));
  d.appendChild(el('div',{class:'msg',text:i.message}));
  let dl=el('dl',{class:'grid'});field(dl,'Received',full(i.created_at));field(dl,'Page',i.page);field(dl,'Version',i.app_version);field(dl,'Screen',i.viewport);field(dl,'Plan',i.plan);field(dl,'Browser',i.user_agent);field(dl,'Discord',i.discord_status);field(dl,'ID',i.id);
  if(i.email){dl.appendChild(el('dt',{text:'Email (opted in)'}));dl.appendChild(el('dd',{},[el('a',{href:'mailto:'+encodeURIComponent(i.email).replace('%40','@'),text:i.email})]));}
  d.appendChild(dl);
  let seg=el('div',{class:'seg',role:'group','aria-label':'Status'});STATUSES.forEach(function(s){let sb=el('button',{type:'button','aria-pressed':String(i.status===s[0]),text:s[1],onclick:function(){setStatus(i,s[0]);}});if(i.saving)sb.disabled=true;seg.appendChild(sb);});
  let actions=el('div',{class:'actions'},[seg,el('button',{class:'btn',type:'button',text:'Copy as Markdown',onclick:function(ev){copy(markdown(i),ev.target);}}),el('button',{id:'del',class:'btn danger',type:'button',text:'Delete…',onclick:function(ev){confirmDelete(i,ev.target);}})]);
  d.appendChild(actions);}
function copy(text,btn){let done=function(m){let o=btn.textContent;btn.textContent=m;setTimeout(function(){btn.textContent=o;},1400);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done('Copied');},function(){done('Copy failed');});}else{done('Copy unavailable');}}
function dropItem(id){let idx=state.items.findIndex(function(x){return x.id===id;});if(idx<0)return;state.items.splice(idx,1);
  if(state.selected===id){let next=state.items[Math.min(idx,state.items.length-1)];state.selected=next?next.id:null;}}
function setStatus(i,status){if(i.saving||i.status===status)return;let prev=i.status;i.status=status;i.saving=true;render();
  api('/admin/api/feedback/'+encodeURIComponent(i.id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:status})}).then(function(){i.saving=false;
    if(state.filters.status&&state.filters.status!==status)dropItem(i.id);render();return loadSummary();}).catch(function(e){i.saving=false;i.status=prev;setError(e.message);render();});}
function confirmDelete(i,btn){if(btn.getAttribute('data-armed')!=='1'){btn.setAttribute('data-armed','1');btn.textContent='Click again to delete permanently';btn.className='btn primary danger';setTimeout(function(){btn.setAttribute('data-armed','0');btn.textContent='Delete…';btn.className='btn danger';},4000);return;}
  btn.disabled=true;api('/admin/api/feedback/'+encodeURIComponent(i.id),{method:'DELETE'}).then(function(){dropItem(i.id);loadSummary();render();}).catch(function(e){btn.disabled=false;setError(e.message);});}
function select(id){state.selected=id;renderList();renderDetail();let r=Array.prototype.find.call(document.querySelectorAll('#list .row'),function(x){return x.getAttribute('data-id')===id;});if(r&&r.scrollIntoView)r.scrollIntoView({block:'nearest'});}
function move(delta){let rows=visible();if(!rows.length)return;let at=rows.map(function(x){return x.id;}).indexOf(state.selected);select(rows[Math.max(0,Math.min(rows.length-1,at+delta))].id);}
function render(){renderList();renderDetail();}
function syncUrl(){let p=new URLSearchParams();['status','target','category'].forEach(function(k){if(state.filters[k])p.set(k,state.filters[k]);});history.replaceState(null,'',p.toString()?'?'+p.toString():location.pathname);}
function bind(){['status','target','category'].forEach(function(k){$('f-'+k).addEventListener('change',function(e){state.filters[k]=e.target.value;state.selected=null;syncUrl();loadList(true);});});
  $('f-q').addEventListener('input',function(e){state.filters.q=e.target.value;syncUrl();render();});
  $('refresh').addEventListener('click',function(){loadSummary();loadList(true);});
  document.addEventListener('keydown',onKey);}
function onKey(e){let t=e.target?e.target.tagName:'';if(['INPUT','SELECT','TEXTAREA'].indexOf(t)>=0)return;if(e.target?.isContentEditable)return;if([e.metaKey,e.ctrlKey,e.altKey].some(Boolean))return;if(e.key==='j')move(1);else if(e.key==='k')move(-1);}
function init(){let p=new URLSearchParams(location.search);['status','target','category'].forEach(function(k){let v=p.get(k)||'';state.filters[k]=v;let n=$('f-'+k);if(n)n.value=v;});bind();loadSummary();loadList(true);}
init();
})();
`;

/** Returns the viewer document; `nonce` must match the CSP header sent with it. */
export function renderViewerPage(nonce) {
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) throw new Error('Invalid CSP nonce');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>GFC Feedback</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<header class="top">
  <div><h1>GFC Feedback</h1><div class="sub">Private inbox. Kept until you delete it.</div></div>
  <div class="tiles" id="tiles" aria-label="Summary"></div>
</header>
<div class="bar" role="search">
  <select id="f-status" aria-label="Status"><option value="">All statuses</option><option value="new">New</option><option value="triaged">Triaged</option><option value="resolved">Resolved</option><option value="wontfix">Won't fix</option></select>
  <select id="f-target" aria-label="Build"><option value="">Beta + production</option><option value="beta">Beta</option><option value="production">Production</option></select>
  <select id="f-category" aria-label="Type"><option value="">All types</option><option value="bug">Bug</option><option value="idea">Idea</option><option value="praise">Praise</option><option value="question">Question</option><option value="other">Other</option></select>
  <input id="f-q" type="search" placeholder="Search loaded feedback" aria-label="Search loaded feedback" autocomplete="off">
  <button class="btn" id="refresh" type="button">Refresh</button>
  <span class="hint">j / k to move</span>
</div>
<div class="err" id="err" role="alert" hidden></div>
<main>
  <div id="list" role="listbox" aria-label="Feedback"></div>
  <section id="detail" aria-live="polite"></section>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}
