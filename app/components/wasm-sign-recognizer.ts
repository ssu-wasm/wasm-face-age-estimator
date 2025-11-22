/**
 * WASM 기반 수화 인식기
 * C++로 작성된 제스처 인식 로직을 WASM으로 실행
 */

import { HandLandmark } from "./mediapipe-hand-detector";

export interface RecognitionResult {
  gesture: string;
  confidence: number;
  id: number;
}

interface WasmModule {
  SignRecognizer: new () => SignRecognizerInstance;
  HandLandmark?: new () => HandLandmarkInstance; // optional - recognizeFromPointer 사용 시 불필요
  RecognitionResult?: new () => RecognitionResultInstance; // optional
  VectorHandLandmark?: new () => VectorHandLandmarkInstance; // optional - register_vector로 등록되지만 생성자로 사용 불가
  test_function?: () => string;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPF32?: Float32Array; // optional - recognizeFromPointer 사용 시 필요
}

interface SignRecognizerInstance {
  initialize: () => boolean;
  recognize: (
    landmarks: VectorHandLandmarkInstance
  ) => RecognitionResultInstance;
  recognizeFromPointer: (landmarksPtr: number, count: number) => string;
  setDetectionThreshold: (threshold: number) => void;
  setRecognitionThreshold: (threshold: number) => void;
  getVersion: () => string;
}

interface HandLandmarkInstance {
  x: number;
  y: number;
  z: number;
}

interface RecognitionResultInstance {
  gesture: string;
  confidence: number;
  id: number;
}

interface VectorHandLandmarkInstance {
  push_back: (landmark: HandLandmarkInstance) => void;
  size: () => number;
  get: (index: number) => HandLandmarkInstance;
  delete: () => void;
}

declare global {
  function CreateSignWasmModule(options?: {
    locateFile?: (path: string) => string;
  }): Promise<WasmModule>;
}

export class WASMSignRecognizer {
  private wasmModule: WasmModule | null = null;
  private recognizer: SignRecognizerInstance | null = null;
  private isInitialized: boolean = false;

  /**
   * WASM 모듈 로드 및 초기화
   */
  async initialize(): Promise<boolean> {
    try {
      if (typeof window === "undefined") {
        console.warn("브라우저 환경이 아닙니다");
        return false;
      }

      // WASM 모듈 로드
      // 스크립트가 이미 로드되어 있는지 확인
      if (typeof CreateSignWasmModule === "undefined") {
        // 스크립트 태그를 사용하여 WASM 모듈 로드
        const script = document.createElement("script");
        script.src = "/wasm/sign_wasm.js";

        console.log("📥 WASM 스크립트 로드 시작:", script.src);
        await new Promise<void>((resolve, reject) => {
          script.onload = () => {
            console.log("✅ WASM 스크립트 로드 완료");
            // 전역 함수가 로드될 때까지 대기
            let checkCount = 0;
            const checkInterval = setInterval(() => {
              checkCount++;
              if (typeof CreateSignWasmModule !== "undefined") {
                console.log(
                  `✅ CreateSignWasmModule 함수 발견 (${checkCount}회 시도)`
                );
                clearInterval(checkInterval);
                resolve();
              }
              if (checkCount > 1000) {
                clearInterval(checkInterval);
                reject(
                  new Error("CreateSignWasmModule 함수를 찾을 수 없습니다")
                );
              }
            }, 10);

            // 타임아웃
            setTimeout(() => {
              clearInterval(checkInterval);
              reject(
                new Error(`WASM 모듈 로드 타임아웃 (${checkCount}회 시도 후)`)
              );
            }, 10000);
          };
          script.onerror = (error) => {
            console.error("❌ WASM 스크립트 로드 실패:", script.src, error);
            reject(new Error(`WASM 스크립트 로드 실패: ${script.src}`));
          };
          document.head.appendChild(script);
        });
      }

      // WASM 모듈 생성
      console.log("🔄 WASM 모듈 생성 시작...");
      let moduleResult;
      try {
        moduleResult = await CreateSignWasmModule({
          locateFile: (path: string) => {
            const wasmPath = path.endsWith(".wasm") ? `/wasm/${path}` : path;
            console.log(`📍 WASM 파일 경로: ${wasmPath}`);
            return wasmPath;
          },
        });
      } catch (error) {
        console.error("❌ CreateSignWasmModule 호출 실패:", error);
        throw error;
      }

      // 모듈이 Promise를 반환할 수 있으므로 확인
      if (moduleResult instanceof Promise) {
        console.log("🔄 WASM 모듈 Promise 대기 중...");
        this.wasmModule = await moduleResult;
      } else {
        this.wasmModule = moduleResult;
      }

      if (!this.wasmModule) {
        console.error("❌ WASM 모듈 생성 실패: 모듈이 null입니다");
        return false;
      }

      console.log("✅ WASM 모듈 로드 성공");

      // 모듈이 완전히 초기화될 때까지 대기 (필요한 클래스들이 로드될 때까지)
      console.log("🔄 WASM 모듈 초기화 대기 중...");
      let retries = 0;
      const maxRetries = 50; // 최대 5초 대기
      while (
        retries < maxRetries &&
        (!this.wasmModule.SignRecognizer ||
          typeof this.wasmModule.SignRecognizer !== "function")
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
        if (retries % 10 === 0) {
          console.log(`⏳ 초기화 대기 중... (${retries}/${maxRetries})`);
        }
      }

      // 필요한 클래스들이 로드되었는지 확인
      if (
        !this.wasmModule.SignRecognizer ||
        typeof this.wasmModule.SignRecognizer !== "function"
      ) {
        console.error("❌ SignRecognizer 클래스를 찾을 수 없습니다");
        console.error(
          "사용 가능한 키:",
          Object.keys(this.wasmModule).slice(0, 30)
        );
        console.error("모듈 타입:", typeof this.wasmModule);
        return false;
      }

      // VectorHandLandmark와 HandLandmark는 register_vector로 등록되지만
      // 생성자로 직접 사용할 수 없습니다. recognizeFromPointer를 사용하므로
      // 이들은 필요하지 않습니다.

      // recognizeFromPointer를 사용하기 위해 필요한 함수들 확인
      if (
        !this.wasmModule._malloc ||
        typeof this.wasmModule._malloc !== "function"
      ) {
        console.error("❌ _malloc 함수를 찾을 수 없습니다");
        console.error(
          "사용 가능한 키:",
          Object.keys(this.wasmModule).slice(0, 30)
        );
        return false;
      }

      if (
        !this.wasmModule._free ||
        typeof this.wasmModule._free !== "function"
      ) {
        console.error("❌ _free 함수를 찾을 수 없습니다");
        console.error(
          "사용 가능한 키:",
          Object.keys(this.wasmModule).slice(0, 30)
        );
        return false;
      }

      // SignRecognizer 인스턴스 생성
      try {
        this.recognizer = new this.wasmModule.SignRecognizer();
      } catch (error) {
        console.error("❌ SignRecognizer 인스턴스 생성 실패:", error);
        return false;
      }

      if (!this.recognizer) {
        console.error("❌ SignRecognizer 인스턴스가 null입니다");
        return false;
      }

      try {
        const initResult = this.recognizer.initialize();
        if (!initResult) {
          console.error(
            "❌ SignRecognizer.initialize()가 false를 반환했습니다"
          );
          return false;
        }
      } catch (error) {
        console.error("❌ SignRecognizer 초기화 중 오류:", error);
        return false;
      }

      // 임계값 설정
      this.recognizer.setDetectionThreshold(0.5);
      this.recognizer.setRecognitionThreshold(0.7);

      this.isInitialized = true;
      console.log("WASM 인식기 초기화 완료:", this.recognizer.getVersion());
      return true;
    } catch (error) {
      console.error("WASM 초기화 실패:", error);
      return false;
    }
  }

  /**
   * 랜드마크로부터 제스처 인식
   * VectorHandLandmark가 사용 불가능하므로 recognizeFast를 사용
   */
  async recognize(landmarks: HandLandmark[]): Promise<RecognitionResult> {
    // recognizeFast를 사용 (더 빠르고 안정적)
    return this.recognizeFast(landmarks);
  }

  /**
   * 랜드마크로부터 제스처 인식 (포인터 사용 - 더 빠름)
   */
  async recognizeFast(landmarks: HandLandmark[]): Promise<RecognitionResult> {
    if (!this.isInitialized || !this.recognizer || !this.wasmModule) {
      return {
        gesture: "감지되지 않음",
        confidence: 0.0,
        id: 0,
      };
    }

    // HEAPF32가 없으면 일반 recognize 메서드 사용
    if (!this.wasmModule.HEAPF32) {
      console.warn(
        "HEAPF32가 사용 불가능합니다. 일반 recognize 메서드를 사용합니다."
      );
      return this.recognize(landmarks);
    }

    try {
      // 랜드마크를 Float32Array로 변환 (21개 * 2 = 42개 float)
      const landmarkData = new Float32Array(42);
      for (let i = 0; i < 21; i++) {
        if (landmarks[i]) {
          landmarkData[i * 2] = landmarks[i].x;
          landmarkData[i * 2 + 1] = landmarks[i].y;
        }
      }

      // WASM 메모리에 할당
      const landmarksPtr = this.wasmModule._malloc(landmarkData.length * 4); // float = 4 bytes

      if (landmarksPtr === 0) {
        throw new Error("메모리 할당 실패");
      }

      // 메모리에 데이터 복사
      this.wasmModule.HEAPF32.set(landmarkData, landmarksPtr / 4);

      // 인식 수행
      const resultJson = this.recognizer.recognizeFromPointer(landmarksPtr, 42);

      // 메모리 해제
      this.wasmModule._free(landmarksPtr);

      // JSON 파싱
      const result = JSON.parse(resultJson) as RecognitionResult;
      return result;
    } catch (error) {
      console.error("WASM 인식 오류:", error);
      // 오류 발생 시 일반 recognize 메서드로 fallback
      return this.recognize(landmarks);
    }
  }

  /**
   * 임계값 설정
   */
  setDetectionThreshold(threshold: number): void {
    if (this.recognizer) {
      this.recognizer.setDetectionThreshold(threshold);
    }
  }

  setRecognitionThreshold(threshold: number): void {
    if (this.recognizer) {
      this.recognizer.setRecognitionThreshold(threshold);
    }
  }

  /**
   * 버전 정보
   */
  getVersion(): string {
    if (this.recognizer) {
      return this.recognizer.getVersion();
    }
    return "N/A";
  }

  /**
   * 리소스 정리
   */
  dispose(): void {
    // WASM 모듈은 자동으로 정리됨
    this.recognizer = null;
    this.wasmModule = null;
    this.isInitialized = false;
  }
}
