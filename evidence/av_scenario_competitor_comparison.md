# Competitor evidence — Scenario Forge trong thị trường AV scenario simulation

Ngày thu thập: 05-09-2026. Shortlist này gồm 4 nền tảng lớn có liên quan đến scenario simulation / validation AV. Đây không phải market map đầy đủ. Mỗi claim đối thủ có snapshot HTML nguồn, evidence span và tier; Refinery build digest: `b88f3c036af010c7`.

## Kết luận dùng được cho pitch

**Scenario Forge không nên tự định vị là simulator thay thế Foretellix, dSPACE, Cognata hay Applied Intuition.** Các nền tảng đó đã mạnh về simulation fidelity, data scale, test execution và validation enterprise.

Điểm đứng vững hơn là: **lớp workflow cho đội V&V biến brief tiếng Việt thành CARLA scenario có thể xem, bị ràng buộc catalog, được con người ký đúng nội dung, rồi xuất lineage để audit.** Đây là năng lực được mô tả trong deck Scenario Forge; các trang công khai đã capture của đối thủ không mô tả đúng chuỗi `Vietnamese intent → catalog allow-list → refusal → content-bound manifest signature → CARLA lineage`. Điều đó không chứng minh đối thủ không có các tính năng này; chỉ nói rằng chúng chưa xuất hiện trong bằng chứng public đã thu thập.

## Bằng chứng production / maturity

| Đối thủ | Bằng chứng | Chất lượng evidence | Ý nghĩa đối với Scenario Forge |
|---|---|---|---|
| **Foretellix — Foretify** | Foretellix nêu Torc, Volvo, Mazda, Woven by Toyota và Nuro là khách hàng; Nuro nói họ dùng Foretellix trong validation stack với large-scale scenario generation và log analysis. | **B**: vendor page có customer quote được gán tên. | Đối thủ trực tiếp nhất ở V&V/scenario generation. Không nên claim thắng về scale, ODD coverage hay safety case. [Nguồn](https://www.foretellix.com/foretellix-accelerates-ai-powered-autonomous-vehicles/) |
| **dSPACE — SIMPHERA** | dSPACE nói SIMPHERA đã được TÜV SÜD chứng nhận theo ISO 26262; tạo, chạy và đánh giá deterministic simulations với role-based access, cloud parallelism và reuse SIL/HIL. | **B** cho tuyên bố chứng nhận trên trang vendor. | Không nên claim Scenario Forge “unique deterministic” hay “unique human control”. Điểm khác phải là trải nghiệm intent/approval dành cho V&V và CARLA. [Nguồn](https://www.dspace.com/en/ltd/home/products/sw/simulation_software/simphera.cfm) |
| **Cognata — AV/ADAS Simulation** | Có scenario library, fuzzing, giao diện web và Python scripting; trang vendor nói hỗ trợ vòng đời tới commercial deployment. | **A** cho feature; **C** cho production claim vì là tự công bố, không có customer proof trong capture. | Đây là benchmark tốt cho authoring GUI và library. Không được nói “chỉ Scenario Forge cho phép tạo scenario không cần code”; Cognata có GUI, dù cũng công bố Python scripting. [Nguồn](https://www.cognata.com/simulation/) |
| **Applied Intuition — Tools for Vehicle Intelligence** | Công bố agentic simulation/evaluation, MCP-ready interfaces, SDK cloud/on-prem/air-gapped; “workflows in production” là tự công bố. | **A** cho feature; **C** cho production wording. | Là nền tảng enterprise kề cận. Không nên claim “agentic workflow là mới”. [Nguồn](https://www.appliedintuition.com/products) |

## So sánh công bằng

| Trục so sánh | Nền tảng enterprise đã capture | Scenario Forge theo deck hiện có | Câu claim an toàn |
|---|---|---|---|
| Scale, sensor realism, coverage | Foretellix tạo synthetic data quy mô lớn và safety-case coverage; dSPACE chạy cloud song song; Cognata có digital twins/fuzzing. | Không phải mục tiêu chính. | “Scenario Forge bổ sung workflow tạo và ký duyệt scenario; không thay thế enterprise simulator.” |
| Authoring | Cognata có GUI + Python; dSPACE có role-based prepare/simulate/validate; Foretellix sinh scenario ở quy mô lớn. | Một câu tiếng Việt → IR → token catalog → CARLA; không cần đọc Scenic/Python để duyệt. | “Tập trung rút ngắn khoảng cách giữa V&V intent và scenario có thể review.” |
| AI / agent | Applied Intuition công bố agentic workflows; Foretellix dùng data automation. | LLM chỉ sinh IR, sau đó qua retriever, validator và reviewer. | “Khác biệt không phải chỉ là LLM; đó là LLM bị giới hạn bởi catalog và quy trình ký duyệt.” |
| Governance / reproducibility | dSPACE công bố deterministic simulations và role access; Foretellix có coverage/safety-case evidence. | Catalog phiên bản, refusal khi không chắc, manifest hash gắn approval, seed, video và `lineage.json`. | “Approval của Scenario Forge gắn vào đúng nội dung scenario và có lineage để audit.” Chưa đủ evidence để nói tốt hơn mọi enterprise platform. |
| Production readiness | Foretellix có customer-use evidence; dSPACE có certification. | Deck hiện ghi CARLA runtime matrix còn bị chặn bởi driver/image mismatch. | “Prototype có logic/build evidence; production claim chờ CARLA runtime ổn định và pilot.” |

## Vị thế nên dùng

> **Scenario Forge is the governed intent-to-scenario layer for CARLA V&V teams: Vietnamese brief → catalog-grounded scenario → content-bound human approval → reproducible run lineage.**

Nói bằng tiếng Việt trên deck:

> **Không cạnh tranh dựng simulator mới. Scenario Forge làm cho ý định kiểm thử của đội V&V trở thành kịch bản CARLA có catalog, có người ký và truy vết lại được.**

Đây là positioning có thể bảo vệ: nó không phủ nhận năng lực lớn của đối thủ và mô tả đúng sản phẩm hiện có.

## Các claim không nên dùng

- “Scenario Forge là sản phẩm duy nhất có deterministic runs / human approval / scenario authoring.” Bằng chứng public đã capture không cho phép kết luận độc quyền.
- “Nhanh hơn Foretellix, dSPACE, Cognata hoặc Applied Intuition.” Chưa có benchmark cùng task.
- “Production-ready.” Runtime CARLA full matrix của project chưa hoàn tất.
- “Thay thế simulator enterprise.” Sai với scope hiện tại.

## Evidence cần đo để biến positioning thành lợi thế thật

Chạy pilot với 3–5 kỹ sư V&V và 8–12 brief. So baseline workflow với Scenario Forge, đo:

1. Thời gian từ brief đến scenario **được phê duyệt và chạy được**.
2. Tỷ lệ token đúng catalog và tỷ lệ refusal đúng khi yêu cầu ngoài catalog.
3. Số lần sửa tay trước first-pass runnable.
4. Tỷ lệ người review xác nhận scenario khớp brief.
5. Tỷ lệ run tái lập cùng seed/hash/video.

Kết quả pilot mới cho phép nói “tốt hơn” bằng số. Cho đến lúc đó, lợi thế phù hợp là **governed Vietnamese V&V workflow**, không phải superiority claim tổng quát.

## Traceability

Registry giao kèm: [domain.yaml](./av_scenario_competitor_refinery/domain.yaml), [claims.jsonl](./av_scenario_competitor_refinery/claims.jsonl), và bốn snapshot HTML nguồn. Tất cả span được kiểm tra tồn tại nguyên văn trong snapshot; build, audit và bite suite đều pass.
