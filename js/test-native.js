// Independent comparison page: intentionally does not import reader.js or PDF.js.
const bookSelect=document.getElementById('book');
const frame=document.getElementById('pdf');
const direct=document.getElementById('direct');
const reload=document.getElementById('reload');
const status=document.getElementById('status');
let books=[];
function openBook(){
 const book=books[Number(bookSelect.value)];
 if(!book)return;
 const encoded=book.file.split('/').map(encodeURIComponent).join('/');
 const url=new URL(encoded,new URL('../',import.meta.url));
 if(url.origin!==location.origin)throw new Error('같은 사이트의 PDF만 열 수 있습니다.');
 direct.href=url.href;direct.hidden=false;
 // A new iframe resets the native viewer even when reopening the same file.
 const next=frame.cloneNode(false);
 next.src=url.href+'#view=FitH';
 document.getElementById('pdf').replaceWith(next);
 const query=new URL(location.href);query.searchParams.set('file',book.file);
 history.replaceState(null,'',query);
 status.textContent=`${book.file} — 화면 DPR: ${window.devicePixelRatio||1}. PDF가 표시되지 않으면 새 탭 링크를 사용하세요.`;
}
try{
 const response=await fetch('./config/books.json',{cache:'no-store'});
 if(!response.ok)throw new Error(`문서 목록 요청 실패 (${response.status})`);
 const config=await response.json();
 books=(config.books||[]).filter(b=>typeof b.file==='string'&&/\.pdf$/i.test(b.file));
 if(!books.length)throw new Error('설정에 PDF 문서가 없습니다.');
 for(const [i,book] of books.entries()){
  const option=document.createElement('option');option.value=i;
  const rule=(config.titleRules||[]).find(r=>typeof r.contains==='string'&&book.file.includes(r.contains));
  option.textContent=rule?.title||book.file;bookSelect.append(option);
 }
 const requested=new URL(location.href).searchParams.get('file');
 const selected=books.findIndex(b=>b.file===requested);
 bookSelect.value=String(Math.max(0,selected));
 bookSelect.disabled=false;reload.disabled=false;
 bookSelect.addEventListener('change',openBook);reload.addEventListener('click',openBook);
 openBook();
}catch(error){status.classList.add('error');status.textContent=`${error.message} — 로컬 파일을 직접 여는 대신 HTTP 서버 또는 GitHub Pages에서 접속하세요.`;}
