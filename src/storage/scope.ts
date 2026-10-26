/**
 * WHOSE DATA IS ON THIS PHONE
 * ---------------------------------------------------------------------------
 * The app is offline-first, so the database outlives the session. That is
 * what makes a plane readable — and it is also what would let one reader's
 * purchases, progress and conversations greet the next reader who signs in
 * on the same phone.
 *
 * So every account that signs in adopts the local data: if the owner on
 * record is a DIFFERENT account, that account's data is wiped first, and
 * only then does the new account become the owner.
 *
 * The first account after this code ships adopts whatever is already there
 * (`owner === null`), because that data can only have come from the reader
 * who is upgrading the app. Wiping on upgrade would punish the one person
 * who did nothing wrong.
 */
import { clearUserContent, readDataOwner, writeDataOwner } from "@/storage/database";

/** Make `userId` the owner of the local data, wiping a previous owner's. */
export async function adoptUserScope(userId: string): Promise<void> {
  const owner = await readDataOwner();
  if (owner === userId) return;
  if (owner !== null) {
    await clearUserContent();
  }
  await writeDataOwner(userId);
}
