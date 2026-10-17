// Native browser PDF rendering with site-owned page navigation.
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
const $=id=>document.getElementById(id);
const PAGE_OWNER=location.hostname.endsWith('.github.io')?location.hostname.slice(0,-'.github.io'.length):'smartbooks1';
const PAGE_REPOSITORY=location.hostname.endsWith('.github.io')?(location.pathname.split('/').filter(Boolean)[0]||PAGE_OWNER+'.github.io'):'AI2027';
const ROOT=PAGE_OWNER+'/'+PAGE_REPOSITORY;
const displayName=path=>decodeURIComponent(path.split('/').pop()).replace(/\.pdf$/i,'');
const link=path=>path.split('/').map(encodeURIComponent).join('/');
let books=[],readerDefaults={fit:'auto'},currentPage=1,totalPages=0,currentBookUrl='',currentBookTitle='',pageInfoTask=null,openToken=0,zoomLevel=100,twoPage=false;
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
  twoPage=readerDefaults.twoPage;

  const siteTitle=typeof config.siteTitle==='string'&&config.siteTitle.trim()?config.siteTitle:'전자책 자료실';
  $('siteTitle').textContent=siteTitle;document.title=siteTitle;
  if(!books.length){$('chapters').replaceChildren();info('표시할 PDF가 없습니다. config/books.json의 books, visible, autoDiscover 설정을 확인해 주세요.');return}
  const nav=$('chapters');nav.replaceChildren();books.forEach((b,i)=>{const btn=document.createElement('button');btn.className='chapter';btn.textContent=b.title;btn.onclick=()=>openBook(i);nav.appendChild(btn)});
  openBook(0);
 }catch(e){info('도서 목록을 불러오지 못했습니다: '+e.message,true)}
}

function updatePageControls(){
 const pageText=twoPage?(currentPage===1?'백면 · 1':(currentPage+(currentPage<totalPages?' · '+(currentPage+1):' · 백면'))):String(currentPage);
 $('currentPage').textContent=pageText;
 $('totalPages').textContent=totalPages?String(totalPages):'-';
 const atFirst=currentPage<=1,atLast=!totalPages||currentPage>=lastPageStart();
 $('firstPage').disabled=atFirst;$('prevPage').disabled=atFirst;$('edgePrev').disabled=atFirst;
 $('nextPage').disabled=atLast;$('lastPage').disabled=atLast;$('edgeNext').disabled=atLast;
 $('readerZoomLabel').textContent=zoomLevel+'%';$('zoomOut').disabled=zoomLevel<=50;$('zoomIn').disabled=zoomLevel>=200;
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
function nativePageUrl(pageNumber){
 const url=new URL(currentBookUrl);
 // A distinct document URL prevents Chrome from retaining the old embedded
 // PDF viewport when only the fragment's page number changes.
 url.searchParams.set('reader-page',String(pageNumber));
 url.searchParams.set('reader-zoom',String(zoomLevel));
 url.searchParams.set('reader-view',twoPage?'two':'one');
 url.hash='page='+pageNumber+'&zoom='+zoomLevel+'&toolbar=0&navpanes=0';
 return url.href;
}
function blankPage(){
 const slot=document.createElement('div');slot.className='native-page-slot native-blank';
 const sheet=document.createElement('div');sheet.className='blank-sheet';sheet.textContent='백면';slot.appendChild(sheet);return slot;
}
function renderNativePages(){
 const pages=$('nativePages');pages.classList.toggle('two-page',twoPage);pages.replaceChildren();
 for(const pageNumber of visiblePages()){
  if(pageNumber===null){pages.appendChild(blankPage());continue}
  const frame=document.createElement('iframe');frame.className='native-page-frame';
  frame.title=currentBookTitle+' '+pageNumber+'쪽 PDF';frame.src=nativePageUrl(pageNumber);pages.appendChild(frame);
 }
}
function goToPage(pageNumber){
 if(!totalPages)return;
 const next=normalizePage(pageNumber);
 if(next===currentPage)return;
 currentPage=next;updatePageControls();renderNativePages();
}
function previousPage(){return twoPage?(currentPage<=2?1:currentPage-2):currentPage-1}
function nextPage(){return twoPage?(currentPage===1?2:currentPage+2):currentPage+1}
function setZoom(next){
 if(!currentBookUrl)return;
 const value=Math.max(50,Math.min(200,next));if(value===zoomLevel)return;
 zoomLevel=value;updatePageControls();renderNativePages();
}
function setTwoPage(enabled){
 if(!currentBookUrl)return;
 if(twoPage===enabled)return;twoPage=enabled;currentPage=normalizePage(currentPage);
 updatePageControls();renderNativePages();
}
async function openBook(index){
 const token=++openToken;
 if(pageInfoTask){pageInfoTask.destroy().catch(()=>{});pageInfoTask=null}
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
  const pageCount=documentRef.numPages;await documentRef.destroy();
  if(token!==openToken)return;
  totalPages=pageCount;pageInfoTask=null;
  updatePageControls();$('message').hidden=true;
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
$('zoomOut').onclick=()=>setZoom(zoomLevel-10);
$('zoomIn').onclick=()=>setZoom(zoomLevel+10);
$('singlePageMode').onclick=()=>setTwoPage(false);
$('twoPageMode').onclick=()=>setTwoPage(true);
const smallScreen=()=>window.matchMedia('(max-width:760px), (max-width:1000px) and (pointer:coarse)').matches;
function syncMenu(){
 const expanded=smallScreen()?$('sidebar').classList.contains('open'):!document.querySelector('.layout').classList.contains('sidebar-collapsed');
 $('menu').textContent=expanded?'☰ 목차 접기':'☰ 목차 열기';$('menu').setAttribute('aria-expanded',String(expanded));
}
$('menu').onclick=()=>{if(smallScreen())$('sidebar').classList.toggle('open');else document.querySelector('.layout').classList.toggle('sidebar-collapsed');syncMenu()};
function focusReading(enabled){document.querySelector('.layout').classList.toggle('focus-reading',enabled);$('focusExit').hidden=!enabled;$('focusMode').setAttribute('aria-pressed',String(enabled));$('focusMode').setAttribute('aria-label',enabled?'집중 모드 종료':'집중 모드 시작')}
$('focusMode').onclick=()=>focusReading(!document.querySelector('.layout').classList.contains('focus-reading'));$('focusExit').onclick=()=>focusReading(false);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){focusReading(false);return}
 if(event.target instanceof HTMLInputElement)return;
 if(event.key==='ArrowLeft')goToPage(previousPage());
 if(event.key==='ArrowRight')goToPage(nextPage());
});
window.addEventListener('resize',syncMenu);
syncMenu();loadBooks();
