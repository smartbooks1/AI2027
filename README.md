# AI2027 웹 전자책 뷰어

GitHub Pages에서 여러 PDF를 하나의 전자책 목차로 구성하는 뷰어입니다.

- 서비스 주소: https://smartbooks1.github.io/AI2027/
- 렌더링: PDF.js
- PC: 왼쪽 목차, 한 쪽·펼친 두 쪽 보기, 맞춤·확대, 책갈피
- 모바일: 맞춤형 목차, 스와이프 이동, 핀치 확대, 세로·가로 전용 도구 배치

## 운영 파일

- `index.html`: 화면 구조와 현재 CSS·JS 진입점
- `js/native-reader.js`: PDF 로딩, 렌더링, 페이지 이동, 모바일 제스처, 책갈피
- `css/style.css`: 사이트 공통 레이아웃과 왼쪽 목차
- `css/native-reader.css`: 리더와 모바일 전용 화면
- `config/books.json`: 사이트 제목, PDF 순서와 목차 이름, 초기 보기 설정

## PDF 추가와 변경

현재 `config/books.json`은 `autoDiscover: false`이므로 `books`에 적힌 PDF만 표시합니다.

```json
{
  "file": "새로운장.pdf",
  "title": "새로운 장"
}
```

1. PDF를 저장소에 업로드합니다.
2. `config/books.json`의 `books`에 파일 경로를 추가합니다.
3. `title`을 생략하면 `titleRules` 또는 파일명이 목차 이름으로 사용됩니다.
4. GitHub Pages 배포가 끝난 뒤 PC와 모바일에서 열어 봅니다.

`autoDiscover: true`로 바꾸면 저장소의 PDF를 자동으로 찾습니다. 이 경우 `books`에 직접 적은 PDF가 먼저 나오고, 나머지는 파일 경로 순서로 추가됩니다.

## 설정 항목

- `siteTitle`: 브라우저와 왼쪽 사이드바에 표시할 제목
- `autoDiscover`: 등록하지 않은 PDF의 자동 검색 여부
- `books`: 표시할 PDF의 경로·제목·순서
- `books[].visible`: `false`이면 목차에서 제외
- `titleRules`: 파일명에 특정 문자열이 포함될 때 적용할 목차 이름
- `readerDefaults.fit`: `auto`, `page`, `width` 중 하나
- `readerDefaults.twoPage`: PC와 모바일 가로 화면의 초기 펼친 보기 여부

## 책갈피와 공개 범위

책갈피는 독자의 브라우저 `localStorage`에 하나만 저장되며 새 책갈피가 이전 값을 덮어씁니다. 다른 기기와 동기화되지 않습니다.

GitHub Pages와 공개 저장소에 올린 PDF는 원본 주소로 접근할 수 있습니다. 우클릭 방지는 편의 기능이며 파일 접근 권한을 통제하지 않습니다.
