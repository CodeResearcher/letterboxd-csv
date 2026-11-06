import type { IScannerControls } from "@zxing/browser";
import type { DecodeHintType } from "@zxing/library";

/**
 * Camera barcode scanning.
 *
 * A single JavaScript decoder (ZXing) is used on both iOS and Android, so the
 * app does not depend on the native `BarcodeDetector` API, which iOS Safari
 * does not implement. To change engines later (for example to the faster WASM
 * `barcode-detector` ponyfill), implement `ScannerEngine` and swap the factory
 * at the bottom of this file; nothing in the UI imports ZXing directly.
 *
 * ZXing is ~350 kB minified, so it is imported dynamically the first time the
 * camera starts. That keeps the initial page load small on phones.
 */

export interface ScanHit {
  /** Raw decoded text, which is the barcode digits. */
  text: string;
  format: string;
}

export interface ScannerEngine {
  /**
   * Start decoding from `video`, calling `onHit` for every decode. Returns a
   * stop function that also releases camera tracks.
   */
  start(video: HTMLVideoElement, onHit: (hit: ScanHit) => void): Promise<() => void>;
}

/**
 * ZXing engine. Decoding is throttled so low-end Android phones are not pinned
 * at 60 fps of image work.
 */
export function createZxingEngine(frameIntervalMs = 100): ScannerEngine {
  return {
    async start(video, onHit) {
      const zxing = await import("@zxing/browser");
      const library = await import("@zxing/library");
      const { BarcodeFormat, BrowserMultiFormatReader } = zxing;
      const { DecodeHintType } = library;
      const hints = new Map<DecodeHintType, unknown>([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.UPC_E],
        ],
        // Try harder: disc barcodes are thin and often shot at an angle.
        [DecodeHintType.TRY_HARDER, true],
      ]);

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: frameIntervalMs,
      });

      let controls: IScannerControls | null = null;
      controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            // Thin disc barcodes need resolution more than frame rate.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        video,
        (result) => {
          if (!result) return;
          onHit({
            text: result.getText(),
            format: BarcodeFormat[result.getBarcodeFormat()] ?? "unknown",
          });
        },
      );

      return () => {
        controls?.stop();
        const stream = video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      };
    },
  };
}

/** Whether the device exposes a torch on the active camera track. */
export function hasTorch(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities) return false;
  // `torch` is still non-standard, so it is missing from the DOM typings.
  const capabilities = track.getCapabilities() as { torch?: boolean };
  return Boolean(capabilities.torch);
}

export async function setTorch(stream: MediaStream, on: boolean): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] } as unknown as MediaTrackConstraints);
  } catch {
    // Not supported or the camera refused: the toggle simply does nothing.
  }
}