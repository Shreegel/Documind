import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    console.log("URI:", JSON.stringify(process.env.MONGO_URI));
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};
