"use client";

import { useState, useEffect } from "react";
import { MLSignRecognizer, HandLandmark } from "../components/ml-sign-recognizer";
import PerformanceComparison from "../components/performance-comparison";
import styles from "./benchmark.module.css";

// 테스트용 더미 랜드마크 데이터 생성
function generateTestLandmarks(count: number = 21): HandLandmark[] {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.random() * 0.5 + 0.25, // 0.25-0.75 범위
    y: Math.random() * 0.5 + 0.25,
    z: Math.random() * 0.1 - 0.05,
  }));
}

// 대용량 랜드마크 데이터 생성 (여러 프레임 시뮬레이션)
function generateLargeDataset(frameCount: number = 50): HandLandmark[] {
  const allLandmarks: HandLandmark[] = [];
  
  for (let frame = 0; frame < frameCount; frame++) {
    const frameLandmarks = generateTestLandmarks(21);
    allLandmarks.push(...frameLandmarks);
  }
  
  return allLandmarks; // frameCount * 21 개의 랜드마크
}

export default function BenchmarkPage() {
  const [recognizer, setRecognizer] = useState<MLSignRecognizer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 더미 성능 데이터
  const [performanceData, setPerformanceData] = useState({
    wasm: { count: 0, avgTime: 0 },
    javascript: { count: 0, avgTime: 0 },
    speedup: 0,
  });

  useEffect(() => {
    const initRecognizer = async () => {
      try {
        setIsLoading(true);
        console.log("🔄 ML 인식기 초기화 중...");
        
        const mlRecognizer = new MLSignRecognizer();
        const success = await mlRecognizer.loadModel();
        
        if (success) {
          setRecognizer(mlRecognizer);
          console.log("✅ ML 인식기 초기화 완료");
          
          // 초기 성능 데이터 설정
          setPerformanceData({
            wasm: { count: 0, avgTime: 0 },
            javascript: { count: 0, avgTime: 0 },
            speedup: 0,
          });
        } else {
          throw new Error("WASM 모델 로드 실패");
        }
      } catch (err) {
        console.error("❌ 인식기 초기화 실패:", err);
        setError(err instanceof Error ? err.message : "알 수 없는 오류");
      } finally {
        setIsLoading(false);
      }
    };

    initRecognizer();

    return () => {
      if (recognizer) {
        recognizer.dispose();
      }
    };
  }, []);


  const handleLargeDataBenchmark = async () => {
    if (!recognizer) {
      throw new Error("인식기가 초기화되지 않았습니다.");
    }

    console.log("🚀 대용량 데이터 벤치마크 시작");
    // 1050개 랜드마크 생성 (50 프레임 * 21 랜드마크)
    const largeDataset = generateLargeDataset(50);
    const result = await recognizer.performLargeDataBenchmark(largeDataset, 10);
    
    // 성능 데이터 업데이트
    setPerformanceData({
      wasm: { count: result.wasm.totalIterations, avgTime: result.wasm.avgTime },
      javascript: { count: result.javascript.totalIterations, avgTime: result.javascript.avgTime },
      speedup: result.speedup,
    });

    return {
      wasm: result.wasm,
      javascript: result.javascript,
      speedup: result.speedup,
    };
  };


  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <h2>🔄 벤치마크 시스템 로딩 중...</h2>
          <p>WASM 모듈을 초기화하고 있습니다.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>❌ 오류 발생</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>🚀 WASM vs JavaScript 성능 벤치마크</h1>
        <p>recognizeWithAdvancedML 함수의 WASM과 JavaScript 구현체 성능 비교</p>
      </header>

      <div className={styles.infoSection}>
        <h2>🔍 테스트 개요</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <h3>WASM 구현체</h3>
            <ul>
              <li>C++로 작성된 recognizeWithAdvancedML</li>
              <li>Emscripten으로 컴파일</li>
              <li>SIMD 최적화 포함</li>
              <li>직접 메모리 관리</li>
            </ul>
          </div>
          <div className={styles.infoCard}>
            <h3>JavaScript 구현체</h3>
            <ul>
              <li>C++ 코드의 완벽한 포팅</li>
              <li>동일한 알고리즘 및 로직</li>
              <li>같은 신경망 구조</li>
              <li>결과 정확성 비교 포함</li>
            </ul>
          </div>
        </div>
      </div>

      <PerformanceComparison
        onLargeDataBenchmarkStart={handleLargeDataBenchmark}
        realTimeData={performanceData}
      />

      <footer className={styles.footer}>
        <p>
          📊 이 벤치마크는 동일한 알고리즘을 WASM과 JavaScript로 구현하여 
          순수한 성능 차이를 측정합니다.
        </p>
      </footer>
    </div>
  );
}