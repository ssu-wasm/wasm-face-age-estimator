"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WASMSignRecognizer } from "./wasm-sign-recognizer";
import { MediaPipeHandDetector, HandLandmark } from "./mediapipe-hand-detector";

import styles from "./SignDetector.module.css";

interface RecognitionResult {
  gesture: string;
  confidence: number;
  id: number;
}

interface ChatMessage {
  id: string;
  gesture: string;
  confidence: number;
  timestamp: Date;
}

// MLP 모델 라벨
const MLP_LABELS = ["hello", "love", "nice", "thanks"];
const MLP_LABEL_MAP: { [key: string]: string } = {
  hello: "안녕(주먹)",
  love: "사랑해",
  nice: "반가워",
  thanks: "고마워",
};

type RecognitionMode = "JS_RULE" | "WASM_RULE" | "WASM_MLP";

export default function AISignDetectorExample() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selfCanvasRef = useRef<HTMLCanvasElement>(null);
  const isRecordingRef = useRef(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const [currentResult, setCurrentResult] = useState<RecognitionResult | null>(
    null
  );
  const [mlpResult, setMlpResult] = useState<string>("-");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const lastGestureRef = useRef<string>("");

  const [performanceStats, setPerformanceStats] = useState({
    time: 0,
    count: 0,
  });

  const [recognitionMode, setRecognitionMode] =
    useState<RecognitionMode>("WASM_RULE");
  const recognitionModeRef = useRef<RecognitionMode>("WASM_RULE");

  const handDetectorRef = useRef<MediaPipeHandDetector | null>(null);
  const mlRecognizerRef = useRef<WASMSignRecognizer | null>(null);

  // --- JS 인식 로직 (단일 손) ---
  const recognizeWithJavaScript = (
    landmarks: HandLandmark[]
  ): RecognitionResult => {
    if (!landmarks || landmarks.length === 0) {
      return { gesture: "감지되지 않음", confidence: 0, id: 0 };
    }

    const fingerTips = [4, 8, 12, 16, 20];
    const fingerPips = [3, 6, 10, 14, 18];

    const isExtended = fingerTips.map((tipIdx, i) => {
      if (i === 0) {
        return (
          Math.abs(landmarks[tipIdx].x - landmarks[0].x) >
          Math.abs(landmarks[fingerPips[i]].x - landmarks[0].x)
        );
      }
      return landmarks[tipIdx].y < landmarks[fingerPips[i]].y;
    });

    const count = isExtended.filter(Boolean).length;
    const [thumb, index, middle, ring, pinky] = isExtended;

    let gesture = "알 수 없음";
    let id = 0;

    if (count === 5) {
      gesture = "보 (Open)";
      id = 1;
    } else if (count === 0) {
      gesture = "주먹 (Fist)";
      id = 2;
    } else if (index && middle && !ring && !pinky) {
      gesture = "가위 (V)";
      id = 3;
    } else if (index && !middle && !ring && !pinky) {
      gesture = "검지 (Point)";
      id = 4;
    } else if (thumb && !index && !middle && !ring && !pinky) {
      gesture = "최고 (ThumbUp)";
      id = 6;
    } else if (thumb && index && pinky && !middle && !ring) {
      gesture = "사랑해 (ILY)";
      id = 5;
    }

    return { gesture, confidence: 0.8, id };
  };

  // --- Helper Functions ---

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // [수정] null 체크 추가
  const clearCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // context null 체크
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // [수정] null 체크 추가
  const clearCanvasWithText = (
    canvas: HTMLCanvasElement | null,
    text: string
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 320;
      canvas.height = 240;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = "#666666";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText(text, 160, 125);
    }
  };

  const drawSingleHand = (
    ctx: CanvasRenderingContext2D,
    landmarks: HandLandmark[],
    w: number,
    h: number,
    color: string,
    lw: number
  ) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    landmarks.forEach((lm) => {
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, lw * 1.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    const conns = [
      [0, 1],
      [0, 5],
      [0, 9],
      [0, 13],
      [0, 17],
      [1, 2],
      [2, 3],
      [3, 4],
      [5, 6],
      [6, 7],
      [7, 8],
      [9, 10],
      [10, 11],
      [11, 12],
      [13, 14],
      [14, 15],
      [15, 16],
      [17, 18],
      [18, 19],
      [19, 20],
    ];
    conns.forEach(([s, e]) => {
      const start = landmarks[s];
      const end = landmarks[e];
      if (start && end) {
        ctx.beginPath();
        ctx.moveTo(start.x * w, start.y * h);
        ctx.lineTo(end.x * w, end.y * h);
        ctx.stroke();
      }
    });
  };

  // [수정] null 체크 추가
  const drawLandmarks = (
    canvas: HTMLCanvasElement | null,
    multiHandLandmarks: HandLandmark[][]
  ) => {
    if (!canvas || !videoRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    multiHandLandmarks.forEach((landmarks) => {
      drawSingleHand(ctx, landmarks, canvas.width, canvas.height, "#00ff00", 2);
    });
  };

  // [수정] null 체크 추가
  const drawSelfLandmarks = (
    canvas: HTMLCanvasElement | null,
    multiHandLandmarks: HandLandmark[][],
    result: RecognitionResult | null,
    mlpText: string,
    mode: RecognitionMode
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 320;
    canvas.height = 240;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    multiHandLandmarks.forEach((landmarks) => {
      drawSingleHand(ctx, landmarks, canvas.width, canvas.height, "#00ff88", 3);
    });

    ctx.textAlign = "center";
    ctx.font = "bold 20px Arial";

    if (mode === "WASM_MLP") {
      ctx.fillStyle = "#ffd700";
      ctx.fillText(`MLP: ${mlpText}`, canvas.width / 2, canvas.height - 20);
    } else if (mode === "WASM_RULE") {
      const text =
        result && result.gesture !== "감지되지 않음" ? result.gesture : "...";
      ctx.fillStyle = "#00ffff";
      ctx.fillText(`Rule: ${text}`, canvas.width / 2, canvas.height - 20);
    } else {
      const text =
        result && result.gesture !== "감지되지 않음" ? result.gesture : "...";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`JS: ${text}`, canvas.width / 2, canvas.height - 20);
    }
  };

  // --- Main Logic ---

  const handleModeChange = (mode: RecognitionMode) => {
    setRecognitionMode(mode);
    setPerformanceStats({ time: 0, count: 0 });

    // MLP일 때만 2개, 나머지(JS_RULE, WASM_RULE)는 1개
    if (handDetectorRef.current) {
      const numHands = mode === "WASM_MLP" ? 2 : 1;
      handDetectorRef.current.updateMaxHands(numHands);
    }
  };

  useEffect(() => {
    recognitionModeRef.current = recognitionMode;
  }, [recognitionMode]);

  useEffect(() => {
    const init = async () => {
      try {
        const detector = new MediaPipeHandDetector();
        await detector.initialize();
        handDetectorRef.current = detector;

        // 초기값: WASM_RULE이므로 1개
        detector.updateMaxHands(1);

        const recognizer = new WASMSignRecognizer();
        const success = await recognizer.initialize();

        if (success) {
          try {
            const res = await fetch("/models/scaler.json");
            if (res.ok) {
              const data = await res.json();
              recognizer.setScaler(data.mean, data.scale);
              console.log("✅ Scaler 로드 완료");
            }
          } catch (e) {
            console.warn("Scaler 실패");
          }
          mlRecognizerRef.current = recognizer;
        }

        setIsLoading(false);
      } catch (e) {
        console.error("초기화 에러:", e);
        setIsLoading(false);
      }
    };
    init();

    return () => {
      handDetectorRef.current?.dispose();
      mlRecognizerRef.current?.dispose();
    };
  }, []);

  const setupCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (error) {
      console.error("카메라 실패:", error);
    }
  };

  const addChatMessage = (result: RecognitionResult) => {
    if (
      !result ||
      result.gesture === "감지되지 않음" ||
      result.gesture === "?" ||
      result.gesture === "-" ||
      result.gesture === "알 수 없음"
    )
      return;
    if (result.gesture === lastGestureRef.current) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      gesture: result.gesture,
      confidence: result.confidence,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, newMessage]);
    lastGestureRef.current = result.gesture;

    setTimeout(() => {
      if (chatMessagesRef.current)
        chatMessagesRef.current.scrollTop =
          chatMessagesRef.current.scrollHeight;
    }, 100);
  };

  const startRecording = () => {
    if (!isCameraActive) setupCamera();
    isRecordingRef.current = true;
    setIsRecording(true);
    processFrame();
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setCurrentResult(null);
    setMlpResult("-");
    lastGestureRef.current = "";
    setPerformanceStats({ time: 0, count: 0 });
  };

  const clearChat = () => {
    setChatMessages([]);
    lastGestureRef.current = "";
  };

  const processFrame = async () => {
    if (!isRecordingRef.current) return;

    const detector = handDetectorRef.current;
    const recognizer = mlRecognizerRef.current;
    const video = videoRef.current;
    const currentMode = recognitionModeRef.current;

    if (!video || !detector || !recognizer) {
      if (isRecordingRef.current) requestAnimationFrame(processFrame);
      return;
    }

    try {
      const detection = await detector.detect(video);

      // 손 감지 확인 (multiHandLandmarks 길이 확인)
      if (
        detection &&
        detection.multiHandLandmarks &&
        detection.multiHandLandmarks.length > 0
      ) {
        let result: RecognitionResult = {
          gesture: "...",
          confidence: 0,
          id: 0,
        };

        let currentMlpText = "-";

        // === 모드별 실행 ===
        if (currentMode === "WASM_RULE") {
          // 1. WASM Rule (한 손)
          result = await recognizer.recognizeFast(detection.landmarks);
        } else if (currentMode === "JS_RULE") {
          // 2. JS Rule (한 손) - 간단 로직 사용
          result = recognizeWithJavaScript(detection.landmarks);
        } else if (currentMode === "WASM_MLP") {
          // 3. WASM MLP (두 손) - 전체 데이터 사용
          const mlpIdx = recognizer.predictWithMLP(detection);
          if (mlpIdx >= 0 && mlpIdx < MLP_LABELS.length) {
            const label = MLP_LABELS[mlpIdx];
            const displayLabel = MLP_LABEL_MAP[label] || label;
            currentMlpText = displayLabel;
            result = { gesture: displayLabel, confidence: 0.9, id: mlpIdx };
          } else {
            currentMlpText = "?";
            result = { gesture: "?", confidence: 0, id: -1 };
          }
        }

        setCurrentResult(result);
        setMlpResult(currentMlpText);

        if (result.confidence > 0.6) {
          addChatMessage(result);
        }

        // 캔버스 그리기 (Ref가 null이 아닐 때만 실행)
        if (canvasRef.current) {
          drawLandmarks(canvasRef.current, detection.multiHandLandmarks);
        }
        if (selfCanvasRef.current) {
          drawSelfLandmarks(
            selfCanvasRef.current,
            detection.multiHandLandmarks,
            result,
            currentMlpText,
            currentMode
          );
        }
      } else {
        // 손 없음
        setCurrentResult(null);
        setMlpResult("-");
        clearCanvas(canvasRef.current);
        if (selfCanvasRef.current)
          clearCanvasWithText(selfCanvasRef.current, "손을 보여주세요");
      }
    } catch (err) {
      console.error("Frame Error:", err);
    }

    if (isRecordingRef.current) {
      requestAnimationFrame(processFrame);
    }
  };

  if (isLoading)
    return (
      <div className={styles.container}>
        <div className={styles.loadingOverlay}>
          <div>AI 모델 로딩 중...</div>
        </div>
      </div>
    );

  return (
    <div className={styles.appContainer}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🤟</span>
            <span className={styles.logoText}>후이즈유</span>
          </div>
          <nav className={styles.navigation}>
            <Link
              href="/camera"
              className={`${styles.navItem} ${styles.active}`}
            >
              수화 인식
            </Link>
            <Link href="/about" className={styles.navItem}>
              소개
            </Link>
          </nav>
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.mainVideoArea}>
          <div className={styles.videoContainer}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.mainVideo}
            />
            <canvas ref={canvasRef} className={styles.handCanvas} />
            <div className={styles.selfVideoContainer}>
              <canvas ref={selfCanvasRef} className={styles.selfHandCanvas} />
            </div>
            {!isCameraActive && (
              <div className={styles.loadingOverlay}>
                <div>카메라를 활성화해주세요</div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.chatArea}>
          {isRecording && (
            <div className={styles.currentStatus}>
              <div className={styles.typingIndicator}>
                <div className={styles.typingDot}></div>
                <div className={styles.typingDot}></div>
                <div className={styles.typingDot}></div>
              </div>
              <div className={styles.statusText}>
                {recognitionMode === "JS_RULE" &&
                  `🔥 JS Rule: ${currentResult?.gesture}`}
                {recognitionMode === "WASM_RULE" &&
                  `🚀 WASM Rule: ${currentResult?.gesture}`}
                {recognitionMode === "WASM_MLP" && `🤖 WASM MLP: ${mlpResult}`}
                <span
                  style={{
                    fontSize: "0.8em",
                    marginLeft: "10px",
                    color: "#aaa",
                  }}
                >
                  (
                  {performanceStats.count > 0
                    ? (performanceStats.time / performanceStats.count).toFixed(
                        2
                      )
                    : 0}{" "}
                  ms)
                </span>
              </div>
            </div>
          )}

          <div className={styles.chatMessages} ref={chatMessagesRef}>
            {chatMessages.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>🤲</div>
                <div>수화 인식을 시작하면 결과가 표시됩니다</div>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className={styles.messageItem}>
                  <div className={styles.messageAvatar}>🤟</div>
                  <div className={styles.messageContent}>
                    <div className={styles.messageBubble}>
                      <div className={styles.messageGesture}>{msg.gesture}</div>
                      <div className={styles.messageConfidence}>
                        {(msg.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className={styles.messageTime}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={styles.controlsArea}>
            <div className={styles.controlsGrid}>
              <div className={styles.buttonRow}>
                <button
                  onClick={isCameraActive ? () => {} : setupCamera}
                  className={`${styles.button} ${
                    isCameraActive ? styles.primary : ""
                  }`}
                  disabled={isCameraActive}
                >
                  {isCameraActive ? "활성화됨" : "카메라 켜기"}
                </button>
                <button
                  onClick={clearChat}
                  className={styles.button}
                  disabled={chatMessages.length === 0}
                >
                  기록 삭제
                </button>
              </div>
              <div className={styles.buttonRow}>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`${styles.button} ${
                    isRecording ? styles.recording : styles.primary
                  }`}
                  disabled={!isCameraActive}
                >
                  {isRecording ? "인식 중단" : "인식 시작"}
                </button>
              </div>

              <div
                className={styles.toggleRow}
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "10px",
                }}
              >
                <div className={styles.toggleLabel}>인식 모드 선택:</div>
                <div style={{ display: "flex", gap: "8px", width: "100%" }}>
                  <button
                    onClick={() => handleModeChange("JS_RULE")}
                    className={`${styles.button} ${
                      recognitionMode === "JS_RULE" ? styles.primary : ""
                    }`}
                    style={{ flex: 1, padding: "8px 4px", fontSize: "12px" }}
                  >
                    🔥 JS
                  </button>
                  <button
                    onClick={() => handleModeChange("WASM_RULE")}
                    className={`${styles.button} ${
                      recognitionMode === "WASM_RULE" ? styles.primary : ""
                    }`}
                    style={{ flex: 1, padding: "8px 4px", fontSize: "12px" }}
                  >
                    🚀 Rule
                  </button>
                  <button
                    onClick={() => handleModeChange("WASM_MLP")}
                    className={`${styles.button} ${
                      recognitionMode === "WASM_MLP" ? styles.primary : ""
                    }`}
                    style={{ flex: 1, padding: "8px 4px", fontSize: "12px" }}
                  >
                    🤖 MLP
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
