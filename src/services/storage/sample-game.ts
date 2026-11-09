/**
 * Trò chơi mẫu của lần chạy đầu — image verbatim of `seedGame()` in `main.ts`.
 *
 * `main.ts` seeds a fresh profile with this one scenario game so the library page is
 * not empty on day one. The Tauri shell has to seed the same row, and two hand-kept
 * copies of a five-question game drift the first time a word is fixed, so this module
 * is the single source: `main.ts` keeps its own `seedGame()` for the legacy
 * `library.json` import path, and `tests/unit/sample-game.test.ts` compares the two
 * field by field. `scripts/build-embedded-js.js` bundles this into the V8 bundle the
 * Rust shell runs.
 */

/** Id the sample always keeps, so re-seeding can never duplicate it. */
export const SAMPLE_GAME_ID = 'sample-traffic-001';

/** Fixed questions: same ids, prompts, options and points as `main.ts`. */
const QUESTION_TEXT = [
  {
    id: 'q1',
    type: 'scenario',
    prompt: 'Em đang đi xe đạp đến gần ngã tư. Đèn tín hiệu chuyển đỏ khi em còn cách vạch dừng vài mét. Em nên làm gì?',
    options: [
      { id: 'a', text: 'Tăng tốc để vượt qua trước khi xe khác tới' },
      { id: 'b', text: 'Giảm tốc và dừng trước vạch dừng' },
      { id: 'c', text: 'Đi lên vỉa hè để tránh đèn đỏ' },
      { id: 'd', text: 'Quan sát sơ qua rồi đi tiếp' }
    ],
    correctOptionId: 'b',
    explanation: 'Khi đèn tín hiệu màu đỏ, người tham gia giao thông phải dừng trước vạch dừng. Đi chậm và dừng đúng vị trí giúp bảo vệ bản thân và người khác.'
  },
  {
    id: 'q2',
    type: 'multiple-choice',
    prompt: 'Khi đi xe đạp trên đường, hành vi nào an toàn nhất?',
    options: [
      { id: 'a', text: 'Đi hàng ba để trò chuyện' },
      { id: 'b', text: 'Bám vào xe máy phía trước' },
      { id: 'c', text: 'Đi đúng phần đường, chú ý quan sát và giữ khoảng cách' },
      { id: 'd', text: 'Vừa đi vừa sử dụng điện thoại' }
    ],
    correctOptionId: 'c',
    explanation: 'Đi đúng phần đường, quan sát và giữ khoảng cách giúp người đi xe đạp chủ động xử lý tình huống bất ngờ.'
  },
  {
    id: 'q3',
    type: 'scenario',
    prompt: 'Một người bạn rủ em ngồi sau xe máy nhưng không đội mũ bảo hiểm. Em sẽ làm gì?',
    options: [
      { id: 'a', text: 'Đi ngay vì quãng đường ngắn' },
      { id: 'b', text: 'Từ chối đi cho đến khi có mũ bảo hiểm phù hợp' },
      { id: 'c', text: 'Đội mũ lưỡi trai thay thế' },
      { id: 'd', text: 'Chỉ đội nếu gặp công an' }
    ],
    correctOptionId: 'b',
    explanation: 'Mũ bảo hiểm đạt chuẩn và cài quai đúng cách giúp giảm nguy cơ chấn thương đầu. An toàn không phụ thuộc quãng đường dài hay ngắn.'
  },
  {
    id: 'q4',
    type: 'multiple-choice',
    prompt: 'Khi muốn sang đường tại nơi không có đèn tín hiệu, em nên làm gì?',
    options: [
      { id: 'a', text: 'Chạy thật nhanh qua đường' },
      { id: 'b', text: 'Đi theo người khác mà không quan sát' },
      { id: 'c', text: 'Chọn nơi dễ quan sát, nhìn trái–phải–trái và chỉ sang khi an toàn' },
      { id: 'd', text: 'Vừa đi vừa nhìn điện thoại' }
    ],
    correctOptionId: 'c',
    explanation: 'Quan sát kỹ cả hai phía, đánh giá khoảng cách và tốc độ phương tiện trước khi sang đường. Không chạy bất ngờ ra lòng đường.'
  },
  {
    id: 'q5',
    type: 'scenario',
    prompt: 'Trời mưa, mặt đường trơn và tầm nhìn giảm. Điều chỉnh nào phù hợp?',
    options: [
      { id: 'a', text: 'Đi nhanh hơn để về sớm' },
      { id: 'b', text: 'Phanh gấp liên tục' },
      { id: 'c', text: 'Giảm tốc độ, tăng khoảng cách và tránh phanh/đánh lái đột ngột' },
      { id: 'd', text: 'Đi sát xe phía trước' }
    ],
    correctOptionId: 'c',
    explanation: 'Mặt đường trơn làm tăng quãng đường phanh. Giảm tốc độ và tăng khoảng cách giúp có thêm thời gian xử lý.'
  }
] as const;

/**
 * The sample game for a given moment. `createdAt` and `updatedAt` are the only
 * values that change between runs, exactly like `new Date().toISOString()` twice in
 * `seedGame()`.
 */
export function sampleGame(now: string): Record<string, unknown> {
  return {
    id: SAMPLE_GAME_ID,
    title: 'Thử thách an toàn giao thông',
    subject: 'Giáo dục công dân',
    grade: '7',
    topic: 'An toàn giao thông',
    template: 'scenario',
    description: 'Nhận diện tình huống giao thông và lựa chọn cách xử lý an toàn.',
    createdAt: now,
    updatedAt: now,
    sourceName: 'Trò chơi mẫu',
    tags: ['Giao thông', 'Tình huống', 'Lớp 7'],
    questions: QUESTION_TEXT.map(question => ({
      ...question,
      options: question.options.map(option => ({ ...option })),
      points: 100
    }))
  };
}
