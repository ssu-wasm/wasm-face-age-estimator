/**
 * WASM 기반 수화 인식기 (Hybrid: Rule-based + MLP)
 * - 메모리 안전성 확보 (Direct Memory Access)
 * - MLP 데이터 전처리 로직 포함 (convertLandmarksToVector, normalizeLandmarks)
 */

import { HandLandmark } from "./mediapipe-hand-detector";

export interface RecognitionResult {
  gesture: string;
  confidence: number;
  id: number;
}

interface WasmModule {
  // C++ 클래스 생성자들
  SignRecognizer: new () => SignRecognizerInstance;
  SignRecognition?: new () => SignRecognitionInstance;
  VectorFloat?: new () => VectorFloatInstance;

  // Emscripten 필수 함수/속성
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;

  // 메모리 버퍼 접근용
  HEAPU8: Uint8Array;
  HEAPF32?: Float32Array;
  buffer?: ArrayBuffer;
  asm?: {
    memory: {
      buffer: ArrayBuffer;
    };
  } | null;

  [key: string]: unknown | undefined;
}

// 규칙 기반 인식기 (Rule-based)
interface SignRecognizerInstance {
  initialize: () => boolean;
  recognizeFromPointer: (landmarksPtr: number, count: number) => string;
  setDetectionThreshold: (threshold: number) => void;
  setRecognitionThreshold: (threshold: number) => void;
  getVersion: () => string;
}

// 딥러닝 인식기 (MLP)
interface SignRecognitionInstance {
  setScaler: (mean: VectorFloatInstance, scale: VectorFloatInstance) => void;
  predictMLP: (features: VectorFloatInstance) => number;
}

// C++ Vector 바인딩
interface VectorFloatInstance {
  push_back: (value: number) => void;
  size: () => number;
  get: (index: number) => number;
  delete: () => void;
}

declare global {
  function CreateSignWasmModule(options?: {
    locateFile?: (path: string) => string;
  }): Promise<WasmModule>;
}

export class WASMSignRecognizer {
  private wasmModule: WasmModule | null = null;
  private recognizer: SignRecognizerInstance | null = null; // Rule-based
  private mlpRecognizer: SignRecognitionInstance | null = null; // MLP
  private isInitialized: boolean = false;

  // 메모리 재사용을 위한 캐시 (GC 방지)
  private memoryPool: number[] = [];
  private landmarkDataCache = new Float32Array(42); // 한 손(21개 * 2좌표) 캐시

  async initialize(): Promise<boolean> {
    try {
      if (typeof window === "undefined") return false;

      // 1. WASM 스크립트 로드
      if (typeof CreateSignWasmModule === "undefined") {
        const script = document.createElement("script");
        script.src = "/wasm/sign_wasm.js";
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("WASM script load failed"));
          document.head.appendChild(script);
        });

        // 전역 함수 로드 대기
        let count = 0;
        while (typeof CreateSignWasmModule === "undefined" && count < 50) {
          await new Promise((r) => setTimeout(r, 50));
          count++;
        }
      }

      // 2. 모듈 생성
      console.log("🔄 WASM 모듈 생성 중...");
      this.wasmModule = await CreateSignWasmModule({
        locateFile: (path) => (path.endsWith(".wasm") ? `/wasm/${path}` : path),
      });

      if (!this.wasmModule) throw new Error("Module is null");

      // 3. 인스턴스 생성
      // (A) 규칙 기반
      if (this.wasmModule.SignRecognizer) {
        this.recognizer = new this.wasmModule.SignRecognizer();
        this.recognizer.initialize();
        this.recognizer.setDetectionThreshold(0.5);
        this.recognizer.setRecognitionThreshold(0.7);
        console.log("✅ Rule-based Recognizer initialized");
      } else {
        console.error("❌ SignRecognizer class not found");
      }

      // (B) 딥러닝 기반
      if (this.wasmModule.SignRecognition) {
        this.mlpRecognizer = new this.wasmModule.SignRecognition();
        console.log("✅ MLP Recognizer initialized");
      } else {
        console.warn("⚠️ SignRecognition class not found (MLP disabled)");
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("❌ WASM Init Failed:", error);
      return false;
    }
  }

  // ============================================================
  // 1. 규칙 기반 인식 (Rule-based) - [메모리 에러 해결 버전]
  // ============================================================
  /**
   * WASM 기반 고속 인식 함수
   *
   * 🚀 WASM이 JavaScript보다 빠른 이유:
   *
   * 1. **네이티브 코드 컴파일**
   *    - C++ 코드가 WebAssembly로 컴파일되어 네이티브에 가까운 성능 제공
   *    - JavaScript 엔진의 JIT 컴파일 오버헤드 없음
   *
   * 2. **직접 메모리 접근 (Direct Memory Access)**
   *    - HEAPU8/HEAPF32를 통한 직접 메모리 접근으로 오버헤드 최소화
   *    - JavaScript의 객체 래핑/언래핑 비용 없음
   *    - 메모리 풀링으로 할당/해제 비용 감소
   *
   * 3. **타입 안정성과 최적화**
   *    - 컴파일 타임에 타입이 결정되어 런타임 체크 불필요
   *    - 컴파일러가 최적화된 기계어 코드 생성
   *
   * 4. **메모리 효율성**
   *    - 고정 크기 메모리 레이아웃으로 캐시 효율성 향상
   *    - GC(가비지 컬렉션) 압박 없음
   *    - 예측 가능한 메모리 사용 패턴
   *
   * 5. **SIMD 최적화 가능**
   *    - 벡터 연산을 SIMD 명령어로 최적화 가능
   *    - 병렬 처리로 대량 데이터 처리 속도 향상
   *
   * 성능 비교 (예상):
   * - JavaScript: ~2-5ms (복잡한 특징 추출 + 신경망 추론)
   * - WASM: ~0.5-1.5ms (동일한 연산, 약 2-3배 빠름)
   */
  async recognizeFast(
    landmarks: {
      x: number;
      y: number;
      z: number;
    }[]
  ): Promise<RecognitionResult> {
    if (!this.isInitialized || !this.recognizer || !this.wasmModule) {
      return { gesture: "초기화 안됨", confidence: 0, id: 0 };
    }

    let ptr = 0;

    try {
      // 1. 데이터 준비 (x, y 좌표만 추출하여 캐시에 담기)
      for (let i = 0; i < 21; i++) {
        if (landmarks[i]) {
          this.landmarkDataCache[i * 2] = landmarks[i].x;
          this.landmarkDataCache[i * 2 + 1] = landmarks[i].y;
        } else {
          this.landmarkDataCache[i * 2] = 0;
          this.landmarkDataCache[i * 2 + 1] = 0;
        }
      }

      // 2. 메모리 할당 (풀 사용 or 신규 할당)
      // *주의: _malloc 호출 시 내부적으로 메모리 확장(Resize)이 일어날 수 있음
      if (this.memoryPool.length > 0) {
        ptr = this.memoryPool.pop()!;
      } else {
        ptr = this.wasmModule._malloc(42 * 4); // 42 floats * 4 bytes
      }

      if (ptr === 0) throw new Error("Memory allocation failed");

      // 3. [핵심] 최신 버퍼 직접 가져오기 (Direct Memory Access)
      // HEAPF32 전역 변수는 메모리 확장 시 끊어지므로(Detached), 항상 최신 buffer를 조회해야 함
      let buffer: ArrayBuffer | undefined;

      // Emscripten은 HEAPU8을 자동으로 갱신하므로 가장 신뢰할 수 있음
      if (this.wasmModule.HEAPU8 && this.wasmModule.HEAPU8.buffer) {
        buffer = this.wasmModule.HEAPU8.buffer as ArrayBuffer;
      } else if (this.wasmModule.buffer) {
        buffer = this.wasmModule.buffer;
      } else if (this.wasmModule.asm && this.wasmModule.asm.memory) {
        buffer = this.wasmModule.asm.memory.buffer;
      }

      if (!buffer) throw new Error("WASM Memory buffer not found");

      // 4. 해당 포인터 위치에 뷰(View)를 생성하여 데이터 복사
      // new Float32Array(buffer, byteOffset, length)
      const wasmView = new Float32Array(buffer, ptr, 42);
      wasmView.set(this.landmarkDataCache);

      // 5. C++ 인식 함수 호출
      const resultJson = this.recognizer.recognizeFromPointer(ptr, 42);

      // 6. 메모리 반환 (풀링)
      if (this.memoryPool.length < 50) {
        this.memoryPool.push(ptr);
      } else {
        this.wasmModule._free(ptr);
      }

      return JSON.parse(resultJson);
    } catch (e) {
      console.error("Rule-based Error:", e);
      // 에러 발생 시 해당 메모리는 해제 (풀에 넣지 않음)
      if (ptr !== 0 && this.wasmModule) {
        try {
          this.wasmModule._free(ptr);
        } catch (freeErr) {}
      }
      return { gesture: "메모리 에러", confidence: 0, id: 0 };
    }
  }

  // ============================================================
  // 2. 딥러닝 인식 (MLP) - [기존 로직 100% 이식]
  // ============================================================
  public setScaler(mean: number[], scale: number[]): void {
    if (!this.mlpRecognizer || !this.wasmModule?.VectorFloat) return;

    const vecMean = new this.wasmModule.VectorFloat();
    const vecScale = new this.wasmModule.VectorFloat();

    mean.forEach((v) => vecMean.push_back(v));
    scale.forEach((v) => vecScale.push_back(v));

    this.mlpRecognizer.setScaler(vecMean, vecScale);

    vecMean.delete();
    vecScale.delete();
  }

  public predictWithMLP(results: {
    multiHandLandmarks: HandLandmark[][];
    multiHandedness: { label: string }[];
  }): number {
    if (!this.mlpRecognizer || !this.wasmModule?.VectorFloat) return -1;

    // 1. MediaPipe 결과를 126차원 벡터로 변환 (정규화 + 정렬 포함)
    // [중요] 여기에 this.convertLandmarksToVector 호출이 있습니다.
    const features = this.convertLandmarksToVector(results);

    // 2. C++ Vector 생성 및 데이터 주입
    const inputVec = new this.wasmModule.VectorFloat();
    for (const v of features) {
      inputVec.push_back(v);
    }

    let result = -1;
    try {
      // 3. 추론 실행
      result = this.mlpRecognizer.predictMLP(inputVec);
    } catch (e) {
      console.error("MLP Error:", e);
    }

    inputVec.delete();
    return result;
  }

  // [핵심] 기존 sign-language-estimator.js의 로직 완벽 이식
  // 왼손(0~62), 오른손(63~125) 순서로 채워넣음
  private convertLandmarksToVector(results: {
    multiHandLandmarks: HandLandmark[][];
    multiHandedness: { label: string }[];
  }): number[] {
    const vec: number[] = []; // 결과 벡터 (빈 배열로 시작)

    // 데이터가 없으면 0으로 126개 채워서 반환
    if (!results || !results.multiHandLandmarks || !results.multiHandedness) {
      return new Array(126).fill(0.0);
    }

    let leftPts: HandLandmark[] | null = null;
    let rightPts: HandLandmark[] | null = null;

    // 1. 손 분류 (MediaPipe 라벨 기준)
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const pts = results.multiHandLandmarks[i];
      const label = results.multiHandedness[i]?.label;
      if (label === "Left") leftPts = pts;
      if (label === "Right") rightPts = pts;
    }
    // 2. 왼손 처리 (0~62 인덱스)
    if (leftPts) {
      const norm = this.normalizeLandmarks(leftPts);
      for (const p of norm) {
        vec.push(p.x, p.y, p.z);
      }
    } else {
      // 왼손 없으면 0.0으로 63개 채움
      for (let i = 0; i < 63; i++) vec.push(0.0);
    }

    // 3. 오른손 처리 (63~125 인덱스)
    if (rightPts) {
      const norm = this.normalizeLandmarks(rightPts);
      for (const p of norm) {
        vec.push(p.x, p.y, p.z);
      }
    } else {
      // 오른손 없으면 0.0으로 63개 채움
      for (let i = 0; i < 63; i++) vec.push(0.0);
    }

    return vec;
  }

  // [핵심] 정규화 함수 (기존 로직 이식)
  // 손목을 (0,0,0)으로 이동하고 크기 스케일링
  private normalizeLandmarks(
    pts: HandLandmark[]
  ): { x: number; y: number; z: number }[] {
    if (!pts || pts.length === 0) return [];

    // 1. 중심 이동 (손목 기준)
    const base = pts[0];
    const centered = pts.map((p) => ({
      x: p.x - base.x,
      y: p.y - base.y,
      z: (p.z || 0) - (base.z || 0),
    }));

    // 2. 크기 스케일링 (손목 ~ 중지 기저부 거리 기준)
    const ref = centered[9];
    const scale =
      Math.sqrt(ref.x * ref.x + ref.y * ref.y + ref.z * ref.z) || 1.0;

    return centered.map((p) => ({
      x: p.x / scale,
      y: p.y / scale,
      z: p.z / scale,
    }));
  }

  dispose() {
    if (this.wasmModule) {
      this.memoryPool.forEach((ptr) => {
        try {
          this.wasmModule?._free(ptr);
        } catch (e) {}
      });
    }
    this.memoryPool = [];
    this.recognizer = null;
    this.mlpRecognizer = null;
    this.wasmModule = null;
    this.isInitialized = false;
  }
}
