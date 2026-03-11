import { schema, table, t } from 'spacetimedb/server';

const spacetimedb = schema({
  tile: table(
    { name: 'tile', public: true },
    {
      coords: t.string().primaryKey(), // Format: "x,y"
      x: t.i32(),
      y: t.i32(),
      color: t.i32(),
      owner_identity: t.string(),
      clerk_id: t.string(),
    }
  ),
});
export default spacetimedb;

export const init = spacetimedb.init(_ctx => {
  // Called when the module is initially published
});

export const onConnect = spacetimedb.clientConnected(_ctx => {
  // Called every time a new client connects
});

export const onDisconnect = spacetimedb.clientDisconnected(_ctx => {
  // Called every time a client disconnects
});

export const setTileColor = spacetimedb.reducer(
  { x: t.i32(), y: t.i32(), color: t.i32(), clerk_id: t.string() },
  (ctx, { x, y, color, clerk_id }) => {
    const coords = `${x},${y}`;
    const owner_identity = ctx.sender.toHexString();

    const existingTile = ctx.db.tile.coords.find(coords);

    if (existingTile) {
      if (existingTile.clerk_id !== "" && existingTile.owner_identity !== owner_identity) {
        throw new Error("Cannot overwrite a tile protected by another signed-in user.");
      }
      ctx.db.tile.coords.delete(coords);
    }

    if (color !== 0) {
      ctx.db.tile.insert({ coords, x, y, color, owner_identity, clerk_id });
    }
  }
);

export const adminResetUserTiles = spacetimedb.reducer(
  { clerk_id: t.string() },
  (ctx, { clerk_id }) => {
    if (!clerk_id) throw new Error("clerk_id required");

    // Find all tiles with this clerk_id and delete them
    const tilesToDelete = [];
    for (const tile of ctx.db.tile.iter()) {
      if (tile.clerk_id === clerk_id) {
        tilesToDelete.push(tile.coords);
      }
    }

    for (const coords of tilesToDelete) {
      ctx.db.tile.coords.delete(coords);
    }
  }
);
