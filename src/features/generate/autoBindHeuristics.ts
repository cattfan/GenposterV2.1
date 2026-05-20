// Heuristic chặt cho auto-bind tầng 3 — đoán field từ nội dung staticText với
// các pattern ÍT KHẢ NĂNG false positive (phone, price, hours, url/email).
//
// Tuyệt đối KHÔNG đoán name / address / description / signatureDish vì các
// trường đó không có pattern đặc trưng đủ chặt — designer hay dùng chữ thường
// (ví dụ "Phở 30k Hà Nội") sẽ bị nhận nhầm thành priceRange.
//
// Mỗi helper trả về `bindingPath | null`. Caller (autoBindPlaceholders) chịu
// trách nhiệm gán vào slot khi non-null.

import type { EntityFieldDefinition } from "@/engines/normalize/fieldRegistry";
import { lookupById } from "@/engines/normalize/fieldRegistry";

/**
 * Phone VN: bắt đầu 0/+84/84, theo sau 9-10 chữ số có thể có dấu cách / ./ -
 * giữa các nhóm. Toàn bộ chuỗi phải là phone (không có chữ cái xen kẽ trừ
 * tiền tố hotline / sđt).
 */
const PHONE_PATTERN =
  /^(?:hotline|sdt|s\u0111t|tel|phone)?\s*[:-]?\s*(?:\+?84|0)\s*\d(?:[\s.-]?\d){8,9}\s*$/i;

/**
 * Giá: chứa "đ", "VND", "VNĐ" hoặc dạng "30k", "100K", "1.000.000", "30.000đ".
 * Ngoài ra chấp nhận khoảng giá dạng "100k - 200k".
 *
 * Lưu ý: KHÔNG dùng `\b` sau `đ` (U+0111) vì JS regex word boundary chỉ áp
 * dụng cho ASCII — sẽ false-negative với "100.000đ".
 */
const PRICE_PATTERN =
  /^(?:gi\u00e1|t\u1eeb|kho\u1ea3ng)?\s*[:-]?\s*\d[\d.,\s]*\s*(?:k|K|\u0111|VN\u0110|VND|vnd|vn\u0111)(?:\s*[-\u2013]\s*\d[\d.,\s]*\s*(?:k|K|\u0111|VN\u0110|VND|vnd|vn\u0111)?)?\s*$/i;

/**
 * Giờ mở cửa: dạng "7h", "07h00", "8:30 - 22:00", "08h - 22h", có thể kèm
 * "mở cửa" / "giờ mở cửa".
 */
const HOURS_PATTERN =
  /^(?:gi\u1edd\s*m\u1edf\s*c\u1eeda|m\u1edf\s*c\u1eeda|open|hours)?\s*[:-]?\s*\d{1,2}\s*(?:h|:)\s*\d{0,2}\s*(?:[-\u2013]\s*\d{1,2}\s*(?:h|:)\s*\d{0,2})?\s*$/i;

/**
 * URL hoặc email — không bind vào field cụ thể (registry không có), nhưng để
 * caller skip không nhầm sang `name`/`address`. Trả `null` để skip rõ ràng.
 */
const URL_PATTERN = /^\s*(?:https?:\/\/|www\.)\S+\s*$/i;
const EMAIL_PATTERN = /^\s*[\w.+-]+@[\w-]+\.[\w.-]+\s*$/i;

function field(id: string): EntityFieldDefinition | undefined {
  return lookupById(id);
}

/**
 * Đoán field từ staticText. Chỉ trả non-null cho 3 pattern an toàn cao:
 * phone / priceRange / openingHours. Trả `null` cho mọi trường hợp khác —
 * caller giữ slot không bind.
 *
 * URL/email pattern cũng trả null (không có field tương ứng) NHƯNG hàm vẫn
 * KHÔNG đoán nhầm sang field khác vì chuỗi đã được nhận diện.
 */
export function guessFieldFromStaticText(
  staticText: string | undefined,
): EntityFieldDefinition | null {
  if (!staticText) return null;
  const trimmed = staticText.trim();
  if (!trimmed) return null;
  // Tránh đoán nhầm với placeholder dạng `{{...}}` (đã có tầng 1 xử lý riêng).
  if (/^\{\{.*\}\}$/.test(trimmed)) return null;
  // URL / email: skip rõ ràng để không nhầm sang name/address.
  if (URL_PATTERN.test(trimmed) || EMAIL_PATTERN.test(trimmed)) return null;

  if (PHONE_PATTERN.test(trimmed)) return field("phone") ?? null;
  if (PRICE_PATTERN.test(trimmed)) return field("priceRange") ?? null;
  if (HOURS_PATTERN.test(trimmed)) return field("openingHours") ?? null;
  return null;
}
