import { create } from "qrcode";

type QrMatrix = { size: number; path: string };

// Dựng QR thành path SVG (gộp các ô đen liền nhau trên cùng hàng) — vector nên
// in tem sắc nét, không cần canvas/ảnh. Hàm ở cấp module (không phải component)
// nên try/catch không ảnh hưởng React Compiler.
function buildQr(value: string): QrMatrix | null {
  try {
    const qr = create(value, { errorCorrectionLevel: "M" });
    const size = qr.modules.size;
    const data = qr.modules.data;
    let path = "";
    for (let y = 0; y < size; y++) {
      let x = 0;
      while (x < size) {
        if (!data[y * size + x]) { x++; continue; }
        const start = x;
        while (x < size && data[y * size + x]) x++;
        path += `M${start} ${y}h${x - start}v1h-${x - start}z`;
      }
    }
    return { size, path };
  } catch {
    return null;
  }
}

type QrCodeProps = {
  value: string;
  /** Kích thước hiển thị (px hoặc đơn vị CSS như "32mm"). */
  size?: number | string;
  label?: string;
};

// QR luôn đen trên nền trắng (kể cả dark mode) để máy quét đọc được.
export default function QrCode({ value, size = 176, label = "Mã QR kích hoạt" }: QrCodeProps) {
  const qr = buildQr(value);
  if (!qr) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded border border-dashed border-critical/40 bg-critical-soft p-2 text-center text-xs text-critical"
      >
        Không tạo được QR — dùng mã chữ bên cạnh.
      </div>
    );
  }
  const margin = 2;
  const box = qr.size + margin * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-margin} ${-margin} ${box} ${box}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <rect x={-margin} y={-margin} width={box} height={box} fill="#FFFFFF" />
      <path d={qr.path} fill="#000000" />
    </svg>
  );
}
