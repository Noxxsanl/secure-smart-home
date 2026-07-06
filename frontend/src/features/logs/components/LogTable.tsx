import type { LogEntry } from "@/features/logs/types";

type LogTableProps = {
  logs: LogEntry[];
};

const levelStyles: Record<LogEntry["level"], string> = {
  INFO:     "bg-blue-50 text-blue-700",
  WARNING:  "bg-amber-50 text-amber-700",
  ERROR:    "bg-red-50 text-red-700",
  SECURITY: "bg-violet-50 text-violet-700",
};

export default function LogTable({ logs }: LogTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-sm">
      <div className="border-b border-[#E5EAF0] px-6 py-4 text-sm text-gray-500">System events log</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Time</th>
              <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Device ID</th>
              <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Event</th>
              <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Level</th>
              <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-gray-100 transition hover:bg-gray-50">
                <td className="px-4 py-4 text-gray-600">{log.timestamp}</td>
                <td className="px-4 py-4 text-gray-600">{log.deviceId}</td>
                <td className="px-4 py-4 text-gray-600">{log.event}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${levelStyles[log.level]}`}>
                    {log.level}
                  </span>
                </td>
                <td className="px-4 py-4 text-gray-500">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
