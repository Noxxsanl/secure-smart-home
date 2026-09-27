import { notFound } from "next/navigation";
import LogCategoryPage from "@smarthome/console/logs/pages/LogCategoryPage";
import { logCategoriesFor } from "@smarthome/console/logs/config";

// Chặn ở server: loại log ngoài phạm vi role của app trả HTTP 404 ngay,
// không phụ thuộc kiểm tra phía client trong LogCategoryPage.
export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!logCategoriesFor("operator").some((c) => c.category === category)) notFound();
  return <LogCategoryPage />;
}
