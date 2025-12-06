# 🧠 후이즈유 - AI 수화 인식 시스템

숭실대 프로젝트 **WASM(WebAssembly)** 기반의 실시간 수어 번역기입니다.

## 👥 팀원

- 윤이찬미, 김경훈, 정은지

## 🚀 주요 기능

- **실시간 수화 인식**: 웹캠을 통한 실시간 손동작 인식
- **AI 기반 처리**: MediaPipe Hands + WASM을 활용한 고성능 제스처 분석
- **다중 제스처 지원**: 5가지 기본 수화 제스처 인식
- **실시간 시각화**: 손 랜드마크 및 연결선 실시간 표시

## 🎯 지원하는 수화 제스처

| 제스처     | 설명                    | ID  |
| ---------- | ----------------------- | --- |
| 안녕하세요 | 모든 손가락 펼치기      | 1   |
| 감사합니다 | 주먹 쥐기               | 2   |
| 예         | 검지만 펼치기           | 3   |
| V          | 검지와 중지 펼치기      | 4   |
| OK         | 검지, 중지, 약지 펼치기 | 5   |

## 🧩 기술 스택

### Frontend

- **React 18** + **TypeScript**
- **Next.js 15** (App Router)
- **Tailwind CSS**

### AI/Computer Vision

- **MediaPipe Hands** - 손 랜드마크 검출
- **WebAssembly (WASM)** - 고성능 제스처 인식
- **Emscripten** - C++을 WASM으로 컴파일

### Backend (WASM)

- **C++17** - 핵심 제스처 인식 알고리즘
- **Embind** - JavaScript ↔ WASM 바인딩

## 📁 프로젝트 구조

```
.
├── app/                          # Next.js App Router
│   ├── components/               # React 컴포넌트
│   │   ├── ai-sign-detector-example.tsx    # 메인 수화 인식 UI
│   │   ├── ml-sign-recognizer.ts           # ML 인식기 (WASM + 규칙기반)
│   │   ├── wasm-sign-recognizer.ts         # WASM 래퍼 클래스
│   │   ├── mediapipe-hand-detector.ts      # MediaPipe Hands 래퍼
│   │   └── mediapipe-loader.ts             # 동적 MediaPipe 로더
│   ├── camera/page.tsx           # 카메라 페이지
│   └── layout.tsx               # 루트 레이아웃
├── cpp/                         # C++ WASM 소스
│   ├── src/
│   │   ├── main.cpp            # WASM 바인딩 및 래퍼 클래스
│   │   ├── sign_recognition.h  # 제스처 인식 헤더
│   │   └── sign_recognition.cpp # 제스처 인식 구현
│   ├── Makefile               # WASM 빌드 설정
│   └── build/                 # 빌드 출력
├── public/wasm/               # 빌드된 WASM 파일
│   ├── sign_wasm.js
│   └── sign_wasm.wasm
└── emsdk/                     # Emscripten SDK
```

## ⚙️ 설치 및 실행

### 1. 개발 환경 설정

```bash
# Node.js 버전 설정
nvm use

# 의존성 설치
pnpm install
```

### 2. Emscripten 설치

```bash
# 프로젝트 내부에 emsdk 설치
git clone https://github.com/emscripten-core/emsdk.git ./emsdk
cd emsdk

# 최신 버전 설치 및 활성화
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# 설치 확인
emcc -v
```

### 3. WASM 빌드

```bash
cd cpp

# WASM 모듈 빌드
make clean
make

# 빌드 파일을 public 폴더로 복사 (자동으로 수행됨)
```

### 4. 개발 서버 실행

```bash
pnpm run dev
```

## 🔧 주요 알고리즘

### 1. 손 랜드마크 검출 (MediaPipe)

- 21개 3D 손 랜드마크 추출
- 실시간 손 추적 및 정규화

### 2. 제스처 인식 (C++ WASM)

- **규칙 기반 분류**: 손가락 펼침/굽힘 상태 분석
- **기하학적 계산**: 랜드마크 간 거리 및 각도 계산
- **신뢰도 기반 필터링**: 임계값 기반 결과 검증

```cpp
// 핵심 인식 로직
bool isFingerExtended(tip, pip, mcp) {
    return tip.y < pip.y && pip.y < mcp.y;
}

RecognitionResult recognizeByRules(landmarks) {
    // 각 손가락 상태 분석
    // 패턴 매칭을 통한 제스처 분류
    // 신뢰도 계산 및 반환
}
```

### 3. 실시간 처리 파이프라인

```
카메라 스트림 → MediaPipe Hands → 21개 랜드마크 → WASM 제스처 인식 → 결과 표시
    ↓              ↓                    ↓                ↓               ↓
브라우저 API    JavaScript        Float32Array      C++ 알고리즘    JSON 응답
```

## 🎨 UI 기능

### 실시간 시각화

- **손 랜드마크**: 21개 포인트 실시간 표시
- **연결선**: MediaPipe Hand 구조를 따른 정확한 손 모양 시각화
- **제스처 결과**: 인식된 제스처명, 신뢰도, ID 표시

### 제어 기능

- **카메라 활성화**: 웹캠 접근 및 스트림 시작
- **AI 인식 시작/중단**: 실시간 제스처 인식 제어
- **성능 모니터링**: FPS 및 프레임 처리 시간 표시

## 🛠️ 개발 중 해결한 기술적 도전

### 1. WASM 바인딩 문제

- **문제**: `this.recognizer.recognizeFromPointer is not a function`
- **해결**: SignRecognizerWrapper 클래스로 포인터 타입 바인딩 문제 해결

### 2. 메모리 관리

- **문제**: WASM HEAP 메모리 접근 오류
- **해결**: HEAPF32 동적 생성 및 안전한 메모리 할당/해제

### 3. MediaPipe 타입 정의

- **문제**: TypeScript에서 MediaPipe 타입 인식 불가
- **해결**: 동적 import 및 커스텀 인터페이스 정의

### 4. 실시간 성능 최적화

- **문제**: 프레임 처리 지연
- **해결**: requestAnimationFrame 기반 비동기 처리

## 📊 성능 지표

- **랜드마크 검출**: ~30 FPS (MediaPipe)
- **제스처 인식**: ~60 FPS (WASM)
- **전체 파이프라인**: ~25-30 FPS
- **메모리 사용량**: ~50MB (브라우저 + WASM)

## 🔄 개발 워크플로우

### WASM 개발

```bash
# C++ 코드 수정 후
cd cpp
make clean && make
# 자동으로 public/wasm/에 복사됨
```

### 프론트엔드 개발

```bash
# React 컴포넌트 수정 후
pnpm run dev
# 핫 리로드로 즉시 반영
```

## 🚧 향후 개선 계획

- [ ] **더 많은 제스처**: 한국 수화 표준 제스처 추가
- [ ] **OpenCV.js 통합**: 더 정확한 손 검출
- [ ] **딥러닝 모델**: TensorFlow.js 기반 학습 모델
- [ ] **실시간 번역**: 연속된 제스처를 문장으로 번역
- [ ] **모바일 최적화**: 스마트폰에서의 성능 향상

## 📈 역할 분담

|          |   Frontend/WASM    |        WASM        |        WASM/Design        |
| :------: | :----------------: | :----------------: | :-----------------------: |
|  People  |      윤이찬미      |       김경훈       |          정은지           |
|   Role   |    개발, 인프라    |     개발, 기획     |       개발, 디자인        |
| Language |  TypeScript, C++   |        C++         |            C++            |
|   Tool   | Visual Studio Code | Visual Studio Code | Visual Studio Code, Figma |

## 📚 참고 자료

- [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)
- [Emscripten Documentation](https://emscripten.org/docs/)
- [WebAssembly Specification](https://webassembly.github.io/spec/)
- [Next.js App Router](https://nextjs.org/docs/app)

---

<div align="center">

**🌟 실시간 수화 인식으로 소통의 장벽을 허물어보세요! 🌟**

</div>
