module.exports = function handler(req, res) {
  res.status(200).json({ ok: true, message: "Vercel API werkt", version: "test-1" });
};
