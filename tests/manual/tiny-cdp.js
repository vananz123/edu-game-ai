// tiny-cdp.js — kiểm tra nhanh CDP còn sống, in kích thước cửa sổ renderer và
// (tuỳ chọn) giá trị của một biểu thức chạy trong page.
//   node tests/manual/tiny-cdp.js 9357
//   node tests/manual/tiny-cdp.js 9357 "document.title"
const { connect } = require('./lib/ui-check-lib');

(async () => {
  const { ws, evaluate } = await connect();
  const size = await evaluate('innerWidth + "x" + innerHeight');
  console.log('viewport ' + size);
  if (process.argv[3]) {
    try {
      console.log(JSON.stringify(await evaluate(process.argv[3]), null, 1));
    } catch (e) {
      console.log('EVAL ERR ' + e.message);
    }
  }
  ws.close();
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
