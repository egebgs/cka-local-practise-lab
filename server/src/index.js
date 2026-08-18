const express = require("express");
const cors = require("cors");
const http = require("http");
const routes = require("./routes");
const { attachTerminalServer } = require("./terminal");

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "internal error" });
});

const server = http.createServer(app);
attachTerminalServer(server);

server.listen(PORT, () => {
  console.log(`CKA practice server listening on http://localhost:${PORT}`);
});
