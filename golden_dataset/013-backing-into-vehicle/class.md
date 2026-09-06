# NHTSA 13 — Backing into Vehicle

## Tên NHTSA gốc và tên tiếng Việt

- **Tên NHTSA gốc:** Backing into Vehicle
- **Tên tiếng Việt:** Lùi vào phương tiện

## Định nghĩa DOT HS 812 745

Một xe va chạm với một xe khác khi đang lùi.

Đây là bản diễn đạt tiếng Việt trung thành với định nghĩa của NHTSA trong DOT HS 812 745, report p. 7 / PDF p. 19. Các ví dụ và ranh giới ở đây không mở rộng định nghĩa nguồn.

## Các thành phần của lớp

- **Phương tiện chủ thể:** `ego` — phương tiện thực hiện hành động tới hạn trong bộ case của lớp.
- **Đối tượng/phương tiện đối ứng:** một phương tiện khác.
- **Chuyển động trước sự kiện:** `backing`.
- **Sự kiện tới hạn:** `collision with another vehicle`.
- **Loại tai nạn:** `backing collision with another vehicle`.

Trong biểu diễn oracle hiện tại, thao tác chính là `back_into_vehicle`; môi trường là `location=parking_lot`, `weather=clear`, `road_surface=dry`, `time_of_day=daytime`, `visibility=clear`; ràng buộc là `map=Town02`, `speed=3 m/s`. Đây là ngữ nghĩa của ba record hiện có, không phải yêu cầu bổ sung cho định nghĩa NHTSA.

## Phân biệt với các lớp gần kề

Sự kiện là xe đang lùi va vào xe khác, không phải xe rời đường khi lùi (006). Đây là xung đột với phương tiện đối ứng trong khi chuyển động trước sự kiện là lùi.

## Biểu diễn hiện tại của Scenario Forge

Pipeline đóng hiện tại giữ đúng ngữ nghĩa của từng lens, nhưng chưa có compiler family cho lớp này (`expected_family=null`).

| Biểu diễn | Ngôn ngữ | Kết quả kỳ vọng | Điểm quyết định | Chi tiết |
|---|---|---|---|---|
| `canonical` | `vi` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | `family=null`; `UNSUPPORTED_STRUCTURED_SEMANTICS` |
| `paraphrase` | `en` | `EXPECTED_UNSUPPORTED` | `semantic_compiler` | Cùng semantic fingerprint với canonical; `family=null` |
| `incomplete` | `vi` | `CLARIFICATION_REQUIRED` | `clarification` | thiếu `location`; `MISSING_REQUIRED_FIELD` |

- **`semantic_missing`:** chỉ xuất hiện ở record `incomplete`; trường chặn được phân bổ cho lớp này là `location`. Vì thiếu đúng trường đó, pipeline phải hỏi làm rõ và không được tự điền.
- **`semantic_unsupported`:** `canonical` và `paraphrase` đều kỳ vọng `EXPECTED_UNSUPPORTED` với `UNSUPPORTED_STRUCTURED_SEMANTICS`; compiler đóng hiện tại không gán family cho ngữ nghĩa NHTSA này.
- **Biên pre-Scenic:** các record chỉ dừng ở diễn giải/làm rõ/compiler đóng; không được gọi `build`, `scenic`, `run` hoặc `carla`. Record `incomplete` còn cấm `ground` và `semantic_compiler` trước khi làm rõ.

## Ba case của lớp

- `canonical`: `nhtsa-13-backing_into_vehicle-canonical`
- `paraphrase`: `nhtsa-13-backing_into_vehicle-paraphrase`
- `incomplete`: `nhtsa-13-backing_into_vehicle-incomplete`

## Provenance và trạng thái review

- **Report:** `DOT HS 812 745`, report p. `7` / PDF p. `19`
- **Source hash:** `sha256:3138095486cd8dda2f3fa2d443972e2ffd0c45129370afd6852d833d5e69ed59`
- **`taxonomy_review`:** `approved`
- **`compiler_review`:** `approved`
