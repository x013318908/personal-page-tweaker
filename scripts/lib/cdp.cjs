// Small DevTools client used only by local browser checks and asset generation.
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', event => {
      const data = JSON.parse(event.data), job = this.pending.get(data.id);
      if (process.env.PPS_CDP_DEBUG) console.log('CDP receive', JSON.stringify(data).slice(0, 350));
      if (job) { this.pending.delete(data.id); clearTimeout(job.timer); data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result); }
    });
  }
  call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method + ' ' + (params.expression || '').slice(0, 180))); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async page(url = 'about:blank', background = false) {
    const { targetId } = await this.call('Target.createTarget', { url, background });
    const { sessionId } = await this.call('Target.attachToTarget', { targetId, flatten: true });
    await this.call('Page.enable', {}, sessionId);
    return sessionId;
  }
  async eval(sessionId, expression) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async wait(sessionId, expression) {
    for (let i = 0; i < 100; i++) {
      if (await this.eval(sessionId, expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const page = await this.eval(sessionId, '({url:location.href,text:document.body?.innerText.slice(0,2000)})');
    throw new Error('Timed out: ' + expression + '\nPage: ' + JSON.stringify(page));
  }
}
module.exports = { CDP };
