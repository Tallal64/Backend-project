// require("dotenv").config({ path: "./env" });
import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./db/index.js";

dotenv.config({
  path: "./env",
});

// dotenv.config();

connectDB()
  .then(() => {
    app.get("/", (req, res) => {
      res.send("MongoDB connection successful. Express server running!");
    });
    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server running on http://localhost:${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.log("connnection is failed!", err);
  });

/*
// IIFE ()()
(async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
    app.on("error", () => {
      console.log("ERROR: ", error);
    });
    app.listen(process.env.PORT, () => {
      console.log(`App is listening on port ${process.env.PORT}`);
    });
  } catch (error) {
    console.error("ERROR: ", error);
  }
})();
*/
