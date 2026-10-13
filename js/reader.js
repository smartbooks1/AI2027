import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
const ROOT='smartbooks1/AI2027';
const $=id=>document.getElementById(id);
let books=[],pdf=null,current=0,page=1,spread=false,zoom=1,task=0,loadingTask=null;
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
  const config=await response.json();$('siteTitle').textContent=config.siteTitle||'AI2027 전자책 자료실';
  const declared=(config.books||[]).filter(b=>b.visible!==false&&b.file);
  books=declared.length?declared:(config.autoDiscover?await discover():[]);
  if(!books.length){info('등록된 PDF가 없습니다. 저장소에 PDF를 올리거나 config/books.json을 설정해 주세요.');return}
  books=books.map(b=>({...b,title:b.title||displayName(b.file)}));
  const nav=$('chapters');nav.replaceChildren();books.forEach((b,i)=>{const btn=document.createElement('button');btn.className='chapter';btn.textContent=b.title;btn.onclick=()=>openBook(i);nav.appendChild(btn)});
  const initial=new URLSearchParams(location.search).get('book');const idx=initial?books.findIndex(b=>b.file===initial):-1;await openBook(idx<0?0:idx);
 }catch(e){info('도서 목록을 불러오지 못했습니다: '+e.message,true)}
}
async function openBook(index){
 current=index;page=1;zoom=1;const id=++task;const b=books[index];
 if(loadingTask){try{loadingTask.destroy()}catch{}loadingTask=null}
 pdf=null;$('title').textContent=b.title;
 document.querySelectorAll('.chapter').forEach((n,i)=>n.classList.toggle('active',i===index));
 $('sidebar').classList.remove('open');$('sheets').replaceChildren();info('PDF를 불러오는 중입니다…');
 const dl=$('download');dl.classList.toggle('hidden',!b.allowDownload);dl.href=link(b.file);dl.download=b.file.split('/').pop();
 history.replaceState(null,'',location.pathname+'?book='+encodeURIComponent(b.file));
 try{const job=pdfjsLib.getDocument({url:link(b.file)});loadingTask=job;const doc=await job.promise;if(id!==task){await doc.destroy();return}pdf=doc;loadingTask=null;await render()}
 catch(e){if(id===task)info('PDF 열기 실패: '+e.message,true)}
}
async function render(){
 if(!pdf)return;const id=++task;const nums=spread&&page<pdf.numPages?[page,page+1]:[page];
 info('페이지를 표시하는 중입니다…');$('sheets').replaceChildren();
 try{
  const pages=await Promise.all(nums.map(n=>pdf.getPage(n)));if(id!==task)return;
  const vw=Math.max(200,$('viewer').clientWidth-36),dpr=Math.min(devicePixelRatio||1,2);
  const base=pages.map(p=>p.getViewport({scale:1}));
  const scale=Math.min(...base.map(v=>(vw-12*(nums.length-1))/(v.width*nums.length)))*zoom;
  const canvases=pages.map((p,i)=>{const view=p.getViewport({scale:scale*dpr}),canvas=document.createElement('canvas');canvas.className='sheet';canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=(view.width/dpr)+'px';canvas.style.height=(view.height/dpr)+'px';return{p,view,canvas}});
  canvases.forEach(c=>$('sheets').appendChild(c.canvas));await Promise.all(canvases.map(c=>c.p.render({canvasContext:c.canvas.getContext('2d'),viewport:c.view}).promise));
  if(id!==task)return;$('message').hidden=true;
  $('page').value=page;$('page').max=pdf.numPages;$('total').textContent=pdf.numPages;
  $('prev').disabled=page<=1;$('next').disabled=page+(spread?1:0)>=pdf.numPages;$('zoomLabel').textContent=Math.round(zoom*100)+'%';
 }catch(e){if(id===task)info('페이지 표시 실패: '+e.message,true)}
}
function navigate(target){if(!pdf)return;page=Math.max(1,Math.min(pdf.numPages,target));render()}
$('menu').onclick=()=>$('sidebar').classList.toggle('open');
$('prev').onclick=()=>navigate(page-(spread?2:1));$('next').onclick=()=>navigate(page+(spread?2:1));
$('page').onchange=()=>navigate(Number($('page').value)||1);
$('zoomIn').onclick=()=>{zoom=Math.min(3,zoom+.2);render()};
$('zoomOut').onclick=()=>{zoom=Math.max(.5,zoom-.2);render()};
$('fit').onclick=()=>{zoom=1;render()};
$('spread').onclick=()=>{spread=!spread;$('spread').textContent=spread?'한 쪽 보기':'두 쪽 보기';render()};
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key==='ArrowRight')$('next').click();if(e.key==='ArrowLeft')$('prev').click()});
document.addEventListener('contextmenu',e=>{if(e.target.closest('.viewer'))e.preventDefault()});
window.addEventListener('resize',()=>{if(pdf)render()});
loadBooks();
