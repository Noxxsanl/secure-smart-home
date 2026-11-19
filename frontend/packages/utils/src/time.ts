export function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)     return "Vừa xong";
  if (diff < 3600)   return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}
