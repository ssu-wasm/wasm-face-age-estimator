# 🧠 소리손 - 실시간 수화 인식 시스템

숭실대학교 팀프로젝트 - **WASM(WebAssembly)** 기반의 실시간 수어 번역기입니다.

## 👥 팀원

- 윤이찬미, 김경훈, 정은지

## 🚀 주요 기능

- **실시간 수화 인식** : 웹캠을 통한 지연 없는 손동작 인식
- **하이브리드 AI 엔진** : 규칙 기반(Rule-based) 알고리즘과 경량 딥러닝(MLP) 모델의 결합
- **WASM 가속** : C++로 작성된 인식 엔진을 브라우저에서 네이티브에 준하는 속도로 실행
- **다중 제스처 지원** : 6가지 핵심 수화 제스처 인식 및 확장 가능한 구조
- **실시간 시각화** : MediaPipe 랜드마크와 인식 결과를 캔버스에 실시간 렌더링

## 🎯 지원하는 수화 제스처

| ID | 제스처                   | 설명  | 인식 방식 |   
| --- | ---------- | ----------------------- | --- |
| 1   | 안녕하세요 | 모든 손가락 펼치기      | Hybrid (MLP)   |
| 2   | 감사합니다 | 주먹 쥐기             | Hybrid (MLP)  |
| 3   | 사랑해    | 엄지, 검지, 소지 펼치  | Hybrid (MLP)   |
| 4   | 예       | 검지만 펼치기           | Rule-based    |
| 5   | V        | 검지와 중지 펼치기      | Rule-based   |
| 6   | OK       | 검지, 중지, 약지 펼치기 | Rule-based   |

## 🧩 기술 스택

### Frontend
- **Framework** : Next.js 15 (App Router), React 18
- **Language** : TypeScript
- **Styling** : Tailwind CSS

### AI & Core Engine
- **Computer Vision** : MediaPipe Hands (손 랜드마크 검출)
- **Core Logic** : C++17 (WASM, 고성능 제스처 인식)
- **Deep Learning** : PyTorch (Python) - 모델 학습 및 가중치 추출
- **Build Tool** : Emscripten (Embind), C++ → WASM 컴파일

### Backend (WASM)
- **C++17** - 핵심 제스처 인식 알고리즘
- **Embind** - JavaScript ↔ WASM 바인딩

## 📁 프로젝트 구조

```
.
├── app/                         # Next.js App Router
│   ├── components/              # React 컴포넌트
│   │   ├── ai-sign-detector-example.tsx    # 메인 수화 인식 UI
│   │   ├── ml-sign-recognizer.ts           # ML 인식기 (WASM + 규칙기반)
│   │   ├── wasm-sign-recognizer.ts         # WASM 모듈 래퍼 클래스
│   │   ├── mediapipe-hand-detector.ts      # MediaPipe Hands 래퍼
│   │   └── mediapipe-loader.ts             # 동적 MediaPipe 로더
│   ├── camera/page.tsx          # 카메라 페이지
│   └── layout.tsx               # 루트 레이아웃
├── cpp/                         # C++ WASM 소스
│   ├── src/
│   │   ├── main.cpp             # WASM 바인딩 및 래퍼 클래스
│   │   ├── sign_recognition.cpp # 제스처 인식 구현
│   │   ├── sign_recognition.h   # 제스처 인식 헤더
│   │   └── gesture_weights.h    # 학습된 MLP 가중치 (Header-only)
│   ├── Makefile                 # WASM 빌드 스크립트
├── notebooks/                   # AI 모델 학습용 Jupyter Notebook
├── traning/                     # 학습된 모델(.pt, .onnx) 및 가중치 데이터
├── public/wasm/                 # 빌드된 WASM 파일
│   ├── sign_wasm.js
│   └── sign_wasm.wasm
└── emsdk/                       # Emscripten SDK
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

## 🔧 주요 알고리즘 (하이브리드 엔진)

### 1. 손 랜드마크 검출 (MediaPipe)

- 21개 3D 손 랜드마크 추출
- 실시간 손 추적 및 정규화

### 2. 제스처 인식 (C++ WASM)
**2.1 규칙 기반 (Rule-based)**
- 직관적인 손 모양(가위바위보 등)은 기하학적 계산으로 빠르게 처리합니다.
- Finger State: 각 손가락의 굽힘/펴짐 상태 판별 (tip.y < pip.y)
- Vector Analysis: 손가락 간의 각도 및 거리 계산

**2.2 딥러닝 기반 (MLP - Multi Layer Perceptron)**
- 규칙으로 정의하기 복잡한 미세한 제스처는 학습된 신경망이 처리합니다.
- **구조** : Input(63) → Hidden1(30) → Hidden2(20) → Output(Class)
- **경량화** : PyTorch로 학습된 가중치를 gesture_weights.h 헤더 파일로 변환하여 C++에 직접 임베딩 (별도 모델 파일 로딩 불필요)
- **전처리** : 입력 랜드마크의 정규화(Normalization) 및 상대 좌표 변환

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

int SignRecognition::predictMLP(const std::vector<float>& featureArr) {
    // 1. 정규화 (Scaler)
    // 2. 순전파 (Forward Propagation)
    // 3. Argmax로 결과 도출
    return argmax;
}
```

### 3. 실시간 처리 파이프라인

```
카메라 스트림  →  MediaPipe Hands  →   21개 랜드마크  →   WASM 제스처 인식  →  결과 표시
    ↓                ↓                    ↓                 ↓                ↓
브라우저 API      JavaScript          Float32Array      C++ 알고리즘        JSON 응답
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
- **문제** : `this.recognizer.recognizeFromPointer is not a function`
- **해결** : SignRecognizerWrapper 클래스로 포인터 타입 바인딩 문제 해결
### 2. WASM 메모리 관리 및 힙(Heap) 접근
- **문제** : JS의 배열을 C++로 전달할 때 메모리 주소 불일치 및 오버헤드 발생
- **해결** : `Module.HEAPF32`를 사용하여 공유 메모리 버퍼에 직접 접근, 데이터 복사 비용 최소화
### 3. MediaPipe 타입 정의
- **문제** : TypeScript에서 MediaPipe 타입 인식 불가
- **해결** : 동적 import 및 커스텀 인터페이스 정의
### 4. 실시간 성능 최적화
- **문제** : 프레임 처리 지연
- **해결** : requestAnimationFrame 기반 비동기 처리
### 5. 하이브리드 구조 설계
- **문제** : 규칙 기반과 딥러닝 모델의 결과가 충돌할 경우 처리 곤란
- **해결** : 우선순위 큐(Priority Queue) 방식 도입. 명확한 규칙이 매칭되면 우선 처리하고, 모호한 경우 MLP의 신뢰도(Confidence) 점수를 기반으로 판단
### 6. Next.js와 WASM의 호환성
- **문제** : SSR(Server Side Rendering) 환경에서 브라우저 전용 API인 WASM 로딩 실패
- **해결** : useEffect와 동적 임포트(dynamic import)를 활용하여 클라이언트 사이드에서만 WASM이 초기화되도록 생명주기 관리

## 📊 성능 지표
- **랜드마크 검출** : ~30 FPS (MediaPipe)
- **제스처 인식** : ~60 FPS (WASM)
- **전체 파이프라인** : ~25-30 FPS
- **메모리 사용량** : ~50MB (브라우저 + WASM)

|  측정 항목  |   C++    |        JS        |
| :------: | :----------------: | :----------------: |
|   |      <1ms      |       <3ms       |
|   |      <1ms      |       <4ms       |
|   |      <5ms      |       <50ms      |
|   |      <21ms     |       <400ms     |

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

- [ ] **더 많은 제스처** : 한국 수화 표준 제스처 추가
- [ ] **모델 고도화** : LSTM을 도입하여 동적인 수화(움직임이 있는 동작) 인식
- [ ] **데이터셋 확장** : 한국 수어(KSL) 데이터셋 직접 구축 및 학습
- [ ] **OpenCV.js 통합** : 더 정확한 손 검출
- [ ] **실시간 번역** : 연속된 제스처를 문장으로 번역
- [ ] **모바일 최적화** : 스마트폰에서의 성능 향상

## 📈 역할 분담

|          |   Frontend/WASM    |        WASM        |        WASM/Design        |
| :------: | :----------------: | :----------------: | :-----------------------: |
|  People  |      윤이찬미      |       김경훈       |          정은지           |
|   Role   |    개발, 인프라    |     개발, 기획     |       개발, 디자인        |
| Language |  TypeScript, C++   |        Python, C++         |            C++            |
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
