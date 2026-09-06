# NHTSA 04 — Road Edge Departure/Maneuver

## Tên NHTSA gốc và tên tiếng Việt

- **Tên NHTSA gốc:** Road Edge Departure/Maneuver
- **Tên tiếng Việt:** Rời mép đường/Có thao tác

## Định nghĩa DOT HS 812 745

Một xe rời khỏi mặt đường khi đang thực hiện thao tác (ví dụ: vượt, rẽ hoặc chuyển làn).

Đây là bản diễn đạt tiếng Việt trung thành với định nghĩa của NHTSA trong DOT HS 812 745, report p. 7 / PDF p. 19. Các ví dụ và ranh giới ở đây không mở rộng định nghĩa nguồn.

## Các thành phần của lớp

- **Phương tiện chủ thể:** `ego` — phương tiện thực hiện hành động tới hạn trong bộ case của lớp.
- **Đối tượng/phương tiện đối ứng:** Không có phương tiện/đối tượng đối ứng trong oracle của lớp.
- **Chuyển động trước sự kiện:** `performing a maneuver`.
- **Sự kiện tới hạn:** `departure from the road edge`.
- **Loại tai nạn:** `road edge departure while maneuvering`.

Trong biểu diễn oracle hiện tại, thao tác chính là `depart_road_while_passing`; môi trường là `location=rural_road`, `weather=clear`, `road_surface=dry`, `time_of_day=daytime`, `visibility=clear`; ràng buộc là `map=Town01`, `speed=18 m/s`, `approach=from_rear`, `gap=10 m`. Đây là ngữ nghĩa của ba record hiện có, không phải yêu cầu bổ sung cho định nghĩa NHTSA.

## Phân biệt với các lớp gần kề

Rời mép đường ở đây xảy ra trong lúc có thao tác như vượt, rẽ hoặc chuyển làn. Nếu xe chỉ đi thẳng/qua cua thì là lớp 005; nếu đang lùi thì là lớp 006.

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

- `canonical`: `nhtsa-04-road_edge_departure_maneuver-canonical`
- `paraphrase`: `nhtsa-04-road_edge_departure_maneuver-paraphrase`
- `incomplete`: `nhtsa-04-road_edge_departure_maneuver-incomplete`

## Provenance và trạng thái review

- **Report:** `DOT HS 812 745`, report p. `7` / PDF p. `19`
- **Source hash:** `sha256:3138095486cd8dda2f3fa2d443972e2ffd0c45129370afd6852d833d5e69ed59`
- **`taxonomy_review`:** `approved`
- **`compiler_review`:** `approved`
