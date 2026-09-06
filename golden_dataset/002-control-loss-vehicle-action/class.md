# NHTSA 02 — Control Loss/Vehicle Action

## Tên NHTSA gốc và tên tiếng Việt

- **Tên NHTSA gốc:** Control Loss/Vehicle Action
- **Tên tiếng Việt:** Mất kiểm soát/Có thao tác xe

## Định nghĩa DOT HS 812 745

Một xe mất kiểm soát khi đang thực hiện thao tác (ví dụ: vượt hoặc rẽ tại giao lộ).

Đây là bản diễn đạt tiếng Việt trung thành với định nghĩa của NHTSA trong DOT HS 812 745, report p. 7 / PDF p. 19. Các ví dụ và ranh giới ở đây không mở rộng định nghĩa nguồn.

## Các thành phần của lớp

- **Phương tiện chủ thể:** `ego` — phương tiện thực hiện hành động tới hạn trong bộ case của lớp.
- **Đối tượng/phương tiện đối ứng:** Không có phương tiện/đối tượng đối ứng trong oracle của lớp.
- **Chuyển động trước sự kiện:** `performing a maneuver`.
- **Sự kiện tới hạn:** `loss of control`.
- **Loại tai nạn:** `control loss while maneuvering`.

Trong biểu diễn oracle hiện tại, thao tác chính là `lose_control_while_passing`; môi trường là `location=intersection`, `weather=clear`, `road_surface=dry`, `time_of_day=daytime`, `visibility=clear`; ràng buộc là `map=Town01`, `speed=14 m/s`, `approach=from_rear`, `gap=12 m`. Đây là ngữ nghĩa của ba record hiện có, không phải yêu cầu bổ sung cho định nghĩa NHTSA.

## Phân biệt với các lớp gần kề

Điểm tách khỏi lớp 003 là mất kiểm soát xảy ra trong lúc xe đang làm một thao tác cụ thể. Lớp này cũng không phải lớp 018: xe đối ứng (nếu có) không được dùng để định nghĩa xung đột ngược hướng.

## Biểu diễn hiện tại của Scenario Forge

Pipeline đóng hiện tại giữ đúng ngữ nghĩa của từng lens, nhưng chưa có compiler family cho lớp này (`expected_family=null`).

| Biểu diễn | Ngôn ngữ | Kết quả kỳ vọng | Điểm quyết định | Chi tiết |
|---|---|---|---|---|
| `canonical` | `vi` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | `family=null`; `UNSUPPORTED_STRUCTURED_SEMANTICS` |
| `paraphrase` | `en` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | Cùng semantic fingerprint với canonical; `family=null` |
| `incomplete` | `vi` | `CLARIFICATION_REQUIRED` | `clarification` | thiếu `maneuver`; `MISSING_REQUIRED_FIELD` |

- **`semantic_missing`:** chỉ xuất hiện ở record `incomplete`; trường chặn được phân bổ cho lớp này là `maneuver`. Vì thiếu đúng trường đó, pipeline phải hỏi làm rõ và không được tự điền.
- **`semantic_unsupported`:** `canonical` và `paraphrase` đều kỳ vọng `EXPECTED_UNSUPPORTED` với `UNSUPPORTED_STRUCTURED_SEMANTICS`; compiler đóng hiện tại không gán family cho ngữ nghĩa NHTSA này.
- **Biên pre-Scenic:** các record chỉ dừng ở diễn giải/làm rõ/compiler đóng; không được gọi `build`, `scenic`, `run` hoặc `carla`. Record `incomplete` còn cấm `ground` và `semantic_compiler` trước khi làm rõ.

## Ba case của lớp

- `canonical`: `nhtsa-02-control_loss_vehicle_action-canonical`
- `paraphrase`: `nhtsa-02-control_loss_vehicle_action-paraphrase`
- `incomplete`: `nhtsa-02-control_loss_vehicle_action-incomplete`

## Provenance và trạng thái review

- **Report:** `DOT HS 812 745`, report p. `7` / PDF p. `19`
- **Source hash:** `sha256:3138095486cd8dda2f3fa2d443972e2ffd0c45129370afd6852d833d5e69ed59`
- **`taxonomy_review`:** `approved`
- **`compiler_review`:** `approved`
