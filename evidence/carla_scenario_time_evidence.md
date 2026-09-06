# Evidence registry — thời gian tạo/chạy kịch bản CARLA và AV simulation

Ngày thu thập: 05-09-2026. Đây là shortlist gồm 6 nguồn công khai; không phải tổng quan hệ thống toàn bộ nghiên cứu. Mỗi claim được lưu kèm bản chụp nguồn và đã qua Refinery: `build digest 41db2cd28b9047da`, build lặp lại nhất quán, auditor pass, và bộ kiểm tra cố ý làm sai đều bị chặn.

## Bằng chứng dùng được ngay trong slide

| Mức dùng | Bằng chứng | Diễn giải đúng |
|---|---|---|
| **Dùng làm số headline** | Một technical paper được kiểm chứng trên **CARLA** báo tạo scenario file theo phương pháp truyền thống mất **600–1.500 giây**; phương pháp của bài báo là **3–4 giây**. | Đây là benchmark **tạo scenario file**, tương đương 10–25 phút xuống 3–4 giây (giảm khoảng 99,3–99,8% ở bước đó). Không được diễn đạt thành “tiết kiệm 10–25 phút công kỹ sư end-to-end”. [Nguồn SAE](https://saemobilus.sae.org/papers/automating-concrete-simulation-scenario-generation-autonomous-driving-large-language-models-2025-01-7318) |
| **Dùng giải thích pain point CARLA** | Báo cáo kỹ thuật ScenarioGen mô tả: một safety engineer có thể cần khoảng **200 dòng Python** và nhiều vòng trial-and-error để biến mô tả 2 câu thành scenario CARLA; hệ thống của họ nói “hours” sang “seconds”. | Có liên quan trực tiếp đến CARLA nhưng không công bố protocol đo giờ/phút; chỉ dùng để diễn giải friction, không dùng làm con số hiệu quả sản phẩm. [Nguồn Buffalo](https://cse.buffalo.edu/tech-reports/2026-22.pdf) |
| **Dùng làm bối cảnh chi phí test vật lý** | Một nghiên cứu track test ghi nhận **8 người × 4 giờ** để setup/calibrate, rồi khoảng 25 lượt chạy, mỗi lượt **10–15 phút**. | Là test vật lý, không phải CARLA. Dùng ở slide “tại sao mô phỏng và iteration nhanh quan trọng”, không dùng làm baseline cho Scenario Forge. [Nguồn nghiên cứu](https://escholarship.org/content/qt6z29g6tn/qt6z29g6tn_noSplash_869e592e8768321bc4963dd21bf93b9b.pdf) |
| **Dùng làm bối cảnh dựng môi trường** | Nghiên cứu driving simulator ước lượng dựng môi trường thủ công >**138 giờ/km**, so với **15 giờ/km** khi dùng IFC-RoadBIM. | Không phải CARLA và là ước lượng từ kinh nghiệm nhóm nghiên cứu. Phù hợp cho map/environment conversion, không cho prompt-to-scenario. [Nguồn MDPI](https://www.mdpi.com/2071-1050/13/4/2039) |

Hai nguồn CARLA độc lập cũng xác nhận pain point định tính: “manual scenario creation is time consuming” trong CARLA, và việc sinh safety-relevant scenario “expensive and time-consuming” ngay cả trong simulation. [Ferree 2021](https://commons.erau.edu/edt/591/), [Nalic et al. 2020](https://arxiv.org/abs/2011.06553)

## Câu chữ đề xuất cho deck

> **Evidence from a CARLA benchmark:** traditional concrete scenario-file generation took 600–1,500 s; an automated method reported 3–4 s. Our product claim will be measured separately on our own scenario set.

Điều này tách rõ benchmark ngoài thị trường khỏi kết quả của Scenario Forge. Tránh ghi “engineers normally spend 10–25 minutes” vì bài báo không đo toàn bộ thời gian làm việc của kỹ sư.

## Registry đã lọc

| Nguồn | Nền tảng/bối cảnh | Công đoạn | Quan sát thời gian | Mức bằng chứng | Phạm vi |
|---|---|---|---|---|---|
| Li & Wang 2025 | CARLA | Tạo scenario file đúng chuẩn simulator | 600–1.500 s truyền thống; 3–4 s phương pháp bài báo | A — benchmark trực tiếp | File generation, không phải full engineering cycle |
| ScenarioGen 2026 | CARLA | Natural language → runnable episode | “hours” → “seconds” | B — mô tả định tính | Không có protocol/đo thời gian công bố |
| Ferree 2021 | CARLA | Tạo scenario thủ công | “time consuming” | B — định tính | So với sinh scenario tự động |
| Nalic et al. 2020 | IPG CarMaker + PTV Vissim | Sinh safety-relevant scenario | “expensive and time-consuming” | A — định tính | Không phải CARLA |
| Driving-simulator BIM 2021 | Driving simulator | Dựng môi trường | >138 h/km thủ công; 15 h/km IFC-RoadBIM | A — ước lượng so sánh | Environment build, không phải prompt-to-scenario |
| Formal Scenario-Based Testing | Track test | Setup, calibration và chạy test | 8 người × 4h setup; 10–15 min/run | A — quan sát trực tiếp | Test vật lý, không phải CARLA |

## Evidence còn thiếu và cách eval Scenario Forge

Chưa có nguồn công khai trong shortlist đo đúng đơn vị mà deck cần nhất: **thời gian của kỹ sư từ brief tự nhiên đến một CARLA scenario đã chạy được, được review, và đạt đúng intent**. Vì thế con số “Scenario Forge giảm X%” phải lấy từ evaluation nội bộ.

Protocol gọn để tạo evidence riêng cho slide evaluation:

1. Chọn 8–12 brief đại diện: pedestrian crossing, cut-in, sudden brake, red-light runner, weather/visibility và multi-agent.
2. Cho cùng kỹ sư làm mỗi brief theo baseline hiện tại và Scenario Forge, đảo thứ tự để giảm learning effect.
3. Đo từ lúc nhận brief đến episode chạy pass validation; ghi thêm số lần sửa tay, first-pass runnable rate và điểm reviewer về fidelity với brief.
4. Báo cáo median và khoảng min–max theo từng công đoạn. Claim sản phẩm chỉ dùng số này.

## Traceability

Registry giao kèm có [domain.yaml](./carla_scenario_time_refinery/domain.yaml), [claims.jsonl](./carla_scenario_time_refinery/claims.jsonl) và sáu snapshot nguồn. Mỗi evidence span trong bảng đều được máy kiểm tra là xuất hiện nguyên văn trong snapshot nguồn; các trường suy luận chỉ là phân loại phạm vi, không phải số liệu trích dẫn.
