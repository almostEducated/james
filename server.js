const express = require("express");
const db = require("./db");
require("dotenv").config();
//git webhook test

const http = require("http");

const PORT = process.env.PORT;
const ENVIRONMENT = process.env.NODE_ENV;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/", require("./router.js"));

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Server Running in ${ENVIRONMENT} mode on port ${PORT}`);
});

process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error("Error closing database:", err);
    } else {
      console.log("Database connection closed");
    }
    process.exit();
  });
});
