/** The product's vocabulary, in one place.
 *
 *  The Homeowner chose maximal translation: only names with no Vietnamese
 *  equivalent stay as they are -- CARLA, Scenic, IR, seed, hash. Everything
 *  else gets a Vietnamese word, and every dictionary entry has to use the word
 *  chosen here rather than inventing its own. A product that calls the same
 *  object "Định nghĩa" on one screen and "Bản mô tả" on the next is harder to
 *  read than one that left the term in English.
 *
 *  This file is documentation, not runtime code: nothing imports it. It exists
 *  so a term can be argued about, and changed, in one place instead of being
 *  hunted across five hundred strings.
 *
 *  ## Values are not translated from a fixed list
 *
 *  A catalog belongs to the provider and grows without asking this repository.
 *  `clarificationLabels.ts` therefore resolves a value's label in four steps: a
 *  label the provider supplied, then an idiomatic entry, then composition from
 *  a token vocabulary so an unseen combination still reads, and finally the raw
 *  identifier. It never guesses.
 *
 *  **The durable fix is a contract request, not more table entries.** The
 *  clarification contract already carries `label` and `label_key` per option
 *  (`ClarificationQuestionItemSchema`). Catalog options in the registry do not.
 *  Until they do, a value the provider invents tomorrow shows as its own
 *  identifier -- truthful, but not translated.
 *
 *  ## Kept as-is in both languages
 *
 *  | Term    | Why |
 *  |---------|-----|
 *  | CARLA   | The simulator's name. |
 *  | Scenic  | The scenario language's name. |
 *  | IR      | Intermediate Representation; the contract calls it this. |
 *  | seed    | Written into a Run's evidence verbatim; renaming it would break the link between screen and record. |
 *  | hash    | Same reason. |
 *  | Town05, Clear, Daytime, Vehicle, … | Catalog values from the provider, matched against a versioned allow-list. Translating a value would make it fail to match. Only field *labels* are translated. |
 *
 *  ## Translated
 *
 *  | English            | Tiếng Việt            |
 *  |--------------------|-----------------------|
 *  | Workspace          | Không gian làm việc   |
 *  | Scenario           | Kịch bản              |
 *  | Scenario Library   | Thư viện kịch bản     |
 *  | Definition         | Định nghĩa            |
 *  | Definition Version | Phiên bản định nghĩa  |
 *  | Build (noun)       | Bản dựng              |
 *  | Build (verb)       | Dựng                  |
 *  | Run (noun)         | Lượt chạy             |
 *  | Run (verb)         | Chạy                  |
 *  | Smoke run          | Lượt chạy nhanh       |
 *  | Full run           | Lượt chạy đầy đủ      |
 *  | Canvas             | Bảng dựng             |
 *  | Structured (step)  | Cấu trúc              |
 *  | Template           | Mẫu                   |
 *  | Registry           | Danh mục              |
 *  | Catalog            | Danh mục nguồn        |
 *  | Capabilities       | Năng lực              |
 *  | Agent              | Trợ lý                |
 *  | Provider           | Nhà cung cấp          |
 *  | Model              | Mô hình               |
 *  | Manifest           | Bản kê                |
 *  | Evidence           | Bằng chứng            |
 *  | Provenance         | Nguồn gốc             |
 *  | Claim              | Mệnh đề               |
 *  | Actor              | Đối tượng             |
 *  | Approval / Approve | Phê duyệt             |
 *  | Reviewer           | Người duyệt           |
 *  | Grounded           | Đã neo                |
 *  | Clarification      | Câu hỏi làm rõ        |
 *  | Thread             | Cuộc trò chuyện       |
 *  | Session            | Phiên                 |
 *  | Budget             | Ngân sách             |
 *  | Telemetry          | Dữ liệu đo            |
 *  | Lineage            | Dấu vết               |
 */
export const GLOSSARY_NOTE = 'See the table above before adding a translation.';
