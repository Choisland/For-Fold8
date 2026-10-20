# For-Fold8

For Fold8 fun — 갤럭시 Z Fold8에서 접힘 상태에 따라 레이아웃이 바뀌는 리더 PWA, **Fold Reader**.

## 화면 모드

| 모드 | 언제 | 레이아웃 |
| --- | --- | --- |
| `single` | 접힌 커버 화면, 좁은 창 | 한 쪽씩 보기 |
| `wide` | 펼친 메인 화면 | 두 쪽 펼침 (가운데 구분선) |
| `book` | 세로로 반쯤 접음 (화면 구간이 좌우 2개) | 각 쪽을 힌지 양옆 화면에 하나씩 배치 |
| `tabletop` | 가로로 반쯤 접어 세움 (화면 구간이 위아래 2개) | 위 화면은 본문, 아래 화면은 큰 조작 버튼 |

감지 순서:
1. `window.viewport.segments`(Viewport Segments API)로 화면 구간 확인
2. `navigator.devicePosture`(Device Posture API)의 `change` 이벤트로 접힘 변화 감지
3. 둘 다 없으면 화면 너비와 비율로 `single`/`wide` 판단

오른쪽 위 **ⓘ** 버튼을 누르면 감지된 상태를 볼 수 있고, **모드 시뮬레이션**으로 폴더블이 없어도 `book`/`tabletop`을 확인할 수 있어요.

## 기능

- CSS 다단(column) 기반 페이지 나누기, 장(`#` 제목)마다 새 쪽에서 시작
- 탭(화면 좌우 1/3), 스와이프, 슬라이더, 키보드로 페이지 넘기기
- 글자 크기, 테마(자동/밝게/세피아/어둡게), 책별 읽던 위치 저장
- `.txt` 파일 열기
- 서비스 워커로 오프라인 동작, 홈 화면에 설치 가능

## 실행

빌드 과정 없이 정적 파일만 있으면 됩니다.

```sh
python3 -m http.server 8000
# http://localhost:8000
```

PC 크롬에서는 DevTools 기기 툴바에서 폴더블 기기를 고르고 접힘 상태를 바꿔 보면 `book`/`tabletop`을 테스트할 수 있어요.

## Fold8에서 테스트

서비스 워커와 설치 기능은 HTTPS가 필요합니다. `main`에 머지하면 `.github/workflows/pages.yml`이 GitHub Pages로 배포해요.
(처음 한 번은 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 설정해야 합니다.)

배포 후 Fold8의 크롬이나 삼성 인터넷에서 열고 **홈 화면에 추가**하면 됩니다.
