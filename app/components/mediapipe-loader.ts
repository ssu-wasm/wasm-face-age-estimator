/**
 * MediaPipe 모듈을 dynamic import로 로드하는 헬퍼 함수
 * Next.js에서 @mediapipe 패키지의 UMD 방식 문제를 해결하기 위함
 */

export const loadHandsModule = async () => {
  if (typeof window !== "undefined") {
    const { Hands } = await import("@mediapipe/hands");
    return { Hands };
  }
  return null;
};

