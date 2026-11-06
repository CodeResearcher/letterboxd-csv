import { useCallback, useEffect, useRef, useState } from "react";
import { createZxingEngine, hasTorch, setTorch, type ScannerEngine } from "../services/scanner";

type CameraState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running" }
  | { kind: "error"; message: string; canRetry: boolean };

export interface ScannerProps {
  onScan: (barcode: string) => void;
  /** Scanning pauses while a confirmation is on screen. */
  paused: boolean;
}

/**
 * Live camera scanner.
 *
 * Decoding is done in JavaScript by ZXing on both iOS and Android, so there is
 * no dependency on the native BarcodeDetector API (absent on iOS Safari). A hit
 * must repeat on consecutive decodes before it is accepted, which filters the
 * partial reads that thin disc barcodes produce.
 */
export function Scanner({ onScan, paused }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastHitRef = useRef<{ text: string; count: number }>({ text: "", count: 0 });
  const lastAcceptedRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  // Read inside the decode callback, which is created once per camera start.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const [camera, setCamera] = useState<CameraState>({ kind: "idle" });
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const engineRef = useRef<ScannerEngine>(createZxingEngine());

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    streamRef.current = null;
    setTorchOn(false);
    setCamera({ kind: "idle" });
  }, []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setCamera({ kind: "starting" });
    lastHitRef.current = { text: "", count: 0 };

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera({
          kind: "error",
          message: "This browser does not expose a camera API.",
          canRetry: false,
        });
        return;
      }

      const stopFn = await engineRef.current.start(video, (hit) => {
        // Stay quiet while a confirmation is on screen.
        if (pausedRef.current) return;
        const text = hit.text;
        const last = lastHitRef.current;
        // Accept only when the same code is decoded twice in a row.
        const count = last.text === text ? last.count + 1 : 1;
        lastHitRef.current = { text, count };
        if (count < 2) return;

        const now = Date.now();
        const accepted = lastAcceptedRef.current;
        if (accepted.text === text && now - accepted.at < 2500) return;
        lastAcceptedRef.current = { text, at: now };
        lastHitRef.current = { text: "", count: 0 };

        if (navigator.vibrate) navigator.vibrate(35);
        onScanRef.current(text);
      });

      stopRef.current = stopFn;
      const stream = video.srcObject as MediaStream | null;
      streamRef.current = stream;
      setTorchAvailable(stream ? hasTorch(stream) : false);
      setCamera({ kind: "running" });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      const message =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera access was denied. Allow the camera for this site in your browser settings, then try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No usable camera was found on this device."
            : name === "NotReadableError"
              ? "The camera is in use by another app. Close it and try again."
              : "The camera could not be started.";
      setCamera({ kind: "error", message, canRetry: true });
    }
  }, []);

  // Release the camera when the component goes away or the user leaves the tab.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && stopRef.current) {
        stopRef.current();
        stopRef.current = null;
        streamRef.current = null;
        setCamera({ kind: "idle" });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !torchOn;
    setTorchOn(next);
    await setTorch(stream, next);
  }, [torchOn]);

  return (
    <div className="stack">
      <div className="scanner">
        <video ref={videoRef} playsInline muted autoPlay />
        {camera.kind === "running" && <div className="reticle" aria-hidden />}

        {camera.kind !== "running" && (
          <div className="scanner-empty">
            {camera.kind === "starting" ? (
              <>
                <div className="spinner" />
                <p>Starting the camera…</p>
              </>
            ) : camera.kind === "error" ? (
              <>
                <p>{camera.message}</p>
                {camera.canRetry && (
                  <button type="button" className="btn small" onClick={() => void start()}>
                    Try again
                  </button>
                )}
              </>
            ) : (
              <>
                <p>Point the camera at the barcode on the back of the case.</p>
                <button type="button" className="btn primary" onClick={() => void start()}>
                  Start camera
                </button>
              </>
            )}
          </div>
        )}

        {camera.kind === "running" && (
          <div className="scanner-overlay">
            <span className="pill">Scanning</span>
            {torchAvailable && (
              <button
                type="button"
                className="torch"
                aria-pressed={torchOn}
                aria-label="Toggle flashlight"
                onClick={() => void toggleTorch()}
              >
                ☀
              </button>
            )}
          </div>
        )}
      </div>

      {camera.kind === "running" ? (
        <div className="row between">
          <span className="scanner-tip grow">
            Fill the frame with the barcode. Hold steady for a moment.
          </span>
          <button type="button" className="btn small ghost" onClick={stop}>
            Stop camera
          </button>
        </div>
      ) : (
        !navigator.mediaDevices?.getUserMedia && (
          <p className="scanner-tip">
            Camera scanning needs HTTPS. On a plain HTTP address, add a barcode by hand below.
          </p>
        )
      )}
    </div>
  );
}