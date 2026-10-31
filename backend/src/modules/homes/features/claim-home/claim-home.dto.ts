// Input của POST /claim (đã validate ở controller): đúng một trong hai — mã gõ tay hoặc nội dung QR.
export interface ClaimInput {
  code?: string;
  qrPayload?: string;
}
