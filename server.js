const express = require("express");
require("dotenv").config();

const fs = require("fs");
const https = require("https");
const http = require("http");

const PORT = process.env.PORT;
const ENVIRONMENT = process.env.NODE_ENV;
const SSL_PATH = process.env.SSL_PATH;
const SSL_KEY = process.env.SSL_KEY;
const SSL_CERT = process.env.SSL_CERT;
const HTTPS = process.env.HTTPS;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/", require("./router.js"));

if (ENVIRONMENT === "production") {
  const sslServer = https.createServer(
    {
      key: fs.readFileSync(path.join(__dirname, `${SSL_PATH}`, `${SSL_KEY}`)),
      cert: fs.readFileSync(path.join(__dirname, `${SSL_PATH}`, `${SSL_CERT}`)),
    },
    app
  );
  sslServer.listen(HTTPS, () => console.log(`HTTPS listening on ${HTTPS}`));
}
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Server Running in ${ENVIRONMENT} mode on port ${PORT}`);
});
