"""Gọi LLM, chạy vòng lặp tool (tối đa AGENT_MAX_TOOL_ROUNDS), sinh kế hoạch có cấu trúc.

Planner chỉ *đề xuất* (`propose_plan`); không có đường nào từ đây tới thực thi lệnh.
"""
