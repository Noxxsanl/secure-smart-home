# Bộ đánh giá tiếng Việt

Dùng cho mục 3.8 báo cáo. Cơ cấu và ngưỡng theo `docs/proposals/DE_XUAT_AI_AGENT.md` §12.

- `cases.jsonl` — mỗi dòng một câu có nhãn (chưa tạo; mục tiêu ≥ 150 câu).
- `results/` — kết quả chạy, gitignored.

Định dạng một dòng:

```json
{"id": "cmd-001", "group": "lenh_ro_rang", "role": "CONTROLLER", "text": "tat quat phong ngu",
 "expect": {"type": "plan", "steps": [{"device": "Quạt — Phòng ngủ", "command": "RELAY_OFF"}], "risk": "R1"}}
```

`group`: `hoi_dap` · `lenh_ro_rang` · `tinh_huong` · `mo_ho` · `ngoai_kha_nang` · `red_team`.
`expect.type`: `answer` · `plan` · `clarify` · `refuse`.
