import { hashPassword } from "./lib/password.js";

const plaintext = process.argv[2];
if (!plaintext) {
  console.error("Usage: bun run hash-password <password>");
  process.exit(1);
}

console.log(hashPassword(plaintext));
