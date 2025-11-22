"use client";

import { useEffect, useRef, useState } from "react";

interface SignRecognitionResult {
  gesture: string;
  confidence: number;
  id: number;
}

interface SignRecognizerClass {
  new (): SignRecognizerInstance;
}

interface SignRecognizerInstance {
  initialize: () => boolean;
  processFrame: (
    dataPtr: number,
    width: number,
    height: number,
    channels: number
  ) => string;
  setDetectionThreshold: (threshold: number) => void;
  setRecognitionThreshold: (threshold: number) => void;
  getVersion: () => string;
}

interface WasmModule {
  SignRecognizer: SignRecognizerClass;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  applyGrayscale: (bufferPtr: number, width: number, height: number) => void;
  enhanceHandContours: (
    bufferPtr: number,
    width: number,
    height: number
  ) => void;
  enhanceSkinTone: (bufferPtr: number, width: number, height: number) => void;
  simple_gesture_detect: (
    dataPtr: number,
    width: number,
    height: number
  ) => string;
  test_function?: () => string;
}

// OpenCV 타입 정의 (OpenCV.js 실제 API 기반)
interface OpenCVMat {
  data: Uint8Array;
  cols: number;
  rows: number;
  delete: () => void;
}

interface OpenCVPoint {
  x: number;
  y: number;
}

interface OpenCVRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// OpenCV.js는 동적 타입이 많아 unknown 사용 필요
interface OpenCV {
  Mat: new (rows: number, cols: number, type: number) => OpenCVMat;
  MatVector: new () => unknown;
  imread: (canvasId: string | HTMLCanvasElement) => OpenCVMat;
  cvtColor: (src: OpenCVMat, dst: OpenCVMat, code: number) => void;
  inRange: (
    src: OpenCVMat,
    lower: OpenCVMat | unknown,
    upper: OpenCVMat | unknown,
    dst: OpenCVMat
  ) => void;
  findContours: (
    image: OpenCVMat,
    contours: unknown,
    hierarchy: OpenCVMat,
    mode: number,
    method: number
  ) => void;
  boundingRect: (contour: unknown) => OpenCVRect;
  rectangle: (
    img: OpenCVMat,
    pt1: OpenCVPoint,
    pt2: OpenCVPoint,
    color: unknown,
    thickness?: number
  ) => void;
  Scalar: new (b: number, g: number, r: number, a?: number) => unknown;
  COLOR_RGBA2RGB: number;
  COLOR_RGB2HSV: number;
  COLOR_RGBA2HSV: number;
  COLOR_RGB2YCrCb: number;
  COLOR_RGBA2YCrCb?: number;
  COLOR_GRAY2RGB?: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_8UC1: number;
  CV_8UC3: number;
  CV_8UC4: number;
  imshow: (canvasId: string | HTMLCanvasElement, mat: OpenCVMat) => void;
  getBuildInformation: () => string;
}

declare global {
  function CreateSignWasmModule(): Promise<WasmModule>;
  interface Window {
    cv: OpenCV;
  }
}

interface HandROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function CameraSignDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isRecordingRef = useRef(false); // 최신 isRecording 값을 추적
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<SignRecognitionResult | null>(null);
  const [wasmModule, setWasmModule] = useState<WasmModule | null>(null);
  const [recognizer, setRecognizer] = useState<SignRecognizerInstance | null>(
    null
  );
  const [filter, setFilter] = useState<
    "none" | "grayscale" | "contours" | "skin" | "opencv"
  >("none");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isOpenCVReady, setIsOpenCVReady] = useState(false);
  const [handROI, setHandROI] = useState<HandROI | null>(null);
  const [showOpenCVDebug, setShowOpenCVDebug] = useState(false);
  const [opencvDebugInfo, setOpencvDebugInfo] = useState<{
    contoursFound: number;
    maxArea: number;
    processingTime: number;
  } | null>(null);
  const opencvDebugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    initializeWasm();
    initializeOpenCV();
  }, []);

  useEffect(() => {
    // 비디오 요소가 준비된 후 카메라 설정
    const timer = setTimeout(() => {
      if (videoRef.current) {
        setupCamera();
      } else {
        console.warn(
          "비디오 요소가 아직 준비되지 않았습니다. 수동으로 카메라를 활성화하세요."
        );
      }
    }, 1000); // 1초 대기

    return () => clearTimeout(timer);
  }, []);

  const initializeOpenCV = () => {
    console.log("OpenCV 초기화 시작...");

    const checkOpenCV = () => {
      if (typeof window !== "undefined" && window.cv) {
        if (window.cv.getBuildInformation) {
          console.log("OpenCV.js 로드 완료:", window.cv.getBuildInformation());
          setIsOpenCVReady(true);
        } else {
          console.log("OpenCV 아직 초기화 중...");
          setTimeout(checkOpenCV, 100);
        }
      } else {
        console.log("OpenCV 로딩 대기 중...");
        setTimeout(checkOpenCV, 100);
      }
    };

    checkOpenCV();
  };

  /**
   * OpenCV.js를 사용하여 손 영역(ROI) 검출
   * 피부색 기반으로 손의 bounding box를 찾아 좌표만 반환
   */
  const detectHandROI = (imageData: ImageData): HandROI | null => {
    if (!isOpenCVReady || !window.cv) {
      console.warn("OpenCV가 준비되지 않았습니다");
      return null;
    }

    const startTime = performance.now();

    try {
      const cv = window.cv;
      console.log("OpenCV 처리 시작:", {
        imageWidth: imageData.width,
        imageHeight: imageData.height,
      });

      // ImageData를 OpenCV Mat으로 변환
      // 임시 캔버스에 그려서 cv.imread 사용
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return null;

      tempCtx.putImageData(imageData, 0, 0);

      // OpenCV Mat 생성 (RGBA) - canvas가 준비될 때까지 대기
      if (!tempCanvas || tempCanvas.width === 0 || tempCanvas.height === 0) {
        console.error("OpenCV: 임시 캔버스가 유효하지 않습니다");
        return null;
      }

      console.log("OpenCV: imread 호출 전", {
        canvasWidth: tempCanvas.width,
        canvasHeight: tempCanvas.height,
      });

      const src = cv.imread(tempCanvas);

      if (!src || src.rows === 0 || src.cols === 0) {
        console.error("OpenCV: imread 실패 - Mat이 유효하지 않습니다");
        return null;
      }

      console.log("OpenCV: Mat 생성 성공", {
        rows: src.rows,
        cols: src.cols,
        dataLength: src.data?.length || 0,
      });

      // YCrCb 색공간으로 변환 (참고: https://88-it.tistory.com/9)
      // YCrCb가 피부색 검출에 더 정확함
      const ycrcb = new cv.Mat(src.rows, src.cols, cv.CV_8UC3);

      if (!ycrcb || ycrcb.rows === 0 || ycrcb.cols === 0) {
        console.error("OpenCV: YCrCb Mat 생성 실패");
        src.delete();
        return null;
      }

      // OpenCV.js 색상 변환 코드 확인 및 로그
      console.log("OpenCV: 색상 변환 코드 확인", {
        COLOR_RGBA2RGB: cv.COLOR_RGBA2RGB,
        COLOR_RGB2YCrCb: cv.COLOR_RGB2YCrCb,
      });

      try {
        // RGBA를 먼저 RGB로 변환한 후 YCrCb로 변환
        const rgb = new cv.Mat(src.rows, src.cols, cv.CV_8UC3);

        if (!rgb || rgb.rows === 0 || rgb.cols === 0) {
          console.error("OpenCV: RGB Mat 생성 실패");
          src.delete();
          ycrcb.delete();
          return null;
        }

        console.log("OpenCV: RGBA -> RGB 변환 시작");
        const rgba2rgb = cv.COLOR_RGBA2RGB;
        if (!rgba2rgb) {
          console.error("OpenCV: COLOR_RGBA2RGB가 정의되지 않았습니다");
          src.delete();
          ycrcb.delete();
          rgb.delete();
          return null;
        }
        cv.cvtColor(src, rgb, rgba2rgb);
        console.log("OpenCV: RGBA -> RGB 변환 성공");

        console.log("OpenCV: RGB -> YCrCb 변환 시작");
        const rgb2ycrcb = cv.COLOR_RGB2YCrCb;
        if (!rgb2ycrcb) {
          console.error("OpenCV: COLOR_RGB2YCrCb가 정의되지 않았습니다");
          src.delete();
          ycrcb.delete();
          rgb.delete();
          return null;
        }
        cv.cvtColor(rgb, ycrcb, rgb2ycrcb);
        console.log("OpenCV: RGB -> YCrCb 변환 성공");

        rgb.delete();
      } catch (cvtColorError) {
        console.error("OpenCV: cvtColor 실패", cvtColorError);
        src.delete();
        ycrcb.delete();
        return null;
      }

      // 피부색 범위 (YCrCb) - 참고 링크의 범위 사용
      // 출처: https://88-it.tistory.com/9
      // YCrCb 범위: [0,133,77] ~ [255,173,127]
      console.log("OpenCV: 피부색 범위 Mat 생성 시작 (YCrCb)");

      // lower bound: [0, 133, 77] - YCrCb 색공간
      const lower = new cv.Mat(1, 1, cv.CV_8UC3);
      lower.data[0] = 0; // Y
      lower.data[1] = 133; // Cr
      lower.data[2] = 77; // Cb

      // upper bound: [255, 173, 127] - YCrCb 색공간
      const upper = new cv.Mat(1, 1, cv.CV_8UC3);
      upper.data[0] = 255; // Y
      upper.data[1] = 173; // Cr
      upper.data[2] = 127; // Cb

      if (!lower || !upper) {
        console.error("OpenCV: 범위 Mat 생성 실패");
        src.delete();
        ycrcb.delete();
        return null;
      }

      console.log("OpenCV: 범위 Mat 생성 성공", {
        lowerData: Array.from(lower.data.slice(0, 3)),
        upperData: Array.from(upper.data.slice(0, 3)),
      });

      // 피부색 마스크 생성 (YCrCb 색공간 사용)
      const mask = new cv.Mat(ycrcb.rows, ycrcb.cols, cv.CV_8UC1);

      if (!mask || mask.rows === 0 || mask.cols === 0) {
        console.error("OpenCV: Mask Mat 생성 실패");
        src.delete();
        ycrcb.delete();
        lower.delete();
        upper.delete();
        return null;
      }

      console.log("OpenCV: inRange 호출 (YCrCb)", {
        ycrcbRows: ycrcb.rows,
        ycrcbCols: ycrcb.cols,
        maskRows: mask.rows,
        maskCols: mask.cols,
        lowerRange: [0, 133, 77],
        upperRange: [255, 173, 127],
      });

      try {
        cv.inRange(ycrcb, lower, upper, mask);
        console.log("OpenCV: inRange 성공 (YCrCb)");
      } catch (inRangeError) {
        console.error("OpenCV: inRange 실패", inRangeError);
        src.delete();
        ycrcb.delete();
        lower.delete();
        upper.delete();
        mask.delete();
        return null;
      }

      // 윤곽선 찾기
      console.log("OpenCV: findContours 준비");

      const contours = new cv.MatVector() as {
        size: () => number;
        get: (index: number) => unknown;
        delete: () => void;
      };

      if (!contours) {
        console.error("OpenCV: MatVector 생성 실패");
        src.delete();
        ycrcb.delete();
        mask.delete();
        return null;
      }

      // hierarchy는 findContours가 자동으로 채워주므로 빈 Mat 생성
      // OpenCV.js는 findContours의 hierarchy를 자동으로 할당하므로 빈 Mat 생성
      // CV_32SC1 타입으로 생성 (정수형, 1채널)
      const hierarchy = new cv.Mat(0, 0, cv.CV_8UC1);

      if (!hierarchy) {
        console.error("OpenCV: Hierarchy Mat 생성 실패");
        src.delete();
        ycrcb.delete();
        mask.delete();
        contours.delete();
        return null;
      }

      console.log("OpenCV: findContours 호출", {
        maskRows: mask.rows,
        maskCols: mask.cols,
        retrMode: cv.RETR_EXTERNAL,
        chainMode: cv.CHAIN_APPROX_SIMPLE,
      });

      try {
        cv.findContours(
          mask,
          contours,
          hierarchy,
          cv.RETR_EXTERNAL,
          cv.CHAIN_APPROX_SIMPLE
        );
        console.log("OpenCV: findContours 성공");
      } catch (findContoursError) {
        console.error("OpenCV: findContours 실패", findContoursError);
        src.delete();
        ycrcb.delete();
        mask.delete();
        contours.delete();
        hierarchy.delete();
        return null;
      }

      // 가장 큰 윤곽선의 bounding box 찾기
      let maxArea = 0;
      let maxRect: OpenCVRect | null = null;
      const totalContours = contours.size();

      console.log(`OpenCV: ${totalContours}개의 윤곽선 발견`);

      for (let i = 0; i < totalContours; i++) {
        try {
          const contour = contours.get(i);

          if (!contour) {
            console.warn(`OpenCV: 윤곽선 ${i}가 null입니다`);
            continue;
          }

          const rect = cv.boundingRect(contour);

          if (!rect || rect.width === undefined || rect.height === undefined) {
            console.warn(
              `OpenCV: 윤곽선 ${i}의 boundingRect가 유효하지 않습니다`
            );
            continue;
          }

          const area = rect.width * rect.height;

          if (area > maxArea && area > 1000) {
            // 최소 크기 필터링 (노이즈 제거)
            maxArea = area;
            maxRect = rect;
          }
        } catch (contourError) {
          console.error(`OpenCV: 윤곽선 ${i} 처리 중 오류:`, contourError);
          continue;
        }
      }

      // OpenCV 디버그 정보 저장 (ROI가 없어도 정보는 저장)
      const processingTime = performance.now() - startTime;
      setOpencvDebugInfo({
        contoursFound: totalContours,
        maxArea,
        processingTime,
      });

      // OpenCV 마스크를 디버그 캔버스에 표시
      console.log(
        "showOpenCVDebug",
        showOpenCVDebug,
        "opencvDebugCanvasRef.current",
        !!opencvDebugCanvasRef.current
      );
      if (showOpenCVDebug && opencvDebugCanvasRef.current) {
        const debugCanvas = opencvDebugCanvasRef.current;
        const debugCtx = debugCanvas.getContext("2d");
        if (debugCtx) {
          debugCanvas.width = imageData.width;
          debugCanvas.height = imageData.height;

          console.log("OpenCV 디버그 캔버스에 마스크 표시 중...", {
            canvasWidth: debugCanvas.width,
            canvasHeight: debugCanvas.height,
            maskRows: mask.rows,
            maskCols: mask.cols,
          });

          try {
            // 마스크를 직접 캔버스에 표시 (GRAY 스케일)
            cv.imshow(debugCanvas, mask);
            console.log("OpenCV imshow 성공");

            // 윤곽선 그리기
            if (maxRect) {
              debugCtx.strokeStyle = "lime";
              debugCtx.lineWidth = 3;
              debugCtx.strokeRect(
                maxRect.x,
                maxRect.y,
                maxRect.width,
                maxRect.height
              );

              // 텍스트 표시
              debugCtx.fillStyle = "lime";
              debugCtx.font = "16px Arial";
              debugCtx.fillText(
                `ROI: ${maxRect.width}×${maxRect.height}`,
                maxRect.x,
                maxRect.y - 5
              );
            } else {
              // ROI가 없을 때 메시지 표시
              debugCtx.fillStyle = "red";
              debugCtx.font = "20px Arial";
              debugCtx.fillText("ROI를 찾을 수 없습니다", 10, 30);
            }
          } catch (imshowError) {
            console.error("OpenCV imshow 실패:", imshowError);
          }
        } else {
          console.error("디버그 캔버스 컨텍스트를 가져올 수 없습니다");
        }
      } else {
        console.log("디버그 모드가 꺼져있거나 캔버스 ref가 없습니다", {
          showOpenCVDebug,
          hasRef: !!opencvDebugCanvasRef.current,
        });
      }

      // 메모리 정리
      src.delete();
      ycrcb.delete();
      lower.delete();
      upper.delete();
      mask.delete();
      contours.delete();
      hierarchy.delete();

      console.log("maxRect", maxRect);
      if (maxRect) {
        const roi: HandROI = {
          x: maxRect.x,
          y: maxRect.y,
          width: maxRect.width,
          height: maxRect.height,
        };

        console.log("손 ROI 검출:", roi);
        return roi;
      }

      console.log("ROI를 찾을 수 없습니다");
      return null;
    } catch (error) {
      console.error("손 ROI 검출 실패:", error);
      return null;
    }
  };

  const initializeWasm = async () => {
    try {
      console.log("WASM 초기화 시작...");

      // WASM 모듈 로드
      const script = document.createElement("script");
      script.src = "/wasm/sign_wasm.js";
      script.onload = async () => {
        console.log("WASM 스크립트 로드 완료");

        try {
          const wasmModule = await CreateSignWasmModule();
          console.log("WASM 모듈 생성 완료:", wasmModule);

          // WASM 모듈이 완전히 초기화될 때까지 대기
          await new Promise((resolve) => setTimeout(resolve, 100));

          console.log("WASM 메모리 체크:", {
            hasHEAPU8: !!wasmModule.HEAPU8,
            HEAPU8Type: typeof wasmModule.HEAPU8,
            HEAPU8Length: wasmModule.HEAPU8?.length || 0,
            hasMalloc: !!wasmModule._malloc,
            mallocType: typeof wasmModule._malloc,
            hasFree: !!wasmModule._free,
            hasSimpleGestureDetect: !!wasmModule.simple_gesture_detect,
          });

          // 메모리 테스트 및 HEAP 버퍼 확인
          try {
            const testPtr = wasmModule._malloc(100);
            console.log("메모리 할당 테스트 성공:", testPtr);

            // HEAPU8 버퍼 확인
            if (wasmModule.HEAPU8) {
              console.log("HEAPU8 버퍼 사용 가능:", {
                bufferLength: wasmModule.HEAPU8.buffer.byteLength,
                HEAPU8Length: wasmModule.HEAPU8.length,
              });
            } else {
              console.warn("HEAPU8 버퍼를 찾을 수 없습니다");
            }

            wasmModule._free(testPtr);
            console.log("메모리 해제 테스트 성공");
          } catch (memError) {
            console.error("메모리 테스트 실패:", memError);
          }

          setWasmModule(wasmModule);

          // 테스트 함수 실행
          if (wasmModule.test_function) {
            const testResult = wasmModule.test_function();
            console.log("테스트 함수 결과:", testResult);
          }

          // 간단한 제스처 검출 함수 테스트
          if (typeof wasmModule.simple_gesture_detect === "function") {
            console.log("simple_gesture_detect 함수 사용 가능");
          }

          // 수화 인식기 초기화
          try {
            const recognizerInstance = new wasmModule.SignRecognizer();
            console.log("SignRecognizer 생성 완료:", recognizerInstance);

            const initialized = recognizerInstance.initialize();
            console.log("초기화 결과:", initialized);

            if (initialized) {
              recognizerInstance.setDetectionThreshold(0.5);
              recognizerInstance.setRecognitionThreshold(0.7);
              setRecognizer(recognizerInstance);
              console.log(
                "WASM 수화 인식기 초기화 완료:",
                recognizerInstance.getVersion()
              );
            } else {
              console.error("수화 인식기 초기화 실패");
            }
          } catch (recognizerError) {
            console.error("SignRecognizer 생성 실패:", recognizerError);
          }

          setIsLoading(false);
        } catch (moduleError) {
          console.error("WASM 모듈 생성 실패:", moduleError);
          setIsLoading(false);
        }
      };

      script.onerror = (error) => {
        console.error("WASM 스크립트 로드 실패:", error);
        setIsLoading(false);
      };

      document.head.appendChild(script);
    } catch (error) {
      console.error("WASM 로드 실패:", error);
      setIsLoading(false);
    }
  };

  const setupCamera = async () => {
    try {
      console.log("카메라 설정 시작...");

      // 비디오 요소가 준비될 때까지 대기
      if (!videoRef.current) {
        console.log("비디오 요소 대기 중...");
        await new Promise<void>((resolve, reject) => {
          const checkInterval = setInterval(() => {
            if (videoRef.current) {
              clearInterval(checkInterval);
              console.log("비디오 요소 준비 완료");
              resolve();
            }
          }, 100);

          // 5초 후 타임아웃
          setTimeout(() => {
            clearInterval(checkInterval);
            reject(
              new Error(
                "비디오 요소를 찾을 수 없습니다. 페이지를 새로고침해보세요."
              )
            );
          }, 5000);
        });
      }

      // 먼저 미디어 장치 권한 확인
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("이 브라우저는 카메라 액세스를 지원하지 않습니다.");
      }

      console.log("미디어 장치 사용 가능, 스트림 요청 중...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: "user",
        },
      });

      console.log("스트림 획득 완료:", stream);

      if (videoRef.current) {
        console.log("비디오 요소에 스트림 설정 중...");
        videoRef.current.srcObject = stream;

        // 타임아웃과 함께 비디오 로드 대기
        const loadPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("비디오 로드 타임아웃"));
          }, 10000); // 10초 타임아웃

          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              clearTimeout(timeout);
              console.log("비디오 메타데이터 로드 완료:", {
                videoWidth: videoRef.current?.videoWidth,
                videoHeight: videoRef.current?.videoHeight,
                readyState: videoRef.current?.readyState,
              });
              setIsCameraReady(true);
              resolve();
            };

            videoRef.current.onerror = (error) => {
              clearTimeout(timeout);
              console.error("비디오 요소 오류:", error);
              reject(error);
            };

            // 비디오 재생 시작
            videoRef.current.play().catch((playError) => {
              console.warn("비디오 자동 재생 실패 (일반적인 현상):", playError);
              // 자동 재생 실패는 사용자 상호작용 후에 해결됨
            });
          }
        });

        await loadPromise;
        console.log("카메라 설정 완료");
      } else {
        throw new Error("비디오 참조가 null입니다.");
      }
    } catch (error) {
      console.error("카메라 접근 실패:", error);
      setIsCameraReady(false);

      // 사용자에게 더 명확한 오류 메시지 제공
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          alert(
            "카메라 권한이 필요합니다. 브라우저 설정에서 카메라 접근을 허용해주세요."
          );
        } else if (error.name === "NotFoundError") {
          alert(
            "카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요."
          );
        } else {
          alert(`카메라 설정 오류: ${error.message}`);
        }
      }
    }
  };

  const startRecording = () => {
    console.log("startRecording 호출됨");
    // ref와 state 모두 업데이트 (ref는 즉시 반영됨)
    isRecordingRef.current = true;
    setIsRecording(true);

    // 다음 프레임에서 processFrame 시작
    requestAnimationFrame(() => {
      console.log("requestAnimationFrame에서 processFrame 시작");
      processFrame();
    });
  };

  const stopRecording = () => {
    console.log("stopRecording 호출됨");
    // ref와 state 모두 업데이트
    isRecordingRef.current = false;
    setIsRecording(false);
    setResult(null);
  };

  const testGestureDetection = () => {
    console.log("테스트 제스처 검출 시작...");

    if (!wasmModule) {
      console.error("WASM 모듈이 없습니다");
      return;
    }

    if (!videoRef.current) {
      console.error("비디오 참조가 null입니다");
      return;
    }

    if (!canvasRef.current) {
      console.error("캔버스 참조가 null입니다");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    console.log("비디오 상태:", {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      readyState: video.readyState,
      srcObject: !!video.srcObject,
    });

    if (!ctx) {
      console.error("캔버스 컨텍스트를 가져올 수 없습니다");
      return;
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error("비디오가 준비되지 않았습니다. 잠시 후 다시 시도하세요.");
      return;
    }

    // 캔버스 크기 설정
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 비디오 프레임을 캔버스에 그리기
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 이미지 데이터 가져오기
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;

    // WASM 메모리에 이미지 데이터 복사
    const dataSize = width * height * 4; // RGBA
    const dataPtr = wasmModule._malloc(dataSize);

    try {
      if (dataPtr === 0 || dataPtr === null) {
        console.error("메모리 할당 실패: dataPtr가 유효하지 않습니다", dataPtr);
        return;
      }

      // HEAPU8 대신 직접 메모리에 쓰기
      console.log("이미지 데이터를 직접 메모리에 복사 중...", {
        width,
        height,
        dataSize,
        dataPtr,
      });

      // 메모리에 직접 데이터 쓰기 (ccall 사용)
      const wasmMemory = new Uint8Array(
        wasmModule.HEAPU8.buffer,
        dataPtr,
        dataSize
      );
      for (let i = 0; i < data.length && i < dataSize; i++) {
        wasmMemory[i] = data[i];
      }

      console.log("테스트: 이미지 데이터 WASM에 복사 완료", {
        width,
        height,
        dataSize,
      });

      // 간단한 제스처 검출 테스트
      if (wasmModule.simple_gesture_detect) {
        console.log("테스트: simple_gesture_detect 호출...");
        const result = wasmModule.simple_gesture_detect(dataPtr, width, height);
        console.log("테스트 결과:", result);

        try {
          const gestureResult: SignRecognitionResult = JSON.parse(result);
          console.log("테스트: 파싱된 결과:", gestureResult);
          setResult(gestureResult);
        } catch (parseError) {
          console.error("테스트: 결과 파싱 실패:", parseError);
        }
      } else {
        console.error("simple_gesture_detect 함수를 찾을 수 없습니다");
      }
    } finally {
      wasmModule._free(dataPtr);
    }
  };

  const processFrame = () => {
    // ref를 사용해서 최신 isRecording 값 확인 (비동기 상태 업데이트 문제 해결)
    if (!isRecordingRef.current) {
      console.log("processFrame: isRecordingRef가 false입니다 - 중단");
      return;
    }

    console.log("processFrame 실행 중...", {
      isRecording: isRecordingRef.current,
      hasVideo: !!videoRef.current,
      hasCanvas: !!canvasRef.current,
      hasWasm: !!wasmModule,
    });
    if (!videoRef.current) {
      console.log("processFrame: videoRef가 null입니다");
      return;
    }
    if (!canvasRef.current) {
      console.log("processFrame: canvasRef가 null입니다");
      return;
    }
    if (!wasmModule) {
      console.log("processFrame: wasmModule이 null입니다");
      return;
    }
    // recognizer는 선택적 (simple_gesture_detect 사용 가능)
    if (!recognizer) {
      console.log(
        "processFrame: recognizer가 null입니다 (simple_gesture_detect만 사용)"
      );
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {
      requestAnimationFrame(processFrame);
      return;
    }

    // 캔버스 크기 설정
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 비디오 프레임을 캔버스에 그리기
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 이미지 데이터 가져오기
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height } = imageData;

    // OpenCV로 손 ROI 검출 (JS에서만 실행)
    console.log("processFrame: detectHandROI 호출 전");
    const detectedROI = detectHandROI(imageData);
    console.log("processFrame: detectHandROI 결과", detectedROI);
    setHandROI(detectedROI);

    console.log(
      "processFrame 실행 중 - ROI 검출:",
      detectedROI ? "성공" : "실패"
    );

    // ROI가 없으면 다음 프레임으로 (계속 시도)
    if (!detectedROI) {
      console.log("ROI가 없어서 다음 프레임으로 계속 진행");
      requestAnimationFrame(processFrame);
      return;
    }

    // ROI 영역만 추출
    const roiX = Math.max(0, detectedROI.x);
    const roiY = Math.max(0, detectedROI.y);
    const roiWidth = Math.min(detectedROI.width, width - roiX);
    const roiHeight = Math.min(detectedROI.height, height - roiY);

    // ROI 영역의 이미지 데이터만 추출
    const roiImageData = ctx.getImageData(roiX, roiY, roiWidth, roiHeight);
    const roiData = roiImageData.data;

    // WASM 메모리에 ROI 영역만 복사 (전체 프레임이 아닌 ROI만!)
    const roiDataSize = roiWidth * roiHeight * 4; // RGBA
    const dataPtr = wasmModule._malloc(roiDataSize);

    try {
      if (dataPtr === 0 || dataPtr === null) {
        console.error("메모리 할당 실패: dataPtr가 유효하지 않습니다", dataPtr);
        return;
      }

      console.log("수화 인식: ROI 영역만 메모리에 복사 중...", {
        roiX,
        roiY,
        roiWidth,
        roiHeight,
        roiDataSize,
        dataPtr,
      });

      // ROI 데이터만 메모리에 복사
      const wasmMemory = new Uint8Array(
        wasmModule.HEAPU8.buffer,
        dataPtr,
        roiDataSize
      );
      for (let i = 0; i < roiData.length && i < roiDataSize; i++) {
        wasmMemory[i] = roiData[i];
      }

      console.log("수화 인식: ROI 메모리 복사 완료");

      // 필터 적용 (ROI 영역에만)
      switch (filter) {
        case "grayscale":
          wasmModule.applyGrayscale(dataPtr, roiWidth, roiHeight);
          break;
        case "contours":
          wasmModule.enhanceHandContours(dataPtr, roiWidth, roiHeight);
          break;
        case "skin":
          wasmModule.enhanceSkinTone(dataPtr, roiWidth, roiHeight);
          break;
      }

      // 수화 인식 처리 (ROI 영역만 처리)
      try {
        console.log("수화 인식 처리 시작 (ROI만)...", {
          roiWidth,
          roiHeight,
          dataPtr,
        });

        // 먼저 간단한 제스처 검출 함수 시도 (ROI 크기로)
        if (wasmModule.simple_gesture_detect) {
          console.log("simple_gesture_detect 함수 호출 (ROI)...");
          const simpleResult = wasmModule.simple_gesture_detect(
            dataPtr,
            roiWidth,
            roiHeight
          );
          console.log("simple_gesture_detect 결과:", simpleResult);

          try {
            const simpleGestureResult: SignRecognitionResult =
              JSON.parse(simpleResult);
            console.log("파싱된 간단 제스처 결과:", simpleGestureResult);

            if (
              simpleGestureResult.gesture !== "감지되지 않음" &&
              simpleGestureResult.confidence > 0.3
            ) {
              console.log("간단 제스처 인식 성공:", simpleGestureResult);
              setResult(simpleGestureResult);
            }
          } catch (simpleParseError) {
            console.error("간단 제스처 결과 파싱 실패:", simpleParseError);
          }
        }

        // 기존 복잡한 인식기 시도 (ROI 크기로) - 선택적
        if (recognizer && recognizer.processFrame) {
          try {
            const resultString = recognizer.processFrame(
              dataPtr,
              roiWidth,
              roiHeight,
              4
            );
            console.log("수화 인식 결과 문자열:", resultString);

            const recognitionResult: SignRecognitionResult =
              JSON.parse(resultString);
            console.log("파싱된 수화 인식 결과:", recognitionResult);

            if (
              recognitionResult.gesture !== "감지되지 않음" &&
              recognitionResult.confidence > 0.5
            ) {
              console.log("수화 인식 성공:", recognitionResult);
              setResult(recognitionResult);
            } else {
              console.log(
                "수화 인식 실패 또는 낮은 신뢰도:",
                recognitionResult
              );
            }
          } catch (recognizerError) {
            console.error("recognizer.processFrame 오류:", recognizerError);
          }
        } else {
          console.log("recognizer가 없어서 simple_gesture_detect만 사용합니다");
        }
      } catch (parseError) {
        console.error("수화 인식 결과 파싱 실패:", parseError);
      }

      // 필터가 적용된 ROI 이미지를 원본 캔버스의 ROI 위치에 다시 표시
      if (filter !== "none") {
        const processedData = wasmModule.HEAPU8.slice(
          dataPtr,
          dataPtr + roiDataSize
        );
        const processedImageData = new ImageData(
          new Uint8ClampedArray(processedData),
          roiWidth,
          roiHeight
        );
        // ROI 위치에만 다시 그리기
        ctx.putImageData(processedImageData, roiX, roiY);
      }

      // ROI 영역을 시각적으로 표시 (디버깅용)
      if (detectedROI) {
        ctx.strokeStyle = "lime";
        ctx.lineWidth = 2;
        ctx.strokeRect(roiX, roiY, roiWidth, roiHeight);
      }
    } finally {
      wasmModule._free(dataPtr);
    }

    // 다음 프레임 처리
    requestAnimationFrame(processFrame);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">WASM 모듈 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">수화 번역 시스템</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-lg border shadow-lg"
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              style={{ display: filter !== "none" ? "block" : "none" }}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {!isCameraReady && (
              <button
                onClick={setupCamera}
                className="px-4 py-2 rounded-lg font-semibold bg-orange-500 hover:bg-orange-600 text-white"
              >
                카메라 활성화
              </button>
            )}

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-4 py-2 rounded-lg font-semibold ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : isCameraReady
                  ? "bg-green-500 hover:bg-green-600 text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              disabled={!isCameraReady}
            >
              {isRecording ? "인식 중단" : "수화 인식 시작"}
            </button>

            <button
              onClick={testGestureDetection}
              className={`px-4 py-2 rounded-lg font-semibold ${
                wasmModule && isCameraReady
                  ? "bg-blue-500 hover:bg-blue-600 text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              disabled={!wasmModule || !isCameraReady}
            >
              테스트 인식
            </button>

            <select
              value={filter}
              onChange={(e) =>
                setFilter(
                  e.target.value as "none" | "grayscale" | "contours" | "skin"
                )
              }
              className="px-3 py-2 border rounded-lg"
            >
              <option value="none">필터 없음</option>
              <option value="grayscale">흑백</option>
              <option value="contours">윤곽선 강조</option>
              <option value="skin">피부색 강조</option>
            </select>
          </div>
        </div>

        {/* 결과 영역 */}
        <div className="space-y-4">
          <div className="bg-gray-50 p-6 rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">인식 결과</h2>

            {result ? (
              <div className="space-y-2">
                <div className="text-3xl font-bold text-blue-600">
                  {result.gesture}
                </div>
                <div className="text-sm text-gray-600">
                  신뢰도: {(result.confidence * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">
                  제스처 ID: {result.id}
                </div>
              </div>
            ) : (
              <div className="text-gray-500">
                {isRecording
                  ? "수화를 인식 중입니다..."
                  : "수화 인식을 시작하세요."}
              </div>
            )}
          </div>

          {/* 지원 제스처 목록 */}
          <div className="bg-blue-50 p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-3">지원하는 수화</h3>
            <ul className="space-y-1 text-sm">
              <li>• 안녕하세요 - 손바닥 펼치고 흔들기</li>
              <li>• 감사합니다 - 주먹을 가슴에</li>
              <li>• 예 - 검지 세우기</li>
            </ul>
          </div>

          {/* OpenCV 디버그 정보 */}
          <div className="bg-purple-50 p-4 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">OpenCV 상태</h3>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showOpenCVDebug}
                  onChange={(e) => setShowOpenCVDebug(e.target.checked)}
                  className="rounded"
                />
                디버그 모드
              </label>
            </div>
            <div className="text-xs text-gray-700 space-y-1">
              <div>
                상태:{" "}
                <span
                  className={
                    isOpenCVReady
                      ? "text-green-600 font-semibold"
                      : "text-red-600"
                  }
                >
                  {isOpenCVReady ? "준비됨" : "대기 중"}
                </span>
              </div>
              {opencvDebugInfo && (
                <>
                  <div>윤곽선 발견: {opencvDebugInfo.contoursFound}개</div>
                  <div>
                    최대 영역: {opencvDebugInfo.maxArea.toLocaleString()}px²
                  </div>
                  <div>
                    처리 시간: {opencvDebugInfo.processingTime.toFixed(2)}ms
                  </div>
                </>
              )}
            </div>
          </div>

          {/* OpenCV 디버그 캔버스 */}
          {showOpenCVDebug && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h3 className="text-sm font-semibold mb-2">OpenCV 마스크</h3>
              <canvas
                ref={opencvDebugCanvasRef}
                className="w-full border rounded"
                style={{ maxHeight: "200px", objectFit: "contain" }}
              />
            </div>
          )}

          {/* ROI 정보 */}
          {handROI && (
            <div className="bg-green-50 p-4 rounded-lg border text-xs">
              <h3 className="text-sm font-semibold mb-2">손 영역 (ROI)</h3>
              <div className="text-gray-700">
                <div>
                  위치: ({handROI.x}, {handROI.y})
                </div>
                <div>
                  크기: {handROI.width} × {handROI.height}
                </div>
                <div>
                  면적: {(handROI.width * handROI.height).toLocaleString()}px²
                </div>
              </div>
            </div>
          )}

          {/* 시스템 정보 */}
          <div className="bg-gray-50 p-4 rounded-lg border text-xs text-gray-600">
            <div>WASM 버전: {recognizer?.getVersion?.() || "N/A"}</div>
            <div>OpenCV: {isOpenCVReady ? "준비됨" : "대기 중"}</div>
            <div>상태: {isRecording ? "인식 중" : "대기 중"}</div>
            <div>필터: {filter === "none" ? "없음" : filter}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
