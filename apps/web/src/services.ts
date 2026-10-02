import { createAuth } from "@Main/auth";
import { createDb } from "@Main/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
