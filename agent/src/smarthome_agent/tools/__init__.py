"""Tool cho LLM — mỗi tool gọi một endpoint /api/mobile/** bằng Bearer token của người đang chat.

Danh sách lệnh sinh từ contracts/datapoints.yaml (hiện là bản tạm). Theo đề xuất §6:
- Chỉ có tool đọc (get_home_overview, list_devices, get_sensor_readings, …),
  ask_clarification và propose_plan.
- KHÔNG tạo tool execute / send_command / confirm / set_risk_level.
"""
