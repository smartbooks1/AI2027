// Native browser PDF rendering with site-owned page navigation.
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
const $=id=>document.getElementById(id);
const PAGE_OWNER=location.hostname.endsWith('.github.io')?location.hostname.slice(0,-'.github.io'.length):'smartbooks1';
const PAGE_REPOSITORY=location.hostname.endsWith('.github.io')?(location.pathname.split('/').filter(Boolean)[0]||PAGE_OWNER+'.github.io'):'AI2027';
const ROOT=PAGE_OWNER+'/'+PAGE_REPOSITORY;
const displayName=path=>decodeURIComponent(path.split('/').pop()).replace(/\.pdf$/i,'');
const link=path=>path.split('/').map(encodeURIComponent).join('/');
let books=[],readerDefaults={fit:'auto'},currentPage=1,totalPages=0,currentBookUrl='',currentBookTitle='',pageInfoTask=null,pdfDocument=null,openToken=0,zoomLevel=100,fitMode='page',twoPage=false,spreadRenderToken=0,spreadRenderTasks=[];
// Canvas spreads need supersampling to retain the sharp text of the native PDF viewer.
const MIN_SPREAD_RENDER_RATIO=2;
const MAX_SPREAD_RENDER_RATIO=3;
const MAX_SPREAD_PAGE_PIXELS=12000000;
const info=(text,error=false)=>{$('message').textContent=text;$('message').className='message'+(error?' error':'');$('message').hidden=false};
async function discover(){
 const resp=await fetch('https://api.github.com/repos/'+ROOT+'/git/trees/main?recursive=1',{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
 if(!resp.ok)throw Error('GitHub 파일 목록 조회 실패 ('+resp.status+')');
 const obj=await resp.json();
 if(obj.truncated)throw Error('저장소 파일 목록이 너무 커 자동 검색하지 못했습니다.');
 return obj.tree.filter(f=>f.type==='blob'&&/\.pdf$/i.test(f.path)).map(f=>({file:f.path,visible:true,allowDownload:false})).sort((a,b)=>a.file.localeCompare(b.file,'ko',{numeric:true}));
}
function configuredBooks(config,discovered){
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('books.json의 최상위 값은 { } 형태여야 합니다.');
 if(config.books!==undefined&&!Array.isArray(config.books))throw Error('books 항목은 [ ] 목록이어야 합니다.');
 if(config.titleRules!==undefined&&!Array.isArray(config.titleRules))throw Error('titleRules 항목은 [ ] 목록이어야 합니다.');
 if(config.siteTitle!==undefined&&(typeof config.siteTitle!=='string'||!config.siteTitle.trim()))throw Error('siteTitle에는 비어 있지 않은 책 제목을 입력해 주세요.');
 if(config.autoDiscover!==undefined&&typeof config.autoDiscover!=='boolean')throw Error('autoDiscover는 true 또는 false로 지정해 주세요.');
 const defaults=config.readerDefaults===undefined?{}:config.readerDefaults;
 if(!defaults||typeof defaults!=='object'||Array.isArray(defaults))throw Error('readerDefaults는 { } 형태여야 합니다.');
 if(defaults.fit!==undefined&&!['auto','width','page'].includes(defaults.fit))throw Error('readerDefaults.fit은 auto, width, page 중 하나여야 합니다.');
 for(const key of ['twoPage','allowDownload'])if(defaults[key]!==undefined&&typeof defaults[key]!=='boolean')throw Error('readerDefaults.'+key+'는 true 또는 false여야 합니다.');
 const rules=config.titleRules||[];
 for(let i=0;i<rules.length;i++){const rule=rules[i];if(!rule||typeof rule.contains!=='string'||!rule.contains.trim()||typeof rule.title!=='string'||!rule.title.trim())throw Error('titleRules '+(i+1)+'번째 항목의 contains와 title을 확인해 주세요.')}
 const declared=config.books||[],seen=new Set(),ordered=[];
 for(let i=0;i<declared.length;i++){
  const b=declared[i],prefix='books '+(i+1)+'번째 항목';
  if(!b||typeof b!=='object'||Array.isArray(b))throw Error(prefix+'은 { } 형태여야 합니다.');
  if(typeof b.file!=='string'||!b.file.trim()||!(/\.pdf$/i.test(b.file)))throw Error(prefix+'의 file에 PDF 경로(.pdf)를 입력해 주세요.');
  if(b.file.startsWith('/')||b.file.includes('\\')||b.file.split('/').some(p=>p==='.'||p==='..'||!p))throw Error(prefix+'의 file 경로를 확인해 주세요.');
  if(seen.has(b.file.toLocaleLowerCase()))throw Error(prefix+'의 PDF 경로가 중복되었습니다: '+b.file);
  if(b.allowDownload!==undefined&&typeof b.allowDownload!=='boolean')throw Error(prefix+'의 allowDownload는 true 또는 false로 지정해 주세요.');
  if(b.visible!==undefined&&typeof b.visible!=='boolean')throw Error(prefix+'의 visible은 true 또는 false로 지정해 주세요.');
  if(b.title!==undefined&&(typeof b.title!=='string'||!b.title.trim()))throw Error(prefix+'의 title을 확인해 주세요.');
  seen.add(b.file.toLocaleLowerCase());if(b.visible!==false)ordered.push(b);
 }
 const auto=config.autoDiscover!==false;
 if(auto){for(const item of discovered){if(!seen.has(item.file.toLocaleLowerCase()))ordered.push(item)}}
 return ordered.map(b=>{
  const rule=rules.find(x=>b.file.includes(x.contains));
  return {...b,title:b.title||rule?.title||displayName(b.file)};
 });
}
async function loadBooks(){
 info('도서 목록을 불러오는 중입니다…');
 try{
  const response=await fetch('./config/books.json',{cache:'no-store'});if(!response.ok)throw Error('config/books.json을 찾을 수 없습니다 ('+response.status+').');
  let config;try{config=await response.json()}catch{throw Error('books.json 문법 오류: 쉼표, 따옴표, 괄호를 확인해 주세요.')}
  // Validate settings before making network requests.
  configuredBooks(config,[]);
  const discovered=config.autoDiscover!==false?await discover():[];
  books=configuredBooks(config,discovered);
  // Verify manually listed PDFs using GitHub Pages paths, also when auto discovery is disabled.
  const listed=books.filter(b=>(config.books||[]).some(x=>x.file===b.file));
  const check=await Promise.all(listed.map(async b=>{try{const res=await fetch(link(b.file),{method:'HEAD',cache:'no-store'});return res.ok?null:b.file+' (HTTP '+res.status+')'}catch{return b.file+' (연결 확인 실패)'}}));
  const missing=check.filter(Boolean);
  if(missing.length)throw Error('지정한 PDF 파일을 찾지 못했습니다: '+missing.join(', ')+'. books.json의 file 경로와 실제 업로드 파일명을 확인해 주세요.');
  readerDefaults={fit:config.readerDefaults?.fit||'auto',twoPage:config.readerDefaults?.twoPage===true,allowDownload:config.readerDefaults?.allowDownload===true};
  fitMode=readerDefaults.fit==='width'?'width':'page';
  twoPage=readerDefaults.twoPage;

  const siteTitle=typeof config.siteTitle==='string'&&config.siteTitle.trim()?config.siteTitle:'전자책 자료실';
  $('siteTitle').textContent=siteTitle;document.title=siteTitle;
  if(!books.length){$('chapters').replaceChildren();info('표시할 PDF가 없습니다. config/books.json의 books, visible, autoDiscover 설정을 확인해 주세요.');return}
  const nav=$('chapters');nav.replaceChildren();books.forEach((b,i)=>{const btn=document.createElement('button');btn.className='chapter';btn.textContent=b.title;btn.onclick=()=>openBook(i);nav.appendChild(btn)});
  openBook(0);
 }catch(e){info('도서 목록을 불러오지 못했습니다: '+e.message,true)}
}

function updatePageControls(){
 $('currentPage').value=String(currentPage);$('currentPage').max=String(Math.max(1,totalPages));$('currentPage').disabled=!totalPages;
 $('totalPages').textContent=totalPages?String(totalPages):'-';
 const atFirst=currentPage<=1,atLast=!totalPages||currentPage>=lastPageStart();
 $('firstPage').disabled=atFirst;$('prevPage').disabled=atFirst;$('edgePrev').disabled=atFirst;
 $('nextPage').disabled=atLast;$('lastPage').disabled=atLast;$('edgeNext').disabled=atLast;
 $('readerZoomLabel').textContent=zoomLevel+'%';$('zoomOut').disabled=zoomLevel<=50;$('zoomIn').disabled=zoomLevel>=200;
 $('fitWidth').setAttribute('aria-pressed',String(fitMode==='width'));$('fitPage').setAttribute('aria-pressed',String(fitMode==='page'));
 $('singlePageMode').setAttribute('aria-pressed',String(!twoPage));$('twoPageMode').setAttribute('aria-pressed',String(twoPage));
}
function lastPageStart(){
 if(!twoPage||totalPages<=1)return Math.max(1,totalPages);
 return totalPages%2===0?totalPages:totalPages-1;
}
function normalizePage(pageNumber){
 const bounded=Math.max(1,Math.min(totalPages||1,pageNumber));
 return twoPage&&bounded>1&&bounded%2!==0?bounded-1:bounded;
}
function visiblePages(){
 if(!twoPage)return [currentPage];
 if(currentPage===1)return [null,1];
 return [currentPage,currentPage+1<=totalPages?currentPage+1:null];
}
function cancelSpreadRendering(){
 spreadRenderToken++;for(const task of spreadRenderTasks){try{task.cancel()}catch{}}spreadRenderTasks=[];
}
function spreadRenderRatio(width,height){
 const screenRatio=Math.max(MIN_SPREAD_RENDER_RATIO,Math.min(window.devicePixelRatio||1,MAX_SPREAD_RENDER_RATIO));
 return Math.min(screenRatio,Math.sqrt(MAX_SPREAD_PAGE_PIXELS/(width*height)));
}
function renderNativePages(){
 cancelSpreadRendering();const token=spreadRenderToken,pages=$('nativePages');pages.replaceChildren();
 pages.classList.toggle('two-page',twoPage);
 pages.classList.toggle('page-fitted',fitMode==='page'&&zoomLevel===100);
 if(pdfDocument)renderPageView(pages,token);
}
async function renderPageView(container,token){
 const documentRef=pdfDocument,slots=visiblePages();
 try{
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const loaded=await Promise.all(slots.map(pageNumber=>pageNumber===null?null:documentRef.getPage(pageNumber)));
   if(token!==spreadRenderToken||documentRef!==pdfDocument)return;
  const real=loaded.filter(Boolean),base=real.map(page=>page.getViewport({scale:1}));
  const maxWidth=Math.max(...base.map(view=>view.width)),maxHeight=Math.max(...base.map(view=>view.height));
   const padding=fitMode==='page'?10:Math.min(28,Math.max(12,container.clientWidth*.02)),gap=twoPage?3:0,slotCount=twoPage?2:1;
   const widthScale=Math.max(.1,(container.clientWidth-padding*2-gap*(slotCount-1))/(maxWidth*slotCount));
  const heightScale=Math.max(.1,(container.clientHeight-padding*2)/maxHeight);
  const fitScale=fitMode==='width'?widthScale:Math.min(widthScale,heightScale);
  const scale=fitScale*(zoomLevel/100);
  const reference=real[0].getViewport({scale}),referenceWidth=Math.max(1,Math.round(reference.width)),referenceHeight=Math.max(1,Math.round(reference.height));
  const stage=document.createElement('div');stage.className='spread-stage';stage.style.setProperty('--spread-padding',padding+'px');
  const renderItems=[];
  loaded.forEach((page,index)=>{
   const sideClass=twoPage?(index===0?'spread-left':'spread-right'):'spread-single';
   if(!page){const blank=document.createElement('div');blank.className='spread-blank '+sideClass;blank.setAttribute('aria-label','빈 페이지');blank.style.width=referenceWidth+'px';blank.style.height=referenceHeight+'px';stage.appendChild(blank);return}
   const display=page.getViewport({scale}),displayWidth=Math.max(1,Math.round(display.width)),displayHeight=Math.max(1,Math.round(display.height));
   const outputScale=spreadRenderRatio(displayWidth,displayHeight);
   const canvas=document.createElement('canvas');canvas.className='spread-page '+sideClass;canvas.width=Math.ceil(displayWidth*outputScale);canvas.height=Math.ceil(displayHeight*outputScale);canvas.style.width=displayWidth+'px';canvas.style.height=displayHeight+'px';canvas.setAttribute('aria-label',slots[index]+'쪽');stage.appendChild(canvas);renderItems.push({page,canvas,display,outputScale});
  });
  container.appendChild(stage);
  spreadRenderTasks=renderItems.map(item=>item.page.render({canvasContext:item.canvas.getContext('2d',{alpha:false}),viewport:item.display,transform:[item.outputScale,0,0,item.outputScale,0,0],background:'#fff'}));
  await Promise.all(spreadRenderTasks.map(task=>task.promise));
  if(token===spreadRenderToken)spreadRenderTasks=[];
 }catch(error){if(error?.name!=='RenderingCancelledException'&&token===spreadRenderToken)info('두 쪽 보기를 표시하지 못했습니다: '+error.message,true)}
}
function goToPage(pageNumber){
 if(!totalPages)return;
 const next=normalizePage(pageNumber);
 if(next===currentPage){updatePageControls();return}
 currentPage=next;updatePageControls();renderNativePages();
}
function submitPageInput(){
 const input=$('currentPage'),value=input.value.trim(),requested=Number(value);
 if(!value||!Number.isInteger(requested)){updatePageControls();return}
 goToPage(requested);
}
function previousPage(){return twoPage?(currentPage<=2?1:currentPage-2):currentPage-1}
function nextPage(){return twoPage?(currentPage===1?2:currentPage+2):currentPage+1}
function setZoom(next){
 if(!currentBookUrl)return;
 const value=Math.max(50,Math.min(200,next));if(value===zoomLevel&&fitMode===null)return;
 zoomLevel=value;fitMode=null;updatePageControls();renderNativePages();
}
function setFitMode(mode){
 if(!currentBookUrl||fitMode===mode)return;
 fitMode=mode;zoomLevel=100;updatePageControls();renderNativePages();
}
function setTwoPage(enabled){
 if(!currentBookUrl)return;
 if(twoPage===enabled)return;twoPage=enabled;currentPage=normalizePage(currentPage);
 updatePageControls();renderNativePages();
}
async function openBook(index){
 const token=++openToken;
 cancelSpreadRendering();
 if(pageInfoTask){pageInfoTask.destroy().catch(()=>{});pageInfoTask=null}
 if(pdfDocument){pdfDocument.destroy().catch(()=>{});pdfDocument=null}
 const book=books[index];
 const url=new URL(link(book.file),location.href);
 if(url.origin!==location.origin){info('같은 사이트의 PDF만 열 수 있습니다.',true);return}
 $('title').textContent=book.title;
 document.querySelectorAll('.chapter').forEach((button,i)=>{button.classList.toggle('active',i===index);button.setAttribute('aria-current',i===index?'true':'false')});
 $('sidebar').classList.remove('open');syncMenu();
 currentBookUrl=url.href;currentBookTitle=book.title;currentPage=1;totalPages=0;zoomLevel=100;updatePageControls();
 // The native toolbar is replaced by the simpler site-owned page bar.
 renderNativePages();
 info('페이지 정보를 불러오는 중입니다…');
 try{
  const loading=pdfjsLib.getDocument({url:url.href});pageInfoTask=loading;
  const documentRef=await loading.promise;
  if(token!==openToken){await documentRef.destroy();return}
  pdfDocument=documentRef;totalPages=documentRef.numPages;pageInfoTask=null;
  updatePageControls();renderNativePages();$('message').hidden=true;
 }catch(error){
  if(token===openToken){pageInfoTask=null;info('페이지 수를 확인하지 못했습니다: '+error.message,true)}
 }
}
$('firstPage').onclick=()=>goToPage(1);
$('prevPage').onclick=()=>goToPage(previousPage());
$('nextPage').onclick=()=>goToPage(nextPage());
$('lastPage').onclick=()=>goToPage(lastPageStart());
$('edgePrev').onclick=()=>goToPage(previousPage());
$('edgeNext').onclick=()=>goToPage(nextPage());
$('currentPage').addEventListener('change',submitPageInput);
$('currentPage').addEventListener('focus',event=>event.currentTarget.select());
$('currentPage').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();submitPageInput();event.currentTarget.blur()}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();updatePageControls();event.currentTarget.blur()}});
$('zoomOut').onclick=()=>setZoom(zoomLevel-10);
$('zoomIn').onclick=()=>setZoom(zoomLevel+10);
$('fitWidth').onclick=()=>setFitMode('width');
$('fitPage').onclick=()=>setFitMode('page');
$('singlePageMode').onclick=()=>setTwoPage(false);
$('twoPageMode').onclick=()=>setTwoPage(true);
const smallScreen=()=>window.matchMedia('(max-width:760px), (max-width:1000px) and (pointer:coarse)').matches;
function syncMenu(){
 const expanded=smallScreen()?$('sidebar').classList.contains('open'):!document.querySelector('.layout').classList.contains('sidebar-collapsed');
 $('menu').textContent=expanded?'☰ 목차 접기':'☰ 목차 열기';$('menu').setAttribute('aria-expanded',String(expanded));
}
let resizeTimer=null;
function scheduleSpreadRender(){clearTimeout(resizeTimer);if(pdfDocument)resizeTimer=setTimeout(renderNativePages,120)}
$('menu').onclick=()=>{if(smallScreen())$('sidebar').classList.toggle('open');else document.querySelector('.layout').classList.toggle('sidebar-collapsed');syncMenu();scheduleSpreadRender()};
function focusReading(enabled){const button=$('focusMode'),label=enabled?'집중 해제':'집중';document.querySelector('.layout').classList.toggle('focus-reading',enabled);button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'집중 모드 종료':'집중 모드 시작');button.title=label;button.querySelector('span').textContent=label;scheduleSpreadRender()}
$('focusMode').onclick=()=>focusReading(!document.querySelector('.layout').classList.contains('focus-reading'));
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){focusReading(false);return}
 if(event.target instanceof HTMLInputElement)return;
 if(event.key==='ArrowLeft')goToPage(previousPage());
 if(event.key==='ArrowRight')goToPage(nextPage());
});
document.addEventListener('contextmenu',event=>event.preventDefault());
window.addEventListener('resize',()=>{syncMenu();scheduleSpreadRender()});
syncMenu();loadBooks();
