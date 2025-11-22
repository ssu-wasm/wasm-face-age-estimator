"use client";

import { loadHandsModule } from "./mediapipe-loader";
import type { Results, HandsConfig, Options } from "@mediapipe/hands";

// Hands 인스턴스 타입 정의
interface HandsInstance {
  setOptions(options: Options): void;
  initialize(): Promise<void>;
  onResults(listener: (results: Results) => void | Promise<void>): void;
  send(inputs: { image: HTMLVideoElement | HTMLCanvasElement }): Promise<void>;
  close(): Promise<void>;
}

// Hands 생성자 타입 정의
interface HandsConstructor {
  new (config?: HandsConfig): HandsInstance;
}

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandDetectionResult {
  landmarks: HandLandmark[];
  confidence: number;
}

export class MediaPipeHandDetector {
  private hands: HandsInstance | null = null;
  private isInitialized: boolean = false;
  private pendingResolve:
    | ((result: HandDetectionResult | null) => void)
    | null = null;

  /**
   * MediaPipe Hands 초기화
   */
  async initialize(): Promise<boolean> {
    try {
      if (typeof window === "undefined") {
        console.warn("브라우저 환경이 아닙니다");
        return false;
      }

      // Dynamic import로 Hands 모듈 로드
      const handsModule = await loadHandsModule();
      if (!handsModule || !handsModule.Hands) {
        console.error("Hands 모듈을 로드할 수 없습니다");
        return false;
      }

      const Hands = handsModule.Hands as HandsConstructor;

      // Hands 인스턴스 생성
      this.hands = new Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        },
      });

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // onResults 콜백을 한 번만 설정
      this.hands.onResults((results: Results) => {
        if (this.pendingResolve) {
          if (
            results.multiHandLandmarks &&
            results.multiHandLandmarks.length > 0
          ) {
            const landmarks = results.multiHandLandmarks[0].map((lm) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
            }));

            this.pendingResolve({
              landmarks,
              confidence: results.multiHandedness?.[0]?.score || 0.5,
            });
          } else {
            this.pendingResolve(null);
          }
          this.pendingResolve = null;
        }
      });

      // 초기화 (비동기)
      await this.hands.initialize();

      this.isInitialized = true;
      console.log("MediaPipe Hands 초기화 완료");
      return true;
    } catch (error) {
      console.error("MediaPipe Hands 초기화 실패:", error);
      return false;
    }
  }

  /**
   * 비디오 프레임에서 손 랜드마크 검출
   */
  async detect(
    videoElement: HTMLVideoElement
  ): Promise<HandDetectionResult | null> {
    if (!this.isInitialized || !this.hands) {
      return null;
    }

    return new Promise((resolve) => {
      // 이전 요청이 있으면 취소
      if (this.pendingResolve) {
        this.pendingResolve(null);
      }

      this.pendingResolve = resolve;
      this.hands!.send({ image: videoElement });
    });
  }

  /**
   * Canvas에서 손 랜드마크 검출
   */
  async detectFromCanvas(
    canvas: HTMLCanvasElement
  ): Promise<HandDetectionResult | null> {
    if (!this.isInitialized || !this.hands) {
      return null;
    }

    return new Promise((resolve) => {
      // 이전 요청이 있으면 취소
      if (this.pendingResolve) {
        this.pendingResolve(null);
      }

      this.pendingResolve = resolve;
      this.hands!.send({ image: canvas });
    });
  }

  async dispose(): Promise<void> {
    if (this.hands) {
      await this.hands.close();
      this.hands = null;
    }
    this.isInitialized = false;
  }
}
