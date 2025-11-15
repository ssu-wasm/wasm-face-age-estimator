# 🧠 후이즈유

- **WASM(WebAssembly)** 기반의 실시간 **얼굴 인식 + 나이 추정 웹앱**입니다.  
  브라우저의 카메라를 통해 얼굴을 감지하고, **ONNX Runtime Web**으로 AI 모델을 실행해  
  서버 없이 오프라인에서도 **빠르고 안전하게 나이 추정**을 수행합니다.

## 👥 팀원

- 윤이찬미, 김경훈, 정은지

## 🚀 주요 기능

- 🎥 **실시간 얼굴 감지 (MediaPipe / OpenCV.js)**
- 🧮 **나이 추정 (ONNX Runtime Web)**
  - WebGPU → WASM 폴백
  - Retail-0013 모델 기반 (±7세 오차)
- 🔒 **완전 클라이언트 사이드 처리**
  - 개인정보 서버 전송 없음
- 💡 **UI 표시**
  - 얼굴 박스, 예측 나이, 신뢰도 시각화
- 🎯 **확장 모드**
  - 나이 맞추기 게임 (예측값 vs 실제값)

## 🧩 기술 스택

| 영역      | 기술                                 | 설명                  |
| --------- | ------------------------------------ | --------------------- |
| Frontend  | TypeScript / React (Next.js or Vite) | SPA 프레임워크        |
| AI Engine | MediaPipe + ONNX Runtime Web         | 얼굴 감지 + 나이 추정 |
| Runtime   | WebAssembly (WASM)                   | 고속 연산 수행        |
| Video     | WebRTC (getUserMedia)                | 카메라 스트림         |
| Render    | HTML5 Canvas                         | 실시간 시각화         |
| Build     | Vite / Next.js App Router            | 번들 및 배포 환경     |

## ⚙️ 설치 및 실행

```bash
nvm use
pnpm install
pnpm run dev
```

EMSCRIPTEN

```bash
 git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
 cd ~/emsdk
 ./emsdk install latest
 ./emsdk activate latest
 source ./emsdk_env.sh
```

## 역할 분담

|          |   Frontend/Wasm    |        Wasm        | Wasm/Design  |
| :------: | :----------------: | :----------------: | :----------: |
|  People  |      윤이찬미      |       김경훈       |    정은지    |
|   Role   |    개발, 인프라    |     개발, 기획     | 개발, 디자인 |
| Language |  TypeScript, C++   |        C++         |     C++      |
|   Tool   | Visual Studio Code | Visual Studio Code |    Figma     |

## 개발 중 어려웠던 점과 해결 방법

-
