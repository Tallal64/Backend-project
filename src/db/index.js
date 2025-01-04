import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    )
    console.log(
      `MongoDB connected... DB host: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("MongoDB connection Failed: ", error);
    // console.error(`Connection URI: ${process.env.MONGODB_URI}/${DB_NAME}`);
    process.exit(1);
  }
};

export default connectDB;

// import mongoose from "mongoose";
// import { DB_NAME } from "../constants.js";

// const connectDB = async () => {
//   try {
//     const connnectionInstance = await mongoose.connect(
//       `${process.env.MONGODB_URI}/${DB_NAME}`
//     );
//     console.log(
//       `MongoDB connected... DB host: ${connnectionInstance.connection.host}`
//     );
//   } catch (error) {
//     console.error("MongoDB connection Failed: ", error.message);
//     console.error(`Connection URI: ,${process.env.MONGODB_URI}/${DB_NAME}`);
//     process.exit(1);
//   }
// };

// export default connectDB;
