"use client";

import Link from "next/link";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { MUTED_DASH, TABLE_HEAD_ROW, TH, TR } from "@shh/ui";
import type {
  AiHomeUsage, AiModelPrice, AiModelUsage, AiPurposeUsage, AiUsageCall,
} from "@shh/api-client/dashboard";
import { formatDateTime } from "@shh/utils";
import {
  PRICE_SOURCE_LABELS, STATUS_LABELS, formatInt, formatMs, formatPercent, formatPrice, formatTokens, formatUsd,
  purposeLabel,
} from "../model/format";

const TD = "px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300";
const TD_NUM = `${TD} text-right tabular-nums`;
const TH_NUM = `${TH} text-right`;

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto text-left text-sm">{children}</table>
    </div>
  );
}

export function ModelUsageTable({ rows }: { rows: AiModelUsage[] }) {
  return (
    <Table>
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          <th className={TH}>Model</th>
          <th className={TH_NUM}>Lượt gọi</th>
          <th className={TH_NUM}>Lỗi</th>
          <th className={TH_NUM}>Token vào / ra</th>
          <th className={TH_NUM}>TB / p95</th>
          <th className={TH_NUM}>Chi phí</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
        {rows.map((m) => (
          <tr key={`${m.provider}/${m.model}`} className={TR}>
            <td className={TD}>
              <p className="font-mono text-xs text-gray-900 dark:text-slate-100">{m.model}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">{m.provider}</p>
            </td>
            <td className={TD_NUM}>{formatInt(m.calls)}</td>
            <td className={TD_NUM}>{m.calls > 0 ? formatPercent(m.errors / m.calls) : "—"}</td>
            <td className={TD_NUM}>{formatTokens(m.input_tokens)} / {formatTokens(m.output_tokens)}</td>
            <td className={TD_NUM}>{formatMs(m.avg_latency_ms)} / {formatMs(m.p95_latency_ms)}</td>
            <td className={TD_NUM}>
              {formatUsd(m.cost_usd)}
              {m.unpriced_calls > 0 && (
                <p className="text-[11px] text-warning">{formatInt(m.unpriced_calls)} lượt chưa có giá</p>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function PurposeUsageTable({ rows }: { rows: AiPurposeUsage[] }) {
  return (
    <Table>
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          <th className={TH}>Mục đích</th>
          <th className={TH_NUM}>Lượt gọi</th>
          <th className={TH_NUM}>Token</th>
          <th className={TH_NUM}>Độ trễ TB</th>
          <th className={TH_NUM}>Chi phí</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
        {rows.map((p) => (
          <tr key={p.purpose} className={TR}>
            <td className={TD}>{purposeLabel(p.purpose)}</td>
            <td className={TD_NUM}>{formatInt(p.calls)}</td>
            <td className={TD_NUM}>{formatTokens(p.total_tokens)}</td>
            <td className={TD_NUM}>{formatMs(p.avg_latency_ms)}</td>
            <td className={TD_NUM}>{formatUsd(p.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function HomeUsageTable({ rows }: { rows: AiHomeUsage[] }) {
  return (
    <Table>
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          <th className={TH}>Nhà</th>
          <th className={TH_NUM}>Lượt gọi</th>
          <th className={TH_NUM}>Token</th>
          <th className={TH_NUM}>Chi phí</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
        {rows.map((h) => (
          <tr key={h.home_id} className={TR}>
            <td className={TD}>
              {h.home_name
                ? <Link href={`/smart-homes/${h.home_id}`} className="hover:text-brand">{h.home_name}</Link>
                : <span className={MUTED_DASH}>Nhà đã xoá (#{h.home_id})</span>}
            </td>
            <td className={TD_NUM}>{formatInt(h.calls)}</td>
            <td className={TD_NUM}>{formatTokens(h.total_tokens)}</td>
            <td className={TD_NUM}>{formatUsd(h.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const STATUS_CLASS: Record<AiUsageCall["status"], string> = {
  success: "bg-success-soft text-success",
  error: "bg-critical-soft text-critical",
  timeout: "bg-warning-soft text-warning",
};

export function CallsTable({ rows }: { rows: AiUsageCall[] }) {
  return (
    <Table>
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          <th className={TH}>Thời điểm</th>
          <th className={TH}>Model · mục đích</th>
          <th className={TH}>Kết quả</th>
          <th className={TH_NUM}>Token vào (cache) / ra</th>
          <th className={TH_NUM}>Độ trễ</th>
          <th className={TH_NUM}>Chi phí</th>
          <th className={TH}>Nhà</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
        {rows.map((call) => (
          <tr key={call.id} className={TR}>
            <td className={`${TD} whitespace-nowrap text-xs`}>{formatDateTime(call.occurred_at)}</td>
            <td className={TD}>
              <p className="font-mono text-xs text-gray-900 dark:text-slate-100">{call.model}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                {purposeLabel(call.purpose)}
                {call.round_index !== null ? ` · vòng ${call.round_index + 1}` : ""}
              </p>
            </td>
            <td className={TD}>
              <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[call.status]}`}>
                {STATUS_LABELS[call.status]}
              </span>
              {call.error_code && <p className="mt-0.5 font-mono text-[11px] text-gray-400 dark:text-slate-500">{call.error_code}</p>}
            </td>
            <td className={TD_NUM}>
              {call.audio_seconds !== null && call.input_tokens === 0
                ? `${call.audio_seconds.toLocaleString("vi-VN")} giây âm thanh`
                : <>
                    {formatTokens(call.input_tokens)}
                    {call.cached_input_tokens > 0 && <span className="text-gray-400 dark:text-slate-500"> ({formatTokens(call.cached_input_tokens)})</span>}
                    {" / "}{formatTokens(call.output_tokens)}
                  </>}
            </td>
            <td className={TD_NUM}>
              {formatMs(call.latency_ms)}
              {call.ttft_ms !== null && <p className="text-[11px] text-gray-400 dark:text-slate-500">token đầu {formatMs(call.ttft_ms)}</p>}
            </td>
            <td className={TD_NUM}>{call.cost_usd === null ? <span className="text-xs text-warning">chưa có giá</span> : formatUsd(call.cost_usd)}</td>
            <td className={TD}>{call.home_name ?? (call.home_id ? `#${call.home_id}` : <span className={MUTED_DASH}>—</span>)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

type PriceTableProps = {
  rows: AiModelPrice[];
  canEdit: boolean;
  onEdit: (price: AiModelPrice) => void;
  onDelete: (price: AiModelPrice) => void;
};

export function PriceTable({ rows, canEdit, onEdit, onDelete }: PriceTableProps) {
  return (
    <Table>
      <thead>
        <tr className={TABLE_HEAD_ROW}>
          <th className={TH}>Model</th>
          <th className={TH_NUM}>Vào</th>
          <th className={TH_NUM}>Đọc cache</th>
          <th className={TH_NUM}>Ghi cache</th>
          <th className={TH_NUM}>Ra</th>
          <th className={TH_NUM}>STT / phút</th>
          <th className={TH}>Nguồn</th>
          <th className={TH_NUM}>Lượt 30 ngày</th>
          {canEdit && <th className={TH} />}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
        {rows.map((p) => (
          <tr key={p.id} className={TR}>
            <td className={TD}>
              <p className="font-mono text-xs text-gray-900 dark:text-slate-100">{p.model}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">{p.provider}</p>
            </td>
            <td className={TD_NUM}>{formatPrice(p.input_usd_per_mtok)}</td>
            <td className={TD_NUM}>{formatPrice(p.cached_input_usd_per_mtok)}</td>
            <td className={TD_NUM}>{formatPrice(p.cache_write_usd_per_mtok)}</td>
            <td className={TD_NUM}>{formatPrice(p.output_usd_per_mtok)}</td>
            <td className={TD_NUM}>{formatPrice(p.audio_usd_per_minute)}</td>
            <td className={`${TD} text-xs`}>
              {p.source_url
                ? <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand">
                    {PRICE_SOURCE_LABELS[p.source]} <ExternalLink className="h-3 w-3" />
                  </a>
                : PRICE_SOURCE_LABELS[p.source]}
              {p.checked_at && <p className="text-[11px] text-gray-400 dark:text-slate-500">tra {formatDateTime(p.checked_at)}</p>}
            </td>
            <td className={TD_NUM}>{formatInt(p.calls_30d)}</td>
            {canEdit && (
              <td className={`${TD} whitespace-nowrap`}>
                <button type="button" onClick={() => onEdit(p)} aria-label={`Sửa giá ${p.model}`} className="mr-2 text-gray-400 hover:text-brand">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onDelete(p)} aria-label={`Xoá giá ${p.model}`} className="text-gray-400 hover:text-critical">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
