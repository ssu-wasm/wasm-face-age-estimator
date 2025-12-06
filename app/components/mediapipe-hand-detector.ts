/**
 * MediaPipe Hands Wrapper (동적 설정 변경 지원)
 */
import { Hands, Results } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandDetectionResult {
  landmarks: HandLandmark[];            
  multiHandLandmarks: HandLandmark[][]; 
  multiHandedness: any[];               
}

export class MediaPipeHandDetector {
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private isInitialized = false;
  private currentResolve: ((result: HandDetectionResult | null) => void) | null = null;

  async initialize(): Promise<boolean> {
    try {
      const { Hands } = await import("@mediapipe/hands");
      
      this.hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        },
      });

      // 기본값은 1개로 시작 (나중에 모드에 따라 바뀜)
      this.hands.setOptions({
        maxNumHands: 1, 
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.hands.onResults(this.handleResults);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("MediaPipe 초기화 실패:", error);
      return false;
    }
  }

  // [추가] 외부에서 손 개수를 동적으로 변경하는 함수
  public updateMaxHands(numHands: number) {
    if (this.hands) {
      this.hands.setOptions({
        maxNumHands: numHands,
        // 두 손일 때는 겹침 방지를 위해 민감도를 낮추고, 한 손일 때는 높임
        minDetectionConfidence: numHands === 2 ? 0.3 : 0.5,
        minTrackingConfidence: numHands === 2 ? 0.3 : 0.5,
      });
      console.log(`🙌 MediaPipe 설정 변경: 손 개수 -> ${numHands}개`);
    }
  }

  private handleResults = (results: Results) => {
    if (!this.currentResolve) return;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      this.currentResolve({
        landmarks: results.multiHandLandmarks[0],       
        multiHandLandmarks: results.multiHandLandmarks, 
        multiHandedness: results.multiHandedness        
      });
    } else {
      this.currentResolve(null);
    }
    this.currentResolve = null;
  }

  detect(video: HTMLVideoElement): Promise<HandDetectionResult | null> {
    return new Promise((resolve) => {
      if (!this.hands || !this.isInitialized) {
        resolve(null);
        return;
      }
      if (this.currentResolve) this.currentResolve(null);
      this.currentResolve = resolve;

      this.hands.send({ image: video }).catch(err => {
          console.error("MediaPipe Send Error:", err);
          resolve(null);
      });
    });
  }

  dispose() {
    this.hands?.close();
    this.camera?.stop();
    this.isInitialized = false;
    this.currentResolve = null;
  }
}