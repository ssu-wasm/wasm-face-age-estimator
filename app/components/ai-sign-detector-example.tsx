/**
 * AI 기반 수화 인식 컴포넌트 예제
 * MediaPipe Hands + TensorFlow.js를 사용
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { MLSignRecognizer } from "./ml-sign-recognizer";
import { MediaPipeHandDetector, HandLandmark } from "./mediapipe-hand-detector";

interface RecognitionResult {
  gesture: string;
  confidence: number;
  id: number;
}

export default function AISignDetectorExample() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isRecordingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [mlRecognizer, setMlRecognizer] = useState<MLSignRecognizer | null>(
    null
  );
  const [handDetector, setHandDetector] =
    useState<MediaPipeHandDetector | null>(null);
  const handDetectorRef = useRef<MediaPipeHandDetector | null>(null);
  const mlRecognizerRef = useRef<MLSignRecognizer | null>(null);

  const [performanceStats, setPerformanceStats] = useState<{
    fps: number;
    averageFrameTime: number;
  } | null>(null);

  const initializeAI = async () => {
    try {
      // MediaPipe Hands 초기화
      const detector = new MediaPipeHandDetector();
      const detectorInitialized = await detector.initialize();

      if (!detectorInitialized) {
        console.warn("MediaPipe Hands 초기화 실패, 대체 방법 사용");
        setIsLoading(false);
        return;
      }

      setHandDetector(detector);
      handDetectorRef.current = detector;

      // WASM 인식기 초기화
      const recognizer = new MLSignRecognizer();
      await recognizer.loadModel(); // WASM 모델 로드

      setMlRecognizer(recognizer);
      mlRecognizerRef.current = recognizer;
      setIsLoading(false);
      console.log("AI 인식기 초기화 완료");
    } catch (error) {
      console.error("AI 초기화 실패:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await initializeAI();
    };
    init();
    return () => {
      if (mlRecognizerRef.current) {
        mlRecognizerRef.current.dispose();
      }
      if (handDetectorRef.current) {
        handDetectorRef.current.dispose();
      }
    };
  }, []);

  const setupCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error("카메라 접근 실패:", error);
    }
  };

  const startRecording = () => {
    isRecordingRef.current = true;
    setIsRecording(true);
    processFrame();
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setResult(null);
  };

  const processFrame = async () => {
    if (!isRecordingRef.current) return;
    if (!videoRef.current || !handDetector || !mlRecognizer) {
      if (isRecordingRef.current) {
        requestAnimationFrame(processFrame);
      }
      return;
    }

    try {
      // MediaPipe로 손 랜드마크 검출
      const detection = await handDetector.detect(videoRef.current);

      if (detection && detection.landmarks.length === 21) {
        // ML 모델로 제스처 인식
        const recognition = await mlRecognizer.recognize(detection.landmarks);

        console.log("인식 결과:", recognition);

        // 신뢰도 임계값을 낮춤 (규칙 기반 인식도 표시하기 위해)
        if (
          recognition.confidence > 0.3 &&
          recognition.gesture !== "감지되지 않음"
        ) {
          setResult(recognition);
        } else {
          // 신뢰도가 낮아도 결과 표시 (디버깅용)
          console.log("낮은 신뢰도:", recognition);
        }

        // 랜드마크 시각화
        if (canvasRef.current) {
          drawLandmarks(canvasRef.current, detection.landmarks);
        }
      } else {
        // 손이 검출되지 않음
        if (!detection) {
          console.log("손이 검출되지 않았습니다");
        }
      }
    } catch (error) {
      console.error("프레임 처리 오류:", error);
    }

    if (isRecordingRef.current) {
      requestAnimationFrame(processFrame);
    }
  };

  const drawLandmarks = (
    canvas: HTMLCanvasElement,
    landmarks: HandLandmark[]
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || !videoRef.current) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 2;

    // 랜드마크 그리기
    landmarks.forEach((landmark) => {
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 손가락 연결선 그리기
    const connections = [
      [0, 1, 2, 3, 4], // 엄지
      [0, 5, 6, 7, 8], // 검지
      [0, 9, 10, 11, 12], // 중지
      [0, 13, 14, 15, 16], // 약지
      [0, 17, 18, 19, 20], // 새끼
    ];

    connections.forEach((connection) => {
      for (let i = 0; i < connection.length - 1; i++) {
        const start = landmarks[connection[i]];
        const end = landmarks[connection[i + 1]];

        ctx.beginPath();
        ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
        ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
        ctx.stroke();
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">AI 모델 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">
        AI 기반 수화 번역 시스템
      </h1>

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
              className="absolute top-0 left-0 w-full h-full rounded-lg pointer-events-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={setupCamera}
              className="px-4 py-2 rounded-lg font-semibold bg-blue-500 hover:bg-blue-600 text-white"
            >
              카메라 활성화
            </button>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-4 py-2 rounded-lg font-semibold ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              }`}
            >
              {isRecording ? "인식 중단" : "AI 인식 시작"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 p-6 rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">AI 인식 결과</h2>

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
                  ? "손을 카메라 앞에 보여주세요..."
                  : "AI 인식을 시작하세요."}
              </div>
            )}
          </div>

          <div className="bg-blue-50 p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-3">WASM 인식기 정보</h3>
            <ul className="space-y-1 text-sm">
              <li>• MediaPipe Hands: 손 랜드마크 검출</li>
              <li>• WASM: C++ 기반 고성능 제스처 인식</li>
              <li>• 입력: 21개 손 랜드마크 좌표</li>
              <li>• 출력: 5개 제스처 클래스</li>
              <li>• 성능: 네이티브 수준의 빠른 처리</li>
            </ul>
          </div>

          {performanceStats && (
            <div className="bg-green-50 p-4 rounded-lg border">
              <h3 className="text-lg font-semibold mb-2">실시간 성능</h3>
              <div className="space-y-1 text-sm">
                <div>FPS: {performanceStats.fps.toFixed(1)}</div>
                <div>
                  평균 프레임 시간:{" "}
                  {performanceStats.averageFrameTime.toFixed(2)}ms
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
