import type { Request, Response } from "express";
import { pipeline } from "stream";
import { getAuth } from "../../../../core/auth/auth-context";
import { parseIdParam } from "../../../../shared/validation/validate";
import { openSnapshotImage } from "./get-snapshot-image.handler";

// GET /snapshots/:snapshotId/image (portal: cookie sh_user dùng thẳng trong <img src>; mobile: Bearer)
export async function getSnapshotImageController(req: Request, res: Response): Promise<void> {
  const stream = await openSnapshotImage(getAuth(req), parseIdParam(req.params.snapshotId));
  res.status(200);
  res.setHeader("Content-Type", "image/jpeg");
  // Ảnh không đổi theo id → cache riêng tư 1 ngày; nosniff để trình duyệt không đoán sang kiểu khác
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  pipeline(stream, res, (err) => {
    // Client ngắt giữa chừng là chuyện thường; chỉ ghi tên lỗi, không ghi đường dẫn
    if (err && !res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR" });
  });
}
