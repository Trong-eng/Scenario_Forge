# NHTSA 28 — Left Turn Across Path, Lateral Direction (LTAP/LD)

## Tên NHTSA gốc và tên tiếng Việt

- **Tên NHTSA gốc:** Left Turn Across Path, Lateral Direction (LTAP/LD)
- **Tên tiếng Việt:** Rẽ trái cắt ngang, hướng ngang

## Định nghĩa DOT HS 812 745

Một xe rẽ trái tại giao lộ và cắt qua quỹ đạo của một xe khác đang đi ngược hướng từ hướng ngang (bên trái).

Đây là bản diễn đạt tiếng Việt trung thành với định nghĩa của NHTSA trong DOT HS 812 745, report p. 8 / PDF p. 20. Các ví dụ và ranh giới ở đây không mở rộng định nghĩa nguồn.

## Các thành phần của lớp

- **Phương tiện chủ thể:** `ego` — phương tiện thực hiện hành động tới hạn trong bộ case của lớp.
- **Đối tượng/phương tiện đối ứng:** một phương tiện khác.
- **Chuyển động trước sự kiện:** `turning left at an intersection`.
- **Sự kiện tới hạn:** `crossing the path of another vehicle traveling in the opposite direction from a lateral direction`.
- **Loại tai nạn:** `left-turn-across-path, lateral-direction conflict`.

Trong biểu diễn oracle hiện tại, thao tác chính là `turn_left_across_lateral_opposite_direction_path`; môi trường là `location=intersection`, `weather=clear`, `road_surface=dry`, `time_of_day=daytime`, `visibility=clear`; ràng buộc là `map=Town01`, `speed=6 m/s`. Đây là ngữ nghĩa của ba record hiện có, không phải yêu cầu bổ sung cho định nghĩa NHTSA.

## Phân biệt với các lớp gần kề

LTAP/LD là rẽ trái và cắt xe ngược hướng đi từ hướng ngang bên trái. LTIP (029) đi vào xe cùng hướng; LTAP/OD (030) là xe ngược hướng nhưng không từ hướng ngang.

## Biểu diễn hiện tại của Scenario Forge

Pipeline đóng hiện tại giữ đúng ngữ nghĩa của từng lens, nhưng chưa có compiler family cho lớp này (`expected_family=null`).

| Biểu diễn | Ngôn ngữ | Kết quả kỳ vọng | Điểm quyết định | Chi tiết |
|---|---|---|---|---|
| `canonical` | `vi` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | `family=null`; `UNSUPPORTED_STRUCTURED_SEMANTICS` |
| `paraphrase` | `en` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | Cùng semantic fingerprint với canonical; `family=null` |
| `incomplete` | `vi` | `CLARIFICATION_REQUIRED` | `clarification` | thiếu `road_surface`; `MISSING_REQUIRED_FIELD` |

- **`semantic_missing`:** chỉ xuất hiện ở record `incomplete`; trường chặn được phân bổ cho lớp này là `road_surface`. Vì thiếu đúng trường đó, pipeline phải hỏi làm rõ và không được tự điền.
- **`semantic_unsupported`:** `canonical` và `paraphrase` đều kỳ vọng `EXPECTED_UNSUPPORTED` với `UNSUPPORTED_STRUCTURED_SEMANTICS`; compiler đóng hiện tại không gán family cho ngữ nghĩa NHTSA này.
- **Biên pre-Scenic:** các record chỉ dừng ở diễn giải/làm rõ/compiler đóng; không được gọi `build`, `scenic`, `run` hoặc `carla`. Record `incomplete` còn cấm `ground` và `semantic_compiler` trước khi làm rõ.

## Ba case của lớp

- `canonical`: `nhtsa-28-left_turn_across_path_lateral_direction-canonical`
- `paraphrase`: `nhtsa-28-left_turn_across_path_lateral_direction-paraphrase`
- `incomplete`: `nhtsa-28-left_turn_across_path_lateral_direction-incomplete`

## Provenance và trạng thái review

- **Report:** `DOT HS 812 745`, report p. `8` / PDF p. `20`
- **Source hash:** `sha256:3138095486cd8dda2f3fa2d443972e2ffd0c45129370afd6852d833d5e69ed59`
- **`taxonomy_review`:** `approved`
- **`compiler_review`:** `approved`
