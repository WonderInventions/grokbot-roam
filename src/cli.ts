#!/usr/bin/env node
import { main } from "./main.js";

const code = await main();
process.exit(code);
