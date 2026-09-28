module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    message: "OuderHulp API test werkt!",
    time: new Date().toISOString()
  });
};
