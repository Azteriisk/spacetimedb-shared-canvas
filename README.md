# ![Color Block Canvas](https://spacetimedb.com/favicon.ico) Shared Canvas Grid

A real-time collaborative pixel canvas powered by [SpacetimeDB](https://spacetimedb.com). Draw on a shared infinite grid with anyone in the world — changes sync instantly across all connected clients.

## Features

- **Real-time collaboration** — every paint stroke syncs to all connected clients instantly via SpacetimeDB
- **Infinite canvas** — pan with right-click drag and zoom with scroll wheel
- **10-color palette** — keybindings 0–9 for quick color switching
- **Dark mode** — toggle with the 🌙 button, colors adapt for contrast
- **Clerk authentication** — sign in to protect your tiles from being overwritten by others
- **Admin controls** (restricted to admin via Clerk User ID):
  - 💾 **Save Snapshot** — name and save the current canvas state
  - 🔄 **Load Snapshot** — restore any previously saved snapshot
  - 🗑️ **Wipe Canvas** — clear all tiles and start fresh
  - ✕ **Delete Snapshot** — remove a saved snapshot

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | [React 19](https://react.dev) + [TanStack Router](https://tanstack.com/router) + [Vite](https://vite.dev) |
| Backend | [SpacetimeDB](https://spacetimedb.com) (TypeScript module) |
| Auth | [Clerk](https://clerk.com) |
| Realtime | SpacetimeDB WebSocket subscriptions |

## Getting Started

### Prerequisites

1.  **Bun**: The fast JavaScript runtime. [Install Bun](https://bun.sh).
2.  **SpacetimeDB CLI**: Required for publishing the backend. [Install SpacetimeDB](https://spacetimedb.com/docs/getting-started).
3.  **Accounts**:
    *   [SpacetimeDB Account](https://spacetimedb.com) (Login via CLI: `spacetime login`).
    *   [Clerk Account](https://clerk.com) (For user authentication).

### Setup

**1. Clone the repository:**
```bash
git clone https://github.com/Azteriisk/spacetimedb-shared-canvas
cd spacetimedb-shared-canvas
```

**2. Configure your environment:**
```bash
bun scripts/setup.js
```
The script will create a template file at `spacetimedb/src/admin.ts`. You **must** edit this file:

*   `DB_NAME`: The name you want for your database.
*   `ADMIN_CLERK_ID`: Your Clerk User ID (found in the "Users" section of your [Clerk Dashboard](https://dashboard.clerk.com)).

**3. Provide Authentication Keys:**
The setup script also created a `.env.local` file. Edit it to provide your Clerk keys:
*   `VITE_CLERK_PUBLISHABLE_KEY`: Found in your [Clerk Dashboard](https://dashboard.clerk.com).
*   `CLERK_SECRET_KEY`: Found in your [Clerk Dashboard](https://dashboard.clerk.com).

**4. Finalize and Publish:**
Run the setup script again once your configuration is complete:
```bash
bun scripts/setup.js
```
This script will automatically synchronize your `DB_NAME` and `ADMIN_CLERK_ID` to all necessary configuration files, publish your module to SpacetimeDB, and generate your client-side bindings.


### Local Development

Start the development server:
```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) to start drawing!

## Controls

| Action | Control |
|--------|---------|
| Paint | Left click / drag |
| Pan | Right click drag or middle click drag |
| Zoom | Scroll wheel |
| Select color | Keys `1`–`9`, `0` |
| Toggle dark mode | 🌙 button in toolbar |
| Admin panel | ⚙️ Admin button (signed in as Admin only) |

## Development Commands

```bash
bun run dev                   # Start dev server
bun run build                 # Production build
bun run spacetime:publish     # Republish module to maincloud
bun run spacetime:generate    # Regenerate client bindings
spacetime logs <your-db-name> # View backend logs
```

## License

[MIT](LICENSE)
