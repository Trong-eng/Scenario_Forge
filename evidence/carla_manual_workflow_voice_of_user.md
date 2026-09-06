# Voice of user — pain point khi làm CARLA thủ công

Ngày thu thập: 05-09-2026. Registry gồm 4 GitHub issue công khai liên quan CARLA/ScenarioRunner. Đây là các trải nghiệm tự báo cáo của từng người dùng, không phải khảo sát tỷ lệ người dùng. Toàn bộ được giữ ở tier **C**; không được suy ra “đa số kỹ sư CARLA đều gặp vấn đề này”. Refinery build digest: `92f5989fe6ccd84a`.

## Hai quote dùng được cho slide pain point

1. Một issue trong repo chính thức CARLA ScenarioRunner mô tả việc tạo OpenSCENARIO là “frustrating and time-consuming”; người dùng viết rằng chỉnh `.xosc` thủ công là “time-intensive and prone to errors.” Đây là evidence gần nhất với Scenario Forge. [Issue #1135](https://github.com/carla-simulator/scenario_runner/issues/1135)

2. Một người dùng CARLA viết về việc thêm nhiều vehicle/autopilot: cách làm bằng Python API thủ công “is time consuming.” [Issue #1995](https://github.com/carla-simulator/carla/issues/1995)

**Câu dùng trong deck:**

> Public CARLA users describe manual OpenSCENARIO editing as time-intensive and error-prone, and manual Python-API vehicle setup as time-consuming. Scenario Forge turns that specification step into a catalog-grounded, reviewable workflow.

Đừng nói đây là kết quả survey hoặc một số giờ trung bình. Đây là qualitative evidence về friction khi author scenario.

## Registry đã lọc

| Nguồn voice | Pain point tự báo cáo | Mức liên quan đến Scenario Forge | Có dùng làm claim sản phẩm? |
|---|---|---|---|
| [ScenarioRunner #1135](https://github.com/carla-simulator/scenario_runner/issues/1135) | Tạo custom OpenSCENARIO bị mô tả là clunky, unintuitive, buggy; chỉnh `.xosc` tay tốn thời gian và dễ lỗi. | **Trực tiếp.** Đây là công đoạn intent → scenario mà Scenario Forge nhắm tới. | Có, cho pain point authoring. |
| [CARLA #1995](https://github.com/carla-simulator/carla/issues/1995) | Thêm vehicle/autopilot qua Python API thủ công bị xem là tốn thời gian. | **Một phần.** Catalog actor/behavior và IR có thể giảm phần specification, nhưng chưa chứng minh cover toàn bộ workflow. | Có, nhưng chỉ cho actor/behavior setup. |
| [CARLA #9827](https://github.com/carla-simulator/carla/issues/9827) | Với map 6 km, đặt streetlight từng cái một bị mô tả là tedious và time-consuming. | **Ngoài phạm vi.** Đây là Unreal asset/world authoring. | Không dùng để claim Scenario Forge giải quyết. |
| [CARLA #9165](https://github.com/carla-simulator/carla/issues/9165) | Sửa Digital Twin map để thêm bridge/overpass thủ công bị mô tả là time-consuming và error-prone. | **Ngoài phạm vi.** Đây là map-generation/geometry repair. | Không dùng để claim Scenario Forge giải quyết. |

## Story an toàn cho Scenario Forge

**Pain:** Người dùng phải diễn đạt intent thành `.xosc` hoặc Python API; chính họ mô tả quy trình này tốn thời gian, khó dùng và dễ lỗi.

**Solution:** Scenario Forge tiếp nhận brief tiếng Việt, chỉ dùng token đã có trong catalog, từ chối khi không chắc, rồi bắt reviewer ký vào manifest hash trước khi chạy CARLA.

**Value cần đo tiếp:** thời gian từ brief đến scenario được duyệt và chạy được; số lần sửa tay; first-pass runnable rate; reviewer fidelity với brief. Public complaint chỉ chứng minh pain định tính, không chứng minh hiệu quả định lượng của Scenario Forge.

## Không dùng các quote ngoài phạm vi

Map, road geometry và Unreal asset placement là pain point thật của CARLA, nhưng Scenario Forge hiện không tạo/sửa map hay asset. Giữ chúng trong registry giúp team tránh overclaim thay vì dùng mọi lời phàn nàn để làm slide đẹp.

## Traceability

Registry giao kèm: [domain.yaml](./carla_manual_workflow_pain_refinery/domain.yaml), [claims.jsonl](./carla_manual_workflow_pain_refinery/claims.jsonl), và 4 raw GitHub API snapshots. Mỗi quote đã được kiểm chứng tồn tại nguyên văn trong snapshot; build/audit và bite suite đều pass.
