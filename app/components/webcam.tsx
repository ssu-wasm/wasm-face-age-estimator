import { useEffect, useRef } from "react";

export function Webcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function setupCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("카메라를 켜는 중 오류가 났어요:", err);
      }
    }

    setupCamera();

    // 언마운트 시 카메라 정리 (리소스 해제)
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 640,
        aspectRatio: "16 / 9",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid #ccc",
      }}
    >
      <video
        ref={videoRef}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        autoPlay
        playsInline
        muted
      />
    </div>
  );
}
