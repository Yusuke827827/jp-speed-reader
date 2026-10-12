// Safari（iOS を含む）は ReadableStream の非同期反復（for await ... of）に対応していないことがある。
// PDF.js の getTextContent はこれを使うため、無いと本文の取り出しが全ページで失敗する。
// 読み出し器（getReader）で同じ動きをするものを補う。

if (typeof (ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] !== 'function') {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* (this: ReadableStream) {
      const reader = this.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) return
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    },
  })
}

export {}
