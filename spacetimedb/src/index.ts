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
  snapshot: table(
    { name: 'snapshot', public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      name: t.string(),
      created_at: t.timestamp(),
    }
  ),
  snapshot_tile: table(
    {
      name: 'snapshot_tile',
      public: true,
      indexes: [{ name: 'snapshot_tile_snapshot_id', algorithm: 'btree', columns: ['snapshot_id'] }],
    },
    {
      id: t.u64().primaryKey().autoInc(),
      snapshot_id: t.u64(),
      coords: t.string(),
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

export const saveSnapshot = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (!name) throw new Error("Snapshot name required");

    // Create a new snapshot record
    const snapshotRow = ctx.db.snapshot.insert({ id: 0n, name, created_at: ctx.timestamp });
    const snapshotId = snapshotRow.id;

    // Copy all current tiles into snapshot_tile
    for (const tile of ctx.db.tile.iter()) {
      ctx.db.snapshot_tile.insert({
        id: 0n,
        snapshot_id: snapshotId,
        coords: tile.coords,
        x: tile.x,
        y: tile.y,
        color: tile.color,
        owner_identity: tile.owner_identity,
        clerk_id: tile.clerk_id,
      });
    }
  }
);

// Replace this with your actual Clerk User ID for admin access
const ADMIN_CLERK_ID = 'user_REPLACE_ME';

export const loadSnapshot = spacetimedb.reducer(
  { snapshotId: t.u64(), clerkId: t.string() },
  (ctx, { snapshotId, clerkId }) => {
    if (clerkId !== ADMIN_CLERK_ID) throw new Error("Unauthorized");

    // Wipe current canvas
    const coordsToDelete: string[] = [];
    for (const tile of ctx.db.tile.iter()) {
      coordsToDelete.push(tile.coords);
    }
    for (const coords of coordsToDelete) {
      ctx.db.tile.coords.delete(coords);
    }

    // Load tiles from the snapshot
    for (const st of ctx.db.snapshot_tile.iter()) {
      if (st.snapshot_id === snapshotId) {
        ctx.db.tile.insert({
          coords: st.coords,
          x: st.x,
          y: st.y,
          color: st.color,
          owner_identity: st.owner_identity,
          clerk_id: st.clerk_id,
        });
      }
    }
  }
);

export const wipeCanvas = spacetimedb.reducer(
  { clerkId: t.string() },
  (ctx, { clerkId }) => {
    if (clerkId !== ADMIN_CLERK_ID) throw new Error("Unauthorized");

    const coordsToDelete: string[] = [];
    for (const tile of ctx.db.tile.iter()) {
      coordsToDelete.push(tile.coords);
    }
    for (const coords of coordsToDelete) {
      ctx.db.tile.coords.delete(coords);
    }
  }
);

export const deleteSnapshot = spacetimedb.reducer(
  { snapshotId: t.u64(), clerkId: t.string() },
  (ctx, { snapshotId, clerkId }) => {
    if (clerkId !== ADMIN_CLERK_ID) throw new Error("Unauthorized");

    // Delete all tiles in this snapshot
    const idsToDelete: bigint[] = [];
    for (const st of ctx.db.snapshot_tile.iter()) {
      if (st.snapshot_id === snapshotId) {
        idsToDelete.push(st.id);
      }
    }
    for (const id of idsToDelete) {
      ctx.db.snapshot_tile.id.delete(id);
    }
    // Delete the snapshot record itself
    ctx.db.snapshot.id.delete(snapshotId);
  }
);
