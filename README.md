# 🧠 후이즈유

- 숭실대 프로젝트 **WASM(WebAssembly)** 기반의 수어 번역기 입니다.

## 👥 팀원

- 윤이찬미, 김경훈, 정은지

## 🚀 주요 기능

- 영상을 인식해, 수어를 번역해준다.
- 간단한 수어만 인식이 가능 하다.

## 🧩 기술 스택

- c++
- WASM

## ⚙️ 설치 및 실행

```bash
nvm use
pnpm install
pnpm run dev
```

EMSCRIPTEN

```bash
# 프로젝트 내부에 emsdk 설치
git clone https://github.com/emscripten-core/emsdk.git ./emsdk
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
emcc -v
```

## 역할 분담

|          |   Frontend/Wasm    |        Wasm        |        Wasm/Design        |
| :------: | :----------------: | :----------------: | :-----------------------: |
|  People  |      윤이찬미      |       김경훈       |          정은지           |
|   Role   |    개발, 인프라    |     개발, 기획     |       개발, 디자인        |
| Language |  TypeScript, C++   |        C++         |            C++            |
|   Tool   | Visual Studio Code | Visual Studio Code | Visual Studio Code, Figma |

## 개발 중 어려웠던 점과 해결 방법

-
