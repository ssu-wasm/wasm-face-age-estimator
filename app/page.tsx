"use client";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

interface WasmModule {
  add: (a: number, b: number) => number;
}

export default function Home() {
  const [wasmModule, setWasmModule] = useState<WasmModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWasm = async () => {
      try {
        const CreateMyModule = (await import("../wasm/my_module.js")).default;
        const wasmInstance = await CreateMyModule({
          locateFile: (path: string) => {
            // WASM 파일 경로를 올바르게 지정
            if (path.endsWith(".wasm")) {
              return `/wasm/${path}`;
            }
            return path;
          },
        });

        setWasmModule(wasmInstance as WasmModule);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    };

    loadWasm();
  }, []);

  const testWasmFunction = () => {
    if (wasmModule && wasmModule.add) {
      const result = wasmModule.add(5, 3);
      console.log("WASM add(5, 3) =", result);
      alert(`WASM add(5, 3) = ${result}`);
    } else {
      console.log("WASM module or add function not available");
    }
  };

  return (
    <div className={styles.page}>
      <h1>WASM Face Age Estimator</h1>

      {loading && <p>Loading WASM module...</p>}

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {wasmModule && (
        <div>
          <p style={{ color: "green" }}>WASM module loaded successfully!</p>
          <button onClick={testWasmFunction}>Test WASM Function</button>

          <div style={{ marginTop: "20px" }}>
            <h3>Available functions:</h3>
            <pre>{JSON.stringify(Object.keys(wasmModule), null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
