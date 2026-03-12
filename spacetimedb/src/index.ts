import { schema, table, t } from 'spacetimedb/server';
import { ADMIN_CLERK_ID } from './admin';

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
  canvas_stats: table(
    { name: 'canvas_stats', public: true },
    {
      id: t.u32().primaryKey(),
      online_count: t.u32(),
      total_contributors: t.u32(),
    }
  ),
  contributor: table(
    { name: 'contributor', public: false },
    {
      clerk_id: t.string().primaryKey(),
    }
  ),
});
export default spacetimedb;

export const init = spacetimedb.init(ctx => {
  ctx.db.canvas_stats.insert({ id: 0, online_count: 0, total_contributors: 0 });
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const stats = ctx.db.canvas_stats.id.find(0);
  if (stats) {
    ctx.db.canvas_stats.id.update({ ...stats, online_count: stats.online_count + 1 });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const stats = ctx.db.canvas_stats.id.find(0);
  if (stats) {
    const newCount = stats.online_count > 0 ? stats.online_count - 1 : 0;
    ctx.db.canvas_stats.id.update({ ...stats, online_count: newCount });
  }
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
      
      // Track unique contributors
      const contributorId = clerk_id || owner_identity;
      if (contributorId && !ctx.db.contributor.clerk_id.find(contributorId)) {
        ctx.db.contributor.insert({ clerk_id: contributorId });
        const stats = ctx.db.canvas_stats.id.find(0);
        if (stats) {
          ctx.db.canvas_stats.id.update({ ...stats, total_contributors: stats.total_contributors + 1 });
        }
      }
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
  { name: t.string(), clerkId: t.string() },
  (ctx, { name, clerkId }) => {
    if (clerkId !== ADMIN_CLERK_ID) throw new Error("Unauthorized");
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

// Administrative reducers logic starts here...


export const loadSnapshot = spacetimedb.reducer(
  { snapshotId: t.u64(), clerkId: t.string() },
  (ctx, { snapshotId, clerkId }) => {
    if (clerkId !== ADMIN_CLERK_ID) {
      throw new Error("Unauthorized");
    }

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

        // Ensure contributors from loaded snapshots are also tracked
        const contributorId = st.clerk_id || st.owner_identity;
        if (contributorId && !ctx.db.contributor.clerk_id.find(contributorId)) {
          ctx.db.contributor.insert({ clerk_id: contributorId });
          const stats = ctx.db.canvas_stats.id.find(0);
          if (stats) {
            ctx.db.canvas_stats.id.update({ ...stats, total_contributors: stats.total_contributors + 1 });
          }
        }
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
