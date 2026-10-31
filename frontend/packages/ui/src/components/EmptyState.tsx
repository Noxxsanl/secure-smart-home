type EmptyStateProps = {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

// Extracted from the repeated "gray icon + text + optional action" block
// duplicated across DevicesPage/UsersPage/AuditLogTable.
export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="mb-3 h-9 w-9 text-gray-200 dark:text-slate-700" />
      <p className="text-sm font-medium text-gray-400 dark:text-slate-500">{title}</p>
      {description && (
        <p className="mt-0.5 text-xs text-gray-300 dark:text-slate-600">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
