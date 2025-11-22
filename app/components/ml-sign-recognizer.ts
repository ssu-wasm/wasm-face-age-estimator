"use client";
/**
 * WASM 기반 수화 인식기
 * MediaPipe Hands + WASM을 사용한 제스처 인식
 */

import { WASMSignRecognizer } from "./wasm-sign-recognizer";

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface MLRecognitionResult {
  gesture: string;
  confidence: number;
  id: number;
}

export class MLSignRecognizer {
  private isModelLoaded: boolean = false;
  private wasmRecognizer: WASMSignRecognizer | null = null;

  /**
   * WASM 모델 로드
   */
  async loadModel(): Promise<boolean> {
    try {
      this.wasmRecognizer = new WASMSignRecognizer();
      const wasmInitialized = await this.wasmRecognizer.initialize();
      if (wasmInitialized) {
        this.isModelLoaded = true;
        console.log("WASM 인식기 로드 완료");
        return true;
      }
      return false;
    } catch (error) {
      console.error("WASM 로드 실패:", error);
      return false;
    }
  }

  /**
   * 간단한 규칙 기반 제스처 인식 (테스트용)
   */
  private recognizeByRules(
    landmarks: HandLandmark[]
  ): MLRecognitionResult | null {
    // 손가락 끝 랜드마크 인덱스
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    // 검지가 펴져있는지 확인
    const indexExtended =
      indexTip.y < landmarks[6].y && landmarks[6].y < landmarks[5].y;
    // 중지가 펴져있는지 확인
    const middleExtended =
      middleTip.y < landmarks[10].y && landmarks[10].y < landmarks[9].y;
    // 약지가 펴져있는지 확인
    const ringExtended =
      ringTip.y < landmarks[14].y && landmarks[14].y < landmarks[13].y;
    // 새끼손가락이 펴져있는지 확인
    const pinkyExtended =
      pinkyTip.y < landmarks[18].y && landmarks[18].y < landmarks[17].y;
    // 엄지가 펴져있는지 확인 (x 좌표로 판단)
    const thumbExtended =
      Math.abs(thumbTip.x - wrist.x) > Math.abs(landmarks[3].x - wrist.x);

    const extendedFingers = [
      thumbExtended,
      indexExtended,
      middleExtended,
      ringExtended,
      pinkyExtended,
    ].filter(Boolean).length;

    // 규칙 기반 인식
    if (extendedFingers === 1 && indexExtended) {
      // 검지만 펴져있음 -> "예"
      return {
        gesture: "예",
        confidence: 0.8,
        id: 3,
      };
    } else if (extendedFingers === 5) {
      // 모든 손가락이 펴져있음 -> "안녕하세요"
      return {
        gesture: "안녕하세요",
        confidence: 0.75,
        id: 1,
      };
    } else if (extendedFingers === 0) {
      // 주먹 -> "감사합니다"
      return {
        gesture: "감사합니다",
        confidence: 0.7,
        id: 2,
      };
    }

    return null;
  }

  /**
   * 랜드마크로부터 제스처 인식 (WASM 사용)
   */
  async recognize(landmarks: HandLandmark[]): Promise<MLRecognitionResult> {
    // WASM 사용
    if (this.isModelLoaded && this.wasmRecognizer) {
      try {
        const result = await this.wasmRecognizer.recognizeFast(landmarks);
        return {
          gesture: result.gesture,
          confidence: result.confidence,
          id: result.id,
        };
      } catch (error) {
        console.error("WASM 인식 오류:", error);
        // WASM 실패 시 규칙 기반으로 폴백
        const ruleBasedResult = this.recognizeByRules(landmarks);
        if (ruleBasedResult) {
          return ruleBasedResult;
        }
      }
    }

    // WASM이 로드되지 않았거나 실패한 경우 규칙 기반 인식
    const ruleBasedResult = this.recognizeByRules(landmarks);
    if (ruleBasedResult) {
      return ruleBasedResult;
    }

    return {
      gesture: "감지되지 않음",
      confidence: 0.0,
      id: 0,
    };
  }

  dispose(): void {
    if (this.wasmRecognizer) {
      this.wasmRecognizer.dispose();
      this.wasmRecognizer = null;
    }
    this.isModelLoaded = false;
  }
}
