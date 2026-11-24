// .tmp-cdp.js <port> "<expression>" — evaluate in the app page over raw CDP.
const port = process.argv[2];
const expression = process.argv[3];

async function main() {
  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('no page target on ' + port);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const answer = await new Promise(resolve => {
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      resolve(message.result && message.result.result ? message.result.result.value : message.error);
    });
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
  ws.close();
  console.log(typeof answer === 'string' ? answer : JSON.stringify(answer));
}

main().catch(error => { console.error(String(error.message || error)); process.exit(1); });
