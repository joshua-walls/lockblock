import process from "node:process";
import { ESLint } from "eslint";

const patterns = process.argv.slice(2);
const eslint = new ESLint();

try {
  const results = await eslint.lintFiles(patterns.length > 0 ? patterns : ["."]);
  const formatter = await eslint.loadFormatter("stylish");
  const output = formatter.format(results);
  if (output) {
    process.stdout.write(output);
  }

  if (results.some((result) => result.errorCount > 0 || result.fatalErrorCount > 0)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 2;
}
