const express = require("express");
const router = express.Router();
const path = require("path");

const ENVIRONMENT = process.env.NODE_ENV;

const controller = require("./controller.js");

console.log(controller);

function defaultRoutes(req, res, next) {
  console.log(req.url);
  if (req.url === "/axiosConfig.js") {
    return res.sendFile(path.join(__dirname, "./", "axiosConfig.js"));
  }
  if (req.url === "/") {
    if (ENVIRONMENT === "development") console.log("default route", req.url);
    return res.sendFile(path.join(__dirname, "./", "index.html"));
  }
  next();
}

const controllerFunctions = {};
const controllers = [controller];

function controllerToFunction(controllers) {
  controllers.forEach((controller) => {
    for (let key in controller) {
      Object.assign(controllerFunctions, {
        [key]: controller[key],
      });
    }
  });
}

function routeToFunction(route, method) {
  let funcName = method.toLowerCase();
  route
    .split("/")
    .filter(Boolean)
    .forEach((element) => {
      funcName += element.charAt(0).toUpperCase() + element.slice(1);
    });
  return funcName;
}

controllerToFunction(controllers);

//ROUTER
router.use((req, res, next) => {
  if (ENVIRONMENT === "development") console.log(req.url, req.method);
  if (req.method === "GET") {
    router.get(
      req.url,
      defaultRoutes,
      //   private(publicRoutes),
      (req, res, next) => {
        const func = routeToFunction(req.url, req.method);
        if (ENVIRONMENT === "development") console.log(func);
        if (typeof controllerFunctions[func] === "function") {
          controllerFunctions[func](req, res, next);
        } else {
          res.status(404).json({ msg: `Route to ${req.url} Not Found` });
        }
      }
    );
  } else if (req.method === "POST") {
    router.post(
      req.url,
      //   private(publicRoutes),
      //   fileHandler,
      (req, res, next) => {
        const func = routeToFunction(req.url, req.method);
        if (ENVIRONMENT === "development") console.log(func);
        if (typeof controllerFunctions[func] === "function") {
          controllerFunctions[func](req, res, next);
        } else {
          res.status(404).json({ msg: `Route to ${req.url} Not Found` });
        }
      }
    );
  }
  next();
});

module.exports = router;
