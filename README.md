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

## Project Structure

```
shared-canvas/
├── src/                    # Frontend (React + TanStack Router)
│   ├── routes/
│   │   ├── __root.tsx      # App shell + Clerk provider
│   │   └── index.tsx       # Main canvas component
│   ├── module_bindings/    # Auto-generated SpacetimeDB client types
│   └── router.tsx          # SpacetimeDB connection + TanStack Router setup
└── spacetimedb/            # SpacetimeDB backend module
    └── src/
        └── index.ts        # Tables, reducers, and lifecycle hooks
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- [SpacetimeDB CLI](https://spacetimedb.com/docs/getting-started)
- A [Clerk](https://clerk.com) account (for auth)

### Quick Start

**1. Clone and run first-time setup** (installs deps, publishes the module to maincloud, generates bindings):

```bash
git clone <repo-url>
cd shared-canvas
bun scripts/setup.js
```

> The script will create a `.env.local` template if one doesn't exist.  
> 1. Fill in your Clerk publishable key from [dashboard.clerk.com](https://dashboard.clerk.com).
> 2. To use the **Admin capabilities** (Wipe Canvas, Snapshots):
>    - The setup script created `spacetimedb/src/admin.ts` for you.
>    - Add your **Clerk User ID** to the `ADMIN_CLERK_ID` constant in that file.
>    - Add the same User ID to your `.env.local` as `VITE_ADMIN_CLERK_ID`.
> 3. Update the `DB_NAME` in `src/router.tsx` to match your published database name.
> 
> Once configured, run the setup script again.

**2. Start the dev server:**

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) — press `Ctrl+C` to stop.

## Controls

| Action | Control |
|--------|---------|
| Paint | Left click / drag |
| Pan | Right click drag or middle click drag |
| Zoom | Scroll wheel |
| Select color | Keys `1`–`9`, `0` |
| Toggle dark mode | 🌙 button in toolbar |
| Admin panel | ⚙️ Admin button (signed in only) |

## Development Commands

```bash
bun run dev                   # Start dev server
bun run build                 # Production build
bun run spacetime:publish     # Republish module to maincloud
bun run spacetime:generate    # Regenerate client bindings
spacetime logs color-block-bd7pc  # View logs
```

## License

[MIT](LICENSE)
