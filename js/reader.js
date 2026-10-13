import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
const ROOT='smartbooks1/AI2027';
const $=id=>document.getElementById(id);
const isMobileLandscape=()=>window.matchMedia('(orientation:landscape) and (pointer:coarse) and (max-height:600px)').matches;
const defaultFitMode=()=>isMobileLandscape()?'width':'page';
let books=[],pdf=null,current=0,page=1,spread=false,zoom=1,rotation=0,fitMode="page",task=0,loadingTask=null;
const displayName=path=>decodeURIComponent(path.split('/').pop()).replace(/\.pdf$/i,'');
const link=path=>path.split('/').map(encodeURIComponent).join('/');
const info=(message,error=false)=>{$('message').textContent=message;$('message').className='message'+(error?' error':'');$('message').hidden=false};
async function discover(){
 const resp=await fetch('https://api.github.com/repos/'+ROOT+'/git/trees/main?recursive=1',{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
 if(!resp.ok)throw Error('GitHub 파일 목록 조회 실패 ('+resp.status+')');
 const obj=await resp.json();
 if(obj.truncated)throw Error('저장소 파일 목록이 너무 커 자동 검색하지 못했습니다.');
 return obj.tree.filter(f=>f.type==='blob'&&/\.pdf$/i.test(f.path)).map(f=>({file:f.path,title:displayName(f.path),visible:true,allowDownload:false})).sort((a,b)=>a.file.localeCompare(b.file,'ko',{numeric:true}));
}
async function loadBooks(){
 info('도서 목록을 불러오는 중입니다…');
 try{
  const response=await fetch('./config/books.json',{cache:'no-store'});if(!response.ok)throw Error('설정 파일 없음');
  const config=await response.json();const siteTitle=config.siteTitle||'AI2027 전자책 자료실';$('siteTitle').textContent=siteTitle;document.title=siteTitle;
  const declared=(config.books||[]).filter(b=>b.visible!==false&&b.file);
  books=declared.length?declared:(config.autoDiscover?await discover():[]);
  if(!books.length){info('등록된 PDF가 없습니다. 저장소에 PDF를 올리거나 config/books.json을 설정해 주세요.');return}
  books=books.map(b=>{const rule=(config.titleRules||[]).find(rule=>rule.contains&&b.file.includes(rule.contains));return {...b,title:rule?.title||b.title||displayName(b.file)}});
  const nav=$('chapters');nav.replaceChildren();books.forEach((b,i)=>{const btn=document.createElement('button');btn.className='chapter';btn.textContent=b.title;btn.onclick=()=>openBook(i);nav.appendChild(btn)});
  await openBook(0);
 }catch(e){info('도서 목록을 불러오지 못했습니다: '+e.message,true)}
}
async function openBook(index){
 current=index;page=1;zoom=1;rotation=0;fitMode=defaultFitMode();const id=++task;const b=books[index];
 if(loadingTask){try{loadingTask.destroy()}catch{}loadingTask=null}
 pdf=null;$('title').textContent=b.title;
 document.querySelectorAll('.chapter').forEach((n,i)=>n.classList.toggle('active',i===index));
 $('sidebar').classList.remove('open');$('sheets').replaceChildren();info('PDF를 불러오는 중입니다…');
 const dl=$('download');dl.classList.toggle('hidden',!b.allowDownload);dl.href=link(b.file);dl.download=b.file.split('/').pop();
 // Keep the reader URL unchanged when switching chapters.
 try{const job=pdfjsLib.getDocument({url:link(b.file)});loadingTask=job;const doc=await job.promise;if(id!==task){await doc.destroy();return}pdf=doc;loadingTask=null;await render()}
 catch(e){if(id===task)info('PDF 열기 실패: '+e.message,true)}
}
async function render(){
 if(!pdf)return;const id=++task;const nums=spread&&page>1&&page<pdf.numPages?[page,page+1]:[page];
 info('페이지를 표시하는 중입니다…');$('sheets').replaceChildren();
 try{
  const pages=await Promise.all(nums.map(n=>pdf.getPage(n)));if(id!==task)return;
  const vw=Math.max(200,$('viewer').clientWidth-36),dpr=Math.min(devicePixelRatio||1,2);
  const base=pages.map(p=>p.getViewport({scale:1,rotation:(p.rotate+rotation)%360}));
  const widthScale=Math.min(...base.map(v=>(vw-12*(nums.length-1))/(v.width*nums.length)));const availableHeight=Math.max(160,window.innerHeight-$('viewer').getBoundingClientRect().top-64);const heightScale=Math.min(...base.map(v=>availableHeight/v.height));const scale=(fitMode==='page'?Math.min(widthScale,heightScale):widthScale)*zoom;
  const canvases=pages.map((p,i)=>{const view=p.getViewport({scale:scale*dpr,rotation:(p.rotate+rotation)%360}),canvas=document.createElement('canvas');canvas.className='sheet';canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=(view.width/dpr)+'px';canvas.style.height=(view.height/dpr)+'px';return{p,view,canvas}});
  canvases.forEach(c=>$('sheets').appendChild(c.canvas));await Promise.all(canvases.map(c=>c.p.render({canvasContext:c.canvas.getContext('2d'),viewport:c.view}).promise));
  if(id!==task)return;$('message').hidden=true;refreshModeButtons();
  $('page').value=page;$('page').max=pdf.numPages;$('total').textContent=pdf.numPages;
  $('prev').disabled=page<=1;$('next').disabled=page+(spread&&page>1?1:0)>=pdf.numPages;$('zoomLabel').textContent=Math.round(zoom*100)+'%';
 }catch(e){if(id===task)info('페이지 표시 실패: '+e.message,true)}
}
function navigate(target){if(!pdf)return;let next=Math.max(1,Math.min(pdf.numPages,target));if(spread&&next>1&&next%2!==0)next-=1;page=next;$('viewer').scrollTop=0;render()}
$('menu').onclick=()=>{const small=window.matchMedia('(max-width:760px), (max-width:1000px) and (pointer:coarse)').matches;if(small){const opened=$('sidebar').classList.toggle('open');$('menu').textContent=opened?'☰ 목차 닫기':'☰ 목차 열기'}else{const collapsed=document.querySelector('.layout').classList.toggle('sidebar-collapsed');$('menu').textContent=collapsed?'☰ 목차 열기':'☰ 목차 접기';if(pdf)requestAnimationFrame(()=>render())}};
$('prev').onclick=()=>navigate(spread?(page<=2?1:page-2):page-1);$('next').onclick=()=>navigate(spread?(page===1?2:page+2):page+1);
$('page').onchange=()=>navigate(Number($('page').value)||1);
$('zoomIn').onclick=()=>{zoom=Math.min(3,zoom+.1);render()};
$('zoomOut').onclick=()=>{zoom=Math.max(.5,zoom-.1);render()};
$('rotateLeft').onclick=()=>{rotation=(rotation+270)%360;render()};
$('rotateRight').onclick=()=>{rotation=(rotation+90)%360;render()};
function refreshModeButtons(){for(const [id,active] of [['fit',fitMode==='width'],['fitPage',fitMode==='page'],['spread',spread]]){$(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('mode-active',active)}}
$('fit').onclick=()=>{fitMode='width';zoom=1;refreshModeButtons();render()};$('fitPage').onclick=()=>{fitMode='page';zoom=1;refreshModeButtons();render()};
$('spread').onclick=()=>{spread=!spread;if(spread&&page>1&&page%2!==0)page-=1;$('spread').textContent=spread?'▤ 한 쪽':'▣ 두 쪽';refreshModeButtons();render()};


// Mobile settings: controls proxy to the existing reader buttons.
const mobileSettings=$('mobileSettings'), mobileMore=$('mobileMore');
function closeMobileSettings(){mobileSettings.hidden=true;mobileMore.setAttribute('aria-expanded','false')}
mobileMore.onclick=()=>{mobileSettings.hidden=!mobileSettings.hidden;mobileMore.setAttribute('aria-expanded',String(!mobileSettings.hidden));syncMobileSettings()};
$('closeMobileSettings').onclick=closeMobileSettings;
const mobileActions={mFit:'fit',mFitPage:'fitPage',mSpread:'spread',mRotateLeft:'rotateLeft',mRotateRight:'rotateRight'};
for(const [mobileId,sourceId] of Object.entries(mobileActions)){
 $(mobileId).onclick=()=>{$(sourceId).click();syncMobileSettings();closeMobileSettings()};
}
function syncMobileSettings(){
 for(const [mobileId,sourceId] of Object.entries({mFit:'fit',mFitPage:'fitPage',mSpread:'spread'})){
  $(mobileId).setAttribute('aria-pressed',$(sourceId).getAttribute('aria-pressed')||'false');
 }
 $('mSpread').textContent=spread?'▤ 한 쪽 보기':'▣ 두 쪽 보기';
}
document.addEventListener('pointerdown',e=>{if(!mobileSettings.hidden&&!e.target.closest('#mobileSettings')&&!e.target.closest('#mobileMore'))closeMobileSettings()});
function refreshMobileLayout(){
 closeMobileSettings();
 const desired=defaultFitMode();if(fitMode!==desired){fitMode=desired;zoom=1;refreshModeButtons()}
 const mobile=window.matchMedia('(max-width:760px), (max-width:1000px) and (pointer:coarse)').matches;
 if(mobile){$('sidebar').classList.remove('open');$('menu').textContent='☰ 목차';$('menu').setAttribute('aria-expanded','false')}
 else{$('menu').textContent=document.querySelector('.layout').classList.contains('sidebar-collapsed')?'☰ 목차 열기':'☰ 목차 접기'}
 if(pdf)requestAnimationFrame(()=>render());
}
window.addEventListener('orientationchange',()=>setTimeout(refreshMobileLayout,120));
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key==='ArrowRight')$('next').click();if(e.key==='ArrowLeft')$('prev').click()});
document.addEventListener('contextmenu',e=>{if(e.target.closest('.viewer'))e.preventDefault()});
window.addEventListener('resize',()=>{if(pdf)requestAnimationFrame(()=>render())});
// Pointer Events swipe navigation (touch screens); allow vertical scrolling.
let swipeStart=null;
const area=$('viewer');
area.addEventListener('pointerdown',e=>{
 if(e.pointerType!=='touch'||!e.isPrimary){swipeStart=null;return}
 swipeStart={id:e.pointerId,x:e.clientX,y:e.clientY,at:Date.now()};
});
area.addEventListener('pointerup',e=>{
 if(!swipeStart||swipeStart.id!==e.pointerId)return;
 const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;
 const elapsed=Date.now()-swipeStart.at;swipeStart=null;
 if(elapsed<1200&&Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.25){
  if(dx<0)$('next').click();else $('prev').click();
 }
});
area.addEventListener('pointercancel',()=>{swipeStart=null});
area.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.isPrimary)area.setPointerCapture(e.pointerId)});
loadBooks();
