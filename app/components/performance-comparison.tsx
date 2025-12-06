"use client";

import { useState } from "react";
import styles from "./performance-comparison.module.css";

interface PerformanceData {
  wasm: { count: number; avgTime: number };
  javascript: { count: number; avgTime: number };
  speedup: number;
}

interface BenchmarkResult {
  wasm: {
    avgTime: number;
    minTime: number;
    maxTime: number;
    totalIterations: number;
  };
  javascript: {
    avgTime: number;
    minTime: number;
    maxTime: number;
    totalIterations: number;
  };
  speedup: number;
}

interface Props {
  onLargeDataBenchmarkStart?: () => Promise<BenchmarkResult>;
  realTimeData: PerformanceData;
}

export default function PerformanceComparison({
  onLargeDataBenchmarkStart,
  realTimeData,
}: Props) {
  const [largeDataResult, setLargeDataResult] =
    useState<BenchmarkResult | null>(null);
  const [isLargeDataRunning, setIsLargeDataRunning] = useState(false);

  const runLargeDataBenchmark = async () => {
    if (!onLargeDataBenchmarkStart) return;

    setIsLargeDataRunning(true);
    try {
      const result = await onLargeDataBenchmarkStart();
      setLargeDataResult(result);
    } catch (error) {
      console.error("대용량 데이터 벤치마킹 오류:", error);
    } finally {
      setIsLargeDataRunning(false);
    }
  };

  const getSpeedupColor = (speedup: number) => {
    if (speedup > 2) return "#4CAF50"; // 녹색 - 매우 빠름
    if (speedup > 1.5) return "#8BC34A"; // 연녹색 - 빠름
    if (speedup > 1) return "#FFC107"; // 노란색 - 약간 빠름
    if (speedup > 0.8) return "#FF9800"; // 주황색 - 약간 느림
    return "#F44336"; // 빨간색 - 느림
  };

  const getPerformanceDescription = (speedup: number) => {
    if (speedup > 2) return "WASM이 매우 빠름";
    if (speedup > 1.5) return "WASM이 빠름";
    if (speedup > 1) return "WASM이 약간 빠름";
    if (speedup > 0.8) return "거의 동일한 성능";
    return "JavaScript가 더 빠름";
  };

  return (
    <div className={styles.container}>
      <h2>성능 비교 대시보드</h2>

      {/* 실시간 성능 데이터 */}
      <div className={styles.realTimeSection}>
        <h3>실시간 성능 데이터</h3>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h4>WASM</h4>
            <p className={styles.statValue}>
              {realTimeData.wasm.avgTime.toFixed(2)}ms
            </p>
            <p className={styles.statLabel}>
              평균 시간 ({realTimeData.wasm.count}회)
            </p>
          </div>

          <div className={styles.statCard}>
            <h4>JavaScript</h4>
            <p className={styles.statValue}>
              {realTimeData.javascript.avgTime.toFixed(2)}ms
            </p>
            <p className={styles.statLabel}>
              평균 시간 ({realTimeData.javascript.count}회)
            </p>
          </div>

          <div className={styles.statCard}>
            <h4>성능 향상</h4>
            <p
              className={styles.statValue}
              style={{ color: getSpeedupColor(realTimeData.speedup) }}
            >
              {realTimeData.speedup.toFixed(2)}x
            </p>
            <p className={styles.statLabel}>
              {getPerformanceDescription(realTimeData.speedup)}
            </p>
          </div>
        </div>
      </div>

      {/* 벤치마크 섹션 */}
      <div className={styles.benchmarkSection}>
        <h3>상세 벤치마크</h3>
        <div className={styles.buttonGroup}>
          {onLargeDataBenchmarkStart && (
            <button
              onClick={runLargeDataBenchmark}
              disabled={isLargeDataRunning}
              className={styles.largeDataButton}
            >
              {isLargeDataRunning
                ? "대용량 테스트 중..."
                : "🚀 1000+ 랜드마크 테스트"}
            </button>
          )}
        </div>

        {/* 대용량 데이터 벤치마크 결과 */}
        {largeDataResult && (
          <div className={styles.largeDataResults}>
            <h4>🚀 대용량 데이터 성능 결과 (1050개 랜드마크)</h4>
            <div className={styles.resultsGrid}>
              <div className={styles.resultSection}>
                <h5>WASM</h5>
                <p>평균: {largeDataResult.wasm.avgTime.toFixed(2)}ms</p>
                <p>최소: {largeDataResult.wasm.minTime.toFixed(2)}ms</p>
                <p>최대: {largeDataResult.wasm.maxTime.toFixed(2)}ms</p>
                <p>반복횟수: {largeDataResult.wasm.totalIterations}</p>
              </div>

              <div className={styles.resultSection}>
                <h5>JavaScript</h5>
                <p>평균: {largeDataResult.javascript.avgTime.toFixed(2)}ms</p>
                <p>최소: {largeDataResult.javascript.minTime.toFixed(2)}ms</p>
                <p>최대: {largeDataResult.javascript.maxTime.toFixed(2)}ms</p>
                <p>반복횟수: {largeDataResult.javascript.totalIterations}</p>
              </div>

              <div className={styles.resultSection}>
                <h5>대용량 데이터 성능 비교</h5>
                <p
                  style={{
                    color: getSpeedupColor(largeDataResult.speedup),
                    fontSize: "1.4em",
                    fontWeight: "bold",
                  }}
                >
                  {largeDataResult.speedup.toFixed(2)}x{" "}
                  {largeDataResult.speedup > 1 ? "빠름" : "느림"}
                </p>
                <p>{getPerformanceDescription(largeDataResult.speedup)}</p>

                {largeDataResult.speedup > 1 ? (
                  <div className={styles.advantage}>
                    <p>🎉 드디어 WASM이 우위를 보였습니다!</p>
                    <p>
                      대용량 데이터에서{" "}
                      {((largeDataResult.speedup - 1) * 100).toFixed(0)}% 성능
                      향상 달성
                    </p>
                  </div>
                ) : (
                  <div className={styles.jsAdvantage}>
                    <p>🤔 여전히 JavaScript가 빠름</p>
                    <p>WASM 호출 오버헤드가 여전히 큰 영향을 미침</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
