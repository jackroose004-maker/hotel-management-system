// Jest can't parse puppeteer's ESM build. The smoke suite never renders a real
// PDF/screenshot, so a no-op stub is enough to let modules that import it load.
module.exports = {
  launch: async () => ({
    newPage: async () => ({
      setContent: async () => {},
      pdf: async () => Buffer.from(''),
      screenshot: async () => Buffer.from(''),
      close: async () => {},
    }),
    close: async () => {},
  }),
}
