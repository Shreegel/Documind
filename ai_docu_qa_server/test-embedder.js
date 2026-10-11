import { embedderService } from "./src/services/embedder.js";

console.log("start");
const vector = await embedderService.embed("hello world");
console.log("done, vector length:", vector.length);