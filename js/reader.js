import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
const ROOT='smartbooks1/AI2027';
const $=id=>document.getElementById(id);
const isMobileLandscape=()=>window.matchMedia('(orientation:landscape) and (pointer:coarse) and (max-height:600px)').matches;
const defaultFitMode=()=>isMobileLandscape()?'width':'page';
let books=[],pdf=null,current=0,page=1,spread=false,zoom=1,rotation=0,fitMode="page",task=0,loadingTask=null;
const displayName=path=>decodeURIComponent(path.split('/').pop()).replace(/\.pdf$/i,'');
const link=path=>path.split('/').map(encodeURIComponent).join('/');
const READING_KEY='ai2027:last-reading:v1';
function readPosition(){try{const value=JSON.parse(localStorage.getItem(READING_KEY));return value&&typeof value.file==='string'&&Number.isInteger(value.page)&&value.page>=1?value:null}catch{return null}}
function savePosition(){if(!pdf||!books[current])return;try{localStorage.setItem(READING_KEY,JSON.stringify({file:books[current].file,page}))}catch{}}
function hideResume(){$('resumePrompt').hidden=true}
function showResume(){
 const last=readPosition();if(!last)return;
 const index=books.findIndex(b=>b.file===last.file);
 if(index<0||(index===0&&last.page===1))return;
 const targetIndex=index;
 $('resumeDetail').textContent=books[index].title+' · '+last.page+'쪽';
 $('resumeContinue').onclick=()=>{hideResume();openBook(targetIndex,{resumePage:last.page})};
 $('resumeDismiss').onclick=hideResume;
 $('resumePrompt').hidden=false;
}

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
  await openBook(0,{initial:true});showResume();
 }catch(e){info('도서 목록을 불러오지 못했습니다: '+e.message,true)}
}
async function openBook(index,options={}){
 hideResume();current=index;page=1;zoom=1;rotation=0;fitMode=defaultFitMode();const id=++task;const b=books[index];
 if(loadingTask){try{loadingTask.destroy()}catch{}loadingTask=null}
 pdf=null;$('title').textContent=b.title;
 document.querySelectorAll('.chapter').forEach((n,i)=>n.classList.toggle('active',i===index));
 $('sidebar').classList.remove('open');$('sheets').replaceChildren();info('PDF를 불러오는 중입니다…');
 const dl=$('download');dl.classList.toggle('hidden',!b.allowDownload);dl.href=link(b.file);dl.download=b.file.split('/').pop();
 // Keep the reader URL unchanged when switching chapters.
 try{const job=pdfjsLib.getDocument({url:link(b.file)});loadingTask=job;const doc=await job.promise;if(id!==task){await doc.destroy();return}pdf=doc;loadingTask=null;if(options.resumePage)page=Math.max(1,Math.min(pdf.numPages,options.resumePage));await render();if(!options.initial)savePosition()}
 catch(e){if(id===task)info('PDF 열기 실패: '+e.message,true)}
}
async function render(){
 if(!pdf)return;
 const id=++task;
 // Spread slots are always two pages: blank+cover, paired pages, or final page+blank.
 const slots=!spread?[page]:page===1?[null,1]:[page,page+1<=pdf.numPages?page+1:null];
 info('페이지를 표시하는 중입니다…');$('sheets').replaceChildren();
 try{
  const loaded=await Promise.all(slots.map(n=>n===null?null:pdf.getPage(n)));
  if(id!==task)return;
  const real=loaded.filter(Boolean);
  const vw=Math.max(200,$('viewer').clientWidth-36),dpr=Math.min(devicePixelRatio||1,2);
  const base=real.map(p=>p.getViewport({scale:1,rotation:(p.rotate+rotation)%360}));
  const slotCount=slots.length;
  const gap=spread?4:0;
  const widthScale=Math.min(...base.map(v=>(vw-gap*(slotCount-1))/(v.width*slotCount)));
  const availableHeight=Math.max(160,window.innerHeight-$('viewer').getBoundingClientRect().top-64);
  const heightScale=Math.min(...base.map(v=>availableHeight/v.height));
  const scale=(fitMode==='page'?Math.min(widthScale,heightScale):widthScale)*zoom;
  const canvases=loaded.map(p=>{
   if(!p)return null;
   const view=p.getViewport({scale:scale*dpr,rotation:(p.rotate+rotation)%360});
   const canvas=document.createElement('canvas');canvas.className='sheet';
   canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   canvas.style.width=(view.width/dpr)+'px';canvas.style.height=(view.height/dpr)+'px';
   return {p,view,canvas};
  });
  $('sheets').classList.toggle('spread-mode',spread);
  const blankReference=canvases.find(Boolean)?.canvas;
  canvases.forEach(item=>{
   if(item){$('sheets').appendChild(item.canvas);return}
   const blank=document.createElement('div');blank.className='blank-page';
   blank.setAttribute('aria-label','빈 페이지');
   blank.style.width=blankReference.style.width;blank.style.height=blankReference.style.height;
   $('sheets').appendChild(blank);
  });
  await Promise.all(canvases.filter(Boolean).map(c=>c.p.render({canvasContext:c.canvas.getContext('2d'),viewport:c.view}).promise));
  if(id!==task)return;
  $('message').hidden=true;refreshModeButtons();
  $('page').value=page;$('page').max=pdf.numPages;$('total').textContent=pdf.numPages;
  $('prev').disabled=page<=1;$('edgePrev').disabled=$('prev').disabled;
  $('next').disabled=page+(spread&&page>1?1:0)>=pdf.numPages;$('edgeNext').disabled=$('next').disabled;
  $('zoomLabel').textContent=Math.round(zoom*100)+'%';
 }catch(e){if(id===task)info('페이지 표시 실패: '+e.message,true)}
}
function navigate(target){if(!pdf)return;let next=Math.max(1,Math.min(pdf.numPages,target));if(spread&&next>1&&next%2!==0)next-=1;page=next;hideResume();savePosition();$('viewer').scrollTop=0;render()}
$('menu').onclick=()=>{const small=window.matchMedia('(max-width:760px), (max-width:1000px) and (pointer:coarse)').matches;if(small){const opened=$('sidebar').classList.toggle('open');$('menu').textContent=opened?'☰ 목차 닫기':'☰ 목차 열기'}else{const collapsed=document.querySelector('.layout').classList.toggle('sidebar-collapsed');$('menu').textContent=collapsed?'☰ 목차 열기':'☰ 목차 접기';if(pdf)requestAnimationFrame(()=>{positionEdgeButtons();render()})}};
$('prev').onclick=()=>navigate(spread?(page<=2?1:page-2):page-1);$('next').onclick=()=>navigate(spread?(page===1?2:page+2):page+1);
$('page').onchange=()=>navigate(Number($('page').value)||1);
$('edgePrev').onclick=()=>$('prev').click();
$('edgeNext').onclick=()=>$('next').click();
function positionEdgeButtons(){document.querySelector('.layout').style.setProperty('--reader-left',document.querySelector('.main').getBoundingClientRect().left+'px')}
positionEdgeButtons();
$('zoomIn').onclick=()=>{zoom=Math.min(3,zoom+.1);render()};
$('zoomOut').onclick=()=>{zoom=Math.max(.5,zoom-.1);render()};
$('rotateLeft').onclick=()=>{rotation=(rotation+270)%360;render()};
$('rotateRight').onclick=()=>{rotation=(rotation+90)%360;render()};
function refreshModeButtons(){for(const [id,active] of [['fit',fitMode==='width'],['fitPage',fitMode==='page'],['spread',spread]]){$(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('mode-active',active)}}
$('fit').onclick=()=>{fitMode='width';zoom=1;refreshModeButtons();render()};$('fitPage').onclick=()=>{fitMode='page';zoom=1;refreshModeButtons();render()};
$('spread').onclick=()=>{spread=!spread;if(spread&&page>1&&page%2!==0)page-=1;$('spread').textContent=spread?'▤ 한 쪽':'▣ 두 쪽';refreshModeButtons();render()};


// Enter focus mode only through explicit controls; restore via exit or deliberate tap.
let focusReading=false;
function setFocusReading(enabled){
 if(focusReading===enabled)return;
 focusReading=enabled;
 document.querySelector('.layout').classList.toggle('focus-reading',enabled);
 $('focusExit').hidden=!enabled;
 $('focusMode').setAttribute('aria-pressed',String(enabled));
 $('mFocusMode').setAttribute('aria-pressed',String(enabled));
 closeMobileSettings();
 if(pdf)requestAnimationFrame(()=>{positionEdgeButtons();render()});
}
$('focusMode').onclick=()=>setFocusReading(true);
$('mFocusMode').onclick=()=>setFocusReading(true);
$('focusExit').onclick=()=>setFocusReading(false);

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
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key==='Escape'&&focusReading){setFocusReading(false);return}if(e.key==='ArrowRight')$('next').click();if(e.key==='ArrowLeft')$('prev').click()});
document.addEventListener('contextmenu',e=>{if(e.target.closest('.viewer'))e.preventDefault()});
window.addEventListener('resize',()=>{positionEdgeButtons();if(pdf)requestAnimationFrame(()=>render())});
// A brief stationary touch exits focus mode; scrolling, swiping and long press do not.
let focusTap=null;
$('viewer').addEventListener('pointerdown',e=>{
 if(!focusReading||e.pointerType!=='touch'||!e.isPrimary||e.target.closest('button')){focusTap=null;return}
 focusTap={id:e.pointerId,x:e.clientX,y:e.clientY,at:Date.now()};
});
$('viewer').addEventListener('pointerup',e=>{
 if(!focusTap||e.pointerId!==focusTap.id)return;
 const t=focusTap;focusTap=null;
 if(!focusReading)return;
 if(Date.now()-t.at<=300&&Math.hypot(e.clientX-t.x,e.clientY-t.y)<=10)setFocusReading(false);
});
$('viewer').addEventListener('pointercancel',()=>{focusTap=null});

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
