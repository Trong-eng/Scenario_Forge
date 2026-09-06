# NHTSA 24 — Rear-End/Lead Vehicle Stopped (LVS)

## Tên NHTSA gốc và tên tiếng Việt

- **Tên NHTSA gốc:** Rear-End/Lead Vehicle Stopped (LVS)
- **Tên tiếng Việt:** Đuôi xe/Xe dẫn đầu dừng

## Định nghĩa DOT HS 812 745

Một xe áp sát một xe dẫn đầu đang dừng ở phía trước trong cùng làn.

Đây là bản diễn đạt tiếng Việt trung thành với định nghĩa của NHTSA trong DOT HS 812 745, report p. 8 / PDF p. 20. Các ví dụ và ranh giới ở đây không mở rộng định nghĩa nguồn.

## Các thành phần của lớp

- **Phương tiện chủ thể:** `ego` — phương tiện thực hiện hành động tới hạn trong bộ case của lớp.
- **Đối tượng/phương tiện đối ứng:** một xe dẫn đầu phía trước trong cùng làn.
- **Chuyển động trước sự kiện:** `closing in on a stopped lead vehicle`.
- **Sự kiện tới hạn:** `closing in on the stopped vehicle ahead in the same lane`.
- **Loại tai nạn:** `rear-end lead-vehicle-stopped conflict`.

Trong biểu diễn oracle hiện tại, thao tác chính là `close_in_on_stopped_lead_vehicle`; môi trường là `location=straight_road`, `weather=clear`, `road_surface=dry`, `time_of_day=daytime`, `visibility=clear`; ràng buộc là `map=Town04`, `speed=10 m/s`, `duration=5 s`. Đây là ngữ nghĩa của ba record hiện có, không phải yêu cầu bổ sung cho định nghĩa NHTSA.

## Phân biệt với các lớp gần kề

LVS yêu cầu xe dẫn đầu đã dừng trong cùng làn. Đây là khác biệt quyết định với LVA/LVM/LVD, trong đó xe dẫn đầu vẫn đang chuyển động.

## Biểu diễn hiện tại của Scenario Forge

Pipeline đóng hiện tại giữ đúng ngữ nghĩa của từng lens, nhưng chưa có compiler family cho lớp này (`expected_family=null`).

| Biểu diễn | Ngôn ngữ | Kết quả kỳ vọng | Điểm quyết định | Chi tiết |
|---|---|---|---|---|
| `canonical` | `vi` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | `family=null`; `UNSUPPORTED_STRUCTURED_SEMANTICS` |
| `paraphrase` | `en` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | Cùng semantic fingerprint với canonical; `family=null` |
| `incomplete` | `vi` | `CLARIFICATION_REQUIRED` | `clarification` | thiếu `weather`; `MISSING_REQUIRED_FIELD` |

- **`semantic_missing`:** chỉ xuất hiện ở record `incomplete`; trường chặn được phân bổ cho lớp này là `weather`. Vì thiếu đúng trường đó, pipeline phải hỏi làm rõ và không được tự điền.
- **`semantic_unsupported`:** `canonical` và `paraphrase` đều kỳ vọng `EXPECTED_UNSUPPORTED` với `UNSUPPORTED_STRUCTURED_SEMANTICS`; compiler đóng hiện tại không gán family cho ngữ nghĩa NHTSA này.
- **Biên pre-Scenic:** các record chỉ dừng ở diễn giải/làm rõ/compiler đóng; không được gọi `build`, `scenic`, `run` hoặc `carla`. Record `incomplete` còn cấm `ground` và `semantic_compiler` trước khi làm rõ.

## Ba case của lớp

- `canonical`: `nhtsa-24-rear_end_lead_vehicle_stopped-canonical`
- `paraphrase`: `nhtsa-24-rear_end_lead_vehicle_stopped-paraphrase`
- `incomplete`: `nhtsa-24-rear_end_lead_vehicle_stopped-incomplete`

## Provenance và trạng thái review

- **Report:** `DOT HS 812 745`, report p. `8` / PDF p. `20`
- **Source hash:** `sha256:3138095486cd8dda2f3fa2d443972e2ffd0c45129370afd6852d833d5e69ed59`
- **`taxonomy_review`:** `approved`
- **`compiler_review`:** `approved`
