import { openDB } from "idb";
import type { SaveGame, SaveRepository } from "./SaveRepository";

const databasePromise = openDB("dark-dimensions", 1, {
  upgrade(database) {
    if (!database.objectStoreNames.contains("saves")) {
      database.createObjectStore("saves");
    }
  },
});

export class IndexedDbSaveRepository implements SaveRepository {
  async read(): Promise<SaveGame | null> {
    const database = await databasePromise;
    return (await database.get("saves", "primary")) ?? null;
  }

  async write(save: SaveGame): Promise<void> {
    const database = await databasePromise;
    await database.put("saves", save, "primary");
  }
}
