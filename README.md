# AI2027 웹 전자책 뷰어

GitHub Pages에서 PDF 파일 하나를 하나의 장으로 표시하는 전자책 뷰어입니다.

## 접속 주소
https://smartbooks1.github.io/AI2027/

## 관리 방법
GitHub의 `smartbooks1/AI2027` 저장소에 로그인하여 관리합니다. 별도의 관리자 로그인 화면은 없습니다.

현재 `config/books.json`의 `books`가 비어 있고 `autoDiscover: true`이므로, 저장소의 PDF를 자동으로 찾아 파일명 순으로 왼쪽 목차에 표시합니다.

PDF별 이름·순서·다운로드 버튼을 직접 관리하려면 `config/books.json`에 다음과 같이 입력합니다.

```json
{
  "siteTitle": "AI2027 전자책 자료실",
  "autoDiscover": false,
  "books": [
    {"file": "제1장.pdf", "title": "제1장", "visible": true, "allowDownload": false},
    {"file": "제2장.pdf", "title": "제2장", "visible": true, "allowDownload": false}
  ]
}
```

실제 파일 경로를 정확히 입력해야 합니다. 자동 검색 모드는 GitHub의 공개 API를 사용하므로 공개 저장소에서 사용합니다. 페이지를 갱신하면 변경 사항이 반영됩니다.

## 중요
다운로드 버튼 숨기기와 우클릭 방지는 PDF의 실제 다운로드를 기술적으로 막지 못합니다. 공개 GitHub 저장소나 GitHub Pages에 올린 PDF는 직접 접근할 수 있으므로, 외부 공개가 불가능한 자료는 절대 업로드하지 마세요. `visible:false`도 파일을 비공개로 전환하지 않습니다.

## 파일 구조
- `index.html`: 독자용 뷰어
- `js/reader.js`: PDF.js 기반 렌더링·목차·페이지 이동
- `css/style.css`: 레이아웃
- `config/books.json`: 장별 표시와 다운로드 설정
