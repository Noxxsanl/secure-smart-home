"""Kiểm tra sơ bộ kế hoạch trước khi gửi backend.

Ref tồn tại, lệnh thuộc catalog, evidence_span có thật trong câu, gán mức rủi ro R0–R4
(chỉ nâng, không hạ). Đây chỉ là lớp lọc sớm — backend vẫn kiểm duyệt lại toàn bộ (mục 3.2),
nên không được coi kết quả guard là đủ để thực thi.
"""
