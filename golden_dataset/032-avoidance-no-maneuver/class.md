# NHTSA 32 — Avoidance/No Maneuver

## Tên NHTSA gốc và tên tiếng Việt

- **Tên NHTSA gốc:** Avoidance/No Maneuver
- **Tên tiếng Việt:** Tránh né/Không có thao tác

## Định nghĩa DOT HS 812 745

Một xe cố thực hiện thao tác để tránh một vật gì đó khi đang đi thẳng hoặc đang đi qua một đoạn cua.

Đây là bản diễn đạt tiếng Việt trung thành với định nghĩa của NHTSA trong DOT HS 812 745, report p. 8 / PDF p. 20. Các ví dụ và ranh giới ở đây không mở rộng định nghĩa nguồn.

## Các thành phần của lớp

- **Phương tiện chủ thể:** `ego` — phương tiện thực hiện hành động tới hạn trong bộ case của lớp.
- **Đối tượng/phương tiện đối ứng:** Không có phương tiện/đối tượng đối ứng trong oracle của lớp.
- **Chuyển động trước sự kiện:** `driving straight or negotiating a curve`.
- **Sự kiện tới hạn:** `attempted maneuver to avoid something`.
- **Loại tai nạn:** `avoidance maneuver without a prior vehicle maneuver`.

Trong biểu diễn oracle hiện tại, thao tác chính là `avoid_something_while_driving_straight`; môi trường là `location=straight_road`, `weather=clear`, `road_surface=dry`, `time_of_day=daytime`, `visibility=clear`; ràng buộc là `map=Town05`, `speed=12 m/s`. Đây là ngữ nghĩa của ba record hiện có, không phải yêu cầu bổ sung cho định nghĩa NHTSA.

## Phân biệt với các lớp gần kề

Khác với lớp 031, hành động tránh ở đây xảy ra khi xe đang đi thẳng hoặc qua cua, không có thao tác xe trước đó. Vật cần tránh vẫn là sự kiện trung tâm.

## Biểu diễn hiện tại của Scenario Forge

Pipeline đóng hiện tại giữ đúng ngữ nghĩa của từng lens, nhưng chưa có compiler family cho lớp này (`expected_family=null`).

| Biểu diễn | Ngôn ngữ | Kết quả kỳ vọng | Điểm quyết định | Chi tiết |
|---|---|---|---|---|
| `canonical` | `vi` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | `family=null`; `UNSUPPORTED_STRUCTURED_SEMANTICS` |
| `paraphrase` | `en` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | Cùng semantic fingerprint với canonical; `family=null` |
| `incomplete` | `vi` | `CLARIFICATION_REQUIRED` | `clarification` | thiếu `map`; `MISSING_REQUIRED_FIELD` |

- **`semantic_missing`:** chỉ xuất hiện ở record `incomplete`; trường chặn được phân bổ cho lớp này là `map`. Vì thiếu đúng trường đó, pipeline phải hỏi làm rõ và không được tự điền.
- **`semantic_unsupported`:** `canonical` và `paraphrase` đều kỳ vọng `EXPECTED_UNSUPPORTED` với `UNSUPPORTED_STRUCTURED_SEMANTICS`; compiler đóng hiện tại không gán family cho ngữ nghĩa NHTSA này.
- **Biên pre-Scenic:** các record chỉ dừng ở diễn giải/làm rõ/compiler đóng; không được gọi `build`, `scenic`, `run` hoặc `carla`. Record `incomplete` còn cấm `ground` và `semantic_compiler` trước khi làm rõ.

## Ba case của lớp

- `canonical`: `nhtsa-32-avoidance_no_maneuver-canonical`
- `paraphrase`: `nhtsa-32-avoidance_no_maneuver-paraphrase`
- `incomplete`: `nhtsa-32-avoidance_no_maneuver-incomplete`

## Provenance và trạng thái review

- **Report:** `DOT HS 812 745`, report p. `8` / PDF p. `20`
- **Source hash:** `sha256:3138095486cd8dda2f3fa2d443972e2ffd0c45129370afd6852d833d5e69ed59`
- **`taxonomy_review`:** `approved`
- **`compiler_review`:** `approved`
