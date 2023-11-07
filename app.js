﻿let LRS_VERSION = "1.1.0";

require("dotenv").config();
require("rootpath")();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("_helpers/jwt");
const errorHandler = require("_helpers/error-handler");

app.use(cors({ origin: "*" }));

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "500mb" }));

// Serve files in public folder
app.use(express.static("frontend/build"));

app.use("/consumer/:consumerId", express.static("frontend/build"));
app.use(
  "/consumer/:consumerId/course/:courseId",
  express.static("frontend/build")
);
app.use(
  "/consumer/:consumerId/course/:courseId/exercise/:exerciseId",
  express.static("frontend/build")
);

app.use(
  "/consumer/:consumerId/course/:courseId/exercise/:exerciseId/sub/:subExerciseId",
  express.static("frontend/build")
);

app.use("/consumers", express.static("frontend/build"));
app.use("/users", express.static("frontend/build"));
app.use("/login", express.static("frontend/build"));
app.use("/register", express.static("frontend/build"));

// Use JWT auth to secure the API
app.use(jwt());

// User API routes
app.use("/users", require("./users/users.controller"));

// Default route for status
app.get("/status", (req, res) => {
  res.send({ status: "LRS is up", version: LRS_VERSION });
});

// Global error handler
app.use(errorHandler);

// MongoDB direct connection with Mongoose

// Mongo import and init variables
const { MongoClient } = require("mongodb");
var m_client = new MongoClient(process.env.MONGO_URL + process.env.MONGO_DB, {
  useUnifiedTopology: true,
});

// Async function to connect to MongoDB and initiaize variables for db and collection
async function connectMongo() {
  try {
    await m_client.connect();
    console.log("Native MongoDB Driver connected");
  } catch (err) {
    console.log("Error connecting to Mongo Server: ", err);
  }
}
connectMongo();

require("./consumers/consumers.js").init(m_client);
require("./records.js").init(m_client);

// Consumer API routes
app.use("/consumers", require("./consumers/consumers.js").router);

app.use("/records", require("./records.js").router);

// LRS endpoint to accept post data
app.post("/lrs", (req, res) => {
  try {
    // Encryption of personal data is moved to LTI Tool

    // Get consumer and course id from the request so that we can store the record in a collection with the same name
    let consumerId = req?.body?.metadata?.session.custom_consumer ?? "null";
    let courseId = req?.body?.metadata?.session.context_id ?? "null";

    m_client
      .db()
      .collection(
        process.env.MONGO_XAPI_COLLECTION +
          "_consumerId_" +
          consumerId +
          "_courseId_" +
          courseId
      )
      .insertOne(req.body, { check_keys: false }, function (err, mong_res) {
        if (err) {
          throw err;
        }
        console.log("xAPI Record inserted");
        console.log("Mongo Response", mong_res);
        res.send(JSON.stringify({ result: "done" }));
        res.status(200).end();
      });
  } catch (err) {
    console.log(new Date(), "Error inserting record: ", err);
    res.status(500).end();
  }
});

// Get records with find and sorting queries. Also have pagination support (limit and skip)
app.post("/records/get", (req, res) => {
  let query;
  let sort;
  let unwind;
  let limit;
  let skip;
  try {
    req.body.query ? (query = req.body.query) : (query = {});
    req.body.sort ? (sort = req.body.sort) : (sort = {});
    req.body.unwind ? (unwind = req.body.unwind) : (unwind = {});
    req.body.limit ? (limit = req.body.limit) : 0;
    req.body.skip ? (limit = req.body.skip) : 0;
    m_client
      .db()
      .collection(process.env.MONGO_XAPI_COLLECTION)
      .find(query, { limit: limit, skip: skip, sort: sort, unwind: unwind })
      .toArray(function (err, results) {
        if (err) {
          console.log("Error while getting records", err);
          console.log("Input Query was: ", query);
          console.log("Sort Query was: ", sort);
          console.log("Limit: ", limit);
          console.log("Skip: ", skip);
          res.status(500).end();
        } else {
          //console.log("Records request received", req.body);
          res
            .status(200)
            .send({ total: results.length, results: results })
            .end();
        }
      });
  } catch (err) {
    console.log("Error while getting records", err);
    console.log("Input Query was: ", query);
    console.log("Sort Query was: ", sort);
    console.log("Limit: ", limit);
    console.log("Skip: ", skip);
    res.status(500).end();
  }
});

// Start the Server
const port =
  process.env.NODE_ENV === "production" ? process.env.PORT || 80 : 4000;
app.listen(port, function () {
  console.log("Server listening on port " + port);
});
